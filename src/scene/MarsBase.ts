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
}

/**
 * Posto de cada papel na base (GDD, "Tempo da tripulação"): engenheiro no abrigo, médico perto da estufa,
 * cientista perto do rover, comandante perto da antena. Precisam ficar FORA das caixas de `obstacles`.
 */
export const POSTS = {
  commander: new THREE.Vector3(4.6, 0, 2.7),
  engineer: new THREE.Vector3(-9.0, 0, 8.4),
  medic: new THREE.Vector3(3.4, 0, -2.6),
  scientist: new THREE.Vector3(10.5, 0, 9.5),
} as const;

export type Role = keyof typeof POSTS;

/**
 * Onde a tripulação entra à noite (ponto no chão, em frente à porta): no habitat para dormir,
 * no abrigo de regolito na noite de tempestade solar. Precisam ficar FORA das caixas de `obstacles`.
 */
export const ENTRANCES = {
  habitat: new THREE.Vector3(1.6, 0, 2.4),
  shelter: new THREE.Vector3(-11.9, 0, 7.9),
} as const;

/**
 * Onde cada problema acontece (GDD, "Problemas pela base"). Pontos alcançáveis: FORA das caixas de `obstacles`.
 * O rover atolado fica longe da base, para a caminhada longa custar tempo.
 */
