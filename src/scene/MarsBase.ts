import * as THREE from 'three';
import { MOON_PALETTE, PALETTE, toonMaterial, toonMesh } from '@/render/toon';
import { CONFIG, type Location } from '@/sim/config';
import type { Resources } from '@/sim/types';

/** O que a cena precisa saber do jogo para mostrar o estado (GDD, "A cena tem que mostrar o estado do jogo"). */
export interface SceneState {
  res: Resources;
  alert: boolean;
  night: boolean;
  stormNight: boolean;
  earthMessage: boolean;
  scienceBlocks: number;
  /** Lua: dia de sombra das montanhas (a luz do Sol fica fraca). */
  shadow?: boolean;
  /** Lua: luz do Sol de hoje (0–1). O Sol passa atrás dos morros e a cena fica mais clara ou mais escura. */
  sunlight?: number;
}

/**
 * Posto de cada papel na base (GDD, "Tempo da tripulação"): engenheiro no abrigo, médico perto da estufa,
 * cientista perto do rover, comandante perto da antena. Precisam ficar FORA das caixas de `obstacles`.
 */
export const POSTS = {
  commander: new THREE.Vector3(5.6, 0, 0.4),
  engineer: new THREE.Vector3(-9.0, 0, 8.4),
  medic: new THREE.Vector3(3.4, 0, -2.6),
  scientist: new THREE.Vector3(10.5, 0, 9.5),
} as const;

export type Role = keyof typeof POSTS;

/**
 * Onde fica a base de pesquisa (research-base.glb, docs/rover-e-base-de-pesquisa.md): o casco corre em X,
 * a torre do airlock (a porta) fica virada para +Z, para o lado da câmera. Origem do modelo no chão.
 */
const HABITAT_POSITION = new THREE.Vector3(-1.5, 0, 1.8);
/** Porta do airlock no referencial do modelo: o astronauta anda até ela e some (doc do modelo). */
const HABITAT_DOOR_LOCAL_Z = 4.1;
/** Abrigo de regolito (tempestade solar): à frente e à esquerda do habitat, longe da trilha do rover. */
const SHELTER_CENTER = new THREE.Vector3(-13.5, 0, 8.5);
/** Deslocamento do alojamento em relação ao laboratório: a port_b dele encaixa na port_a do laboratório. */
/**
 * Escala dos módulos do habitat (cascos, pernas, teto). Em 100% o casco tem 3,3 m de diâmetro e o astronauta
 * fica pequeno lá dentro; em 80% a cabine fica mais justa, como uma nave. A torre do airlock continua em 100%,
 * para a porta seguir mais alta que o astronauta.
 */
const HABITAT_SCALE = 0.8;
/** Comprimento útil do piso em cada módulo (entre as portas de acoplamento, ±3,25 m no modelo). */
const MODULE_FLOOR_LENGTH = 6.5 * HABITAT_SCALE;
const QUARTERS_OFFSET_X = -7 * HABITAT_SCALE;
/**
 * Base de comunicação (comm-base.glb): bloco com a torre de antena, acoplado na port_b do laboratório
 * (portas em ±3,5 m no laboratório e ±1,95 m na base de comunicação), na mesma escala dos módulos.
 */
const COMM_POSITION = new THREE.Vector3(HABITAT_POSITION.x + (3.5 + 1.95) * HABITAT_SCALE, 0, HABITAT_POSITION.z);
/** Tomada do campo solar (solar-panels-battery.glb): saiu de x = 4,2 para não ficar embaixo do bloco de comunicação. */
const OUTLET_X = 5.0;
/** Bateria do campo solar (no .glb: x = 8,6; z = 3,15). */
const BATTERY_POS = new THREE.Vector3(8.6, 0, 3.15);

/** A academia encaixa do mesmo jeito na port_a do alojamento. */
const GYM_OFFSET_X = 2 * QUARTERS_OFFSET_X;
/** Altura das duas camas de cada beliche, acima do piso. */
const BUNK_LEVELS = [0.3, 1.12] as const;
/** Fundo dos módulos, onde ficam os beliches e os aparelhos (z relativo ao centro do casco). */
const BACK_Z = -0.55;

/** Piso dentro do casco (em 80% o casco vai de y = 0,8 a 3,4; neste piso sobra ~2,1 m de altura). */
const HABITAT_FLOOR_Y = 1.25;

/**
 * Onde cada papel fica DENTRO do habitat, visível pelo casco translúcido: comandante e cientista no
 * laboratório (perto do console), engenheiro e médico no alojamento (em frente aos beliches).
 */
export const HABITAT_SPOTS: Record<Role, THREE.Vector3> = {
  commander: new THREE.Vector3(HABITAT_POSITION.x - 1.0, HABITAT_FLOOR_Y, HABITAT_POSITION.z + 0.35),
  scientist: new THREE.Vector3(HABITAT_POSITION.x + 1.0, HABITAT_FLOOR_Y, HABITAT_POSITION.z + 0.35),
  engineer: new THREE.Vector3(HABITAT_POSITION.x + QUARTERS_OFFSET_X - 1.0, HABITAT_FLOOR_Y, HABITAT_POSITION.z + 0.35),
  medic: new THREE.Vector3(HABITAT_POSITION.x + QUARTERS_OFFSET_X + 1.0, HABITAT_FLOOR_Y, HABITAT_POSITION.z + 0.35),
};

/**
 * Cabines transparentes: todas as peças do casco (casco, faixas, janelas, portas de acoplamento) ficam
 * translúcidas para a câmera, para ver a tripulação lá dentro sem nada opaco na frente. Para o sol continuam
 * metal: fazem sombra (o sol não entra) e cada cabine tem a sua luminária.
 */
function glassMaterial<M extends THREE.Material>(mat: M, opacity: number): M {
  const m = mat.clone();
  m.transparent = true;
  m.opacity = opacity;
  m.depthWrite = false;
  m.side = THREE.FrontSide;
  // Sombra pelos dois lados: por padrão o three.js só desenha a face de trás na sombra, e num casco fechado
  // ela fica atrás de quem está dentro; aí o sol "atravessava" o metal.
  m.shadowSide = THREE.DoubleSide;
  return m;
}

/** Força da luminária de cada cabine (PointLight, sem sombra). */
const CABIN_LIGHT_INTENSITY = 6;

/** Centro de cada beliche em relação ao centro do alojamento. */
const BUNK_DX = 1.25;
/** Comprimento do boneco deitado (deitado ele fica em 80%, para caber entre as duas camas do beliche). */
const LYING_LENGTH = 1.85 * 0.8;

/** Cama de cada papel no alojamento (beliche, cabeça no travesseiro em −X): onde dorme à noite e descansa. */
export const BUNK_SPOTS: Record<Role, THREE.Vector3> = {
  engineer: bunkSpot(-BUNK_DX, 0),
  medic: bunkSpot(-BUNK_DX, 1),
  commander: bunkSpot(BUNK_DX, 0),
  scientist: bunkSpot(BUNK_DX, 1),
};

function bunkSpot(dx: number, level: 0 | 1): THREE.Vector3 {
  // O boneco deitado tem os pés na origem: a origem fica na ponta da cama, longe do travesseiro.
  return new THREE.Vector3(
    HABITAT_POSITION.x + QUARTERS_OFFSET_X + dx + LYING_LENGTH / 2,
    HABITAT_FLOOR_Y + BUNK_LEVELS[level] + 0.36,
    HABITAT_POSITION.z + BACK_Z,
  );
}

/**
 * Aparelhos da academia que um astronauta usa (F9: esteira e bicicleta, como na Estação Espacial).
 * `heading` segue a convenção do andar: 0 olha para −Z; aqui todos olham para a frente (+Z), para a câmera.
 */
/**
 * Para onde cada papel olha quando está parado no seu posto (GDD, "Para onde o astronauta olha"):
 * no laboratório, a sua tela da bancada; no alojamento, o armário (engenheiro) e a mesinha (médico).
 */
export const HABITAT_LOOK: Record<Role, THREE.Vector3> = {
  commander: new THREE.Vector3(HABITAT_POSITION.x - 0.9, HABITAT_FLOOR_Y + 1.3, HABITAT_POSITION.z + BACK_Z - 0.2),
  scientist: new THREE.Vector3(HABITAT_POSITION.x + 0.9, HABITAT_FLOOR_Y + 1.3, HABITAT_POSITION.z + BACK_Z - 0.2),
  engineer: new THREE.Vector3(HABITAT_POSITION.x + QUARTERS_OFFSET_X - 2.38, HABITAT_FLOOR_Y + 1, HABITAT_POSITION.z + BACK_Z),
  medic: new THREE.Vector3(HABITAT_POSITION.x + QUARTERS_OFFSET_X, HABITAT_FLOOR_Y + 0.7, HABITAT_POSITION.z + 0.3),
};

/**
 * Posição (x, relativa ao centro da academia) de cada aparelho. A academia é o último módulo: na ponta da
 * esquerda fica a parede (anel da porta de acoplamento), então a esteira fica perto do meio, com folga para
 * os braços de quem corre; o aparelho de força (só decoração) vai para a outra ponta.
 */
