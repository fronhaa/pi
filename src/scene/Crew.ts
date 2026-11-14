import * as THREE from 'three';
import { PALETTE, toonMesh } from '@/render/toon';
import { POSTS, type Role } from './MarsBase';

/** Cor de destaque de cada papel (faixa no traje). Laranja só no comandante, como detalhe. */
export const ROLE_COLORS: Record<Role, number> = {
  commander: PALETTE.accent,
  engineer: PALETTE.dust,
  medic: 0x8fbf9f,
  scientist: 0x7fa7c9,
};

export const ROLES: Role[] = ['commander', 'engineer', 'medic', 'scientist'];

/** Astronauta (CHR-001 a 004). Escala: 1 unidade = 1 m; altura ~1,85 m (Art Bible). */
export class Astronaut {
  readonly root = new THREE.Group();
  /** Parte visual que gira para a direção do movimento. */
  readonly model = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private bobPhase = Math.random() * Math.PI * 2;

  constructor(readonly role: Role) {
    const suit = PALETTE.light;
    const accent = ROLE_COLORS[role];

    for (const side of [-1, 1]) {
      const leg = toonMesh(new THREE.CapsuleGeometry(0.13, 0.55, 4, 8), suit, 0.05);
      leg.position.set(side * 0.14, 0.42, 0);
      this.model.add(leg);
      const boot = toonMesh(new THREE.BoxGeometry(0.22, 0.14, 0.32), PALETTE.shadow, 0.05);
      boot.position.set(side * 0.14, 0.07, -0.04);
      this.model.add(boot);
    }
    const torso = toonMesh(new THREE.CapsuleGeometry(0.3, 0.45, 4, 12), suit, 0.04);
    torso.position.y = 1.12;
    this.model.add(torso);
    const band = toonMesh(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 16), accent, 0);
    band.position.y = 1.0;
    this.model.add(band);
    for (const side of [-1, 1]) {
      const arm = toonMesh(new THREE.CapsuleGeometry(0.09, 0.45, 4, 8), suit, 0.05);
      arm.position.set(side * 0.4, 1.1, 0);
      arm.rotation.z = side * 0.12;
      this.model.add(arm);
    }
    const pack = toonMesh(new THREE.BoxGeometry(0.5, 0.6, 0.25), PALETTE.tech, 0.04);
    pack.position.set(0, 1.15, 0.3);
    this.model.add(pack);
    const helmet = toonMesh(new THREE.SphereGeometry(0.25, 16, 12), suit, 0.04);
    helmet.position.y = 1.62;
    this.model.add(helmet);
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 10, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.38),
      new THREE.MeshToonMaterial({ color: 0x2b3a4a }),
    );
    visor.position.set(0, 1.62, -0.07);
    visor.rotation.y = Math.PI;
    this.model.add(visor);

    // Anel de seleção no chão (aparece quando o jogador escolhe este astronauta).
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.6, 24),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.visible = false;
    this.root.add(this.ring);

    // Área de acerto invisível, maior que o boneco: facilita passar o mouse e tocar (crianças, celular).
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2, 10), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1;
    hit.userData.isHitArea = true;
    this.root.add(hit);

    this.root.add(this.model);
    this.root.userData.role = role;
    this.root.position.copy(POSTS[role]);
    this.model.rotation.y = Math.PI * 0.85;
  }

  private selected = false;
  private hovered = false;

  setSelected(on: boolean): void {
    this.selected = on;
    this.updateRing();
  }

  /** Mouse em cima: anel mais claro (ou mais forte, se já selecionado) e o boneco cresce um pouco. */
  setHovered(on: boolean): void {
    if (this.hovered === on) return;
    this.hovered = on;
    this.model.scale.setScalar(on ? 1.08 : 1);
    this.updateRing();
  }

  private updateRing(): void {
    const m = this.ring.material as THREE.MeshBasicMaterial;
    this.ring.visible = this.selected || this.hovered;
    m.opacity = this.selected ? 0.95 : 0.45;
    this.ring.scale.setScalar(this.hovered ? 1.15 : 1);
  }

  /** Respiração/balanço leve quando parado. */
  idle(dt: number): void {
    this.bobPhase += dt * 2;
    this.model.position.y = Math.max(0, Math.sin(this.bobPhase) * 0.015);
  }

  /** Chamado pela física: anda (balança e vira para a direção) ou fica parado. */
  setMotion(speed: number, heading: number, dt: number): void {
    if (speed < 0.2) {
      this.idle(dt);
      return;
    }
    this.bobPhase += dt * speed * 4;
    this.model.position.y = Math.abs(Math.sin(this.bobPhase)) * 0.06;
    const diff = Math.atan2(Math.sin(heading - this.model.rotation.y), Math.cos(heading - this.model.rotation.y));
    this.model.rotation.y += diff * Math.min(1, dt * 10);
  }
}

export class Crew {
  readonly members: Record<Role, Astronaut>;
  readonly root = new THREE.Group();

  constructor() {
    this.members = Object.fromEntries(ROLES.map((r) => [r, new Astronaut(r)])) as Record<Role, Astronaut>;
    for (const a of Object.values(this.members)) this.root.add(a.root);
  }

  /** Na noite de tempestade, a tripulação corre para o abrigo e some (GDD). */
  setSheltered(on: boolean): void {
    for (const a of Object.values(this.members)) a.root.visible = !on;
  }

  update(dt: number): void {
    for (const a of Object.values(this.members)) a.idle(dt);
  }
}
