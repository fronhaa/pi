import * as THREE from 'three';
import type { ProblemKind } from '@/sim/types';
import { PROBLEM_SPOTS } from './base/layout';

/**
 * Marcadores dos problemas na cena: "!" flutuando, anel pulsando no chão e barra de progresso.
 * Só desenha. Clique no marcador = mandar o astronauta selecionado (ver Game).
 */
interface Marker {
  group: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  icon: THREE.Sprite;
  bar: THREE.Group;
  fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

const WARN = 0xffb020;
const WORKING = 0x5cc16b;

export class ProblemMarkers {
  readonly root = new THREE.Group();
  private readonly markers = new Map<number, Marker>();
  private readonly iconTexture = makeIconTexture();

  add(uid: number, kind: ProblemKind): void {
    if (this.markers.has(uid)) return;
    const spot = PROBLEM_SPOTS[kind];
    const group = new THREE.Group();
    group.position.copy(spot);
    group.userData.problemUid = uid;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.95, 32),
      new THREE.MeshBasicMaterial({ color: WARN, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);

    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.iconTexture, depthTest: false }));
    icon.scale.set(1.1, 1.1, 1);
    icon.position.y = 2.6;
    icon.renderOrder = 5;
    group.add(icon);

    // Área de clique maior que o ícone (crianças, dedos no celular).
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.2, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.6;
    group.add(hit);

    const bar = new THREE.Group();
    bar.position.y = 3.4;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.22), new THREE.MeshBasicMaterial({ color: 0x473c3a, depthTest: false }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.14), new THREE.MeshBasicMaterial({ color: WORKING, depthTest: false }));
    fill.position.z = 0.01;
    back.renderOrder = 6;
    fill.renderOrder = 7;
    bar.add(back, fill);
    bar.visible = false;
    group.add(bar);

    this.root.add(group);
    this.markers.set(uid, { group, ring, icon, bar, fill });
  }

  remove(uid: number): void {
    const m = this.markers.get(uid);
    if (!m) return;
    this.root.remove(m.group);
    this.markers.delete(uid);
  }

  clear(): void {
    for (const uid of [...this.markers.keys()]) this.remove(uid);
  }

  /** progress 0–1; working = alguém trabalhando agora. */
  setProgress(uid: number, progress: number, working: boolean): void {
    const m = this.markers.get(uid);
    if (!m) return;
    m.bar.visible = working || progress > 0;
    const k = Math.max(0.001, Math.min(1, progress));
    m.fill.scale.x = k;
    m.fill.position.x = -0.75 * (1 - k);
    m.ring.material.color.setHex(working ? WORKING : WARN);
  }

  update(time: number, camera: THREE.Camera): void {
    for (const m of this.markers.values()) {
      const pulse = 1 + Math.sin(time * 4) * 0.12;
      m.ring.scale.setScalar(pulse);
      m.icon.position.y = 2.6 + Math.sin(time * 3) * 0.12;
      m.bar.quaternion.copy(camera.quaternion);
    }
  }

  /** Objetos para o raycast do clique. */
  get pickables(): THREE.Object3D[] {
    return [...this.markers.values()].map((m) => m.group);
  }
}

function makeIconTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffb020';
  g.strokeStyle = '#473c3a';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#473c3a';
  g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