const TREADMILL_DX = -1.15;
const BIKE_DX = 0.45;
const GYM_DX = 1.9;
export const GYM_STATIONS = [
  { pos: new THREE.Vector3(HABITAT_POSITION.x + GYM_OFFSET_X + TREADMILL_DX, HABITAT_FLOOR_Y + 0.08, HABITAT_POSITION.z), heading: Math.PI, speed: 1.8 },
  // Na bicicleta, pedalando em pé atrás do guidão (o boneco não tem pose sentada).
  { pos: new THREE.Vector3(HABITAT_POSITION.x + GYM_OFFSET_X + BIKE_DX, HABITAT_FLOOR_Y + 0.05, HABITAT_POSITION.z - 0.35), heading: Math.PI, speed: 0.9 },
] as const;

/** Dentro da cúpula, perto do vazamento: onde fica quem conserta a estufa (problema de dentro). */
export const GREENHOUSE_WORK_SPOT = new THREE.Vector3(1.0, 0.4, -4.6);

/**
 * Onde a tripulação entra à noite (ponto no chão, em frente à porta): no habitat para dormir,
 * no abrigo de regolito na noite de tempestade solar. Precisam ficar FORA das caixas de `obstacles`.
 */
export const ENTRANCES = {
  habitat: new THREE.Vector3(HABITAT_POSITION.x, 0, HABITAT_POSITION.z + HABITAT_DOOR_LOCAL_Z + 0.3),
  shelter: new THREE.Vector3(SHELTER_CENTER.x + 0.6, 0, SHELTER_CENTER.z + 3.4),
} as const;

/**
 * Onde cada problema acontece (GDD, "Problemas pela base"). Pontos alcançáveis: FORA das caixas de `obstacles`.
 * O rover atolado fica longe da base, para a caminhada longa custar tempo.
 */
export const PROBLEM_SPOTS = {
  dustyPanels: new THREE.Vector3(17, 0, 6.6),
  greenhouseLeak: new THREE.Vector3(2.3, 0, -4.6),
  antenna: new THREE.Vector3(5.4, 0, -0.6),
  roverStuck: new THREE.Vector3(22, 0, 13),
  tornBag: new THREE.Vector3(SHELTER_CENTER.x, 0, SHELTER_CENTER.z + 3.9),
} as const;

/** Céu por lugar: em Marte, rosado com poeira; na Lua, sem ar, o céu é preto até de dia. */
const SKIES: Record<Location, { day: THREE.Color; dust: THREE.Color; alert: THREE.Color; night: THREE.Color }> = {
  mars: { day: new THREE.Color(0xe8b98c), dust: new THREE.Color(0xc99a6e), alert: new THREE.Color(0xd9866a), night: new THREE.Color(0x1c1724) },
  moon: { day: new THREE.Color(MOON_PALETTE.sky), dust: new THREE.Color(MOON_PALETTE.sky), alert: new THREE.Color(0x3a1418), night: new THREE.Color(0x050609) },
};
const SKY_DAY = SKIES.mars.day;
const PANEL_CLEAN = new THREE.Color(PALETTE.panel);
/** Cores de terreno que mudam na Lua (as outras, como prédios e plantas, são as mesmas). */
const TERRAIN_KEYS = ['soil', 'rock', 'lit', 'dust'] as const;
const PLANT_OK = new THREE.Color(PALETTE.plant);
const PLANT_DEAD = new THREE.Color(PALETTE.plantDead);

/**
 * Cena da base na cratera Jezero (ENV-001). Só desenha: nunca muda regras do jogo.
 * Geometria simples (primitivas) para manter o jogo leve.
 */
export class MarsBase {
  readonly root = new THREE.Group();
  /** Colliders estáticos (caixas no chão) para a movimentação da tripulação. */
  readonly obstacles: { center: THREE.Vector3; half: THREE.Vector3 }[] = [];

  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly stars: THREE.Points;
  private readonly earthDot: THREE.Mesh;
  private readonly panels: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>[] = [];
  private readonly plants: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>[] = [];
  private readonly sandbags: THREE.Object3D[] = [];
  private readonly windows: THREE.MeshBasicMaterial;
  private readonly alarm: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly antennaTip: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly batteryMeter: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly rover = new THREE.Group();
  /** Torre, placas e bateria simples: só até os .glb carregarem ou se falharem. */
  private readonly towerFallback = new THREE.Group();
  private readonly panelsFallback = new THREE.Group();
  private readonly batteryFallback = new THREE.Group();
  /** Peças dos .glb que mudam com o estado: luz de alerta, ponta da antena, células das placas, bateria. */
  private glbAlarm: THREE.MeshToonMaterial[] = [];
  private glbAntennaTip: THREE.MeshToonMaterial[] = [];
  private glbPanelCells: THREE.MeshToonMaterial[] = [];
  private battery: { play(name: string, once?: boolean): THREE.AnimationAction | null; mixer: THREE.AnimationMixer; level: THREE.AnimationAction | null } | null = null;
  private batteryMode: 'charge' | 'discharge' | 'level' | null = null;
  /** Habitat simples, só até a base de pesquisa (.glb) carregar ou se ela falhar. */
  private readonly habitatFallback = new THREE.Group();
  /** Animações dos modelos .glb (observatório, cata-vento, broca do rover). */
  private readonly mixers: THREE.AnimationMixer[] = [];
  private roverModel: { play(name: string, once?: boolean): void; mixer: THREE.AnimationMixer } | null = null;
  private roverModelStudying = false;
  private roverWheelRadius = 0.3;
  /** Vidros das janelas dos módulos .glb: acendem à noite (luz de dentro). */
  private readonly windowGlass: THREE.MeshToonMaterial[] = [];
  private readonly dustParticles: THREE.Points;

  private state: SceneState | null = null;
  private location: Location = 'mars';
  /** Materiais de terreno (chão, pedras, mesas, abrigo) com a cor de Marte, para trocar na Lua. */
  private readonly terrainMats: { mat: THREE.MeshToonMaterial; key: (typeof TERRAIN_KEYS)[number] }[] = [];
  private readonly mesas: THREE.Object3D[] = [];
  /** Só na Lua: a Terra grande no horizonte e crateras em volta da base. */
  private readonly moonOnly = new THREE.Group();
  /** Rover atolado: fica parado e inclinado neste ponto até alguém resolver. */
  private roverStuckAt: THREE.Vector3 | null = null;
  private nightAmount = 0;
  private roverAngle = 0;
  /** Rover parado porque há um astronauta na rota (e quanto tempo a rota está livre de novo). */
  private roverBlocked = false;
  private roverClearFor = 0;
  /** Desvio lateral da elipse (m): + para fora, − para dentro. O rover recalcula e desvia de astronautas. */
  private roverOffset = 0;
  private roverOffsetTarget = 0;
  /** Rodas (giram conforme a distância percorrida) e direção do nariz (segue o movimento real). */
  private readonly roverWheels: THREE.Object3D[] = [];
  private roverHeading: number | null = null;
  /** "Volante": metros de lado por metro à frente (−0,6 a 0,6). Gira aos poucos, como um veículo de verdade. */
  private roverSteer = 0;
  /** Pedras que o rover precisa evitar (posição e raio no chão). */
  private readonly roverRocks: { x: number; z: number; r: number }[] = [];
  private roverWarning!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /**
   * Ciclo do rover real: anda um trecho, para e estuda, segue. Rovers passam a maior parte do sol
   * parados fazendo ciência (o recorde do Perseverance foi ~4 h 24 min de direção num sol de 24 h 39 min).
   */
  private roverPhase: 'drive' | 'study' = 'drive';
  /** Depois de desatolar: volta andando do lugar onde atolou até a trilha (sem teleporte). */
  private roverReturn: { from: THREE.Vector3; elapsed: number; duration: number } | null = null;
  private roverPhaseLeft = ROVER_DRIVE_SECONDS;
  /** Cabeça da câmera (gira para olhar a rocha), braço robótico (desce para estudar) e luz do instrumento. */
  private roverHead!: THREE.Group;
  private roverArm!: THREE.Group;
  private roverProbe!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  constructor(private readonly scene: THREE.Scene) {
    scene.add(this.root);
    scene.background = SKY_DAY.clone();
    scene.fog = new THREE.Fog(SKY_DAY.clone(), 45, 140);

    this.hemi = new THREE.HemisphereLight(0xfff1e0, PALETTE.soil, 1.3);
    this.root.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
    this.sun.position.set(-30, 40, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
    this.sun.shadow.bias = -0.0005;
    this.root.add(this.sun);

    this.buildTerrain();
    this.buildMesas();
    this.buildRocks();
    this.windows = new THREE.MeshBasicMaterial({ color: PALETTE.window });
    this.buildHabitat();
    this.buildDome();
    const tower = this.buildTower();
    this.alarm = tower.alarm;
    this.antennaTip = tower.tip;
    this.buildPanels();
    this.batteryMeter = this.buildBattery();
    this.buildShelter();
    this.buildRover();
    this.stars = this.buildStars();
    this.earthDot = this.buildEarth();
    this.dustParticles = this.buildDustParticles();
    this.buildMoonExtras();
    this.collectTerrainMaterials();
  }

  /** Guarda os materiais com cores de terreno de Marte (para a troca de lugar). */
  private collectTerrainMaterials(): void {
    const marsHex = new Map<number, (typeof TERRAIN_KEYS)[number]>(TERRAIN_KEYS.map((k) => [PALETTE[k], k]));
    this.root.traverse((o) => {
      const mat = (o as THREE.Mesh).material;
      if (!(mat instanceof THREE.MeshToonMaterial) || o.parent === this.moonOnly) return;
      const key = marsHex.get(mat.color.getHex());
      if (key) this.terrainMats.push({ mat, key });
    });
  }

  /**
   * Lua: a Terra grande e baixa no horizonte (no polo sul da Lua ela fica sempre perto do horizonte)
   * e algumas crateras longe da trilha do rover. Escondido em Marte.
   */
  private buildMoonExtras(): void {
    const earth = new THREE.Group();
    earth.add(new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), new THREE.MeshBasicMaterial({ color: MOON_PALETTE.earth, fog: false })));
    const rng = mulberry(19);
    for (let i = 0; i < 7; i++) {
      const land = i < 3;
      const blob = new THREE.Mesh(
        new THREE.SphereGeometry(land ? 2.6 : 1.8, 12, 8),
        new THREE.MeshBasicMaterial({ color: land ? MOON_PALETTE.earthLand : PALETTE.white, fog: false }),
      );
      const a = rng() * Math.PI * 1.2 - 0.6;
      const b = rng() * 1.4 - 0.7;
      blob.position.set(Math.sin(a) * 6.7, Math.sin(b) * 6.7, Math.cos(a) * Math.cos(b) * 6.7);
      blob.scale.set(1, land ? 0.7 : 0.35, 0.45);
      blob.lookAt(0, 0, 0);
      earth.add(blob);
    }
    earth.position.set(-75, 16, -150);
    earth.lookAt(0, 0, 0);
    this.moonOnly.add(earth);

