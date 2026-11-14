import * as THREE from 'three';
import { PALETTE, toonMesh } from '@/render/toon';
import type { SceneryModel } from '@/render/sceneryModel';
import { terrainHeight, type Obstacle } from './layout';
import type { Rock } from './terrain';

// Valores de cena (só visual), não regras do jogo.

/** Centro da base: o rover mede daqui o quanto está longe. */
const BASE_CENTER = { x: 2, z: 2 };
/**
 * Até onde o rover vai explorar (m do centro da base): mais blocos de ciência, destinos mais longe.
 * Com 1 bloco ele fica perto (até ~25 m); com 6 ou mais chega a ~50 m, ainda dentro do zoom máximo da câmera.
 */
const RANGE_MIN = 20;
const RANGE_PER_BLOCK = 5;
const RANGE_MAX = 50;
/** Largura da faixa de destinos: ele explora entre (alcance − isto) e o alcance. */
const RANGE_BAND = 14;
/** Mais perto que isto do centro ficam os prédios e os painéis: nenhum destino aqui. */
const RANGE_INNER_MIN = 15;
/**
 * Miolo da base (prédios, painéis): o rover não atravessa, contorna por fora num círculo deste raio.
 * Sem isso ele podia entrar entre os prédios e ficar sem saída.
 */
const CORE_RADIUS = 14;
const ORBIT_RADIUS = 19;
/** Quanto ele avança no contorno por vez (rad): o ponto de passagem anda junto com ele. */
const ORBIT_STEP = 0.9;
/** Velocidade andando (m/s) e giro máximo (rad/s): ele vira aos poucos, como um veículo de verdade. */
const DRIVE_SPEED = 2.4;
const TURN_RATE = 1.3;
/** Parado estudando no destino (s). */
const STUDY_SECONDS = 5;
/** Quanto à frente ele olha para desviar (m), meia-largura com folga e distância segura de um astronauta. */
const LOOKAHEAD = 6;
const ROVER_HALF = 0.9;
const CREW_SAFE = 1.4;
/** Astronauta colado: para na hora. */
const CREW_NEAR = 1.7;
/** Direções que ele testa para desviar (rad, a partir da direção do destino). */
const DETOURS = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75];
/** Ângulo do braço: guardado (em pé) e estudando (apontado para o chão à frente). */
const ARM_STOWED = 1.35;
const ARM_DEPLOYED = -0.75;

/** Até onde o rover explora com estes blocos de ciência: faixa [perto, longe] em metros do centro da base. */
export function exploreRange(scienceBlocks: number): { near: number; far: number } {
  const far = THREE.MathUtils.clamp(RANGE_MIN + RANGE_PER_BLOCK * scienceBlocks, RANGE_MIN + 3, RANGE_MAX);
  return { near: Math.max(RANGE_INNER_MIN, far - RANGE_BAND), far };
}

interface Target {
  x: number;
  z: number;
  /** Para a esta distância do destino (na frente da pedra, não em cima dela). */
  stop: number;
  rock: Rock | null;
  /** Segundos dirigindo até ele; demorou demais (preso atrás de algo), escolhe outro. */
  driving: number;
  limit: number;
}

/**
 * Rover de seis rodas (VEH-001), inspirado no Perseverance (INTERPRETADO). Só visual.
 *
 * Com blocos de ciência ele EXPLORA: escolhe uma pedra (ou um ponto) para estudar, dirige até lá,
 * para e estuda (o braço desce, a câmera olha a pedra), e escolhe o próximo destino. Quanto mais
 * blocos, mais longe da base ficam os destinos (`exploreRange`): a criança vê a energia virar
 * exploração. No caminho ele desvia de prédios, pedras e astronautas (como o AutoNav do
 * Perseverance); sem passagem, ou com um astronauta colado, para e pisca a luz âmbar.
 * À noite ou sem blocos, fica parado. Com o problema "rover atolado", fica preso no lugar.
 * Troca o modelo simples pelo rover .glb do Grégor quando ele carrega (docs/rover-e-base-de-pesquisa.md).
 */
