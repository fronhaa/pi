import * as THREE from 'three';
import { Physics, RAPIER } from '@/core/Physics';
import { PALETTE, toonMesh } from '@/render/toon';

/** Fase de teste: chão, rampa, plataformas e alguns objetos empurráveis. */
export function buildTestLevel(scene: THREE.Scene, physics: Physics): void {
  const world = physics.world;

  // Chão (corpo fixo)
  const groundSize = { x: 40, y: 1, z: 40 };
  const ground = toonMesh(new THREE.BoxGeometry(groundSize.x, groundSize.y, groundSize.z), PALETTE.ground, 0);
  ground.position.y = -groundSize.y / 2;
  scene.add(ground);
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(groundSize.x / 2, groundSize.y / 2, groundSize.z / 2).setTranslation(0, -groundSize.y / 2, 0),
  );

  // Plataformas fixas
  addStatic(scene, physics, { x: 6, y: 0.75, z: -6 }, { x: 3, y: 1.5, z: 3 }, PALETTE.blue);
  addStatic(scene, physics, { x: 10, y: 1.5, z: -10 }, { x: 3, y: 3, z: 3 }, PALETTE.yellow);

  // Rampa
  const ramp = addStatic(scene, physics, { x: -6, y: 1, z: -6 }, { x: 3, y: 0.4, z: 7 }, PALETTE.red, false);
  ramp.rotateX(0.3);
  const rampCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(1.5, 0.2, 3.5));
  rampCollider.setTranslation(ramp.position);
  rampCollider.setRotation(ramp.quaternion);

  // Caixas e bolas dinâmicas para empurrar
  const colors = [PALETTE.red, PALETTE.yellow, PALETTE.green, PALETTE.blue];
  for (let i = 0; i < 8; i++) {
    const pos = { x: -4 + (i % 4) * 2.2, y: 1 + Math.floor(i / 4) * 1.2, z: 4 };
    if (i % 2 === 0) addDynamicBox(scene, physics, pos, 1, colors[i % colors.length]);
    else addDynamicBall(scene, physics, pos, 0.5, colors[i % colors.length]);
  }
}

type Vec3 = { x: number; y: number; z: number };

/** Mesh + collider fixo. Se o mesh for rotacionado depois, crie o collider manualmente (ver rampa). */
function addStatic(scene: THREE.Scene, physics: Physics, pos: Vec3, size: Vec3, color: number, withCollider = true) {
  const mesh = toonMesh(new THREE.BoxGeometry(size.x, size.y, size.z), color, 0.03);
  mesh.position.set(pos.x, pos.y, pos.z);
  scene.add(mesh);
  if (withCollider) {
    physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setTranslation(pos.x, pos.y, pos.z),
    );
  }
  return mesh;
}

function addDynamicBox(scene: THREE.Scene, physics: Physics, pos: Vec3, size: number, color: number) {
  const mesh = toonMesh(new THREE.BoxGeometry(size, size, size), color, 0.04);
  scene.add(mesh);
  const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z));
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2).setDensity(0.5), body);
  physics.link(body, mesh);
}

function addDynamicBall(scene: THREE.Scene, physics: Physics, pos: Vec3, radius: number, color: number) {
  const mesh = toonMesh(new THREE.SphereGeometry(radius, 24, 16), color, 0.05);
  scene.add(mesh);
  const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z));
  physics.world.createCollider(RAPIER.ColliderDesc.ball(radius).setDensity(0.5).setRestitution(0.5), body);
  physics.link(body, mesh);
}
