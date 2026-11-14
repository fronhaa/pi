import * as THREE from 'three';
import { PALETTE, toonMesh } from '@/render/toon';
import type { SceneryModel } from '@/render/sceneryModel';
import { ROVER_TRACK, nearestTrackAngle, terrainHeight, type Obstacle } from './layout';
import type { Rock } from './terrain';

/** Ciclo do rover: segundos andando e segundos parado estudando (valores de cena, não de regra). */
const ROVER_DRIVE_SECONDS = 8;
const ROVER_STUDY_SECONDS = 5;
/** Velocidade da volta para a trilha depois de desatolar (m/s), parecida com a do rover andando. */
const ROVER_RETURN_SPEED = 2.5;
/** Ângulo do braço: guardado (em pé) e estudando (apontado para o chão à frente). */
const ARM_STOWED = 1.35;
const ARM_DEPLOYED = -0.75;

const { cx: CX, cz: CZ, rx: RX, rz: RZ } = ROVER_TRACK;

/**
 * Rover de seis rodas (VEH-001), inspirado no Perseverance (INTERPRETADO). Só visual: anda pela trilha
 * em volta da base quando há blocos de ciência, para e estuda rochas, desvia de astronautas, pedras
 * e prédios, e fica atolado quando o problema "rover atolado" está aberto.
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
  private angle = 0;
  /** Rover parado porque há um astronauta na rota (e quanto tempo a rota está livre de novo). */
  private blocked = false;
  private clearFor = 0;
  /** Desvio lateral da elipse (m): + para fora, − para dentro. O rover recalcula e desvia de astronautas. */
  private offset = 0;
  private offsetTarget = 0;
  /** Rodas (giram conforme a distância percorrida) e direção do nariz (segue o movimento real). */
  private readonly wheels: THREE.Object3D[] = [];
  private heading: number | null = null;
  /** "Volante": metros de lado por metro à frente (−0,6 a 0,6). Gira aos poucos, como um veículo de verdade. */
  private steer = 0;
  private readonly warning: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /**
   * Ciclo do rover real: anda um trecho, para e estuda, segue. Rovers passam a maior parte do sol
   * parados fazendo ciência (o recorde do Perseverance foi ~4 h 24 min de direção num sol de 24 h 39 min).
   */
  private phase: 'drive' | 'study' = 'drive';
  /** Depois de desatolar: volta andando do lugar onde atolou até a trilha (sem teleporte). */
  private returning: { from: THREE.Vector3; elapsed: number; duration: number } | null = null;
  private phaseLeft = ROVER_DRIVE_SECONDS;
  /** Cabeça da câmera (gira para olhar a rocha), braço robótico (desce para estudar) e luz do instrumento. */
  private readonly head: THREE.Group;
  private readonly arm: THREE.Group;
  private readonly probe: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  /**
   * @param obstacles caixas dos prédios (o rover desvia delas)
   * @param rocks pedras do terreno (o rover desvia delas e olha para elas ao estudar)
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
    this.heading = null; // ao voltar a andar, o nariz recomeça da direção do movimento
    if (!at) this.root.rotation.set(0, this.root.rotation.y, 0);
    if (!at && wasStuck) {
      // Desatolou: continua a volta a partir do ponto da trilha mais perto e anda até lá (antes ele "teleportava"
      // para onde a trilha estava quando atolou).
      const p = this.root.position;
      this.angle = nearestTrackAngle(p.x, p.z);
      this.offset = 0;
      this.offsetTarget = 0;
      this.steer = 0;
      const target = this.point(this.angle, 0);
      const dist = Math.hypot(target.x - p.x, target.z - p.z);
      this.returning = { from: p.clone(), elapsed: 0, duration: Math.max(1, dist / ROVER_RETURN_SPEED) };
      this.phase = 'drive';
      this.phaseLeft = ROVER_DRIVE_SECONDS;
    }
  }

  /** Desvio lateral atual do rover (m). */
  get detour(): number {
    return this.offset;
  }

  /** O rover está parado estudando uma rocha? (para testes) */
  get isStudying(): boolean {
    return this.phase === 'study';
  }

  /** O rover está parado esperando um astronauta sair da rota? (para testes e interface) */
  get isWaiting(): boolean {
    return this.blocked;
  }

  /** Posição na elipse do rover com desvio lateral `off` (m). */
  private point(angle: number, off: number): { x: number; z: number } {
    return { x: CX + Math.cos(angle) * (RX + off), z: CZ + Math.sin(angle) * (RZ + off) };
  }

  /**
   * O trecho à frente (~8 m) da rota com desvio `off` passa perto de algum astronauta?
   * Usa a mesma medida para a rota atual e para as rotas alternativas do desvio.
   */
  private routeHits(crew: THREE.Vector3[], off: number): { x: number; z: number } | null {
    // O rover anda ~2,8 m/s e leva ~1 s para mudar de faixa: precisa enxergar longe o bastante para desviar a tempo.
    const LOOKAHEAD = 8;
    const SAFE = 1.4; // meia-largura do rover (~0,65) + astronauta (~0,35) + folga
    const a = this.angle;
    const speed = Math.hypot(Math.sin(a) * (RX + off), Math.cos(a) * (RZ + off));
    const ROVER_HALF = 0.9; // meia-largura do rover + folga, para pedras e prédios
    for (let i = 1; i <= 10; i++) {
      const p = this.point(a + ((i / 10) * LOOKAHEAD) / speed, off);
      for (const c of crew) if (Math.hypot(c.x - p.x, c.z - p.z) < SAFE) return c;
      for (const k of this.rocks) if (Math.hypot(k.x - p.x, k.z - p.z) < k.r + ROVER_HALF) return k;
      for (const o of this.obstacles) {
        if (Math.abs(p.x - o.center.x) < o.half.x + ROVER_HALF && Math.abs(p.z - o.center.z) < o.half.z + ROVER_HALF) return o.center;
      }
    }
    return null;
  }

  /**
   * Recalcula a rota: se há astronauta à frente, escolhe um desvio livre (3 m para dentro ou para fora,
   * de preferência pelo lado oposto ao astronauta). Sem desvio livre, ou com astronauta colado: para.
   * Sem ninguém na rota original, volta para ela.
   */
  private plan(crew: THREE.Vector3[]): boolean {
    const DETOUR = 3;
    const NEAR = 1.7;
    const pos = this.root.position;
    if (crew.some((c) => Math.hypot(c.x - pos.x, c.z - pos.z) < NEAR)) return true; // colado: para
    if (!this.routeHits(crew, 0)) {
      this.offsetTarget = 0;
      return false;
    }
    if (!this.routeHits(crew, this.offsetTarget) && this.offsetTarget !== 0) return false; // desvio atual serve
    const who = this.routeHits(crew, 0)!;
    // Lado do astronauta em relação à elipse: fora (> 1) ou dentro (< 1).
    const outside = ((who.x - CX) / RX) ** 2 + ((who.z - CZ) / RZ) ** 2 > 1;
    for (const off of outside ? [-DETOUR, DETOUR] : [DETOUR, -DETOUR]) {
      if (!this.routeHits(crew, off)) {
        this.offsetTarget = off;
        return false;
      }
    }
    return true; // nenhuma rota livre: espera
  }

  /**
   * Estudando: o braço desce, a cabeça olha para a pedra mais perto (se houver) e a ponta do
   * instrumento pisca. Andando ou parado: tudo volta ao lugar.
   */
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

  /**
   * Um passo da animação. `crew` = astronautas visíveis lá fora (o rover desvia deles);
   * sem blocos de ciência, ou à noite, ele fica parado.
   */
  update(dt: number, time: number, crew: THREE.Vector3[], scienceBlocks: number, night: boolean): void {
    if (this.stuckAt) {
      this.root.position.set(this.stuckAt.x + 1.6, terrainHeight(this.stuckAt.x, this.stuckAt.z) - 0.25, this.stuckAt.z + 0.6);
      this.root.rotation.set(0.18, 0.7, 0.12);
      this.animateTools(false, dt, time);
    } else if (scienceBlocks > 0 && !night) {
      this.root.rotation.x = 0;
      this.root.rotation.z = 0;
      // Segurança: recalcula e desvia de astronautas; para só sem rota livre. Retoma após 0,6 s.
      if (this.plan(crew)) {
        this.blocked = true;
        this.clearFor = 0;
      } else if (this.blocked) {
        this.clearFor += dt;
        if (this.clearFor > 0.6) this.blocked = false;
      }
      // Anda um trecho, para e estuda, segue (como o rover real). O tempo só corre fora do bloqueio.
      if (!this.blocked) {
        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0) {
          this.phase = this.phase === 'drive' ? 'study' : 'drive';
          this.phaseLeft = this.phase === 'drive' ? ROVER_DRIVE_SECONDS : ROVER_STUDY_SECONDS;
        }
      }
      const studying = this.phase === 'study' && !this.blocked;
      this.animateTools(studying, dt, time);
      // Elipse por fora da base e dos painéis (painéis vão até x ≈ 22).
      // Durante a volta para a trilha, o ponto-alvo fica parado (senão o rover acelera para alcançá-lo).
      if (!this.blocked && !studying && !this.returning) {
        const a0 = this.angle;
        this.angle += dt * 0.06 * scienceBlocks;
        const forward = (this.angle - a0) * Math.hypot(Math.sin(a0) * (RX + this.offset), Math.cos(a0) * (RZ + this.offset));
        // Volante: quer virar até ~30° (0,6) para o lado do desvio, aliviando perto da faixa-alvo; gira no máximo 1,5/s.
        const remaining = this.offsetTarget - this.offset;
        const desired = THREE.MathUtils.clamp(remaining / 1.5, -0.6, 0.6);
        this.steer += THREE.MathUtils.clamp(desired - this.steer, -1.5 * dt, 1.5 * dt);
        const lateral = this.steer * forward;
        // Não passa da faixa-alvo.
        this.offset = Math.abs(lateral) > Math.abs(remaining) && Math.sign(lateral) === Math.sign(remaining) ? this.offsetTarget : this.offset + lateral;
      }
      let { x, z } = this.point(this.angle, this.offset);
      const ret = this.returning;
      if (ret && !this.blocked && !studying) {
        // Voltando para a trilha: mistura suave do lugar onde atolou até o ponto atual da trilha.
        ret.elapsed += dt;
        const k = THREE.MathUtils.smoothstep(ret.elapsed / ret.duration, 0, 1);
        x = THREE.MathUtils.lerp(ret.from.x, x, k);
        z = THREE.MathUtils.lerp(ret.from.z, z, k);
        if (ret.elapsed >= ret.duration) this.returning = null;
      } else if (ret) {
        // Parado (estudando ou esperando): fica onde está, no meio do caminho de volta.
        const k = THREE.MathUtils.smoothstep(ret.elapsed / ret.duration, 0, 1);
        x = THREE.MathUtils.lerp(ret.from.x, x, k);
        z = THREE.MathUtils.lerp(ret.from.z, z, k);
      }
      const y = terrainHeight(x, z);
      const moved = Math.hypot(x - this.root.position.x, z - this.root.position.z);
      if (moved > 1e-4 && moved < 2 && this.returning) {
        // Voltando para a trilha: o nariz aponta para onde ele está indo.
        this.heading = Math.atan2(-(z - this.root.position.z), x - this.root.position.x);
        for (const w of this.wheels) w.rotation.z -= moved / this.wheelRadius;
      } else if (moved > 1e-4 && moved < 2) {
        // Nariz = direção exata do movimento: tangente da elipse + componente lateral do volante (sem "drift").
        const a = this.angle;
        const tx = -Math.sin(a) * (RX + this.offset);
        const tz = Math.cos(a) * (RZ + this.offset);
        const tl = Math.hypot(tx, tz);
        const vx = tx / tl + this.steer * Math.cos(a);
        const vz = tz / tl + this.steer * Math.sin(a);
        this.heading = Math.atan2(-vz, vx);
        // Rodas giram conforme a distância (raio 0,3 m).
        for (const w of this.wheels) w.rotation.z -= moved / this.wheelRadius;
      }
      // Terreno: inclina o rover conforme o relevo (frente/trás = arfagem, lados = rolagem).
      const h = this.heading ?? 0;
      const fx = Math.cos(h);
      const fz = -Math.sin(h);
      const front = terrainHeight(x + fx, z + fz);
      const back = terrainHeight(x - fx, z - fz);
      const left = terrainHeight(x - fz * 0.65, z + fx * 0.65);
      const right = terrainHeight(x + fz * 0.65, z - fx * 0.65);
      this.root.rotation.order = 'YZX';
      this.root.rotation.set(Math.atan2(left - right, 1.3), h, Math.atan2(front - back, 2));
      this.root.position.set(x, y, z);
    } else {
      this.blocked = false;
      this.animateTools(false, dt, time);
    }
    this.warning.material.color.setHex(this.blocked && Math.sin(time * 10) > 0 ? 0xffb020 : 0x5a4a2a);
  }
}
