import * as THREE from 'three';
import { Physics, RAPIER } from '@/core/Physics';
import { FIXED_DT, MAX_FRAME_DT } from '@/core/constants';
import type { Input } from '@/core/Input';
import { ROLES, type Crew } from './Crew';
import { POSTS, type Role } from './MarsBase';
import { findPath } from './crewPath';

/**
 * Movimentação da tripulação com física (Rapier) e gravidade de Marte.
 * Este módulo é carregado SOB DEMANDA (import dinâmico): ele traz o Rapier, ~1,6 MB.
 * Ver docs/fisica.md e ADR 0004. A física é dona da posição; a cena só copia.
 */
const HALF = 0.55; // metade do cilindro da cápsula
const RADIUS = 0.32;
const CENTER_Y = HALF + RADIUS; // centro da cápsula acima dos pés
const WALK_SPEED = 2.4; // m/s
const JUMP_SPEED = 2.2; // m/s: ~0,25 m na Terra, ~0,65 m em Marte
const ARRIVE = 0.35;
const BOUNDS = 30; // a tripulação não se afasta mais que isso do centro da base

export interface CrewMotionOptions {
  crew: Crew;
  obstacles: { center: THREE.Vector3; half: THREE.Vector3 }[];
  input: Input;
  camera: THREE.Camera;
  onSelect?: (role: Role) => void;
  onFirstJump?: () => void;
}

export async function createCrewMotion(opts: CrewMotionOptions): Promise<CrewMotion> {
  const physics = await Physics.create();
  return new CrewMotion(physics, opts);
}

export class CrewMotion {
  selected: Role = 'commander';
  enabled = true;

  private readonly bodies = {} as Record<Role, RAPIER.RigidBody>;
  private readonly targets: Partial<Record<Role, THREE.Vector3>> = {};
  private readonly stuckTime: Partial<Record<Role, number>> = {};
  /** Próximos pontos do caminho, depois do alvo atual. */
  private readonly routes: Partial<Record<Role, THREE.Vector3[]>> = {};
  /** Astronautas andando sozinhos (piloto automático: ir dormir, voltar ao posto). */
  private readonly auto = new Map<Role, { speed: number; onArrive?: () => void }>();
  private readonly insideRoles = new Set<Role>();
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private accumulator = 0;
  private jumped = false;

