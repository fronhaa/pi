import * as THREE from 'three';
import { PALETTE, toonMesh } from '@/render/toon';
import { ROLES, type Role } from '@/sim/crew';
import { LYING_SCALE, POSTS } from './base/layout';
import type { ChibiAction, ChibiAstronautInstance } from '@/render/chibiAstronaut';

/** Velocidade em que o `walk` do chibi não escorrega (docs/astronauta-chibi.md). */
const CHIBI_WALK_SPEED = 1.15;
/** Deitado de costas: cabeça para −X e rosto para cima (o `model` olha para −Z em pé). */
const LIE_BASIS = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0));
/**
 * Olhar da tripulação (GDD, "Para onde o astronauta olha"): ninguém encara a câmera; todo giro é suave.
 * TURN_RATE: no máximo ~180°/s. Olhar livre troca de ponto a cada LOOK_MIN a LOOK_MIN + LOOK_SPREAD s.
 * Fora, parado, olha em volta até ±LOOK_AROUND rad da direção em que chegou.
 */
const TURN_RATE = Math.PI;
const LOOK_MIN = 4;
const LOOK_SPREAD = 4;
const LOOK_AROUND = 0.6;
/**
 * Deitar na cama: de costas para ela (de frente para o corredor, +Z), senta na beirada (pose `sit`, src/render/chibiSit.ts)
 * e deita girando em volta do quadril até ficar com a cabeça no travesseiro (deitado = LIE_BASIS). O giro é em volta da
 * articulação do quadril do chibi (legL, 0,55 m acima dos pés).
 */
const HIP_HEIGHT = 0.55;
const Q_LIE = new THREE.Quaternion().setFromRotationMatrix(LIE_BASIS);
const Q_FACING_OUT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
/** Direção (convenção do andar) de quem fica de pé ao lado da cama, de costas para ela: olhando para o corredor (+Z). */
export const FACING_OUT_OF_BED = Math.PI;
/** Pontos do corpo que podem encostar no chão ao deitar: cantos das botas e o capacete (no referencial do model). */
const HELMET_CENTER = new THREE.Vector3(0, 1.45, 0);
const HELMET_RADIUS = 0.42;
/** Altura do chibi em pé (m) e o quanto ele pode se curvar para passar num lugar baixo (túneis). */
const STAND_HEIGHT = 1.87;
const MAX_CROUCH = 0.6;
/** Curvado, também dobra um pouco os joelhos: o corpo desce até isto (m). */
const CROUCH_DROP = 0.08;
/** Duração do clipe `jump`. */
const CHIBI_JUMP_SECONDS = 1.35;

/** Cor de destaque de cada papel (faixa no traje). Laranja só no comandante, como detalhe. */
export const ROLE_COLORS: Record<Role, number> = {
  commander: PALETTE.accent,
  engineer: PALETTE.dust,
  medic: 0x8fbf9f,
  scientist: 0x7fa7c9,
};

/** Lista dos papéis (a fonte é src/sim/crew.ts). */
export { ROLES };

/** Astronauta (CHR-001 a 004). Escala: 1 unidade = 1 m; altura ~1,85 m (Art Bible). */
export class Astronaut {
  readonly root = new THREE.Group();
  /** Parte visual que gira para a direção do movimento. */
  readonly model = new THREE.Group();
  /** Postura dentro do `model`: curva o corpo para a frente (pivô nos pés) para passar em lugar baixo. */
  private readonly posture = new THREE.Group();
  private crouch = 0;
  /** Boneco simples feito de cápsulas: aparece até o chibi (.glb) carregar, ou se ele falhar. */
  private readonly fallback = new THREE.Group();
  private chibi: ChibiAstronautInstance | null = null;
  private action: ChibiAction | 'idle' = 'idle';
  private current: THREE.AnimationAction | null = null;
  private jumpLeft = 0;
  private working = false;
  private readonly ring: THREE.Mesh;
  private bobPhase = Math.random() * Math.PI * 2;