export class Rover {
  readonly root = new THREE.Group();
  /** Animações do .glb (mastro escaneando, broca). */
  mixer: THREE.AnimationMixer | null = null;
  private model: SceneryModel | null = null;
  private modelStudying = false;
  private wheelRadius = 0.3;
  /** Rover atolado: fica parado e inclinado neste ponto até alguém resolver. */
  private stuckAt: THREE.Vector3 | null = null;
  /** Parado porque há um astronauta (ou nenhuma passagem) à frente, e há quanto tempo a frente está livre. */
  private blocked = false;
  private clearFor = 0;
  /** Rodas (giram conforme a distância percorrida) e direção do nariz (0 = +X; gira no sentido anti-horário visto de cima). */
  private readonly wheels: THREE.Object3D[] = [];
  private heading = 0;
  private target: Target | null = null;
  private lastRock: Rock | null = null;
  private phase: 'drive' | 'study' = 'drive';
  private studyLeft = 0;
  private readonly warning: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** Cabeça da câmera (gira para olhar a rocha), braço robótico (desce para estudar) e luz do instrumento. */
  private readonly head: THREE.Group;
  private readonly arm: THREE.Group;
  private readonly probe: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  /**
   * @param obstacles caixas dos prédios (o rover desvia delas)
   * @param rocks pedras do terreno (destinos de estudo; ele desvia das outras)
   */
  constructor(
    private readonly obstacles: readonly Obstacle[],
    private readonly rocks: readonly Rock[],
  ) {
    // VEH-001: rover de seis rodas, inspirado no Perseverance (INTERPRETADO).
    const body = toonMesh(new THREE.BoxGeometry(2, 0.6, 1.3), PALETTE.light);
    body.position.y = 0.85;
    this.root.add(body);
    const stripe = toonMesh(new THREE.BoxGeometry(2.02, 0.12, 1.32), PALETTE.accent, 0);
    stripe.position.y = 0.6;
    this.root.add(stripe);
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.25, 12);
    wheelGeo.rotateX(Math.PI / 2);
    for (const x of [-0.75, 0, 0.75]) {
      for (const z of [-0.75, 0.75]) {
        const w = toonMesh(wheelGeo, PALETTE.shadow, 0.04);
        this.wheels.push(w);
        // Raio da roda visível ao girar (sem isso a roda lisa parece parada).
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.27), new THREE.MeshBasicMaterial({ color: PALETTE.tech }));
        w.add(spoke);
        w.position.set(x, 0.3, z);
        this.root.add(w);
      }
    }
    const mast = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), PALETTE.tech, 0);
    mast.position.set(0.7, 1.6, 0);
    this.root.add(mast);
    // Cabeça num pivô próprio, para girar e "olhar" a rocha ao estudar.
    this.head = new THREE.Group();
    this.head.position.set(0.7, 2.15, 0);
    this.head.add(toonMesh(new THREE.BoxGeometry(0.35, 0.25, 0.45), PALETTE.light));
    this.root.add(this.head);
    // Braço robótico na frente: guardado em pé ao andar, desce até o chão ao estudar.
    this.arm = new THREE.Group();
    this.arm.position.set(1.0, 0.95, 0.5);
    const armGeo = new THREE.BoxGeometry(1.0, 0.14, 0.14);
    armGeo.translate(0.5, 0, 0);
    this.arm.add(toonMesh(armGeo, PALETTE.light, 0.03));
    this.probe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: PALETTE.tech }));
    this.probe.position.set(1.05, 0, 0);
    this.arm.add(this.probe);
    this.arm.rotation.z = ARM_STOWED;
    this.root.add(this.arm);
    // Luz de aviso: pisca em âmbar quando o rover para por causa de um astronauta na rota.
    this.warning = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0x5a4a2a }));
    this.warning.position.set(0.7, 2.36, 0);
    this.root.add(this.warning);
    this.root.position.set(12.5, 0, 9);
  }

  /** Troca o rover simples pelo .glb: a lógica de andar, parar e desviar continua a mesma. */
  useModel(m: SceneryModel): void {
    // O rover simples some (menos a luz de aviso).
    for (const c of this.root.children) if (c !== this.warning) c.visible = false;
    this.wheels.length = 0;
    for (let i = 0; i < 6; i++) {
      const w = m.root.getObjectByName(`wheel_${i}`);
      if (w) this.wheels.push(w);
    }
    this.wheelRadius = 0.34;
    this.warning.position.set(0, 2.62, 0);
    this.root.add(m.root);
    this.model = m;
    this.mixer = m.mixer;
  }

  /** Atola o rover neste ponto (problema "rover atolado") ou solta (null). */
  setStuck(at: THREE.Vector3 | null): void {
    const wasStuck = this.stuckAt !== null;
    this.stuckAt = at;
    if (!at) this.root.rotation.set(0, this.heading, 0);
    if (at) this.heading = 0.7; // a inclinação de atolado usa este giro
    // Desatolou: segue explorando a partir de onde está (anda até o próximo destino, sem teleporte).
    if (!at && wasStuck) {
      this.target = null;
      this.phase = 'drive';
    }
  }

  /** O rover está parado estudando uma rocha? (para testes) */
  get isStudying(): boolean {
    return this.phase === 'study';
  }

  /** O rover está parado esperando um astronauta sair da frente? (para testes e interface) */
  get isWaiting(): boolean {
    return this.blocked;
  }

  /** Distância do rover até o centro da base (m). (para testes) */
  get distanceFromBase(): number {
    return Math.hypot(this.root.position.x - BASE_CENTER.x, this.root.position.z - BASE_CENTER.z);
  }

  /** Destino atual (para testes). */
  get destination(): { x: number; z: number } | null {
    return this.target ? { x: this.target.x, z: this.target.z } : null;
  }

  // ---------- destino ----------

  private fromBase(x: number, z: number): number {
    return Math.hypot(x - BASE_CENTER.x, z - BASE_CENTER.z);
  }

  /** O ponto fica dentro (ou colado) de um prédio? */
  private insideObstacle(x: number, z: number, margin: number): boolean {
    return this.obstacles.some((o) => Math.abs(x - o.center.x) < o.half.x + margin && Math.abs(z - o.center.z) < o.half.z + margin);
  }

  /**
   * Escolhe o próximo destino dentro da faixa de exploração: de preferência uma pedra (o que um rover
   * real vai estudar), longe o bastante de onde ele está para valer a viagem. Sem pedra na faixa, um ponto livre.
   */
  private pickTarget(scienceBlocks: number): void {
    const { near, far } = exploreRange(scienceBlocks);
    const p = this.root.position;
    const rocks = this.rocks.filter((k) => {
      const d = this.fromBase(k.x, k.z);
      return d >= near && d <= far && k !== this.lastRock && Math.hypot(k.x - p.x, k.z - p.z) > 8;
    });
    let x: number;
    let z: number;
    let stop = 1;
    let rock: Rock | null = null;
    if (rocks.length) {
      rock = rocks[Math.floor(Math.random() * rocks.length)];
      ({ x, z } = rock);
      stop = rock.r + 1.6;
    } else {
      let tries = 0;
      do {
        const a = Math.random() * Math.PI * 2;
        const d = near + Math.random() * (far - near);
        x = BASE_CENTER.x + Math.cos(a) * d;
        z = BASE_CENTER.z + Math.sin(a) * d;
      } while (this.insideObstacle(x, z, 2) && ++tries < 20);
    }
    const dist = Math.hypot(x - p.x, z - p.z);
    this.target = { x, z, stop, rock, driving: 0, limit: (dist / DRIVE_SPEED) * 2.5 + 8 };
    this.lastRock = rock;
  }

  /** A linha reta nesta direção, até `length` m, passa livre de prédios, pedras (menos a do destino) e astronautas? */
  private pathFree(heading: number, length: number, crew: THREE.Vector3[]): boolean {
    const p = this.root.position;
    const fx = Math.cos(heading);
    const fz = -Math.sin(heading);
    // O que já encosta nele agora (ex.: desatolou ao lado de uma pedra) não bloqueia: ele precisa conseguir sair dali.
    const touching = (x: number, z: number, r: number) => Math.hypot(x - p.x, z - p.z) < r;
    const steps = Math.max(1, Math.ceil(length));
    for (let i = 1; i <= steps; i++) {
      const s = (i / steps) * length;
      const x = p.x + fx * s;
      const z = p.z + fz * s;
      if (this.fromBase(x, z) > RANGE_MAX + 6) return false;
      if (this.insideObstacle(x, z, ROVER_HALF) && !this.insideObstacle(p.x, p.z, ROVER_HALF)) return false;
      for (const k of this.rocks) {
        if (k === this.target?.rock || touching(k.x, k.z, k.r + ROVER_HALF)) continue;
        if (Math.hypot(k.x - x, k.z - z) < k.r + ROVER_HALF) return false;
      }
      for (const c of crew) if (Math.hypot(c.x - x, c.z - z) < CREW_SAFE) return false;
    }
    return true;
  }

  /**
   * Próximo ponto da viagem: o destino, se a linha reta até ele não corta o miolo da base; senão, um ponto
   * no contorno, um pouco à frente, pelo lado mais curto. Dentro do miolo, primeiro sai para fora.
   */
  private waypoint(): { x: number; z: number; final: boolean } {
    const t = this.target!;
    const p = this.root.position;
    const { x: cx, z: cz } = BASE_CENTER;
    const orbit = (a: number) => ({ x: cx + Math.cos(a) * ORBIT_RADIUS, z: cz + Math.sin(a) * ORBIT_RADIUS, final: false });
    const ap = Math.atan2(p.z - cz, p.x - cx);
    if (this.fromBase(p.x, p.z) < CORE_RADIUS) return orbit(ap);
    // Ponto do segmento rover → destino mais perto do centro da base.
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const k = THREE.MathUtils.clamp(((cx - p.x) * dx + (cz - p.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    if (this.fromBase(p.x + dx * k, p.z + dz * k) >= CORE_RADIUS) return { x: t.x, z: t.z, final: true };
    const at = Math.atan2(t.z - cz, t.x - cx);
    const diff = Math.atan2(Math.sin(at - ap), Math.cos(at - ap));
    return orbit(ap + THREE.MathUtils.clamp(diff, -ORBIT_STEP, ORBIT_STEP));
  }

  /**
   * Para onde virar agora: a direção do próximo ponto, se estiver livre; senão, o desvio livre mais perto dela
   * (empatados, o que exige virar menos). null = nenhuma passagem.
   */
  private steer(crew: THREE.Vector3[]): number | null {
    const t = this.target!;
    const w = this.waypoint();
    const p = this.root.position;
    const toTarget = Math.atan2(-(w.z - p.z), w.x - p.x);
    const length = w.final ? Math.min(LOOKAHEAD, Math.max(1, Math.hypot(t.x - p.x, t.z - p.z) - t.stop)) : LOOKAHEAD;
    const turn = (h: number) => Math.abs(Math.atan2(Math.sin(h - this.heading), Math.cos(h - this.heading)));
    const options = DETOURS.map((d) => toTarget + d).sort((a, b) => Math.abs(a - toTarget) - Math.abs(b - toTarget) || turn(a) - turn(b));
    const ahead = options.find((h) => this.pathFree(h, length, crew));
    if (ahead !== undefined) return ahead;
    // Encurralado (a frente toda fechada): manobra para qualquer lado livre, o que exige virar menos.
    const around = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2).sort((a, b) => turn(a) - turn(b));
    return around.find((h) => this.pathFree(h, 2, crew)) ?? null;
  }

  private animateTools(studying: boolean, dt: number, time: number): void {
    // Rover .glb: ao parar para estudar, o mastro escaneia e a broca desce; ao voltar a andar, para tudo.
    if (this.model && studying !== this.modelStudying) {
      this.modelStudying = studying;
      if (studying) {
        this.model.play('scan');
        this.model.play('drill', true);
      } else this.model.mixer.stopAllAction();
    }
    this.arm.rotation.z = THREE.MathUtils.damp(this.arm.rotation.z, studying ? ARM_DEPLOYED : ARM_STOWED, 4, dt);
    let yaw = 0;
    if (studying) {
      const p = this.root.position;
      let best: { x: number; z: number } | null = null;
      for (const k of this.rocks) {
        if (Math.hypot(k.x - p.x, k.z - p.z) < 9 && (!best || Math.hypot(k.x - p.x, k.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z))) best = k;
      }
      if (best) {
        // Ângulo da pedra no referencial do rover (frente = +x local), limitado ao giro da cabeça.
        const world = Math.atan2(-(best.z - p.z), best.x - p.x);
        yaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(world - this.root.rotation.y), Math.cos(world - this.root.rotation.y)), -1.4, 1.4);
      } else {
        yaw = Math.sin(time * 0.8) * 0.8; // sem pedra perto: olha em volta
      }
    }
    this.head.rotation.y = THREE.MathUtils.damp(this.head.rotation.y, yaw, 3, dt);
    this.probe.material.color.setHex(studying && Math.sin(time * 8) > 0 ? 0x9fe3ff : PALETTE.tech);
  }

  // ---------- por frame ----------

  /**
   * Um passo da animação. `crew` = astronautas visíveis lá fora (o rover desvia deles);
   * sem blocos de ciência, ou à noite, ele fica parado.
   */
  update(dt: number, time: number, crew: THREE.Vector3[], scienceBlocks: number, night: boolean): void {
    if (this.stuckAt) {
      this.root.position.set(this.stuckAt.x + 1.6, terrainHeight(this.stuckAt.x, this.stuckAt.z) - 0.25, this.stuckAt.z + 0.6);
      this.root.rotation.set(0.18, 0.7, 0.12);
      this.blocked = false;
      this.animateTools(false, dt, time);
    } else if (scienceBlocks > 0 && !night) {
      this.explore(dt, time, crew, scienceBlocks);
    } else {
      this.blocked = false;
      this.animateTools(false, dt, time);
    }
    this.warning.material.color.setHex(this.blocked && Math.sin(time * 10) > 0 ? 0xffb020 : 0x5a4a2a);
  }

  private explore(dt: number, time: number, crew: THREE.Vector3[], scienceBlocks: number): void {
    const p = this.root.position;
    if (this.phase === 'study') {
      this.studyLeft -= dt;
      this.animateTools(true, dt, time);
      if (this.studyLeft <= 0) {
        this.phase = 'drive';
        this.target = null;
      }
      return;
    }
    // Sem destino, ou o destino ficou longe demais (tiraram blocos de ciência): escolhe outro.
    const { far } = exploreRange(scienceBlocks);
    if (!this.target || this.fromBase(this.target.x, this.target.z) > far + 4) this.pickTarget(scienceBlocks);
    const t = this.target!;
    t.driving += dt;
    if (t.driving > t.limit) {
      this.pickTarget(scienceBlocks); // preso atrás de algo: tenta outro lugar
      return;
    }
    // Chegou: para e estuda.
    if (Math.hypot(t.x - p.x, t.z - p.z) <= t.stop) {
      this.phase = 'study';
      this.studyLeft = STUDY_SECONDS;
      this.blocked = false;
      return;
    }

    // Segurança: astronauta colado, ou astronauta fechando a passagem → para e pisca. Retoma 0,6 s depois de a frente liberar.
    // Sem passagem por causa de pedras ou prédios (sem astronauta): não espera, escolhe outro destino.
    const close = crew.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < CREW_NEAR);
    const heading = close ? null : this.steer(crew);
    if (heading === null && !close && this.steer([]) === null) {
      this.blocked = false;
      this.pickTarget(scienceBlocks);
      return;
    }
    if (heading === null) {
      this.blocked = true;
      this.clearFor = 0;
    } else if (this.blocked) {
      this.clearFor += dt;
      if (this.clearFor > 0.6) this.blocked = false;
    }
    this.animateTools(false, dt, time);
    if (this.blocked || heading === null) return;

    // Vira aos poucos para a direção escolhida e anda mais devagar nas curvas fechadas.
    const diff = Math.atan2(Math.sin(heading - this.heading), Math.cos(heading - this.heading));
    this.heading += THREE.MathUtils.clamp(diff, -TURN_RATE * dt, TURN_RATE * dt);
    const speed = DRIVE_SPEED * Math.max(0.35, Math.cos(diff));
    const step = speed * dt;
    const x = p.x + Math.cos(this.heading) * step;
    const z = p.z - Math.sin(this.heading) * step;
    for (const w of this.wheels) w.rotation.z -= step / this.wheelRadius;

    // Terreno: inclina o rover conforme o relevo (frente/trás = arfagem, lados = rolagem).
    const h = this.heading;
    const fx = Math.cos(h);
    const fz = -Math.sin(h);
    const front = terrainHeight(x + fx, z + fz);
    const back = terrainHeight(x - fx, z - fz);
    const left = terrainHeight(x - fz * 0.65, z + fx * 0.65);
    const right = terrainHeight(x + fz * 0.65, z - fx * 0.65);
    this.root.rotation.order = 'YZX';
    this.root.rotation.set(Math.atan2(left - right, 1.3), h, Math.atan2(front - back, 2));
    this.root.position.set(x, terrainHeight(x, z), z);
  }
}
