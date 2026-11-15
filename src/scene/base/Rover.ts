import * as THREE from 'three';
import { PALETTE, toonMesh } from '@/render/toon';
import type { SceneryModel } from '@/render/sceneryModel';
import { GARAGE_FLOOR_Y, GARAGE_POSITION, GARAGE_RAMP, GARAGE_SCALE, ROVER_DOCK, ROVER_KEEP_OUT, ROVER_TRACK, terrainHeight, type Obstacle } from './layout';
import type { Rock } from './terrain';

// Valores de cena (só visual), não regras do jogo.

/** Centro da base: o rover mede daqui o quanto está longe. */
const BASE_CENTER = { x: ROVER_TRACK.cx, z: ROVER_TRACK.cz };
/**
 * Até onde o rover vai explorar (m do centro da base): mais blocos de ciência, destinos mais longe.
 * Com 1 bloco ele fica perto (até ~33 m); com 5 ou mais chega a ~52 m, ainda dentro do zoom máximo da câmera.
 */
const RANGE_MIN = 28;
const RANGE_PER_BLOCK = 5;
const RANGE_MAX = 52;
/** Largura da faixa de destinos: ele explora entre (alcance − isto) e o alcance. */
const RANGE_BAND = 14;
const RANGE_INNER_MIN = 20;
/**
 * A base inteira (prédios, painéis, abrigo) fica dentro desta elipse: o rover nunca a atravessa.
 * Para ir ao outro lado ele contorna pela elipse de fora (ORBIT), que passa longe dos prédios.
 */
const CORE = { rx: ROVER_TRACK.rx, rz: ROVER_TRACK.rz };
const ORBIT = { rx: ROVER_TRACK.rx + 4, rz: ROVER_TRACK.rz + 4 };
/** Quanto ele avança no contorno por vez (rad): o ponto de passagem anda junto com ele. */
const ORBIT_STEP = 0.6;
/** Antes de andar, confere esta distância à frente do nariz (m); fechado, gira parado. */
const NOSE_CHECK = 1.5;
/** Paradas de estudo por expedição: depois delas, volta à garagem para entregar as amostras. */
const EXPEDITION_STUDIES = 3;
/** Na garagem: entrega as amostras (braço estendido) e fica em revisão até estar pronto (s). */
const DELIVER_SECONDS = 2.5;
const SERVICE_SECONDS = 9;
/** Velocidade na rampa e na manobra de entrar e sair (m/s): devagar e com cuidado. */
const DOCK_SPEED = 1.3;
/**
 * Rodas (como o Perseverance: suspensão rocker-bogie e as 4 rodas dos cantos viram).
 * Cada roda sobe ou desce até SUSPENSION_UP/DOWN m para acompanhar o chão embaixo dela; o corpo fica na média.
 * As rodas dos cantos viram até STEER_MAX rad: na curva, apontam para o centro da curva; girando parado, ficam em "X".
 */
const SUSPENSION_UP = 0.22;
const SUSPENSION_DOWN = 0.15;
const STEER_MAX = 0.9;
/** Quão rápido a suspensão, a direção das rodas e a inclinação do corpo acompanham (1/s). */
const SUSPENSION_SPEED = 12;
const STEER_SPEED = 16;
const TILT_SPEED = 10;
/** Na rampa, mais devagar perto do pé e do topo (onde a inclinação muda). */
const RAMP_EASE = 0.5;
/** Luz da revisão (verde) e de espera por astronauta (âmbar). */
const LIGHT_SERVICE = 0x5cf07a;
/** Velocidade andando (m/s) e giro máximo (rad/s): ele vira aos poucos, como um veículo de verdade. */
const DRIVE_SPEED = 2.4;
const TURN_RATE = 1.3;
/** Parado estudando no destino (s). */
const STUDY_SECONDS = 5;
/**
 * Planejamento do caminho, como o AutoNav do Perseverance (as câmeras montam o terreno em 3D à frente):
 * ele avalia várias direções até PLAN_RANGE m e escolhe a melhor por uma nota (custo), muito antes de chegar
 * no obstáculo. Assim começa a curva cedo e suave, em vez de desviar em cima da hora.
 */