  constructor(readonly role: Role) {
    const suit = PALETTE.light;
    const accent = ROLE_COLORS[role];

    for (const side of [-1, 1]) {
      const leg = toonMesh(new THREE.CapsuleGeometry(0.13, 0.55, 4, 8), suit, 0.05);
      leg.position.set(side * 0.14, 0.42, 0);
      this.fallback.add(leg);
      const boot = toonMesh(new THREE.BoxGeometry(0.22, 0.14, 0.32), PALETTE.shadow, 0.05);
      boot.position.set(side * 0.14, 0.07, -0.04);
      this.fallback.add(boot);
    }
    const torso = toonMesh(new THREE.CapsuleGeometry(0.3, 0.45, 4, 12), suit, 0.04);
    torso.position.y = 1.12;
    this.fallback.add(torso);
    const band = toonMesh(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 16), accent, 0);
    band.position.y = 1.0;
    this.fallback.add(band);
    for (const side of [-1, 1]) {
      const arm = toonMesh(new THREE.CapsuleGeometry(0.09, 0.45, 4, 8), suit, 0.05);
      arm.position.set(side * 0.4, 1.1, 0);
      arm.rotation.z = side * 0.12;
      this.fallback.add(arm);
    }
    const pack = toonMesh(new THREE.BoxGeometry(0.5, 0.6, 0.25), PALETTE.tech, 0.04);
    pack.position.set(0, 1.15, 0.3);
    this.fallback.add(pack);
    const helmet = toonMesh(new THREE.SphereGeometry(0.25, 16, 12), suit, 0.04);
    helmet.position.y = 1.62;
    this.fallback.add(helmet);
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 10, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.38),
      new THREE.MeshToonMaterial({ color: 0x2b3a4a }),
    );
    visor.position.set(0, 1.62, -0.07);
    visor.rotation.y = Math.PI;
    this.fallback.add(visor);

    this.model.add(this.posture);
    this.posture.add(this.fallback);

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

  /** Troca o boneco simples pelo chibi. O .glb olha para +Z; o `model` daqui olha para −Z. */
  useChibi(chibi: ChibiAstronautInstance): void {
    this.chibi = chibi;
    chibi.root.rotation.y = Math.PI;
    this.posture.add(chibi.root);
    this.fallback.visible = false;
    this.model.position.y = 0;
    this.action = 'idle';
  }

  private lying = false;

  /** Deitado na cama (dormindo ou descansando), ou de volta em pé. */
  setLying(on: boolean): void {
    if (on === this.lying) return;
    this.lying = on;
    // Deitado não fica curvado (a postura só vale em pé).
    this.crouch = 0;
    this.posture.rotation.x = 0;
    this.posture.position.y = 0;
    if (on) this.model.quaternion.setFromRotationMatrix(LIE_BASIS);
    else this.model.rotation.set(0, this.model.rotation.y, 0);
    // Deitado, no tamanho LYING_SCALE (hoje o normal).
    this.model.scale.setScalar(on ? LYING_SCALE : 1);
  }

  /**
   * Abaixa para caber num lugar com `headroom` metros de altura (túneis): curva o corpo para a frente, sem
   * pular (suaviza até o ângulo). Com altura de sobra, volta a ficar em pé.
   */
  fitHeadroom(headroom: number, dt: number): void {
    const target = Math.min(MAX_CROUCH, Math.acos(THREE.MathUtils.clamp((headroom - 0.08) / STAND_HEIGHT, 0, 1)));
    this.crouch = THREE.MathUtils.damp(this.crouch, target, 8, dt);
    if (this.crouch < 0.002) this.crouch = 0;
    // O `model` olha para −Z: girar em X para o lado negativo leva a cabeça para a frente.
    this.posture.rotation.x = -this.crouch;
    this.posture.position.y = -CROUCH_DROP * (this.crouch / MAX_CROUCH);
  }

  /** Onde fica o quadril de quem está deitado com os pés em `feet` (a posição da cama). */
  static lyingHip(feet: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(0, HIP_HEIGHT * LYING_SCALE, 0).applyQuaternion(Q_LIE).add(feet);
  }

  /** Onde fica o quadril de quem está em pé em `feet`. */
  static standingHip(feet: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(feet.x, feet.y + HIP_HEIGHT, feet.z);
  }

  /**
   * Na cama: `k` vai de sentado/em pé de costas para a cama (0) a deitado (1), girando em volta do quadril, que fica em
   * `hip`; `sit` é o quanto está sentado (0 em pé, 1 sentado na beirada; pose `sit` do chibi). Sem pular nem deslizar
   * deitado no ar; nada do corpo abaixo de `floorY`.
   */
  bedBlend(k: number, sit: number, hip: THREE.Vector3, floorY: number, dt: number): void {
    this.lying = k >= 1;
    this.crouch = 0;
    this.posture.rotation.x = 0;
    this.posture.position.y = 0;
    this.model.quaternion.copy(Q_FACING_OUT).slerp(Q_LIE, k);
    const scale = THREE.MathUtils.lerp(1, LYING_SCALE, k);
    this.model.scale.setScalar(scale);
    const hipOffset = new THREE.Vector3(0, HIP_HEIGHT * scale, 0).applyQuaternion(this.model.quaternion);
    this.root.position.copy(hip).sub(hipOffset);
    // O capacete nunca abaixo do chão: se precisar, sobe tudo um pouco (contínuo, sem pulos).
    const q = this.model.quaternion;
    const lowest = new THREE.Vector3().copy(HELMET_CENTER).multiplyScalar(scale).applyQuaternion(q).y - HELMET_RADIUS * scale;
    const lift = floorY - (this.root.position.y + lowest);
    if (lift > 0) this.root.position.y += lift;
    // Pose de sentar pelo peso da ação (o resto do peso é a pose parada).
    if (!this.chibi) return;
    if (sit > 0.001) {
      if (this.action !== 'sit') this.playChibi('sit');
      this.current?.setEffectiveWeight(sit);
    } else if (this.action === 'sit') this.playChibi('idle');
    this.chibi.update(dt);
  }

  /** Exercício sem sair do lugar: `walk` na esteira (speed em m/s), `pedal` na bicicleta (speed = ritmo do clipe). */
  exercise(clip: 'walk' | 'pedal', speed: number, dt: number): void {
    if (!this.chibi) return this.idle(dt);
    if (clip === 'walk') return this.animateChibi(speed, dt);
    this.playChibi('pedal');
    if (this.current) this.current.timeScale = speed;
    this.chibi.update(dt);
  }

  // ---------- olhar (GDD, "Para onde o astronauta olha") ----------

  /** Câmera de quem tocou e quanto tempo ainda fica olhando para ela. */
  private lookPoint: THREE.Vector3 | null = null;
  private lookLeft = 0;
  /** Olhar livre: ponto atual (dentro) ou direção atual (fora) e tempo até trocar. */
  private freePoint: THREE.Vector3 | null = null;
  private freeHeading: number | null = null;
  private freeTimer = 0;
  /** Fora, parado: direção em que chegou (o olhar em volta gira em torno dela). */
  private restHeading: number | null = null;

  /** Direção (convenção do andar: 0 olha para −Z) de onde está até um ponto. */
  private headingTo(p: THREE.Vector3): number {
    return Math.atan2(-(p.x - this.root.position.x), -(p.z - this.root.position.z));
  }

  /** Gira devagar até a direção, no máximo TURN_RATE por segundo: nunca pula. */
  private turnTo(heading: number, dt: number): void {
    const r = this.model.rotation;
    const diff = Math.atan2(Math.sin(heading - r.y), Math.cos(heading - r.y));
    const step = TURN_RATE * dt;
    r.y += Math.max(-step, Math.min(step, diff));
  }

  private nextFreeTime(): number {
    return LOOK_MIN + Math.random() * LOOK_SPREAD;
  }

  /** Tocado e sem tarefa: vira devagar para a câmera de quem controla, olha por `seconds` e volta a ficar livre. */
  lookAt(point: THREE.Vector3, seconds: number): void {
    this.lookPoint = point;
    this.lookLeft = seconds;
  }

  /** Recebeu uma ordem: para de olhar para a câmera e vai cumprir. */
  cancelLook(): void {
    this.lookLeft = 0;
  }

  /** Olhando para quem tocou? Gasta o tempo e gira. */
  private lookingAtCamera(dt: number): boolean {
    if (this.lookLeft <= 0 || !this.lookPoint || this.working) return false;
    this.lookLeft -= dt;
    this.turnTo(this.headingTo(this.lookPoint), dt);
    return true;
  }

  /**
   * Parado sem tarefa dentro da base: olha para a estação do módulo e, de vez em quando, para um colega
   * ou de volta para a estação. Tocado, olha para a câmera por um tempo.
   */
  lookFree(dt: number, station: THREE.Vector3, others: THREE.Vector3[]): void {
    if (this.lookingAtCamera(dt)) return;
    this.freeTimer -= dt;
    if (!this.freePoint || this.freeTimer <= 0) {
      this.freeTimer = this.nextFreeTime();
      const toColleague = this.freePoint !== null && others.length > 0 && Math.random() < 0.5;
      this.freePoint = (toColleague ? others[Math.floor(Math.random() * others.length)] : station).clone();
    }
    this.turnTo(this.headingTo(this.freePoint), dt);
  }

  /** Tarefa ou estação (conserto, esteira): olha para ela e nunca para a câmera. */
  faceToward(point: THREE.Vector3, dt: number): void {
    this.lookLeft = 0;
    this.turnTo(this.headingTo(point), dt);
  }

  faceHeading(heading: number, dt: number): void {
    this.lookLeft = 0;
    this.turnTo(heading, dt);
  }

  /** Fora, parado: mantém a direção em que chegou e de vez em quando olha em volta (nunca durante o conserto). */
  private lookAroundOutside(dt: number): void {
    if (this.working || this.lookingAtCamera(dt)) return;
    this.restHeading ??= this.model.rotation.y;
    this.freeTimer -= dt;
    if (this.freeTimer <= 0) {
      this.freeTimer = this.nextFreeTime();
      this.freeHeading = this.restHeading + (Math.random() * 2 - 1) * LOOK_AROUND;
    }
    if (this.freeHeading !== null) this.turnTo(this.freeHeading, dt);
  }

  /** Mexendo em algo parado (manutenção do rover): segura o tablet (clipe `interact`). */
  tinker(dt: number): void {
    if (!this.chibi) return this.idle(dt);
    this.playChibi('interact');
    this.chibi.update(dt);
  }

  /** Pulo (Espaço): toca o clipe `jump` uma vez. */
  jump(): void {
    if (!this.chibi) return;
    this.jumpLeft = CHIBI_JUMP_SECONDS;
    this.playChibi('jump');
  }

  /** Consertando um problema: segura o tablet (clipe `interact`). */
  setWorking(on: boolean): void {
    this.working = on;
  }

  private playChibi(next: ChibiAction | 'idle'): void {
    const c = this.chibi!;
    if (next === this.action && next !== 'jump') return;
    this.action = next;
    if (next === 'idle') {
      c.stop();
      this.current = null;
    } else this.current = c.play(next);
  }

  /** Escolhe a animação do chibi pelo estado e avança o mixer. */
  private animateChibi(speed: number, dt: number): void {
    const c = this.chibi!;
    this.jumpLeft = Math.max(0, this.jumpLeft - dt);
    if (this.jumpLeft === 0) {
      if (speed >= 0.2) {
        this.playChibi('walk');
        if (this.current) this.current.timeScale = speed / CHIBI_WALK_SPEED;
      } else this.playChibi(this.working ? 'interact' : 'idle');
    }
    c.update(dt);
  }

  /** Respiração/balanço leve quando parado. */
  idle(dt: number): void {
    if (this.chibi) {
      this.animateChibi(0, dt);
      return;
    }
    this.bobPhase += dt * 2;
    this.model.position.y = Math.max(0, Math.sin(this.bobPhase) * 0.015);
  }

  /** Chamado pela física: anda (anima e vira para a direção) ou fica parado. */
  setMotion(speed: number, heading: number, dt: number): void {
    this.setLying(false);
    if (speed < 0.2) {
      this.lookAroundOutside(dt);
      this.idle(dt);
      return;
    }
    // Andando: olha para onde anda (o olhar livre recomeça quando parar).
    this.restHeading = null;
    this.freeHeading = null;
    this.lookLeft = 0;
    if (this.chibi) this.animateChibi(speed, dt);
    else {
      this.bobPhase += dt * speed * 4;
      this.model.position.y = Math.abs(Math.sin(this.bobPhase)) * 0.06;
    }
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

  /**
   * Troca os bonecos simples pelo astronauta chibi (.glb), com a cor do papel no lugar do laranja.
   * Se o .glb falhar, os bonecos simples continuam (o jogo segue funcionando).
   */
  async loadChibi(): Promise<void> {
    try {
      const { loadChibiAstronaut } = await import('@/render/chibiAstronaut');
      const models = await Promise.all(ROLES.map((r) => loadChibiAstronaut(undefined, { accent: ROLE_COLORS[r] })));
      ROLES.forEach((r, i) => this.members[r].useChibi(models[i]));
    } catch (err) {
      console.warn('Astronauta chibi não carregou; usando o boneco simples.', err);
    }
  }

  /** Na noite de tempestade, a tripulação corre para o abrigo e some (GDD). */
  setSheltered(on: boolean): void {
    for (const a of Object.values(this.members)) a.root.visible = !on;
  }

  update(dt: number): void {
    for (const a of Object.values(this.members)) a.idle(dt);
  }
}
