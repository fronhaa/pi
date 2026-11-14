import * as THREE from 'three';
import { Physics, RAPIER } from '@/core/Physics';
import type { Input } from '@/core/Input';
import { PALETTE, toonMesh } from '@/render/toon';

const HALF_HEIGHT = 0.4; // metade do cilindro da cápsula
const RADIUS = 0.45;
const MOVE_SPEED = 7;
/**
 * Velocidade de impulso do pulo (m/s). É a de um salto de ~0,5 m na Terra: √(2 × 9,81 × 0,5) ≈ 3,1.
 * As pernas são as mesmas em qualquer lugar; quem muda a altura é a gravidade REAL do mundo:
 * ~1,3 m em Marte e ~3 m na Lua. Simplificação: ignora a massa do traje (INTERPRETADO).
 */
const JUMP_SPEED = 3.1;
/** Distância (m) em que o alvo do clique conta como alcançado. */
const ARRIVE_DISTANCE = 0.2;
/** Abaixo desta distância (m) do alvo o jogador desacelera, para não passar do ponto. */
const SLOW_RADIUS = 1;
const SPAWN = { x: 0, y: 3, z: 0 };

export class Player {
  /** Segue o corpo físico (posição). */
  readonly root = new THREE.Group();
  /** Visual rotacionado para a direção do movimento (a física tem rotação travada). */
  private readonly model = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  constructor(
    private readonly physics: Physics,
    private readonly input: Input,
  ) {
    this.buildModel();
    this.root.add(this.model);

    const world = physics.world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(SPAWN.x, SPAWN.y, SPAWN.z)
        .lockRotations()
        .setCcdEnabled(true),
    );
    world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS).setFriction(0), this.body);
    physics.link(this.body, this.root);
  }

  private buildModel(): void {
    const body = toonMesh(new THREE.CapsuleGeometry(RADIUS, HALF_HEIGHT * 2, 8, 16), PALETTE.player);
    this.model.add(body);

    // Olhos (cartoon) — olhando para -Z (frente)
    for (const side of [-1, 1]) {
      const eye = toonMesh(new THREE.SphereGeometry(0.13, 16, 12), PALETTE.white, 0.12);
      eye.position.set(side * 0.18, 0.35, -0.38);
      const pupil = toonMesh(new THREE.SphereGeometry(0.06, 12, 8), PALETTE.outline, 0);
      pupil.position.set(0, 0, -0.1);
      eye.add(pupil);
      this.model.add(eye);
    }
  }

  isGrounded(): boolean {
    const t = this.body.translation();
    this.ray.origin = { x: t.x, y: t.y, z: t.z };
    const maxDist = HALF_HEIGHT + RADIUS + 0.08;
    const hit = this.physics.world.castRay(this.ray, maxDist, true, undefined, undefined, undefined, this.body);
    return hit !== null;
  }

  /** Lógica de gameplay — roda no passo fixo, antes do world.step(). */
  fixedUpdate(): void {
    const { x, z } = this.moveDirection();
    const vel = this.body.linvel();
    let vy = vel.y;

    if (this.input.wasPressed('Space') && this.isGrounded()) vy = JUMP_SPEED;

    this.body.setLinvel({ x: x * MOVE_SPEED, y: vy, z: z * MOVE_SPEED }, true);

    if (x !== 0 || z !== 0) {
      const target = Math.atan2(-x, -z);
      this.model.rotation.y = lerpAngle(this.model.rotation.y, target, 0.25);
    }

    if (this.body.translation().y < -20) this.respawn();
  }

  /**
   * Direção desejada no plano XZ (comprimento até 1).
   * Teclado tem prioridade e cancela o alvo do clique; sem teclado, segue o alvo.
   */
  private moveDirection(): { x: number; z: number } {
    const keys = this.input.moveAxis();
    if (keys.x !== 0 || keys.z !== 0) {
      this.input.clearMoveTarget();
      return keys;
    }

    const target = this.input.moveTarget;
    if (!target) return keys;

    const t = this.body.translation();
    const dx = target.x - t.x;
    const dz = target.z - t.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVE_DISTANCE) {
      this.input.clearMoveTarget();
      return { x: 0, z: 0 };
    }
    const speed = Math.min(1, dist / SLOW_RADIUS);
    return { x: (dx / dist) * speed, z: (dz / dist) * speed };
  }

  respawn(): void {
    this.body.setTranslation(SPAWN, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.input.clearMoveTarget();
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}