const PLAN_RANGE = 10;
/** Folga que ele prefere manter dos obstáculos (m, além da meia-largura); mais perto, a nota piora e ele freia. */
const COMFORT = 1.6;
/** Direções avaliadas, a partir da direção do próximo ponto: de −100° a +100°, de 7° em 7°. */
const CANDIDATES = Array.from({ length: 29 }, (_, i) => (i - 14) * 0.125);
/** Uma direção só vale se tiver pelo menos isto livre à frente (m). */
const MIN_FREE = 2.5;
/** Pesos da nota: desviar do destino, virar agora, mudar de ideia, caminho fechado lá na frente, pouca folga. */
const COST = { detour: 1, turn: 0.6, change: 0.8, blocked: 2, tight: 1.5 };
/** Quão rápido a direção planejada acompanha a escolha nova (1/s): amortece o zigue-zague. */
const PLAN_SMOOTH = 4;
/** Meia-largura do rover com folga (m) e distância segura de um astronauta. */
const ROVER_HALF = 0.9;
const CREW_SAFE = 1.4;
/** Astronauta colado: para na hora. */
const CREW_NEAR = 1.7;
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
  /** Volta para casa: é o ponto de aproximação da garagem, não uma pedra para estudar. */
  home?: boolean;
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
  /** Cada roda: posição no rover (x para a frente, z para o lado), altura de repouso, quanto subiu e quanto virou. */
  private wheelInfo: { obj: THREE.Object3D; x: number; z: number; restY: number; lift: number; steer: number }[] = [];
  /** Inclinação do corpo (amortecida): arfagem (nariz) e rolagem (lado). */
  private pitch = 0;
  private roll = 0;
  /** Rover atolado: fica parado e inclinado neste ponto até alguém resolver. */
  private stuckAt: THREE.Vector3 | null = null;
  /** Parado porque há um astronauta (ou nenhuma passagem) à frente, e há quanto tempo a frente está livre. */
  private blocked = false;
  private clearFor = 0;
  /** Rodas (giram conforme a distância percorrida) e direção do nariz (0 = +X; gira no sentido anti-horário visto de cima). */
  private readonly wheels: THREE.Object3D[] = [];
  private heading = 0;
  /** Direção planejada (amortecida) e a última escolhida pelo planejamento. */
  private planned: number | null = null;
  private lastChoice: number | null = null;
  private target: Target | null = null;
  private lastRock: Rock | null = null;
  /**
   * O que ele está fazendo: dirigindo ou estudando na expedição; entrando na garagem (`dockIn`: aproximação,
   * rampa); na garagem (`service`: entrega as amostras e revisão); saindo de ré (`dockOut`).
   */
  private phase: 'drive' | 'study' | 'dockIn' | 'service' | 'dockOut' = 'service';
  private studyLeft = 0;
  /** Paradas de estudo nesta expedição. */
  private studies = 0;
  /** Distância percorrida no caminho da garagem (aproximação → pé da rampa → topo → dentro). */
  private dockS = 0;
  private serviceLeft = 1;
  /**
   * Uma expedição por sol, como a regra dos tubos (3 tubos por sol com ciência, src/sim/day.ts):
   * depois de entregar as amostras, o rover fica estacionado até o próximo sol.
   */
  private sol = 0;
  private expeditionSol = -1;
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
    // Começa estacionado na garagem: no primeiro dia com ciência, sai de ré para a primeira expedição.
    this.root.position.copy(ROVER_DOCK.inside);
    this.heading = ROVER_DOCK.heading;
    this.root.rotation.set(0, this.heading, 0);
    this.setupWheels();
    this.pose(ROVER_DOCK.inside.x, ROVER_DOCK.inside.z, 1, 0, 0);
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
    this.setupWheels();
    // O .glb já tem a própria luz de aviso, em cima da cabeça do mastro: ela passa a piscar (âmbar/verde) e a
    // bolinha do modelo simples some (ficava flutuando sobre o rover). Sem a luz no .glb, a bolinha fica.
    const glbLight = m.root.getObjectByName('warning_light') as THREE.Mesh | undefined;
    if (glbLight) {
      glbLight.material = this.warning.material;
      this.warning.visible = false;
    } else {
      this.warning.position.set(0, 2.62, 0);
    }
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
    if (at) this.phase = 'drive'; // atolou no meio do caminho: a entrada na garagem recomeça depois
    if (!at && wasStuck) {
      this.target = null;
      this.planned = null;
      this.phase = 'drive';
    }
  }

  /** O rover está parado estudando uma rocha? (para testes) */
  get isStudying(): boolean {
    return this.phase === 'study';
  }

  /** Na garagem, entregando amostras ou em revisão? (para testes) */
  get isServicing(): boolean {
    return this.phase === 'service';
  }

  /** O que o rover está fazendo agora (para testes): drive, study, dockIn, service ou dockOut. */
  get activity(): string {
    return this.phase;
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

  /** Dentro da elipse da base (com `margin` m a mais)? */
  private inCore(x: number, z: number, margin = 0): boolean {
    const u = (x - BASE_CENTER.x) / (CORE.rx + margin);
    const v = (z - BASE_CENTER.z) / (CORE.rz + margin);
    return u * u + v * v < 1;
  }

  /**
   * Folga (m) entre o rover, se ele estivesse neste ponto, e a coisa mais perto: prédios (caixas), áreas
   * proibidas (abrigo com os sacos, cúpula) e pedras. Negativa = encostando ou dentro.
   */
  private clearance(x: number, z: number, ignore: Rock | null = null): number {
    let best = Infinity;
    for (const o of this.obstacles) {
      const dx = Math.abs(x - o.center.x) - o.half.x - ROVER_HALF;
      const dz = Math.abs(z - o.center.z) - o.half.z - ROVER_HALF;
      best = Math.min(best, dx > 0 || dz > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) : Math.max(dx, dz));
    }
    for (const k of ROVER_KEEP_OUT) best = Math.min(best, Math.hypot(x - k.x, z - k.z) - k.r - ROVER_HALF);
    for (const k of this.rocks) if (k !== ignore) best = Math.min(best, Math.hypot(x - k.x, z - k.z) - k.r - ROVER_HALF);
    return best;
  }

  /**
   * Escolhe o próximo destino dentro da faixa de exploração: de preferência uma pedra (o que um rover
   * real vai estudar), longe o bastante de onde ele está para valer a viagem. Sem pedra na faixa, um ponto livre.
   */
  private pickTarget(scienceBlocks: number): void {
    const p = this.root.position;
    // Expedição completa: volta para a garagem (o ponto de aproximação, em frente à rampa).
    if (this.studies >= EXPEDITION_STUDIES) {
      const a = ROVER_DOCK.approach;
      const dist = Math.hypot(a.x - p.x, a.z - p.z);
      // Para a ~2 m: com curvas suaves ele não acerta um ponto exato; o resto ele faz devagar, alinhando com a rampa.
      this.target = { x: a.x, z: a.z, stop: 2, rock: null, home: true, driving: 0, limit: (dist / DRIVE_SPEED) * 3 + 15 };
      return;
    }
    const { near, far } = exploreRange(scienceBlocks);
    const rocks = this.rocks.filter((k) => {
      const d = this.fromBase(k.x, k.z);
      return d >= near && d <= far && !this.inCore(k.x, k.z, 4) && k !== this.lastRock && Math.hypot(k.x - p.x, k.z - p.z) > 8;
    });
    let x: number;
    let z: number;
    let stop = 2;
    let rock: Rock | null = null;
    if (rocks.length) {
      rock = rocks[Math.floor(Math.random() * rocks.length)];
      ({ x, z } = rock);
      stop = rock.r + 2.2; // para em frente à pedra; com curvas suaves, sem tentar chegar colado
    } else {
      let tries = 0;
      do {
        const a = Math.random() * Math.PI * 2;
        const d = near + Math.random() * (far - near);
        x = BASE_CENTER.x + Math.cos(a) * d;
        z = BASE_CENTER.z + Math.sin(a) * d;
      } while ((this.inCore(x, z, 4) || this.clearance(x, z) < 1) && ++tries < 40);
    }
    const dist = Math.hypot(x - p.x, z - p.z);
    this.target = { x, z, stop, rock, driving: 0, limit: (dist / DRIVE_SPEED) * 2.5 + 8 };
    this.lastChoice = null;
    this.lastRock = rock;
  }

  /**
   * A linha reta nesta direção, até `length` m, passa livre de prédios, pedras e astronautas?
   * Se ele já está encostado em algo (ex.: desatolou ao lado de uma pedra), só vale direção que o afaste.
   */
  private pathFree(heading: number, length: number, crew: THREE.Vector3[]): boolean {
    const p = this.root.position;
    const fx = Math.cos(heading);
    const fz = -Math.sin(heading);
    let last = this.clearance(p.x, p.z);
    const steps = Math.max(2, Math.ceil(length / 0.5));
    for (let i = 1; i <= steps; i++) {
      const s = (i / steps) * length;
      const x = p.x + fx * s;
      const z = p.z + fz * s;
      if (this.fromBase(x, z) > RANGE_MAX + 6) return false;
      const c = this.clearance(x, z);
      if (c < 0 && c <= last) return false;
      last = c;
      for (const m of crew) if (Math.hypot(m.x - x, m.z - z) < CREW_SAFE) return false;
    }
    return true;
  }

  /**
   * Próximo ponto da viagem: o destino, se a linha reta até ele não corta a base; senão, um ponto no
   * contorno de fora, um pouco à frente, pelo lado mais curto. Dentro da base, primeiro sai para o contorno.
   */
  private waypoint(): { x: number; z: number; final: boolean } {
    const t = this.target!;
    const p = this.root.position;
    const { x: cx, z: cz } = BASE_CENTER;
    const orbit = (a: number) => ({ x: cx + Math.cos(a) * ORBIT.rx, z: cz + Math.sin(a) * ORBIT.rz, final: false });
    const ap = Math.atan2((p.z - cz) / ORBIT.rz, (p.x - cx) / ORBIT.rx);
    if (this.inCore(p.x, p.z)) return orbit(ap);
    let crosses = false;
    for (let i = 1; i < 24 && !crosses; i++) crosses = this.inCore(p.x + ((t.x - p.x) * i) / 24, p.z + ((t.z - p.z) * i) / 24);
    if (!crosses) return { x: t.x, z: t.z, final: true };
    const at = Math.atan2((t.z - cz) / ORBIT.rz, (t.x - cx) / ORBIT.rx);
    const diff = Math.atan2(Math.sin(at - ap), Math.cos(at - ap));
    return orbit(ap + THREE.MathUtils.clamp(diff, -ORBIT_STEP, ORBIT_STEP));
  }

  /**
   * Para onde virar agora: a direção do próximo ponto, se estiver livre; senão, o desvio livre mais perto dela
   * (empatados, o que exige virar menos). null = nenhuma passagem.
   */
  /**
   * O que as câmeras "veem" numa direção até `length` m: quanto dá para andar livre e a menor folga no caminho.
   * Astronautas contam como obstáculo (CREW_SAFE). Se ele já está encostado em algo, vale enquanto se afasta.
   */
  private profile(heading: number, length: number, crew: THREE.Vector3[]): { free: number; clear: number } {
    const p = this.root.position;
    const fx = Math.cos(heading);
    const fz = -Math.sin(heading);
    const at = (x: number, z: number) => {
      // A pedra que ele vai estudar não conta: o caminho termina antes dela (no ponto de parada).
      let c = this.fromBase(x, z) > RANGE_MAX + 6 ? -1 : this.clearance(x, z, this.target?.rock ?? null);
      for (const m of crew) c = Math.min(c, Math.hypot(m.x - x, m.z - z) - CREW_SAFE);
      return c;
    };
    let last = at(p.x, p.z);
    let clear = Infinity;
    const step = 0.5;
    for (let s = step; s <= length + 1e-6; s += step) {
      const c = at(p.x + fx * s, p.z + fz * s);
      if (c < 0 && c <= last) return { free: s - step, clear };
      clear = Math.min(clear, c);
      last = c;
    }
    return { free: length, clear };
  }

  /**
   * Para onde ir agora: avalia CANDIDATES direções em volta da direção do próximo ponto e fica com a de
   * menor custo (desvio, curva, mudança de ideia, caminho fechado adiante e pouca folga). null = nenhuma passagem.
   */
  private steer(crew: THREE.Vector3[]): number | null {
    const t = this.target!;
    const w = this.waypoint();
    const p = this.root.position;
    const toTarget = Math.atan2(-(w.z - p.z), w.x - p.x);
    const length = w.final ? Math.min(PLAN_RANGE, Math.max(1, Math.hypot(t.x - p.x, t.z - p.z) - t.stop)) : PLAN_RANGE;
    const angle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const costOf = (h: number): number => {
      const { free, clear } = this.profile(h, length, crew);
      if (free < Math.min(length, MIN_FREE)) return Infinity;
      return (
        COST.detour * angle(h, toTarget) +
        COST.turn * angle(h, this.heading) +
        (this.lastChoice === null ? 0 : COST.change * angle(h, this.lastChoice)) +
        (COST.blocked * (length - free)) / length +
        (COST.tight * Math.max(0, COMFORT - clear)) / COMFORT
      );
    };
    let best: number | null = null;
    let bestCost = Infinity;
    for (const off of CANDIDATES) {
      const cost = costOf(toTarget + off);
      if (cost < bestCost) {
        bestCost = cost;
        best = toTarget + off;
      }
    }
    if (best !== null) {
      this.lastChoice = best;
      return best;
    }
    // Encurralado (a frente toda fechada): manobra para qualquer lado livre, o que exige virar menos.
    const around = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2).sort((a, b) => angle(a, this.heading) - angle(b, this.heading));
    const escape = around.find((h) => this.profile(h, 2, crew).free >= 2) ?? null;
    this.lastChoice = escape;
    return escape;
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
  update(dt: number, time: number, crew: THREE.Vector3[], scienceBlocks: number, night: boolean, sol = 0): void {
    this.sol = sol;
    if (this.stuckAt) {
      this.root.position.set(this.stuckAt.x + 1.6, terrainHeight(this.stuckAt.x, this.stuckAt.z) - 0.25, this.stuckAt.z + 0.6);
      this.root.rotation.set(0.18, 0.7, 0.12);
      this.blocked = false;
      this.animateTools(false, dt, time);
    } else if (scienceBlocks > 0 && !night) {
      if (this.phase === 'dockIn' || this.phase === 'service' || this.phase === 'dockOut') this.dock(dt, time, crew);
      else this.explore(dt, time, crew, scienceBlocks);
    } else {
      this.blocked = false;
      this.animateTools(false, dt, time);
    }
    const amber = this.blocked && Math.sin(time * 10) > 0;
    const service = this.phase === 'service' && this.serviceLeft > 0 && Math.sin(time * 3) > 0;
    this.warning.material.color.setHex(amber ? 0xffb020 : service ? LIGHT_SERVICE : 0x5a4a2a);
  }

  /** Caminho da garagem: aproximação → pé da rampa → topo da rampa → dentro. */
  private static readonly DOCK_PATH = [ROVER_DOCK.approach, ROVER_DOCK.foot, ROVER_DOCK.top, ROVER_DOCK.inside];

  /** Ponto do caminho da garagem a `s` m do começo (com a altura: sobe na rampa) e se está na rampa. */
  private dockPoint(s: number): { x: number; y: number; z: number; slope: number } {
    const path = Rover.DOCK_PATH;
    let left = s;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const run = Math.hypot(b.x - a.x, b.z - a.z);
      if (left <= run || i === path.length - 1) {
        const k = run > 0 ? Math.min(1, left / run) : 1;
        const ground = (x: number, z: number, y: number) => (y > 0 ? y : terrainHeight(x, z));
        const x = a.x + (b.x - a.x) * k;
        const z = a.z + (b.z - a.z) * k;
        return { x, z, y: THREE.MathUtils.lerp(ground(a.x, a.z, a.y), ground(b.x, b.z, b.y), k), slope: Math.atan2(b.y - a.y, run) };
      }
      left -= run;
    }
    const last = path[path.length - 1];
    return { x: last.x, y: last.y, z: last.z, slope: 0 };
  }

  private static dockLength(): number {
    const path = Rover.DOCK_PATH;
    let total = 0;
    for (let i = 1; i < path.length; i++) total += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    return total;
  }

  /**
   * Garagem: entra (vira de frente para a rampa, sobe devagar), entrega as amostras, fica em revisão
   * (luz verde piscando) e, pronto, sai de ré até a aproximação e começa outra expedição.
   * Astronauta perto do caminho: espera (luz âmbar).
   */
  private dock(dt: number, time: number, crew: THREE.Vector3[]): void {
    const p = this.root.position;
    if (this.phase === 'service') {
      this.blocked = false;
      this.serviceLeft -= dt;
      // Primeiro entrega as amostras (braço estendido), depois a revisão (braço guardado, luz verde).
      this.animateTools(this.serviceLeft > SERVICE_SECONDS - DELIVER_SECONDS, dt, time);
      // Pronto. Já saiu neste sol? Fica estacionado até o próximo (uma expedição por sol, como os tubos).
      if (this.serviceLeft <= 0 && this.sol > this.expeditionSol) {
        this.expeditionSol = this.sol;
        this.phase = 'dockOut';
        this.dockS = Rover.dockLength();
      }
      return;
    }
    this.animateTools(false, dt, time);
    // Antes de entrar: termina de chegar ao ponto de aproximação (vira para ele e anda reto, de frente ou de ré,
    // sem deslizar de lado) e então vira parado de frente para a rampa.
    if (this.phase === 'dockIn' && this.dockS === 0) {
      const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
      const turnTo = (target: number) => {
        const turn = THREE.MathUtils.clamp(wrap(target - this.heading), -TURN_RATE * dt, TURN_RATE * dt);
        this.heading += turn;
        this.pose(p.x, p.z, dt, 0, turn / dt);
        return Math.abs(wrap(target - this.heading)) < 0.02;
      };
      const a = ROVER_DOCK.approach;
      const gap = Math.hypot(a.x - p.x, a.z - p.z);
      if (gap > 0.05) {
        const toA = Math.atan2(-(a.z - p.z), a.x - p.x);
        const backwards = Math.abs(wrap(toA - this.heading)) > Math.PI / 2; // atrás dele: vai de ré
        const face = backwards ? toA + Math.PI : toA;
        if (Math.abs(wrap(face - this.heading)) > 0.05) {
          turnTo(face);
          return;
        }
        const move = Math.min(gap, DOCK_SPEED * dt) * (backwards ? -1 : 1);
        this.pose(p.x + Math.cos(this.heading) * move, p.z - Math.sin(this.heading) * move, dt, move, 0);
        return;
      }
      if (!turnTo(ROVER_DOCK.heading)) return;
      this.heading = ROVER_DOCK.heading;
    }
    if (crew.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < CREW_NEAR + 0.6)) {
      this.blocked = true;
      return;
    }
    this.blocked = false;
    const total = Rover.dockLength();
    // Mais devagar perto do pé e do topo da rampa, onde a inclinação muda.
    const footS = Math.hypot(ROVER_DOCK.foot.x - ROVER_DOCK.approach.x, ROVER_DOCK.foot.z - ROVER_DOCK.approach.z);
    const topS = footS + Math.hypot(ROVER_DOCK.top.x - ROVER_DOCK.foot.x, ROVER_DOCK.top.z - ROVER_DOCK.foot.z);
    const edge = Math.min(Math.abs(this.dockS - footS), Math.abs(this.dockS - topS));
    const step = DOCK_SPEED * dt * (RAMP_EASE + (1 - RAMP_EASE) * THREE.MathUtils.smoothstep(edge, 0, 1.6));
    this.dockS = this.phase === 'dockIn' ? Math.min(total, this.dockS + step) : Math.max(0, this.dockS - step);
    // A altura e a inclinação vêm das rodas (pose): as da frente sobem a rampa primeiro, e o corpo inclina aos poucos.
    // De ré, as rodas giram ao contrário.
    const q = this.dockPoint(this.dockS);
    this.pose(q.x, q.z, dt, this.phase === 'dockIn' ? step : -step, 0);
    if (this.phase === 'dockIn' && this.dockS >= total) {
      this.phase = 'service';
      this.serviceLeft = SERVICE_SECONDS;
      this.studies = 0;
    } else if (this.phase === 'dockOut' && this.dockS <= 0) {
      this.phase = 'drive';
      this.target = null;
      this.planned = null;
    }
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
    if (!this.target || (!this.target.home && this.fromBase(this.target.x, this.target.z) > far + 4)) this.pickTarget(scienceBlocks);
    const t = this.target!;
    t.driving += dt;
    if (t.driving > t.limit) {
      this.pickTarget(scienceBlocks); // preso atrás de algo: tenta outro lugar
      return;
    }
    // Chegou: para e estuda.
    if (Math.hypot(t.x - p.x, t.z - p.z) <= t.stop) {
      if (t.home) {
        // Em frente à rampa: daqui em diante é a manobra de entrar na garagem.
        this.phase = 'dockIn';
        this.dockS = 0;
        this.blocked = false;
        return;
      }
      this.studies++;
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

    // Vira aos poucos para a direção escolhida e anda mais devagar nas curvas fechadas. Se o nariz ainda
    // aponta para algo (a curva não terminou), gira parado em vez de avançar: nunca entra em prédio ou pedra.
    // A direção planejada acompanha a escolha aos poucos (sem zigue-zague); o nariz segue a planejada.
    if (this.planned === null) this.planned = this.heading;
    this.planned += Math.atan2(Math.sin(heading - this.planned), Math.cos(heading - this.planned)) * Math.min(1, PLAN_SMOOTH * dt);
    const diff = Math.atan2(Math.sin(this.planned - this.heading), Math.cos(this.planned - this.heading));
    this.heading += THREE.MathUtils.clamp(diff, -TURN_RATE * dt, TURN_RATE * dt);
    // Perto do destino, olha só até o ponto de parada (senão a própria pedra de estudo "fecharia" a frente).
    const remain = Math.hypot(t.x - p.x, t.z - p.z) - t.stop;
    const noseFree = this.pathFree(this.heading, Math.min(NOSE_CHECK, Math.max(0.3, remain + 0.3)), crew);
    // Freia nas curvas fechadas e quando passa perto de algo (folga menor que a confortável nos próximos 3 m).
    const near = this.profile(this.heading, 3, crew).clear;
    const caution = THREE.MathUtils.clamp(0.65 + (0.35 * near) / COMFORT, 0.65, 1);
    const speed = noseFree ? DRIVE_SPEED * Math.max(0.35, Math.cos(diff)) * caution : 0;
    const step = speed * dt;
    const x = p.x + Math.cos(this.heading) * step;
    const z = p.z - Math.sin(this.heading) * step;
    this.pose(x, z, dt, step, THREE.MathUtils.clamp(diff, -TURN_RATE * dt, TURN_RATE * dt) / dt);
  }

  // ---------- rodas, suspensão e inclinação ----------

  /** Guarda onde cada roda fica no rover (modelo simples ou .glb). */
  private setupWheels(): void {
    this.wheelInfo = this.wheels.map((obj) => ({ obj, x: obj.position.x, z: obj.position.z, restY: obj.position.y, lift: 0, steer: 0 }));
  }

  /** Altura do chão: na rampa e na garagem, a da rampa (sobe do pé até o piso); fora delas, o relevo. */
  private groundAt(x: number, z: number): number {
    const { top, foot, width } = GARAGE_RAMP;
    if (Math.abs(x - foot.x) <= width / 2 + 0.2) {
      if (z >= top.z && z <= foot.z) return THREE.MathUtils.lerp(top.y, foot.y, (z - top.z) / (foot.z - top.z));
      if (z < top.z && z >= GARAGE_POSITION.z - 3.25 * GARAGE_SCALE) return GARAGE_FLOOR_Y;
    }
    return terrainHeight(x, z);
  }

  /**
   * Põe o rover em (x, z) apoiado nas 6 rodas: o corpo fica na altura média do chão embaixo delas e inclina
   * pela diferença entre frente e trás (arfagem) e entre os lados (rolagem), aos poucos. Cada roda sobe ou desce
   * o que falta para tocar o chão (suspensão), as rodas dos cantos viram conforme a curva e todas giram pela
   * distância andada (`forward`, negativo de ré). `yawRate` = quanto ele está virando (rad/s).
   */
  private pose(x: number, z: number, dt: number, forward: number, yawRate: number): void {
    const h = this.heading;
    const c = Math.cos(h);
    const sn = Math.sin(h);
    // Roda (x para a frente, z para o lado) → mundo. O nariz (+X) aponta para (cos h, −sin h).
    const contact = this.wheelInfo.map((w) => this.groundAt(x + w.x * c + w.z * sn, z - w.x * sn + w.z * c));
    const mean = (pick: (w: (typeof this.wheelInfo)[number]) => boolean) => {
      const hs = contact.filter((_, i) => pick(this.wheelInfo[i]));
      return hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : 0;
    };
    const xs = this.wheelInfo.map((w) => w.x);
    const zs = this.wheelInfo.map((w) => w.z);
    const base = Math.max(0.5, Math.max(...xs) - Math.min(...xs));
    const track = Math.max(0.5, Math.max(...zs) - Math.min(...zs));
    const ground = contact.reduce((a, b) => a + b, 0) / Math.max(1, contact.length);
    const pitchTarget = Math.atan2(mean((w) => w.x > 0.3) - mean((w) => w.x < -0.3), base);
    // Rolagem: o lado +Z (esquerdo) mais alto sobe o lado esquerdo do rover (sinal negativo pela ordem YZX).
    const rollTarget = -Math.atan2(mean((w) => w.z > 0) - mean((w) => w.z < 0), track);
    const k = Math.min(1, TILT_SPEED * dt);
    this.pitch += (pitchTarget - this.pitch) * k;
    this.roll += (rollTarget - this.roll) * k;
    this.root.position.set(x, ground, z);
    this.root.rotation.order = 'YZX';
    this.root.rotation.set(this.roll, h, this.pitch);

    const v = dt > 0 ? forward / dt : 0;
    const moving = Math.abs(v) > 0.05 || Math.abs(yawRate) > 0.05;
    this.wheelInfo.forEach((w, i) => {
      // Suspensão: quanto o chão embaixo desta roda está acima (ou abaixo) do plano do corpo.
      const plane = ground + w.x * Math.sin(this.pitch) - w.z * Math.sin(this.roll);
      const lift = THREE.MathUtils.clamp(contact[i] - plane, -SUSPENSION_DOWN, SUSPENSION_UP);
      w.lift += (lift - w.lift) * Math.min(1, SUSPENSION_SPEED * dt);
      w.obj.position.y = w.restY + w.lift;
      // Direção: só as rodas dos cantos. A roda aponta para onde aquele ponto do rover está indo.
      if (Math.abs(w.x) > 0.3 && moving) {
        let steer = Math.atan2(yawRate * w.x, v + yawRate * w.z);
        if (steer > Math.PI / 2) steer -= Math.PI; // de ré, a roda gira para trás em vez de virar 180°
        if (steer < -Math.PI / 2) steer += Math.PI;
        steer = THREE.MathUtils.clamp(steer, -STEER_MAX, STEER_MAX);
        w.steer += (steer - w.steer) * Math.min(1, STEER_SPEED * dt);
      }
      w.obj.rotation.y = w.steer;
      // Giro: cada roda rola com a velocidade do ponto onde ela está, na direção para onde ela aponta.
      // Na curva, a de fora gira mais que a de dentro; girando parado, as do meio giram em sentidos opostos.
      const vx = v + yawRate * w.z;
      const vz = -yawRate * w.x;
      const roll = (vx * Math.cos(w.steer) - vz * Math.sin(w.steer)) * dt;
      w.obj.rotation.z -= roll / this.wheelRadius;
    });
  }
}