export const PROBLEM_SPOTS = {
  dustyPanels: new THREE.Vector3(17, 0, 6.6),
  greenhouseLeak: new THREE.Vector3(2.3, 0, -4.6),
  antenna: new THREE.Vector3(9.7, 0, -0.6),
  roverStuck: new THREE.Vector3(22, 0, 13),
  tornBag: new THREE.Vector3(-12.5, 0, 8.4),
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
      this.roverRocks.push({ x, z, r });
      const rock = toonMesh(geo, color, 0.04);
      rock.scale.set(sx, sy, sz);
      rock.position.set(x, terrainHeight(x, z) + s * 0.2, z);
      rock.rotation.set(rng(), rng() * 3, rng());
      this.root.add(rock);
    }
  }

  private buildHabitat(): void {
    // ARC-001: fila de módulos cilíndricos ligados.
    const geo = new THREE.CylinderGeometry(1.5, 1.5, 3.6, 20);
    geo.rotateZ(Math.PI / 2);
    const ring = new THREE.TorusGeometry(1.55, 0.12, 8, 24);
    ring.rotateY(Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const x = -6 + i * 3.8;
      const mod = toonMesh(geo, PALETTE.light);
      mod.position.set(x, 2.1, 0);
      this.root.add(mod);
      for (const dx of [-1.8, 1.8]) {
        const r = toonMesh(ring, PALETTE.accent, 0);
        r.position.set(x + dx, 2.1, 0);
        this.root.add(r);
      }
      for (const wx of [-0.8, 0, 0.8]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.05), this.windows);
        w.position.set(x + wx, 2.5, 1.49);
        this.root.add(w);
      }
      for (const lx of [-1.2, 1.2]) {
        const leg = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), PALETTE.tech, 0);
        leg.position.set(x + lx, 0.45, 0.9);
        this.root.add(leg);
        const leg2 = leg.clone();
        leg2.position.z = -0.9;
        this.root.add(leg2);
      }
    }
    // Escotilha de entrada (ARC-001): por aqui a tripulação entra para dormir (ver ENTRANCES).
    const hatch = toonMesh(new THREE.BoxGeometry(1.1, 1.7, 0.5), PALETTE.light);
    hatch.position.set(ENTRANCES.habitat.x, 0.85, 1.55);
    this.root.add(hatch);
    const opening = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.2), new THREE.MeshBasicMaterial({ color: PALETTE.shadow }));
    opening.position.set(ENTRANCES.habitat.x, 0.75, 1.81);
    this.root.add(opening);
    this.addObstacle(-0.3, 0, 7.9, 1.6);
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
    const x = 7.4;
    const z = -0.6;
    const base = toonMesh(new THREE.BoxGeometry(2.6, 3, 2.6), PALETTE.light);
    base.position.set(x, 1.5, z);
    this.root.add(base);
    const mid = toonMesh(new THREE.BoxGeometry(1.8, 2, 1.8), PALETTE.light);
    mid.position.set(x, 4, z);
    this.root.add(mid);
    const stripe = toonMesh(new THREE.BoxGeometry(2.65, 0.25, 2.65), PALETTE.accent, 0);
    stripe.position.set(x, 2.6, z);
    this.root.add(stripe);
    for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      const rod = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 5), PALETTE.tech, 0);
      rod.position.set(x + dx, 7.1, z + dz);
      this.root.add(rod);
    }
    const dish = toonMesh(new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), PALETTE.light);
    dish.position.set(x + 0.9, 7.6, z);
    dish.rotation.z = Math.PI / 2.6;
    this.root.add(dish);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: PALETTE.tech }));
    tip.position.set(x + 1.4, 8.1, z);
    this.root.add(tip);
    const alarm = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0x5a2a26 }));
    alarm.position.set(x, 9.4, z);
    this.root.add(alarm);
    // Emblema próprio da missão (PRP-002), nada de logos de agências.
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: PALETTE.accent }));
    badge.position.set(x, 1.7, z + 1.31);
    this.root.add(badge);
    this.addObstacle(x, z, 1.4, 1.4);
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
        this.root.add(p);
        const post = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 5), PALETTE.tech, 0);
        post.position.set(x, 0.55, z);
        this.root.add(post);
      }
    }
    this.addObstacle(17, 3.15, 6.4, 2);
  }

  private buildBattery(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    // PRP-001: contêiner de bateria com medidor.
    const box = toonMesh(new THREE.BoxGeometry(2.6, 1.4, 1.4), PALETTE.light);
    box.position.set(7.6, 0.7, 3.8);
    this.root.add(box);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.36, 0.04), new THREE.MeshBasicMaterial({ color: PALETTE.shadow }));
    frame.position.set(7.6, 0.85, 4.51);
    this.root.add(frame);
    const meter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.26, 0.05), new THREE.MeshBasicMaterial({ color: 0x5cc16b }));
    meter.position.set(7.6, 0.85, 4.53);
    this.root.add(meter);
    this.addObstacle(7.6, 3.8, 1.3, 0.7);
    return meter;
  }

  private buildShelter(): void {
    // ARC-005: abrigo de radiação de regolito com sacos em volta.
    const c = new THREE.Vector3(-12.5, 0, 4.5);
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
    const lifeK = THREE.MathUtils.clamp((r.life - 15) / 45, 0, 1);
    for (const p of this.plants) p.material.color.copy(PLANT_DEAD).lerp(PLANT_OK, lifeK);
    const bags = Math.min(this.sandbags.length, Math.floor(r.shield / 8));
    this.sandbags.forEach((b, i) => (b.visible = i < bags));
    const batK = r.battery / CONFIG.battery.max;
    this.batteryMeter.scale.x = Math.max(0.02, batK);
    this.batteryMeter.position.x = 7.6 - (1.8 * (1 - this.batteryMeter.scale.x)) / 2;
    this.batteryMeter.material.color.set(batK > 0.5 ? 0x5cc16b : batK > 0.25 ? 0xf2c14e : 0xe0503a);
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
    const s = this.state;
    if (!s) return;

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
    this.sun.intensity = THREE.MathUtils.lerp((moon ? 2.6 : 2.2) * (1 - skyDust * 0.5) * (s.shadow ? 0.3 : 1), 0.15, n);
    this.hemi.intensity = THREE.MathUtils.lerp(moon ? 1.05 : 1.3, 0.35, n);
    // Sem ar, as estrelas aparecem até de dia na Lua.
    (this.stars.material as THREE.PointsMaterial).opacity = moon ? Math.max(0.75, n) : n;
    (this.earthDot.material as THREE.MeshBasicMaterial).opacity = n;
    this.windows.color.setHex(PALETTE.window).multiplyScalar(0.6 + n * 0.8);

    const blink = (Math.sin(time * 6) + 1) / 2;
    const alarmOn = s.alert || s.stormNight;
    this.alarm.material.color.setHex(alarmOn ? (blink > 0.5 ? PALETTE.alarm : 0x5a2a26) : 0x5a2a26);
    this.antennaTip.material.color.setHex(s.earthMessage && Math.sin(time * 4) > 0 ? 0x9fe3ff : PALETTE.tech);

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
        for (const w of this.roverWheels) w.rotation.z -= moved / 0.3;
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
        for (const w of this.roverWheels) w.rotation.z -= moved / 0.3;
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