  constructor(
    private readonly physics: Physics,
    private readonly opts: CrewMotionOptions,
  ) {
    const world = physics.world;
    // Chão plano em volta da base (o relevo só começa depois de 30 m; ver terrainHeight).
    world.createCollider(RAPIER.ColliderDesc.cuboid(BOUNDS + 5, 0.5, BOUNDS + 5).setTranslation(0, -0.5, 0));
    for (const o of opts.obstacles) {
      world.createCollider(RAPIER.ColliderDesc.cuboid(o.half.x, o.half.y, o.half.z).setTranslation(o.center.x, o.center.y, o.center.z));
    }
    for (const role of ROLES) {
      const p = opts.crew.members[role].root.position;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y + CENTER_Y, p.z).lockRotations().setCcdEnabled(true),
      );
      world.createCollider(RAPIER.ColliderDesc.capsule(HALF, RADIUS).setFriction(0), body);
      this.bodies[role] = body;
    }
    this.select('commander');
  }

  select(role: Role): void {
    this.selected = role;
    for (const r of ROLES) this.opts.crew.members[r].setSelected(r === role);
    this.opts.onSelect?.(role);
  }

  /** Clique/toque no chão: o astronauta selecionado anda até lá sozinho. */
  moveTo(point: THREE.Vector3): void {
    const p = point.clone();
    p.y = 0;
    if (p.length() > BOUNDS) p.setLength(BOUNDS);
    this.cancelAuto(this.selected);
    this.targets[this.selected] = p;
    this.stuckTime[this.selected] = 0;
  }

  /** Quantos astronautas estão dentro (habitat ou abrigo). */
  get insideCount(): number {
    return this.insideRoles.size;
  }

  /**
   * Noite: cada astronauta anda (ou corre) até a porta, desviando das construções, e entra.
   * `onAllInside` é chamado quando o último entra.
   */
  goInside(door: THREE.Vector3, speed: number, onAllInside: () => void): void {
    for (const role of ROLES) {
      if (this.insideRoles.has(role)) continue;
      this.walkPath(role, door, speed, () => {
        this.hide(role);
        if (this.insideRoles.size === ROLES.length) onAllInside();
      });
    }
    if (this.insideRoles.size === ROLES.length) onAllInside();
  }

  /** Quem não chegou a tempo entra direto (a noite não espera para sempre). */
  forceInside(): void {
    for (const role of ROLES) if (!this.insideRoles.has(role)) this.hide(role);
  }

  /** Manhã: todos saem pela porta e voltam andando aos seus postos. O jogador pode assumir a qualquer momento. */
  comeOut(door: THREE.Vector3): void {
    ROLES.forEach((role, i) => {
      if (!this.insideRoles.has(role)) return;
      this.insideRoles.delete(role);
      const body = this.bodies[role];
      // Saem um ao lado do outro, para não nascerem dentro um do outro.
      const x = door.x + (i - 1.5) * 0.8;
      body.setTranslation({ x, y: CENTER_Y + 0.02, z: door.z + 0.3 }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setEnabled(true);
      this.opts.crew.members[role].root.visible = true;
      this.walkPath(role, POSTS[role], WALK_SPEED);
    });
  }

  private walkPath(role: Role, dest: THREE.Vector3, speed: number, onArrive?: () => void): void {
    const t = this.bodies[role].translation();
    const path = findPath({ x: t.x, z: t.z }, { x: dest.x, z: dest.z }, this.opts.obstacles, RADIUS).map(
      (p) => new THREE.Vector3(p.x, 0, p.z),
    );
    this.targets[role] = path.shift();
    this.routes[role] = path;
    this.stuckTime[role] = 0;
    this.auto.set(role, { speed, onArrive });
  }

  private cancelAuto(role: Role): void {
    this.auto.delete(role);
    delete this.routes[role];
  }

  /** Entra: some da cena e o corpo deixa de colidir, para não bloquear a porta. */
  private hide(role: Role): void {
    this.cancelAuto(role);
    delete this.targets[role];
    this.insideRoles.add(role);
    const body = this.bodies[role];
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setEnabled(false);
    this.opts.crew.members[role].root.visible = false;
  }

  /** Chegou ao fim do caminho (ou desistiu por estar preso). */
  private arrive(role: Role): void {
    const next = this.routes[role]?.shift();
    if (next) {
      this.targets[role] = next;
      this.stuckTime[role] = 0;
      return;
    }
    delete this.targets[role];
    const auto = this.auto.get(role);
    this.cancelAuto(role);
    auto?.onArrive?.();
  }

  update(dt: number): void {
    this.accumulator += Math.min(dt, MAX_FRAME_DT);
    while (this.accumulator >= FIXED_DT) {
      this.fixedUpdate();
      this.physics.step();
      this.opts.input.endStep();
      this.accumulator -= FIXED_DT;
    }
    this.sync(dt);
  }

  private fixedUpdate(): void {
    const input = this.opts.input;
    if (this.enabled) {
      const digits: [string, Role][] = [['Digit1', 'commander'], ['Digit2', 'engineer'], ['Digit3', 'medic'], ['Digit4', 'scientist']];
      for (const [key, role] of digits) if (input.wasPressed(key, key.replace('Digit', 'Numpad'))) this.select(role);
    }

    for (const role of ROLES) {
      if (this.insideRoles.has(role)) continue;
      const body = this.bodies[role];
      const vel = body.linvel();
      let vx = 0;
      let vz = 0;

      if (this.enabled && role === this.selected) {
        const axis = input.moveAxis();
        if (axis.x !== 0 || axis.z !== 0) {
          // Setas relativas à câmera: "para cima" é para longe da câmera.
          const dir = this.cameraRelative(axis.x, axis.z);
          vx = dir.x * WALK_SPEED;
          vz = dir.z * WALK_SPEED;
          delete this.targets[role];
          this.cancelAuto(role);
        }
        if (input.wasPressed('Space') && !focusOnControl() && this.isGrounded(body)) {
          body.setLinvel({ x: vel.x, y: JUMP_SPEED, z: vel.z }, true);
          if (!this.jumped) {
            this.jumped = true;
            this.opts.onFirstJump?.();
          }
        }
      }

      const target = this.targets[role];
      const auto = this.auto.get(role);
      if (target && (this.enabled || auto) && vx === 0 && vz === 0) {
        const speed = auto?.speed ?? WALK_SPEED;
        const t = body.translation();
        const dx = target.x - t.x;
        const dz = target.z - t.z;
        const dist = Math.hypot(dx, dz);
        if (dist < ARRIVE) {
          this.arrive(role);
        } else {
          vx = (dx / dist) * speed;
          vz = (dz / dist) * speed;
          // Clique do jogador vai em linha reta; se ficar preso 1,5 s, desiste.
          // No piloto automático, preso conta como "chegou" (ex.: entra mesmo assim).
          const moving = Math.hypot(vel.x, vel.z) > 0.3;
          this.stuckTime[role] = moving ? 0 : (this.stuckTime[role] ?? 0) + FIXED_DT;
          if ((this.stuckTime[role] ?? 0) > 1.5) {
            if (auto) {
              delete this.routes[role];
              this.arrive(role);
            } else delete this.targets[role];
          }
        }
      }

      // Mantém a tripulação perto da base.
      const t = body.translation();
      if (Math.hypot(t.x, t.z) > BOUNDS && t.x * vx + t.z * vz > 0) {
        vx = 0;
        vz = 0;
      }
      body.setLinvel({ x: vx, y: body.linvel().y, z: vz }, true);
    }
  }

  private cameraRelative(x: number, z: number): THREE.Vector3 {
    const forward = new THREE.Vector3();
    this.opts.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    return right.multiplyScalar(x).addScaledVector(forward, -z).normalize();
  }

  private isGrounded(body: RAPIER.RigidBody): boolean {
    const t = body.translation();
    this.ray.origin = { x: t.x, y: t.y, z: t.z };
    return this.physics.world.castRay(this.ray, CENTER_Y + 0.06, true, undefined, undefined, undefined, body) !== null;
  }

  /** Copia a física para a cena e anima o andar. */
  private sync(dt: number): void {
    for (const role of ROLES) {
      if (this.insideRoles.has(role)) continue;
      const a = this.opts.crew.members[role];
      const t = this.bodies[role].translation();
      const v = this.bodies[role].linvel();
      a.root.position.set(t.x, t.y - CENTER_Y, t.z);
      a.setMotion(Math.hypot(v.x, v.z), Math.atan2(-v.x, -v.z), dt);
    }
  }
}

/** Espaço num botão focado deve apertar o botão, não pular. */
function focusOnControl(): boolean {
  const el = document.activeElement;
  return !!el && el !== document.body && /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
}