    const craterRng = mulberry(23);
    for (let i = 0; i < 9; i++) {
      const angle = craterRng() * Math.PI * 2;
      const dist = 42 + craterRng() * 40;
      const r = 3 + craterRng() * 6;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const rim = toonMesh(new THREE.TorusGeometry(r, r * 0.22, 6, 20), MOON_PALETTE.rock, 0.02);
      rim.rotation.x = -Math.PI / 2;
      rim.scale.z = 0.45;
      rim.position.set(x, terrainHeight(x, z) + 0.1, z);
      rim.castShadow = false;
      this.moonOnly.add(rim);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(r, 20), toonMaterial(MOON_PALETTE.soil));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(x, terrainHeight(x, z) + 0.05, z);
      floor.receiveShadow = true;
      this.moonOnly.add(floor);
    }
    this.moonOnly.visible = false;
    this.root.add(this.moonOnly);
  }

  /** Marte ou Lua: troca céu, luz e cores do terreno. Os prédios da base são os mesmos (só visual). */
  setLocation(place: Location): void {
    this.location = place;
    const moon = place === 'moon';
    for (const { mat, key } of this.terrainMats) mat.color.setHex(moon ? MOON_PALETTE[key] : PALETTE[key]);
    // Na Lua, as mesas de Marte viram bordas de cratera baixas.
    for (const m of this.mesas) m.scale.y = moon ? 0.45 : 1;
    this.moonOnly.visible = moon;
    this.earthDot.visible = !moon; // da Lua a Terra é grande (moonOnly); de Marte, um pontinho
    this.hemi.groundColor.setHex(moon ? MOON_PALETTE.soil : PALETTE.soil);
    this.sun.color.setHex(moon ? 0xffffff : 0xfff0dc);
    // Polo sul da Lua: o Sol fica sempre baixo no horizonte, com sombras compridas.
    this.sun.position.set(-30, moon ? 16 : 40, moon ? 34 : 20);
    (this.dustParticles.material as THREE.PointsMaterial).color.setHex(moon ? MOON_PALETTE.dust : PALETTE.dust);
  }

  // ---------- construção ----------

  private addObstacle(x: number, z: number, hx: number, hz: number, hy = 2): void {
    this.obstacles.push({ center: new THREE.Vector3(x, hy, z), half: new THREE.Vector3(hx, hy, hz) });
  }

  private buildTerrain(): void {
    // Chão plano perto da base e dunas suaves longe dela (GEO, INTERPRETADO até o Mars Trek).
    const geo = new THREE.PlaneGeometry(320, 320, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, toonMaterial(PALETTE.soil));
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.root.add(ground);
  }

  private buildMesas(): void {
    const rng = mulberry(7);
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + rng() * 0.3;
      const dist = 95 + rng() * 45;
      const mesa = new THREE.Group();
      const r = 8 + rng() * 14;
      const layers = 2 + Math.floor(rng() * 2);
      let y = 0;
      for (let l = 0; l < layers; l++) {
        const h = 3 + rng() * 5;
        const color = [PALETTE.rock, PALETTE.lit, PALETTE.soil][l % 3];
        const m = toonMesh(new THREE.CylinderGeometry(r * (1 - l * 0.12), r * (1.08 - l * 0.12), h, 7), color, 0.012);
        m.position.y = y + h / 2;
        m.castShadow = false;
        y += h;
        mesa.add(m);
      }
      const mx = Math.cos(angle) * dist;
      const mz = Math.sin(angle) * dist;
      mesa.position.set(mx, terrainHeight(mx, mz) - 1, mz);
      mesa.rotation.y = rng() * Math.PI;
      this.mesas.push(mesa);
      this.root.add(mesa);
    }
  }

  private buildRocks(): void {
    const rng = mulberry(42);
    const geo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 70; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = 16 + rng() * 34;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const s = 0.25 + rng() * rng() * 1.6;
      const color = rng() > 0.5 ? PALETTE.rock : PALETTE.soil;
      const sx = s * (0.8 + rng() * 0.6);
      const sy = s * (0.5 + rng() * 0.4);
      const sz = s * (0.8 + rng() * 0.6);
      const r = Math.max(sx, sz);
      // Trilha do rover: nenhuma pedra na faixa principal (senão ele poderia ficar preso para sempre).
      if (distanceToRoverTrack(x, z) < r + 2) continue;
      // Nada de pedra em cima do abrigo de regolito e dos sacos em volta dele.
      if (Math.hypot(x - SHELTER_CENTER.x, z - SHELTER_CENTER.z) < r + 4.5) continue;
      this.roverRocks.push({ x, z, r });
      const rock = toonMesh(geo, color, 0.04);
      rock.scale.set(sx, sy, sz);
      rock.position.set(x, terrainHeight(x, z) + s * 0.2, z);
      rock.rotation.set(rng(), rng() * 3, rng());
      this.root.add(rock);
    }
  }

  private buildHabitat(): void {
    // ARC-001: base de pesquisa do Grégor (research-base.glb), carregada em loadModels().
    // Até lá (ou se falhar), um módulo simples no mesmo lugar: casco translúcido e torre com a porta.
    const fb = this.habitatFallback;
    const hullGeo = new THREE.CylinderGeometry(1.6, 1.6, 7.2, 20);
    hullGeo.rotateZ(Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, glassMaterial(toonMaterial(PALETTE.light), 0.3));
    hull.castShadow = true; // o sol não atravessa o metal
    hull.position.y = 2.65;
    fb.add(hull);
    const tower = toonMesh(new THREE.BoxGeometry(1.9, 3.9, 2.4), PALETTE.light);
    tower.position.set(0, 1.95, 2.4);
    fb.add(tower);
    const opening = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), new THREE.MeshBasicMaterial({ color: PALETTE.shadow }));
    opening.position.set(0, 0.9, 3.61);
    fb.add(opening);
    for (const wx of [-2.4, -0.8, 0.8, 2.4]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.05), this.windows);
      w.position.set(wx, 3.2, 1.55);
      fb.add(w);
    }
    for (const ox of [QUARTERS_OFFSET_X, GYM_OFFSET_X]) {
      const extra = hull.clone();
      extra.position.x = ox / HABITAT_SCALE; // o grupo inteiro está em HABITAT_SCALE
      fb.add(extra);
    }
    fb.position.copy(HABITAT_POSITION);
    fb.scale.setScalar(HABITAT_SCALE);
    tower.scale.setScalar(1 / HABITAT_SCALE);
    tower.position.divideScalar(HABITAT_SCALE);
    opening.scale.setScalar(1 / HABITAT_SCALE);
    opening.position.set(0, 0.9 / HABITAT_SCALE, 3.61 / HABITAT_SCALE);
    this.root.add(fb);

    this.buildHabitatInterior();

    // Colisão: os três cascos com as pernas, torre do airlock e o armário de amostras ao lado da porta.
    const { x, z } = HABITAT_POSITION;
    this.addObstacle(x + GYM_OFFSET_X / 2, z, 3.6 * HABITAT_SCALE - GYM_OFFSET_X / 2, 2.5 * HABITAT_SCALE);
    this.addObstacle(x, z + 2.4, 1.0, 1.5);
    this.addObstacle(x - 1.5, z + 3.06, 0.6, 0.35);
  }

  /**
   * Por dentro do habitat (visto pelo casco translúcido): um piso em cada módulo, console no
   * laboratório, dois beliches (4 camas, uma por astronauta) no alojamento e a academia (esteira,
   * bicicleta e aparelho de força, como na Estação Espacial, F9). Serve para os dois modelos.
   */
  private buildHabitatInterior(): void {
    const { x, z } = HABITAT_POSITION;
    const y = HABITAT_FLOOR_Y;
    const inside = new THREE.Group();
    // Um piso por módulo: entre eles ficam as portas de acoplamento (um piso contínuo aparecia por fora).
    // Cada cabine tem luminária no teto: o casco faz sombra e o sol não entra, então a luz de dentro é dela.
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
    for (const ox of [0, QUARTERS_OFFSET_X, GYM_OFFSET_X]) {
      const floor = toonMesh(new THREE.BoxGeometry(MODULE_FLOOR_LENGTH, 0.08, 1.9), PALETTE.tech, 0);
      floor.position.set(ox, y - 0.04, 0);
      inside.add(floor);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(MODULE_FLOOR_LENGTH * 0.6, 0.05, 0.25), lampMat);
      lamp.position.set(ox, y + 2.0, 0);
      inside.add(lamp);
      const light = new THREE.PointLight(0xffe6c0, CABIN_LIGHT_INTENSITY, 4.5, 1.6);
      light.position.set(ox, y + 1.85, 0.2);
      inside.add(light);
    }

    // Laboratório: bancada comprida no fundo, com duas telas (ciência e Terra) e prateleira de amostras.
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x7fe6ea });
    const counter = toonMesh(new THREE.BoxGeometry(3.6, 0.8, 0.5), PALETTE.light, 0.03);
    counter.position.set(0, y + 0.4, BACK_Z - 0.05);
    inside.add(counter);
    const counterTop = toonMesh(new THREE.BoxGeometry(3.7, 0.06, 0.56), PALETTE.tech, 0);
    counterTop.position.set(0, y + 0.83, BACK_Z - 0.05);
    inside.add(counterTop);
    for (const sx of [-0.9, 0.9]) {
      const frame = toonMesh(new THREE.BoxGeometry(0.95, 0.6, 0.06), PALETTE.shadow, 0.03);
      frame.position.set(sx, y + 1.3, BACK_Z - 0.2);
      inside.add(frame);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.48), screenMat);
      screen.position.set(sx, y + 1.3, BACK_Z - 0.165);
      inside.add(screen);
    }
    const shelf = toonMesh(new THREE.BoxGeometry(0.5, 1.5, 0.4), PALETTE.light, 0.03);
    shelf.position.set(-2.15, y + 0.75, BACK_Z);
    inside.add(shelf);
    const jarColors = [0xc65b36, 0x9a9792, 0x718b9a];
    for (let i = 0; i < 3; i++) {
      for (const level of [0.95, 1.35]) {
        const jar = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10), jarColors[(i + (level > 1 ? 1 : 0)) % 3], 0);
        jar.position.set(-2.3 + i * 0.15, y + level, BACK_Z + 0.08);
        inside.add(jar);
      }
    }

    // Alojamento: armários nas pontas e uma mesinha na frente, entre os dois que ficam ali.
    for (const lx of [QUARTERS_OFFSET_X - 2.38, QUARTERS_OFFSET_X + 2.38]) {
      const locker = toonMesh(new THREE.BoxGeometry(0.36, 1.6, 0.6), PALETTE.tech, 0.03);
      locker.position.set(lx, y + 0.8, BACK_Z + 0.05);
      inside.add(locker);
    }
    const table = toonMesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16), PALETTE.light, 0.03);
    table.position.set(QUARTERS_OFFSET_X, y + 0.7, 0.3);
    inside.add(table);
    const leg = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.68, 8), PALETTE.tech, 0);
    leg.position.set(QUARTERS_OFFSET_X, y + 0.34, 0.3);
    inside.add(leg);
    const mug = toonMesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 10), PALETTE.accent, 0);
    mug.position.set(QUARTERS_OFFSET_X + 0.1, y + 0.79, 0.3);
    inside.add(mug);

    // Alojamento: dois beliches encostados no fundo, cada um com duas camas.
    for (const bx of [QUARTERS_OFFSET_X - BUNK_DX, QUARTERS_OFFSET_X + BUNK_DX]) {
      for (const level of BUNK_LEVELS) {
        const bed = toonMesh(new THREE.BoxGeometry(1.9, 0.18, 0.8), PALETTE.light, 0.04);
        bed.position.set(bx, y + level, BACK_Z);
        inside.add(bed);
        const blanket = toonMesh(new THREE.BoxGeometry(1.3, 0.08, 0.82), PALETTE.panel, 0);
        blanket.position.set(bx + 0.25, y + level + 0.12, BACK_Z);
        inside.add(blanket);
        const pillow = toonMesh(new THREE.BoxGeometry(0.4, 0.12, 0.6), 0xffffff, 0);
        pillow.position.set(bx - 0.7, y + level + 0.14, BACK_Z);
        inside.add(pillow);
      }
      for (const px of [-0.93, 0.93]) {
        const post = toonMesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), PALETTE.tech, 0);
        post.position.set(bx + px, y + 0.7, BACK_Z + 0.38);
        inside.add(post);
      }
    }

    // Academia: esteira e bicicleta viradas para a frente (GYM_STATIONS) e um aparelho de força no fundo.
    const g = GYM_OFFSET_X;
    const treadBase = toonMesh(new THREE.BoxGeometry(0.8, 0.07, 1.7), PALETTE.light, 0.04);
    treadBase.position.set(g + TREADMILL_DX, y + 0.035, 0);
    inside.add(treadBase);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 1.5), new THREE.MeshBasicMaterial({ color: PALETTE.shadow }));
    belt.position.set(g + TREADMILL_DX, y + 0.075, 0);
    inside.add(belt);
    for (const side of [-0.38, 0.38]) {
      const rail = toonMesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), PALETTE.tech, 0);
      rail.position.set(g + TREADMILL_DX + side, y + 0.6, 0.75);
      inside.add(rail);
    }
    const panel = toonMesh(new THREE.BoxGeometry(0.85, 0.2, 0.12), PALETTE.accent, 0);
    panel.position.set(g + TREADMILL_DX, y + 1.1, 0.75);
    inside.add(panel);

    const bikeFrame = toonMesh(new THREE.BoxGeometry(0.3, 0.25, 1.1), PALETTE.light, 0.04);
    bikeFrame.position.set(g + BIKE_DX, y + 0.13, 0);
    inside.add(bikeFrame);
    const wheel = toonMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 16).rotateZ(Math.PI / 2), PALETTE.accent, 0.04);
    wheel.position.set(g + BIKE_DX, y + 0.4, 0.45);
    inside.add(wheel);
    const bars = toonMesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), PALETTE.tech, 0);
    bars.position.set(g + BIKE_DX, y + 1.0, 0.55);
    inside.add(bars);
    const stem = toonMesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), PALETTE.tech, 0);
    stem.position.set(g + BIKE_DX, y + 0.62, 0.55);
    inside.add(stem);

    const rack = toonMesh(new THREE.BoxGeometry(1.3, 1.6, 0.12), PALETTE.tech, 0.03);
    rack.position.set(g + GYM_DX, y + 0.8, BACK_Z - 0.2);
    inside.add(rack);
    const bar = toonMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8).rotateZ(Math.PI / 2), PALETTE.light, 0);
    bar.position.set(g + GYM_DX, y + 1.15, BACK_Z + 0.1);
    inside.add(bar);
    for (const side of [-0.68, 0.68]) {
      const plate = toonMesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 16).rotateZ(Math.PI / 2), PALETTE.accent, 0.04);
      plate.position.set(g + GYM_DX + side, y + 1.15, BACK_Z + 0.1);
      inside.add(plate);
    }
    inside.position.set(x, 0, z);
    this.root.add(inside);
  }

  /**
   * Troca a base e o rover simples pelos modelos .glb do Grégor (docs/rover-e-base-de-pesquisa.md).
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
    if (comm.status === 'fulfilled') this.useCommBase(comm.value);
    else console.warn('Base de comunicação (.glb) não carregou; usando a torre simples.', comm.reason);
    if (solar.status === 'fulfilled') this.useSolarField(solar.value);
    else console.warn('Placas e bateria (.glb) não carregaram; usando as simples.', solar.reason);
    if (base.status === 'fulfilled') this.useResearchBase(base.value);
    else console.warn('Base de pesquisa (.glb) não carregou; usando o módulo simples.', base.reason);
    if (rover.status === 'fulfilled') this.useRoverModel(rover.value);
    else console.warn('Rover (.glb) não carregou; usando o rover simples.', rover.reason);
  }

  private useResearchBase(m: { root: THREE.Group; mixer: THREE.AnimationMixer; play(name: string): void }): void {
    // Alojamento: o mesmo bloco, acoplado pela porta de acoplamento do lado esquerdo (como o doc do modelo
    // prevê). Uma porta só para a base inteira: sem torre do airlock, sem armário, sem observatório.
    // A academia encaixa do mesmo jeito no alojamento.
    // Cabines em HABITAT_SCALE; a torre do airlock e o armário ficam em 100% e no mesmo lugar de antes.
    m.root.scale.setScalar(HABITAT_SCALE);
    const extras = [QUARTERS_OFFSET_X, GYM_OFFSET_X].map((ox) => {
      const module = m.root.clone(true);
      for (const name of ['access_tower', 'sample_station', 'observatory_base', 'observatory_ring', 'observatory', 'dish', 'dish_pole']) {
        const o = module.getObjectByName(name);
        if (o) o.visible = false;
      }
      module.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && (mesh.material as THREE.Material).name === 'label') mesh.visible = false; // placa "LAB"
      });
      module.position.set(HABITAT_POSITION.x + ox, 0, HABITAT_POSITION.z);
      this.root.add(module);
      return module;
    });

    for (const name of ['access_tower', 'sample_station']) {
      const o = m.root.getObjectByName(name);
      if (!o) continue;
      o.scale.setScalar(1 / HABITAT_SCALE);
      o.position.divideScalar(HABITAT_SCALE);
    }

    // Cabines transparentes: TODAS as peças do casco ficam translúcidas (o casco mais claro, faixas e janelas um
    // pouco mais visíveis), para nada opaco cortar a tripulação. Sem contorno (ele é opaco) e sem sombra.
    const cut = new Map<THREE.Material, THREE.Material>();
    for (const module of [m.root, ...extras]) {
      module.getObjectByName('hull')?.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData.isOutline) return;
        const src = mesh.material as THREE.Material;
        let mat = cut.get(src);
        if (!mat) {
          mat = glassMaterial(src, mesh.name === 'hull_shell' ? 0.28 : 0.5);
          cut.set(src, mat);
        }
        mesh.material = mat;
        // Transparente só para a câmera: para o sol o casco é metal e faz sombra lá dentro.
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        for (const c of [...mesh.children]) if (c.userData.isOutline) mesh.remove(c);
      });
    }
    // Vidros das janelas: acendem à noite.
    m.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && (mesh.material as THREE.Material).name === 'window') {
        const mat = mesh.material as THREE.MeshToonMaterial;
        if (!this.windowGlass.includes(mat)) this.windowGlass.push(mat);
      }
    });
    for (const mat of this.windowGlass) mat.userData.dayEmissive = mat.emissiveIntensity;
    m.root.position.copy(HABITAT_POSITION);
    this.root.add(m.root);
    this.habitatFallback.visible = false;
    m.play('observatory_scan');
    m.play('weather_spin');
    this.mixers.push(m.mixer);
  }

  /** Materiais de um modelo pelo nome (cada material uma vez). */
  private materialsNamed(root: THREE.Object3D, name: string): THREE.MeshToonMaterial[] {
    const out = new Set<THREE.MeshToonMaterial>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && (mesh.material as THREE.Material).name === name) out.add(mesh.material as THREE.MeshToonMaterial);
    });
    return [...out];
  }

  /**
   * Base de comunicação (docs/base-comunicacao-e-bateria.md): acoplada na port_b do laboratório, em
   * HABITAT_SCALE. Sem a torre de acesso (a base inteira tem uma porta só, a do laboratório). A luz de
   * alerta e a ponta da antena seguem o estado como a torre simples fazia.
   */
  private useCommBase(m: { root: THREE.Group; mixer: THREE.AnimationMixer; play(name: string): void }): void {
    m.root.scale.setScalar(HABITAT_SCALE);
    m.root.position.copy(COMM_POSITION);
    const tower = m.root.getObjectByName('access_tower');
    if (tower) tower.visible = false;
    this.glbAlarm = this.materialsNamed(m.root, 'alarm');
    this.glbAntennaTip = this.materialsNamed(m.root, 'antenna_tip');
    m.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && (mesh.material as THREE.Material).name === 'window') {
        const mat = mesh.material as THREE.MeshToonMaterial;
        if (!this.windowGlass.includes(mat)) {
          mat.userData.dayEmissive = mat.emissiveIntensity;
          this.windowGlass.push(mat);
        }
      }
    });
    this.root.add(m.root);
    this.towerFallback.visible = false;
    m.play('dish_scan');
    m.play('radome_spin');
    this.mixers.push(m.mixer);
  }

  /**
   * Placas solares com bateria (docs/base-comunicacao-e-bateria.md): feitas nas coordenadas do jogo, no
   * mesmo lugar das placas simples. A poeira escurece as células; a bateria anima carga (dia), descarga
   * (noite) ou mostra o nível (cheia). A tomada vai para OUTLET_X, encurtando o cabo de saída.
   */
  private useSolarField(m: { root: THREE.Group; mixer: THREE.AnimationMixer; play(name: string, once?: boolean): THREE.AnimationAction | null }): void {
    const outlet = m.root.getObjectByName('power_outlet');
    const cableOut = m.root.getObjectByName('cable_out');
    const plug = m.root.getObjectByName('cable_plug_3');
    const from = 4.2;
    const end = 7.43; // ponta do cabo na bateria
    if (outlet) outlet.position.x = OUTLET_X;
    if (cableOut) {
      // Escala o cabo em X a partir da ponta da bateria, para ele terminar na tomada nova.
      const k = (end - OUTLET_X - 0.3) / (end - from - 0.3);
      cableOut.scale.x = k;
      cableOut.position.x = end * (1 - k);
    }
    if (plug) plug.position.x += OUTLET_X - from;
    this.glbPanelCells = this.materialsNamed(m.root, 'panel_cells');
    for (const mat of this.glbPanelCells) mat.userData.clean = mat.color.clone();
    this.root.add(m.root);
    this.panelsFallback.visible = false;
    this.batteryFallback.visible = false;
    this.battery = { ...m, level: null };
    this.mixers.push(m.mixer);
  }

  /** Bateria do .glb: dia carregando, noite descarregando, cheia mostrando o nível (clipe battery_level). */
  private animateBattery(night: boolean, batK: number): void {
    const b = this.battery;
    if (!b) return;
    const mode = night ? 'discharge' : batK < 0.98 ? 'charge' : 'level';
    if (mode !== this.batteryMode) {
      this.batteryMode = mode;
      b.mixer.stopAllAction();
      b.level = null;
      if (mode === 'level') {
        b.level = b.play('battery_level', true);
      } else b.play(mode === 'charge' ? 'battery_charge' : 'battery_discharge');
    }
    if (b.level) {
      b.level.timeScale = 0;
      b.level.time = Math.min(0.999, batK);
    }
  }

  private useRoverModel(m: { root: THREE.Group; mixer: THREE.AnimationMixer; play(name: string, once?: boolean): void }): void {
    // O rover simples some (menos a luz de aviso); a lógica de andar, parar e desviar continua a mesma.
    for (const c of this.rover.children) if (c !== this.roverWarning) c.visible = false;
    this.roverWheels.length = 0;
    for (let i = 0; i < 6; i++) {
      const w = m.root.getObjectByName(`wheel_${i}`);
      if (w) this.roverWheels.push(w);
    }
    this.roverWheelRadius = 0.34;
    this.roverWarning.position.set(0, 2.62, 0);
    this.rover.add(m.root);
    this.roverModel = m;
    this.mixers.push(m.mixer);
  }

  private buildDome(): void {
    // ARC-002: cúpula geodésica com a estufa dentro.
    const r = 3.6;
    const center = new THREE.Vector3(-1.5, 0, -4.6);
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(r, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshToonMaterial({ color: 0xdfeaf0, transparent: true, opacity: 0.28 }),
    );
    shell.position.copy(center);
    this.root.add(shell);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(r, 1)),
      new THREE.LineBasicMaterial({ color: PALETTE.light }),
    );
    edges.position.copy(center);
    // Só a metade de cima do icosaedro (corta no plano do chão via clipping simples por escala)
    edges.scale.y = 1;
    const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    (edges.material as THREE.LineBasicMaterial).clippingPlanes = [clip];
    this.root.add(edges);
    const base = toonMesh(new THREE.CylinderGeometry(r + 0.1, r + 0.2, 0.4, 24), PALETTE.tech);
    base.position.set(center.x, 0.2, center.z);
    this.root.add(base);
    const rng = mulberry(3);
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * (r - 1.2);
      const plant = toonMesh(new THREE.SphereGeometry(0.35 + rng() * 0.25, 10, 8), PALETTE.plant, 0.05);
      plant.position.set(center.x + Math.cos(a) * d, 0.7 + rng() * 0.3, center.z + Math.sin(a) * d);
      this.plants.push(plant);
      this.root.add(plant);
    }
    this.addObstacle(center.x, center.z, r * 0.8, r * 0.8);
  }

  private buildTower() {
    // ARC-003: torre com antena e luz de alarme.
    // No lugar da base de comunicação (comm-base.glb), que a substitui quando carrega.
    const { x, z } = COMM_POSITION;
    const base = toonMesh(new THREE.BoxGeometry(2.6, 3, 2.6), PALETTE.light);
    base.position.set(x, 1.5, z);
    this.towerFallback.add(base);
    const mid = toonMesh(new THREE.BoxGeometry(1.8, 2, 1.8), PALETTE.light);
    mid.position.set(x, 4, z);
    this.towerFallback.add(mid);
    const stripe = toonMesh(new THREE.BoxGeometry(2.65, 0.25, 2.65), PALETTE.accent, 0);
    stripe.position.set(x, 2.6, z);
    this.towerFallback.add(stripe);
    for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      const rod = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 5), PALETTE.tech, 0);
      rod.position.set(x + dx, 7.1, z + dz);
      this.towerFallback.add(rod);
    }
    const dish = toonMesh(new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), PALETTE.light);
    dish.position.set(x + 0.9, 7.6, z);
    dish.rotation.z = Math.PI / 2.6;
    this.towerFallback.add(dish);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: PALETTE.tech }));
    tip.position.set(x + 1.4, 8.1, z);
    this.towerFallback.add(tip);
    const alarm = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0x5a2a26 }));
    alarm.position.set(x, 9.4, z);
    this.towerFallback.add(alarm);
    // Emblema próprio da missão (PRP-002), nada de logos de agências.
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: PALETTE.accent }));
    badge.position.set(x, 1.7, z + 1.31);
    this.towerFallback.add(badge);
    this.root.add(this.towerFallback);
    // Colisão do bloco de comunicação (corpo e pernas em HABITAT_SCALE).
    this.addObstacle(x, z, 2.05 * HABITAT_SCALE, 2.5 * HABITAT_SCALE);
    return { alarm, tip };
  }

  private buildPanels(): void {
    // ARC-004: campo de painéis solares.
    const geo = new THREE.BoxGeometry(2.2, 0.08, 1.3);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        const x = 12 + col * 2.5;
        const z = 2 + row * 2.3;
        const p = toonMesh(geo, PALETTE.panel, 0.02);
        p.position.set(x, 1.15, z);
        p.rotation.x = -0.35;
        this.panels.push(p);
        this.panelsFallback.add(p);
        const post = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 5), PALETTE.tech, 0);
        post.position.set(x, 0.55, z);
        this.panelsFallback.add(post);
      }
    }
    this.root.add(this.panelsFallback);
    this.addObstacle(17, 3.15, 6.4, 2);
  }

  private buildBattery(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    // PRP-001: contêiner de bateria com medidor.
    const box = toonMesh(new THREE.BoxGeometry(2.6, 1.4, 1.4), PALETTE.light);
    box.position.set(BATTERY_POS.x, 0.7, BATTERY_POS.z);
    this.batteryFallback.add(box);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.36, 0.04), new THREE.MeshBasicMaterial({ color: PALETTE.shadow }));
    frame.position.set(BATTERY_POS.x, 0.85, BATTERY_POS.z + 0.71);
    this.batteryFallback.add(frame);
    const meter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.26, 0.05), new THREE.MeshBasicMaterial({ color: 0x5cc16b }));
    meter.position.set(BATTERY_POS.x, 0.85, BATTERY_POS.z + 0.73);
    this.batteryFallback.add(meter);
    this.root.add(this.batteryFallback);
    this.addObstacle(BATTERY_POS.x, BATTERY_POS.z, 1.4, 0.75);
    this.addObstacle(OUTLET_X, 3.15, 0.35, 0.35); // tomada
    return meter;
  }

  private buildShelter(): void {
    // ARC-005: abrigo de radiação de regolito com sacos em volta.
    const c = SHELTER_CENTER;
    const mound = toonMesh(new THREE.SphereGeometry(3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), PALETTE.rock);
    mound.scale.y = 0.6;
    mound.position.copy(c);
    this.root.add(mound);
    const door = toonMesh(new THREE.BoxGeometry(1.2, 1.5, 0.6), PALETTE.light);
    door.position.set(c.x + 0.6, 0.75, c.z + 2.6);
    this.root.add(door);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), new THREE.MeshBasicMaterial({ color: PALETTE.shadow }));
    hole.position.set(c.x + 0.6, 0.7, c.z + 2.91);
    this.root.add(hole);
    const bagGeo = new THREE.BoxGeometry(0.9, 0.45, 0.55);
    const max = Math.floor(CONFIG.shield.max / 8);
    for (let i = 0; i < max; i++) {
      const a = -0.2 + (i / max) * Math.PI * 1.6 + Math.PI * 0.75;
      const bag = toonMesh(bagGeo, PALETTE.dust, 0.05);
      const ring = i % 2 === 0 ? 3.5 : 3.6;
      bag.position.set(c.x + Math.cos(a) * ring, 0.23 + (i % 3 === 2 ? 0.45 : 0), c.z + Math.sin(a) * ring);
      bag.rotation.y = -a;
      this.sandbags.push(bag);
      this.root.add(bag);
    }
    this.addObstacle(c.x, c.z, 2.6, 2.6);
  }

  private buildRover(): void {
    // VEH-001: rover de seis rodas, inspirado no Perseverance (INTERPRETADO).
    const body = toonMesh(new THREE.BoxGeometry(2, 0.6, 1.3), PALETTE.light);
    body.position.y = 0.85;
    this.rover.add(body);
    const stripe = toonMesh(new THREE.BoxGeometry(2.02, 0.12, 1.32), PALETTE.accent, 0);
    stripe.position.y = 0.6;
    this.rover.add(stripe);
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.25, 12);
    wheelGeo.rotateX(Math.PI / 2);
    for (const x of [-0.75, 0, 0.75]) {
      for (const z of [-0.75, 0.75]) {
        const w = toonMesh(wheelGeo, PALETTE.shadow, 0.04);
        this.roverWheels.push(w);
        // Raio da roda visível ao girar (sem isso a roda lisa parece parada).
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.27), new THREE.MeshBasicMaterial({ color: PALETTE.tech }));
        w.add(spoke);
        w.position.set(x, 0.3, z);
        this.rover.add(w);
      }
    }
    const mast = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), PALETTE.tech, 0);
    mast.position.set(0.7, 1.6, 0);
    this.rover.add(mast);
    // Cabeça num pivô próprio, para girar e "olhar" a rocha ao estudar.
    this.roverHead = new THREE.Group();
    this.roverHead.position.set(0.7, 2.15, 0);
    this.roverHead.add(toonMesh(new THREE.BoxGeometry(0.35, 0.25, 0.45), PALETTE.light));
    this.rover.add(this.roverHead);
    // Braço robótico na frente: guardado em pé ao andar, desce até o chão ao estudar.
    this.roverArm = new THREE.Group();
    this.roverArm.position.set(1.0, 0.95, 0.5);
    const armGeo = new THREE.BoxGeometry(1.0, 0.14, 0.14);
    armGeo.translate(0.5, 0, 0);
    this.roverArm.add(toonMesh(armGeo, PALETTE.light, 0.03));
    this.roverProbe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: PALETTE.tech }));
    this.roverProbe.position.set(1.05, 0, 0);
    this.roverArm.add(this.roverProbe);
    this.roverArm.rotation.z = ARM_STOWED;
    this.rover.add(this.roverArm);
    // Luz de aviso: pisca em âmbar quando o rover para por causa de um astronauta na rota.
    this.roverWarning = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0x5a4a2a }));
    this.roverWarning.position.set(0.7, 2.36, 0);
    this.rover.add(this.roverWarning);
    this.rover.position.set(12.5, 0, 9);
    this.root.add(this.rover);
  }

  private buildStars(): THREE.Points {
    const rng = mulberry(11);
    const n = 600;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = rng() * Math.PI * 0.42;
      const r = 200;
      arr[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      arr[i * 3 + 1] = Math.cos(phi) * r;
      arr[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    this.root.add(pts);
    return pts;
  }

  private buildEarth(): THREE.Mesh {
    // Visto de Marte, a Terra é só um pontinho azul (FX-002).
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7fb6ff, transparent: true, opacity: 0, fog: false }));
    dot.position.set(-60, 70, -150);
    this.root.add(dot);
    return dot;
  }

  private buildDustParticles(): THREE.Points {
    const rng = mulberry(5);
    const n = 900;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (rng() - 0.5) * 80;
      arr[i * 3 + 1] = rng() * 12;
      arr[i * 3 + 2] = (rng() - 0.5) * 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: PALETTE.dust, size: 0.18, transparent: true, opacity: 0 }));
    this.root.add(pts);
    return pts;
  }

  // ---------- estado ----------

  setRoverStuck(at: THREE.Vector3 | null): void {
    const wasStuck = this.roverStuckAt !== null;
    this.roverStuckAt = at;
    this.roverHeading = null; // ao voltar a andar, o nariz recomeça da direção do movimento
    if (!at) this.rover.rotation.set(0, this.rover.rotation.y, 0);
    if (!at && wasStuck) {
      // Desatolou: continua a volta a partir do ponto da trilha mais perto e anda até lá (antes ele "teleportava"
      // para onde a trilha estava quando atolou).
      const p = this.rover.position;
      this.roverAngle = nearestTrackAngle(p.x, p.z);
      this.roverOffset = 0;
      this.roverOffsetTarget = 0;
      this.roverSteer = 0;
      const target = this.roverPoint(this.roverAngle, 0);
      const dist = Math.hypot(target.x - p.x, target.z - p.z);
      this.roverReturn = { from: p.clone(), elapsed: 0, duration: Math.max(1, dist / ROVER_RETURN_SPEED) };
      this.roverPhase = 'drive';
      this.roverPhaseLeft = ROVER_DRIVE_SECONDS;
    }
  }

  setState(state: SceneState): void {
    this.state = state;
    const r = state.res;
    const dustK = r.dust / CONFIG.dust.max;
    const panelDusty = new THREE.Color(this.location === 'moon' ? MOON_PALETTE.dust : PALETTE.dust);
    for (const p of this.panels) p.material.color.copy(PANEL_CLEAN).lerp(panelDusty, Math.min(1, dustK * 1.2));
    for (const mat of this.glbPanelCells) mat.color.copy(mat.userData.clean as THREE.Color).lerp(panelDusty, Math.min(1, dustK * 1.2));
    const lifeK = THREE.MathUtils.clamp((r.life - 15) / 45, 0, 1);
    for (const p of this.plants) p.material.color.copy(PLANT_DEAD).lerp(PLANT_OK, lifeK);
    const bags = Math.min(this.sandbags.length, Math.floor(r.shield / 8));
    this.sandbags.forEach((b, i) => (b.visible = i < bags));
    const batK = r.battery / CONFIG.battery.max;
    this.batteryMeter.scale.x = Math.max(0.02, batK);
    this.batteryMeter.position.x = BATTERY_POS.x - (1.8 * (1 - this.batteryMeter.scale.x)) / 2;
    this.batteryMeter.material.color.set(batK > 0.5 ? 0x5cc16b : batK > 0.25 ? 0xf2c14e : 0xe0503a);
    this.animateBattery(this.state?.night ?? false, batK);
  }

  /** Animações por frame (só visual). */
  /** O rover (para a física dar a ele um corpo que bloqueia os astronautas). */
  get roverObject(): THREE.Object3D {
    return this.rover;
  }

  /** Desvio lateral atual do rover (m). */
  get roverDetour(): number {
    return this.roverOffset;
  }

  /** O rover está parado estudando uma rocha? (para testes) */
  get isRoverStudying(): boolean {
    return this.roverPhase === 'study';
  }

  /** O rover está parado esperando um astronauta sair da rota? (para testes e interface) */
  get isRoverWaiting(): boolean {
    return this.roverBlocked;
  }

  /** Posição na elipse do rover com desvio lateral `off` (m). */
  private roverPoint(angle: number, off: number): { x: number; z: number } {
    return { x: 2 + Math.cos(angle) * (26 + off), z: 2 + Math.sin(angle) * (15 + off) };
  }

  /**
   * O trecho à frente (~8 m) da rota com desvio `off` passa perto de algum astronauta?
   * Usa a mesma medida para a rota atual e para as rotas alternativas do desvio.
   */
  private routeHits(crew: THREE.Vector3[], off: number): { x: number; z: number } | null {
    // O rover anda ~2,8 m/s e leva ~1 s para mudar de faixa: precisa enxergar longe o bastante para desviar a tempo.
    const LOOKAHEAD = 8;
    const SAFE = 1.4; // meia-largura do rover (~0,65) + astronauta (~0,35) + folga
    const a = this.roverAngle;
    const speed = Math.hypot(Math.sin(a) * (26 + off), Math.cos(a) * (15 + off));
    const ROVER_HALF = 0.9; // meia-largura do rover + folga, para pedras e prédios
    for (let i = 1; i <= 10; i++) {
      const p = this.roverPoint(a + ((i / 10) * LOOKAHEAD) / speed, off);
      for (const c of crew) if (Math.hypot(c.x - p.x, c.z - p.z) < SAFE) return c;
      for (const k of this.roverRocks) if (Math.hypot(k.x - p.x, k.z - p.z) < k.r + ROVER_HALF) return k;
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
  private planRover(crew: THREE.Vector3[]): boolean {
    const DETOUR = 3;
    const NEAR = 1.7;
    const pos = this.rover.position;
    if (crew.some((c) => Math.hypot(c.x - pos.x, c.z - pos.z) < NEAR)) return true; // colado: para
    if (!this.routeHits(crew, 0)) {
      this.roverOffsetTarget = 0;
      return false;
    }
    if (!this.routeHits(crew, this.roverOffsetTarget) && this.roverOffsetTarget !== 0) return false; // desvio atual serve
    const who = this.routeHits(crew, 0)!;
    // Lado do astronauta em relação à elipse: fora (> 1) ou dentro (< 1).
    const outside = ((who.x - 2) / 26) ** 2 + ((who.z - 2) / 15) ** 2 > 1;
    for (const off of outside ? [-DETOUR, DETOUR] : [DETOUR, -DETOUR]) {
      if (!this.routeHits(crew, off)) {
        this.roverOffsetTarget = off;
        return false;
      }
    }
    return true; // nenhuma rota livre: espera
  }

  /**
   * Estudando: o braço desce, a cabeça olha para a pedra mais perto (se houver) e a ponta do
   * instrumento pisca. Andando ou parado: tudo volta ao lugar.
   */
  private animateRoverTools(studying: boolean, dt: number, time: number): void {
    // Rover .glb: ao parar para estudar, o mastro escaneia e a broca desce; ao voltar a andar, para tudo.
    if (this.roverModel && studying !== this.roverModelStudying) {
      this.roverModelStudying = studying;
      if (studying) {
        this.roverModel.play('scan');
        this.roverModel.play('drill', true);
      } else this.roverModel.mixer.stopAllAction();
    }
    this.roverArm.rotation.z = THREE.MathUtils.damp(this.roverArm.rotation.z, studying ? ARM_DEPLOYED : ARM_STOWED, 4, dt);
    let yaw = 0;
    if (studying) {
      const p = this.rover.position;
      let best: { x: number; z: number } | null = null;
      for (const k of this.roverRocks) {
        if (Math.hypot(k.x - p.x, k.z - p.z) < 9 && (!best || Math.hypot(k.x - p.x, k.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z))) best = k;
      }
      if (best) {
        // Ângulo da pedra no referencial do rover (frente = +x local), limitado ao giro da cabeça.
        const world = Math.atan2(-(best.z - p.z), best.x - p.x);
        yaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(world - this.rover.rotation.y), Math.cos(world - this.rover.rotation.y)), -1.4, 1.4);
      } else {
        yaw = Math.sin(time * 0.8) * 0.8; // sem pedra perto: olha em volta
      }
    }
    this.roverHead.rotation.y = THREE.MathUtils.damp(this.roverHead.rotation.y, yaw, 3, dt);
    this.roverProbe.material.color.setHex(studying && Math.sin(time * 8) > 0 ? 0x9fe3ff : PALETTE.tech);
  }

  update(dt: number, time: number, crew: THREE.Vector3[] = []): void {
    for (const m of this.mixers) m.update(dt);
    const s = this.state;
    if (!s) return;
    this.animateBattery(s.night, s.res.battery / CONFIG.battery.max);

    this.nightAmount = THREE.MathUtils.damp(this.nightAmount, s.night ? 1 : 0, 2.5, dt);
    const moon = this.location === 'moon';
    // Na Lua (polo sul) o Sol não se põe a cada 24 h: o descanso da tripulação quase não escurece a cena.
    // Só a noite fria da sombra das montanhas fica escura de verdade.
    const n = moon && !s.shadow ? this.nightAmount * 0.12 : this.nightAmount;
    const dustK = s.res.dust / CONFIG.dust.max;

    const skies = SKIES[this.location];
    const sky = skies.day.clone().lerp(skies.dust, dustK);
    if (s.alert) sky.lerp(skies.alert, 0.45);
    sky.lerp(skies.night, n);
    (this.scene.background as THREE.Color).copy(sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(sky);
    // Na Lua não há ar: quase sem névoa (só esconde a borda do mapa) e a poeira não sobe no céu.
    fog.near = moon ? 150 : THREE.MathUtils.lerp(45, 14, dustK);
    fog.far = moon ? 300 : THREE.MathUtils.lerp(140, 70, dustK);

    // Na Lua a poeira fica nos painéis, mas não escurece o céu (não há vento para levantá-la).
    const skyDust = moon ? 0 : dustK;
    this.sun.intensity = THREE.MathUtils.lerp((moon ? 2.6 : 2.2) * (1 - skyDust * 0.5) * (moon ? 0.2 + 0.8 * (s.sunlight ?? 1) : 1), 0.15, n);
    this.hemi.intensity = THREE.MathUtils.lerp(moon ? 1.05 : 1.3, 0.35, n);
    // Sem ar, as estrelas aparecem até de dia na Lua.
    (this.stars.material as THREE.PointsMaterial).opacity = moon ? Math.max(0.75, n) : n;
    (this.earthDot.material as THREE.MeshBasicMaterial).opacity = n;
    this.windows.color.setHex(PALETTE.window).multiplyScalar(0.6 + n * 0.8);
    for (const mat of this.windowGlass) {
      mat.emissive.setHex(0xffd27a);
      mat.emissiveIntensity = ((mat.userData.dayEmissive as number) ?? 0) + n * 1.2;
    }

    const blink = (Math.sin(time * 6) + 1) / 2;
    const alarmOn = s.alert || s.stormNight;
    this.alarm.material.color.setHex(alarmOn ? (blink > 0.5 ? PALETTE.alarm : 0x5a2a26) : 0x5a2a26);
    this.antennaTip.material.color.setHex(s.earthMessage && Math.sin(time * 4) > 0 ? 0x9fe3ff : PALETTE.tech);
    // Mesmos sinais no bloco de comunicação (.glb): alerta pisca vermelho, antena pisca azul com mensagem.
    for (const mat of this.glbAlarm) {
      mat.emissive.copy(this.alarm.material.color);
      mat.emissiveIntensity = alarmOn ? 1.5 : 0.3;
    }
    for (const mat of this.glbAntennaTip) {
      mat.emissive.copy(this.antennaTip.material.color);
      mat.emissiveIntensity = s.earthMessage ? 1.2 : 0.2;
    }

    const dp = this.dustParticles;
    (dp.material as THREE.PointsMaterial).opacity = moon ? 0 : THREE.MathUtils.lerp(0, 0.7, Math.min(1, dustK * 1.5)) * (1 - n * 0.6);
    dp.position.x = ((time * 3) % 20) - 10;

    if (this.roverStuckAt) {
      this.rover.position.set(this.roverStuckAt.x + 1.6, terrainHeight(this.roverStuckAt.x, this.roverStuckAt.z) - 0.25, this.roverStuckAt.z + 0.6);
      this.rover.rotation.set(0.18, 0.7, 0.12);
      this.animateRoverTools(false, dt, time);
    } else if (s.scienceBlocks > 0 && !s.night) {
      this.rover.rotation.x = 0;
      this.rover.rotation.z = 0;
      // Segurança: recalcula e desvia de astronautas; para só sem rota livre. Retoma após 0,6 s.
      if (this.planRover(crew)) {
        this.roverBlocked = true;
        this.roverClearFor = 0;
      } else if (this.roverBlocked) {
        this.roverClearFor += dt;
        if (this.roverClearFor > 0.6) this.roverBlocked = false;
      }
      // Anda um trecho, para e estuda, segue (como o rover real). O tempo só corre fora do bloqueio.
      if (!this.roverBlocked) {
        this.roverPhaseLeft -= dt;
        if (this.roverPhaseLeft <= 0) {
          this.roverPhase = this.roverPhase === 'drive' ? 'study' : 'drive';
          this.roverPhaseLeft = this.roverPhase === 'drive' ? ROVER_DRIVE_SECONDS : ROVER_STUDY_SECONDS;
        }
      }
      const studying = this.roverPhase === 'study' && !this.roverBlocked;
      this.animateRoverTools(studying, dt, time);
      // Elipse por fora da base e dos painéis (painéis vão até x ≈ 22).
      // Durante a volta para a trilha, o ponto-alvo fica parado (senão o rover acelera para alcançá-lo).
      if (!this.roverBlocked && !studying && !this.roverReturn) {
        const a0 = this.roverAngle;
        this.roverAngle += dt * 0.06 * s.scienceBlocks;
        const forward = (this.roverAngle - a0) * Math.hypot(Math.sin(a0) * (26 + this.roverOffset), Math.cos(a0) * (15 + this.roverOffset));
        // Volante: quer virar até ~30° (0,6) para o lado do desvio, aliviando perto da faixa-alvo; gira no máximo 1,5/s.
        const remaining = this.roverOffsetTarget - this.roverOffset;
        const desired = THREE.MathUtils.clamp(remaining / 1.5, -0.6, 0.6);
        this.roverSteer += THREE.MathUtils.clamp(desired - this.roverSteer, -1.5 * dt, 1.5 * dt);
        const lateral = this.roverSteer * forward;
        // Não passa da faixa-alvo.
        this.roverOffset = Math.abs(lateral) > Math.abs(remaining) && Math.sign(lateral) === Math.sign(remaining) ? this.roverOffsetTarget : this.roverOffset + lateral;
      }
      let { x, z } = this.roverPoint(this.roverAngle, this.roverOffset);
      const ret = this.roverReturn;
      if (ret && !this.roverBlocked && !studying) {
        // Voltando para a trilha: mistura suave do lugar onde atolou até o ponto atual da trilha.
        ret.elapsed += dt;
        const k = THREE.MathUtils.smoothstep(ret.elapsed / ret.duration, 0, 1);
        x = THREE.MathUtils.lerp(ret.from.x, x, k);
        z = THREE.MathUtils.lerp(ret.from.z, z, k);
        if (ret.elapsed >= ret.duration) this.roverReturn = null;
      } else if (ret) {
        // Parado (estudando ou esperando): fica onde está, no meio do caminho de volta.
        const k = THREE.MathUtils.smoothstep(ret.elapsed / ret.duration, 0, 1);
        x = THREE.MathUtils.lerp(ret.from.x, x, k);
        z = THREE.MathUtils.lerp(ret.from.z, z, k);
      }
      const y = terrainHeight(x, z);
      const moved = Math.hypot(x - this.rover.position.x, z - this.rover.position.z);
      if (moved > 1e-4 && moved < 2 && this.roverReturn) {
        // Voltando para a trilha: o nariz aponta para onde ele está indo.
        this.roverHeading = Math.atan2(-(z - this.rover.position.z), x - this.rover.position.x);
        for (const w of this.roverWheels) w.rotation.z -= moved / this.roverWheelRadius;
      } else if (moved > 1e-4 && moved < 2) {
        // Nariz = direção exata do movimento: tangente da elipse + componente lateral do volante (sem "drift").
        const a = this.roverAngle;
        const tx = -Math.sin(a) * (26 + this.roverOffset);
        const tz = Math.cos(a) * (15 + this.roverOffset);
        const tl = Math.hypot(tx, tz);
        const vx = tx / tl + this.roverSteer * Math.cos(a);
        const vz = tz / tl + this.roverSteer * Math.sin(a);
        this.roverHeading = Math.atan2(-vz, vx);
        // Rodas giram conforme a distância (raio 0,3 m).
        for (const w of this.roverWheels) w.rotation.z -= moved / this.roverWheelRadius;
      }
      // Terreno: inclina o rover conforme o relevo (frente/trás = arfagem, lados = rolagem).
      const h = this.roverHeading ?? 0;
      const fx = Math.cos(h);
      const fz = -Math.sin(h);
      const front = terrainHeight(x + fx, z + fz);
      const back = terrainHeight(x - fx, z - fz);
      const left = terrainHeight(x - fz * 0.65, z + fx * 0.65);
      const right = terrainHeight(x + fz * 0.65, z - fx * 0.65);
      this.rover.rotation.order = 'YZX';
      this.rover.rotation.set(Math.atan2(left - right, 1.3), h, Math.atan2(front - back, 2));
      this.rover.position.set(x, y, z);
    } else {
      this.roverBlocked = false;
      this.animateRoverTools(false, dt, time);
    }
    this.roverWarning.material.color.setHex(this.roverBlocked && Math.sin(time * 10) > 0 ? 0xffb020 : 0x5a4a2a);
  }
}

