import * as THREE from 'three';
import { PALETTE, setHullOpen } from '@/render/toon';
import { CONFIG, type Location } from '@/sim/config';
import type { Resources } from '@/sim/types';
import { SCENARIOS, scenarioOf, type Scenario } from '@/scenarios';
import { Habitat } from './base/Habitat';
import { Rover } from './base/Rover';
import { RoverTracks } from './base/RoverTracks';
import { Sky } from './base/Sky';
import { BaseStructures, type BatteryFlow } from './base/structures';
import { buildTerrain } from './base/terrain';
import { DOME_CENTER, DOME_RADIUS, type Obstacle } from './base/layout';

/** O que a cena precisa saber do jogo para mostrar o estado (GDD, "A cena tem que mostrar o estado do jogo"). */
export interface SceneState {
  res: Resources;
  alert: boolean;
  night: boolean;
  stormNight: boolean;
  earthMessage: boolean;
  scienceBlocks: number;
  /** Tempestade de poeira acontecendo (no sol dela e nos sóis em que a poeira fica no ar): só aí há partículas. */
  dustStorm?: boolean;
  /** Sol (dia) atual: o rover faz uma expedição por sol, como a regra dos tubos (src/sim/day.ts). */
  sol?: number;
  /** Lua: dia de sombra das montanhas (a luz do Sol fica fraca). */
  shadow?: boolean;
  /** Lua: luz do Sol de hoje (0–1). O Sol passa atrás dos morros e a cena fica mais clara ou mais escura. */
  sunlight?: number;
  /**
   * Bateria prevista para depois da noite (a prévia do plano, Mission.previewSol). De dia a bateria da cena anda de
   * `res.battery` até ela junto com o Sol, sempre na direção do resultado. Sem ela, a cena mostra só `res.battery`.
   */
  batteryTarget?: number;
}

/**
 * Treino da introdução (sóis 1 a 3, GDD): só visual, nada muda nos números. `dust` enche o céu de poeira (1 = a
 * tempestade do jogo; até 1,4 a névoa fecha mais, para a criança ver bem), `alert` acende o alarme do abrigo e a antena
 * (o aviso da Terra) e `dark` (0–1) apaga a luz do Sol (sombra das montanhas, na Lua).
 */
export interface SceneDemo {
  dust?: number;
  alert?: boolean;
  dark?: number;
}

/** Segundos para o casco abrir ou fechar. */
const HULL_SECONDS = 1.6;

/** Cores de terreno que mudam de um cenário para o outro (as outras, como prédios e plantas, são as mesmas). */
const TERRAIN_KEYS = ['soil', 'rock', 'lit', 'dust'] as const;

/** Hora do sol (Game.dayTime) em que o dia em tempo real começa e termina: a bateria anda nesse trecho. */
const DAY_START = 0.25;
const DAY_END = 0.85;
/**
 * Rapidez com que a bateria da cena alcança a carga certa quando ela pula (carta, tarefa, noite): ~1 s para quase
 * chegar, sem passar do valor. A noite dura ≥ 2,2 s, dá tempo.
 */
const BATTERY_EASE = 3;
/** Diferença (pontos de bateria) a partir da qual a cena mostra a energia entrando ou saindo enquanto alcança. */
const BATTERY_FLOW_GAP = 0.3;

/**
 * Cena da base (ENV-001). Só desenha: nunca muda regras do jogo.
 *
 * Monta as partes de src/scene/base/ (terreno, habitat, prédios, rover, céu) e aplica o cenário
 * do lugar (src/scenarios/: Marte, Lua). Onde cada coisa fica: src/scene/base/layout.ts.
 * Geometria simples (primitivas) para manter o jogo leve; modelos .glb trocam as peças quando carregam.
 */
export class BaseScene {
  /** Bateria mostrada (pontos de bateria, não 0–1): anda entre o começo do dia, a prévia e o resultado da noite. */
  private shownBattery: number = CONFIG.battery.start;
  readonly root = new THREE.Group();
  /** Colliders estáticos (caixas no chão) para a movimentação da tripulação. */
  readonly obstacles: Obstacle[] = [];

