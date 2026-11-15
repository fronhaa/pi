import * as THREE from 'three';
import { PALETTE } from '@/render/toon';
import { CONFIG, type Location } from '@/sim/config';
import type { Resources } from '@/sim/types';
import { SCENARIOS, scenarioOf, type Scenario } from '@/scenarios';
import { Habitat } from './base/Habitat';
import { Rover } from './base/Rover';
import { Sky } from './base/Sky';
import { BaseStructures } from './base/structures';
import { buildTerrain } from './base/terrain';
import type { Obstacle } from './base/layout';

/** O que a cena precisa saber do jogo para mostrar o estado (GDD, "A cena tem que mostrar o estado do jogo"). */
export interface SceneState {
  res: Resources;
  alert: boolean;
  night: boolean;
  stormNight: boolean;
  earthMessage: boolean;
  scienceBlocks: number;
  /** Sol (dia) atual: o rover faz uma expedição por sol, como a regra dos tubos (src/sim/day.ts). */
  sol?: number;
  /** Lua: dia de sombra das montanhas (a luz do Sol fica fraca). */
  shadow?: boolean;
  /** Lua: luz do Sol de hoje (0–1). O Sol passa atrás dos morros e a cena fica mais clara ou mais escura. */
  sunlight?: number;
}

/** Cores de terreno que mudam de um cenário para o outro (as outras, como prédios e plantas, são as mesmas). */
const TERRAIN_KEYS = ['soil', 'rock', 'lit', 'dust'] as const;

/**
 * Cena da base (ENV-001). Só desenha: nunca muda regras do jogo.
 *
 * Monta as partes de src/scene/base/ (terreno, habitat, prédios, rover, céu) e aplica o cenário
 * do lugar (src/scenarios/: Marte, Lua). Onde cada coisa fica: src/scene/base/layout.ts.
 * Geometria simples (primitivas) para manter o jogo leve; modelos .glb trocam as peças quando carregam.
 */
export class BaseScene {
  readonly root = new THREE.Group();
  /** Colliders estáticos (caixas no chão) para a movimentação da tripulação. */
  readonly obstacles: Obstacle[] = [];

  private readonly sky: Sky;
  private readonly habitat: Habitat;
  private readonly structures: BaseStructures;
  private readonly rover: Rover;
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

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    this.sky = new Sky(scene, this.root, this.scenario);
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

  /**
   * O rover está na garagem esperando a tripulação (revisão automática feita, já saiu neste sol)? Só de dia e com
   * ciência no plano, para a busca extra dele poder sair.
   */
  get roverNeedsCrew(): boolean {
    const s = this.state;
    return !!s && !s.night && s.scienceBlocks > 0 && this.rover.needsCrew;
  }

  /** O cientista terminou a manutenção do rover: ele sai para uma busca extra (só visual, sem tubos). */
  releaseRover(): void {
    this.rover.releaseForSurvey();
  }

  /** Amostras que o rover já coletou neste sol (o painel mostra os tubos enchendo). */
  get roverSamplesToday(): number {
    return this.rover.samplesToday;
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
    this.sky.update({ night: n, dust: s.res.dust / CONFIG.dust.max, alert: s.alert, sunlight: s.sunlight ?? 1, time, dt, dayTime: this.dayTime });
    this.habitat.update(n);
    this.structures.update({
      time,
      dt,
      darkness: n,
      night: s.night,
      alarmOn: s.alert || s.stormNight,
      earthMessage: s.earthMessage,
      battery: s.res.battery / CONFIG.battery.max,
      sunDir: this.sky.sunVector,
    });
    this.rover.update(dt, time, crew, s.scienceBlocks, s.night, s.sol ?? 0);
  }
}
