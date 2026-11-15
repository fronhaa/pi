import * as THREE from 'three';
import type { Role } from '@/sim/crew';

/** O que o ponteiro precisa do jogo. Só repassa: quem decide o que fazer é o Game. */
export interface PointerOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  /** Raiz da tripulação (cada astronauta tem `userData.role`). */
  crewRoot: THREE.Object3D;
  /** Marcadores "!" dos problemas (cada um tem `userData.problemUid`). */
  problemPickables: () => THREE.Object3D[];
  ground: () => THREE.Object3D | undefined;
  /** Dia em tempo real (os problemas são clicáveis). */
  isDay: () => boolean;
  /** À noite, nem clique nem hover. */
  isNight: () => boolean;
  /** Na pausa, o clique não faz nada (o hover continua). */
  isPaused: () => boolean;
  /** Texto do hover sobre um problema (null = não mostra). */
  problemLabel: (uid: number) => string | null;
  crewLabel: (role: Role) => string;
  onProblem: (uid: number) => void;
  onCrew: (role: Role) => void;
  onGround: (point: THREE.Vector3) => void;
  onHover: (role: Role | null) => void;
}

/**
 * Clique/toque e hover na cena 3D:
 * - clique num "!" (de dia): manda o astronauta selecionado (GDD: "toca no astronauta e depois no problema");
 * - clique num astronauta: seleciona; no chão: anda até lá. Arrastar gira a câmera (não conta como clique);
 * - hover (só mouse): destaca o astronauta e mostra o nome, ou o problema e o que vai acontecer.
 */
export class ScenePointer {
  private readonly raycaster = new THREE.Raycaster();
  private readonly label = document.createElement('div');
  private down: { x: number; y: number; t: number } | null = null;

  constructor(private readonly o: PointerOptions) {
    this.setupClick();
    this.setupHover();
  }

  private aim(e: PointerEvent): void {
    const rect = this.o.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.o.camera);
  }

  /** Primeiro objeto atingido que está visível (astronauta dentro da base fica escondido e não conta). */
  private firstVisibleHit(objects: THREE.Object3D[]): THREE.Intersection | undefined {
    return this.raycaster.intersectObjects(objects, true).find((h) => {
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (!o.visible) return false;
      return true;
    });
  }

  private roleOf(obj: THREE.Object3D): Role | null {
    for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (o.userData.role) return o.userData.role as Role;
    return null;
  }

  private problemOf(obj: THREE.Object3D): number | null {
    let o: THREE.Object3D | null = obj;
    while (o && o.userData.problemUid === undefined) o = o.parent;
    return o ? (o.userData.problemUid as number) : null;
  }

  private setupClick(): void {
    const el = this.o.canvas;
    el.addEventListener('pointerdown', (e) => (this.down = { x: e.clientX, y: e.clientY, t: performance.now() }));
    el.addEventListener('pointerup', (e) => {
      const d = this.down;
      this.down = null;
      if (!d || this.o.isNight() || this.o.isPaused()) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 500) return;
      this.aim(e);
      // 1) Problema.
      if (this.o.isDay()) {
        const hit = this.raycaster.intersectObjects(this.o.problemPickables(), true)[0];
        if (hit) {
          const uid = this.problemOf(hit.object);
          if (uid !== null) this.o.onProblem(uid);
          return;
        }
      }
      // 2) Astronauta.
      const hitCrew = this.firstVisibleHit([this.o.crewRoot]);
      const role = hitCrew ? this.roleOf(hitCrew.object) : null;
      if (role) {
        this.o.onCrew(role);
        return;
      }
      // 3) Chão.
      const ground = this.o.ground();
      const hit = ground && this.raycaster.intersectObject(ground, false)[0];
      if (hit) this.o.onGround(hit.point);
    });
  }

  private setupHover(): void {
    const el = this.o.canvas;
    this.label.className = 'hover-label';
    this.label.hidden = true;
    document.body.append(this.label);
    const clear = () => {
      this.o.onHover(null);
      this.label.hidden = true;
      el.style.cursor = '';
    };
    el.addEventListener('pointerleave', clear);
    el.addEventListener('pointermove', (e) => {
      // Só mouse (toque não tem hover), sem botão apertado e fora da noite.
      if (e.pointerType !== 'mouse' || e.buttons !== 0 || this.o.isNight()) {
        clear();
        return;
      }
      this.aim(e);
      let text: string | null = null;
      let role: Role | null = null;
      const problemHit = this.o.isDay() ? this.firstVisibleHit(this.o.problemPickables()) : undefined;
      if (problemHit) {
        const uid = this.problemOf(problemHit.object);
        if (uid !== null) text = this.o.problemLabel(uid);
      } else {
        const crewHit = this.firstVisibleHit([this.o.crewRoot]);
        role = crewHit ? this.roleOf(crewHit.object) : null;
        if (role) text = this.o.crewLabel(role);
      }
      this.o.onHover(role);
      el.style.cursor = text ? 'pointer' : '';
      this.label.hidden = !text;
      if (text) {
        this.label.textContent = text;
        this.label.style.left = `${e.clientX + 14}px`;
        this.label.style.top = `${e.clientY + 14}px`;
      }
    });
  }
}