  private readonly sky: Sky;
  private readonly habitat: Habitat;
  private readonly structures: BaseStructures;
  private readonly rover: Rover;
  /** Rastros das rodas no chão (desbotam com o vento, F26). */
  private readonly tracks = new RoverTracks();
  private fadeIn = 0;
  private readonly mesas: THREE.Object3D[];
  /** Objetos só de um lugar (src/scenarios/*, buildExtras), escondidos nos outros. */
  private readonly extras = new Map<Location, THREE.Object3D>();
  /** Materiais de terreno (chão, pedras, mesas, abrigo) com a cor de Marte, para trocar de cenário. */
  private readonly terrainMats: { mat: THREE.MeshToonMaterial; key: (typeof TERRAIN_KEYS)[number] }[] = [];

  private state: SceneState | null = null;
  private scenario: Scenario = SCENARIOS.mars;
  private nightAmount = 0;
  /** Hora do sol (dia), de 0 (nascer) a 1 (pôr): o Sol anda pelo céu (src/scene/base/Sky.ts). */
  private dayTime = 0.2;
  /** Casco das cápsulas: 0 = fechado (opaco), 1 = aberto (transparente). Começa aberto, como sempre foi. */
  private hullOpen = 1;
  private hullTarget = 1;
  private hullDirty = true;
  /** Treino da introdução: o que mostrar e o quanto já entrou (0–1, entra e sai devagar). */
  private demo: SceneDemo = {};
  private demoK = 0;
  private demoTarget = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    this.sky = new Sky(scene, this.root, this.scenario);
    // A lista de caixas é preenchida pela montagem da base; a cúpula é redonda e entra à parte.
    this.sky.setDustExclusion(this.obstacles, [{ x: DOME_CENTER.x, z: DOME_CENTER.z, r: DOME_RADIUS + 0.5, h: DOME_RADIUS + 1 }]);
    const terrain = buildTerrain(this.root);
    this.mesas = terrain.mesas;
    this.habitat = new Habitat(this.obstacles);
    this.root.add(this.habitat.root);
    this.structures = new BaseStructures(this.root, this.obstacles);
    // Pedras que caíram dentro de um prédio (as pedras são sorteadas antes dos prédios) saem da cena e do rover.
    const rocks = terrain.rocks.filter((r) => {
      const inside = this.obstacles.some((o) => Math.abs(r.x - o.center.x) < o.half.x + r.r && Math.abs(r.z - o.center.z) < o.half.z + r.r);
      if (inside) r.mesh?.removeFromParent();
      return !inside;
    });
    this.rover = new Rover(this.obstacles, rocks);
    this.root.add(this.rover.root);
    this.root.add(this.tracks.mesh);
    this.tracks.setGround(this.scenario.terrain.soil, !this.scenario.airless);
    this.collectTerrainMaterials();
    for (const s of Object.values(SCENARIOS)) {
      const extra = s.buildExtras?.();
      if (!extra) continue;
      extra.visible = s.id === this.scenario.id;
      this.extras.set(s.id, extra);
      this.root.add(extra);
    }
  }

  /** Guarda os materiais com cores de terreno de Marte (para a troca de lugar). Antes dos extras dos cenários. */
  private collectTerrainMaterials(): void {
    const marsHex = new Map<number, (typeof TERRAIN_KEYS)[number]>(TERRAIN_KEYS.map((k) => [PALETTE[k], k]));
    this.root.traverse((o) => {
      const mat = (o as THREE.Mesh).material;
      if (!(mat instanceof THREE.MeshToonMaterial)) return;
      const key = marsHex.get(mat.color.getHex());
      if (key) this.terrainMats.push({ mat, key });
    });
  }

  /** Troca o lugar: céu, luz, cores do terreno e objetos só daquele lugar. Os prédios da base são os mesmos (só visual). */
  setLocation(place: Location): void {
    const s = scenarioOf(place);
    this.scenario = s;
    for (const { mat, key } of this.terrainMats) mat.color.setHex(s.terrain[key]);
    for (const m of this.mesas) m.scale.y = s.mesaHeight;
    for (const [id, extra] of this.extras) extra.visible = id === place;
    this.sky.setScenario(s);
    // Na Lua não há vento: os rastros não desbotam.
    this.tracks.setGround(s.terrain.soil, !s.airless);
  }

  /**
   * Troca a base e o rover simples pelos modelos .glb do Grégor (docs/rover-e-base-de-pesquisa.md) e a torre,
   * as placas e a bateria pelos do Marcelo (docs/base-comunicacao-e-bateria.md).
   * Cada um que falhar continua com o modelo simples: o jogo segue funcionando.
   */
  async loadModels(): Promise<void> {
    const { loadSceneryModel, SCENERY_MODELS } = await import('@/render/sceneryModel');
    const [base, rover, comm, solar] = await Promise.allSettled([
      loadSceneryModel(SCENERY_MODELS.researchBase),
      loadSceneryModel(SCENERY_MODELS.rover),
      loadSceneryModel(SCENERY_MODELS.commBase),
      loadSceneryModel(SCENERY_MODELS.solarPanels),
    ]);
    if (comm.status === 'fulfilled') this.structures.useCommBase(comm.value);
    else console.warn('Base de comunicação (.glb) não carregou; usando a torre simples.', comm.reason);
    if (solar.status === 'fulfilled') this.structures.useSolarField(solar.value);
    else console.warn('Placas e bateria (.glb) não carregaram; usando as simples.', solar.reason);
    if (base.status === 'fulfilled') this.habitat.useModel(base.value);
    else console.warn('Base de pesquisa (.glb) não carregou; usando o módulo simples.', base.reason);
    if (rover.status === 'fulfilled') this.rover.useModel(rover.value);
    else console.warn('Rover (.glb) não carregou; usando o rover simples.', rover.reason);
    // Os cascos dos modelos novos nascem abertos: aplica o estado atual (fechado ou aberto).
    this.hullDirty = true;
  }

  /** Fecha (opaco, como é de verdade) ou abre (transparente, para ver por dentro) o casco das cápsulas e da estufa. */
  setHullsOpen(open: boolean, instant = false): void {
    this.hullTarget = open ? 1 : 0;
    if (instant) this.hullOpen = this.hullTarget;
    this.hullDirty = true;
  }

  get hullsOpen(): boolean {
    return this.hullTarget === 1;
  }

  /** Treino da introdução (só visual). `null` encerra: a poeira e o alerta saem devagar. */
  setDemo(demo: SceneDemo | null): void {
    if (demo) this.demo = demo;
    this.demoTarget = demo ? 1 : 0;
  }

  private updateHulls(dt: number): void {
    if (!this.hullDirty && this.hullOpen === this.hullTarget) return;
    const step = dt / HULL_SECONDS;
    this.hullOpen += THREE.MathUtils.clamp(this.hullTarget - this.hullOpen, -step, step);
    const k = THREE.MathUtils.smootherstep(this.hullOpen, 0, 1);
    this.root.traverse((o) => {
      const mat = (o as THREE.Mesh).material;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) setHullOpen(m, k);
    });
    this.hullDirty = false;
  }

  setRoverStuck(at: THREE.Vector3 | null): void {
    this.rover.setStuck(at);
  }

  /** O rover (para a física dar a ele um corpo que bloqueia os astronautas). */
  get roverObject(): THREE.Object3D {
    return this.rover.root;
  }

  /** Distância do rover até o centro da base (m): cresce com os blocos de ciência. (para testes) */
  get roverDistance(): number {
    return this.rover.distanceFromBase;
  }

  /** O rover está parado estudando uma rocha? (para testes) */
  get isRoverStudying(): boolean {
    return this.rover.isStudying;
  }

  /** O rover está parado esperando um astronauta sair da rota? (para testes e interface) */
  get isRoverWaiting(): boolean {
    return this.rover.isWaiting;
  }

  /** Amostras que o rover já coletou neste sol (o painel mostra os tubos enchendo). */
  get roverSamplesToday(): number {
    return this.rover.samplesToday;
  }

  /**
   * Bateria da cena (só visual; os números vêm da simulação). A carga certa agora: de dia, anda junto com o Sol do
   * começo do dia até a prévia; de manhã e à noite, é a carga do estado. A cena nunca pula: quando a carga certa
   * muda de repente (carta, tarefa, resultado da noite), a bateria sobe ou desce suave até ela, sem passar dela.
   */
  private batteryFrame(s: SceneState, dt: number): { battery: number; batteryFlow: BatteryFlow } {
    const now = s.res.battery;
    const flowOf = (from: number, to: number): BatteryFlow => (to > from + 0.01 ? 'charge' : to < from - 0.01 ? 'discharge' : 'idle');
    let goal = now;
    let flow: BatteryFlow = 'idle';
    if (!s.night) {
      const target = s.batteryTarget ?? now;
      const k = THREE.MathUtils.clamp((this.dayTime - DAY_START) / (DAY_END - DAY_START), 0, 1);
      goal = THREE.MathUtils.lerp(now, target, k);
      if (k > 0 && k < 1) flow = flowOf(now, target);
    }
    this.shownBattery = THREE.MathUtils.damp(this.shownBattery, goal, BATTERY_EASE, dt);
    if (Math.abs(goal - this.shownBattery) > BATTERY_FLOW_GAP) flow = flowOf(this.shownBattery, goal);
    return { battery: THREE.MathUtils.clamp(this.shownBattery / CONFIG.battery.max, 0, 1), batteryFlow: flow };
  }

  /** Hora do sol: 0 = nascer, 0,5 = meio-dia, 1 = pôr; acima de 1, noite. Chamado a cada frame pelo Game. */
  setDayTime(t: number): void {
    this.dayTime = t;
  }

  setState(state: SceneState): void {
    this.state = state;
    this.structures.setState(state.res, this.scenario.terrain.dust);
  }

  /** Animações por frame (só visual). `crew` = astronautas visíveis lá fora (o rover desvia deles). */
  update(dt: number, time: number, crew: THREE.Vector3[] = []): void {
    this.habitat.mixer?.update(dt);
    this.rover.mixer?.update(dt);
    const s = this.state;
    if (!s) return;

    this.nightAmount = THREE.MathUtils.damp(this.nightAmount, s.night ? 1 : 0, 2.5, dt);
    // Na Lua (polo sul) o Sol não se põe a cada 24 h: o descanso da tripulação quase não escurece a cena.
    // Só a noite fria da sombra das montanhas fica escura de verdade.
    const n = s.shadow ? this.nightAmount : this.nightAmount * this.scenario.restDarkness;
    this.updateHulls(dt);
    // Treino (introdução): soma ao que a cena já mostra, sem mexer no estado do jogo.
    this.demoK = THREE.MathUtils.damp(this.demoK, this.demoTarget, 1.8, dt);
    const d = this.demoK;
    const dust = Math.max(s.res.dust / CONFIG.dust.max, (this.demo.dust ?? 0) * d);
    const alert = s.alert || (!!this.demo.alert && d > 0.4);
    const sunlight = (s.sunlight ?? 1) * (1 - (this.demo.dark ?? 0) * d);
    // Partículas no ar só com a tempestade de poeira ativa (ou no treino da introdução).
    const airborne = Math.max(s.dustStorm ? dust : 0, (this.demo.dust ?? 0) * d);
    this.sky.update({ night: n, dust, airborne, alert, sunlight, time, dt, dayTime: this.dayTime });
    // Casco fechado: as luzes de dentro apagam junto (senão a luz atravessa o casco e ilumina o lado de fora).
    const inside = THREE.MathUtils.smootherstep(this.hullOpen, 0, 1);
    this.habitat.update(n, inside);
    this.structures.update({
      time,
      dt,
      darkness: n,
      alarmOn: alert || s.stormNight,
      earthMessage: s.earthMessage || (!!this.demo.alert && d > 0.4),
      ...this.batteryFrame(s, dt),
      sunDir: this.sky.sunVector,
      inside,
    });
    this.rover.update(dt, time, crew, s.scienceBlocks, s.night, s.sol ?? 0);
    // Rastros: uma marca a cada pedaço andado; desbotam aos poucos (o vento apaga em meses, F26).
    const rp = this.rover.root.position;
    if (!this.rover.isStuck) this.tracks.drive(rp.x, rp.z, this.rover.headingAngle, s.sol ?? 0);
    this.fadeIn -= dt;
    if (this.fadeIn <= 0) {
      this.fadeIn = 0.5;
      this.tracks.fade(s.sol ?? 0, THREE.MathUtils.clamp(this.dayTime, 0, 1));
    }
  }
}