/** Ciclo do rover: segundos andando e segundos parado estudando (valores de cena, não de regra). */
const ROVER_DRIVE_SECONDS = 8;
const ROVER_STUDY_SECONDS = 5;
/** Velocidade da volta para a trilha depois de desatolar (m/s), parecida com a do rover andando. */
const ROVER_RETURN_SPEED = 2.5;
/** Ângulo do braço: guardado (em pé) e estudando (apontado para o chão à frente). */
const ARM_STOWED = 1.35;
const ARM_DEPLOYED = -0.75;

/** Ângulo da trilha do rover (elipse centro (2,2), semi-eixos 26 e 15) mais perto de um ponto. */
function nearestTrackAngle(x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const d = Math.hypot(x - (2 + Math.cos(a) * 26), z - (2 + Math.sin(a) * 15));
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** Distância (m) de um ponto até a trilha principal do rover (elipse centro (2,2), semi-eixos 26 e 15). */
function distanceToRoverTrack(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    best = Math.min(best, Math.hypot(x - (2 + Math.cos(a) * 26), z - (2 + Math.sin(a) * 15)));
  }
  return best;
}

/** Relevo: plano perto da base, dunas suaves longe dela (INTERPRETADO até o Mars Trek entrar). */
export function terrainHeight(x: number, z: number): number {
  const fade = THREE.MathUtils.smoothstep(Math.hypot(x, z), 30, 60);
  const h = Math.sin(x * 0.07) * Math.cos(z * 0.05) * 1.6 + Math.sin(x * 0.021 + z * 0.03) * 3;
  return h * fade;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
