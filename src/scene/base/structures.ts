import * as THREE from 'three';
import { PALETTE, toonMesh } from '@/render/toon';
import { CONFIG } from '@/sim/config';
import type { Resources } from '@/sim/types';
import type { SceneryModel } from '@/render/sceneryModel';
import {
  BATTERY_POSITION,
  COMM_HALF,
  COMM_POSITION,
  DOME_CENTER,
  DOME_RADIUS,
  GREENHOUSE_STAIRS,
  STAIR_WIDTH,
  WALKWAY_WIDTH,
  HABITAT_SCALE,
  OUTLET_LOCAL_X,
  PANELS_ORIGIN,
  SHELTER_CENTER,
  SOLAR_MODEL_OFFSET,
  addObstacle,
  seededRandom,
  type Obstacle,
} from './layout';

const PANEL_CLEAN = new THREE.Color(PALETTE.panel);
const PLANT_OK = new THREE.Color(PALETTE.plant);
const PLANT_DEAD = new THREE.Color(PALETTE.plantDead);
/** Largura do medidor de bateria (m). */
const METER_WIDTH = 1.8;

/** Materiais de um modelo pelo nome (cada material uma vez). */
function materialsNamed(root: THREE.Object3D, name: string): THREE.MeshToonMaterial[] {
  const out = new Set<THREE.MeshToonMaterial>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && (mesh.material as THREE.Material).name === name) out.add(mesh.material as THREE.MeshToonMaterial);
  });
  return [...out];
}

/** O que muda a cada frame nos prédios. */
export interface StructuresFrame {
  time: number;
  dt: number;
  /** Escuridão da cena (0 dia, 1 noite): as janelas da base de comunicação acendem. */
  darkness: number;
  /** É noite no jogo (a bateria descarrega). */
  night: boolean;
  /** Alerta ou noite de tempestade: a luz de alarme pisca. */
  alarmOn: boolean;
  /** Mensagem da Terra: a ponta da antena pisca. */
  earthMessage: boolean;
  /** Carga da bateria (0–1). */
  battery: number;
}

/**
 * Prédios que MOSTRAM o estado do jogo (GDD, "A cena tem que mostrar o estado do jogo"):
 * cúpula com a estufa (suporte de vida), base de comunicação com alarme (mensagens e tempestade),
 * painéis solares (poeira), bateria (carga) e abrigo de regolito (sacos = blindagem).
 *
 * A base de comunicação e o campo solar com bateria são .glb do Marcelo (docs/base-comunicacao-e-bateria.md),
 * carregados em useCommBase/useSolarField; até lá (ou se falharem) ficam a torre, as placas e a bateria simples.
 */
export class BaseStructures {
  private readonly panels: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>[] = [];
  private readonly plants: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>[] = [];
  private readonly sandbags: THREE.Object3D[] = [];
  private readonly alarm: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly antennaTip: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly batteryMeter: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** Torre, placas e bateria simples: só até os .glb carregarem ou se falharem. */
  private readonly towerFallback = new THREE.Group();
  private readonly panelsFallback = new THREE.Group();
  private readonly batteryFallback = new THREE.Group();
  /** Peças dos .glb que mudam com o estado: luz de alerta, ponta da antena, células das placas, janelas. */
  private glbAlarm: THREE.MeshToonMaterial[] = [];
  private glbAntennaTip: THREE.MeshToonMaterial[] = [];
  private glbPanelCells: THREE.MeshToonMaterial[] = [];
  private readonly glbWindows: THREE.MeshToonMaterial[] = [];
  private battery: { model: SceneryModel; level: THREE.AnimationAction | null } | null = null;
  private batteryMode: 'charge' | 'discharge' | 'level' | null = null;
  /** Animações dos .glb (antena girando, bateria). */
  private readonly mixers: THREE.AnimationMixer[] = [];

  constructor(
    private readonly root: THREE.Object3D,
    private readonly obstacles: Obstacle[],
  ) {
    this.buildDome();
    const tower = this.buildTower();
    this.alarm = tower.alarm;
    this.antennaTip = tower.tip;
    this.buildPanels();
    this.batteryMeter = this.buildBattery();
    this.buildShelter();
  }

  /** Recursos → cena: poeira nos painéis, plantas, sacos de regolito, medidor da bateria. */
  setState(r: Resources, dustColor: number): void {
    const dustK = r.dust / CONFIG.dust.max;
    const panelDusty = new THREE.Color(dustColor);
    for (const p of this.panels) p.material.color.copy(PANEL_CLEAN).lerp(panelDusty, Math.min(1, dustK * 1.2));
    for (const mat of this.glbPanelCells) mat.color.copy(mat.userData.clean as THREE.Color).lerp(panelDusty, Math.min(1, dustK * 1.2));
    const lifeK = THREE.MathUtils.clamp((r.life - 15) / 45, 0, 1);
    for (const p of this.plants) p.material.color.copy(PLANT_DEAD).lerp(PLANT_OK, lifeK);
    const bags = Math.min(this.sandbags.length, Math.floor(r.shield / 8));
    this.sandbags.forEach((b, i) => (b.visible = i < bags));
    const batK = r.battery / CONFIG.battery.max;
    this.batteryMeter.scale.x = Math.max(0.02, batK);
    this.batteryMeter.position.x = BATTERY_POSITION.x - (METER_WIDTH * (1 - this.batteryMeter.scale.x)) / 2;
    this.batteryMeter.material.color.set(batK > 0.5 ? 0x5cc16b : batK > 0.25 ? 0xf2c14e : 0xe0503a);
  }

  /** Alarme piscando (alerta ou noite de tempestade), ponta da antena (mensagem da Terra), bateria e janelas. */
  update(f: StructuresFrame): void {
    for (const m of this.mixers) m.update(f.dt);
    const blink = (Math.sin(f.time * 6) + 1) / 2;
    this.alarm.material.color.setHex(f.alarmOn ? (blink > 0.5 ? PALETTE.alarm : 0x5a2a26) : 0x5a2a26);
    this.antennaTip.material.color.setHex(f.earthMessage && Math.sin(f.time * 4) > 0 ? 0x9fe3ff : PALETTE.tech);
    // Mesmos sinais no bloco de comunicação (.glb): alerta pisca vermelho, antena pisca azul com mensagem.
    for (const mat of this.glbAlarm) {
      mat.emissive.copy(this.alarm.material.color);
      mat.emissiveIntensity = f.alarmOn ? 1.5 : 0.3;
    }
    for (const mat of this.glbAntennaTip) {
      mat.emissive.copy(this.antennaTip.material.color);
      mat.emissiveIntensity = f.earthMessage ? 1.2 : 0.2;
    }
    for (const mat of this.glbWindows) {
      mat.emissive.setHex(0xffd27a);
      mat.emissiveIntensity = ((mat.userData.dayEmissive as number) ?? 0) + f.darkness * 1.2;
    }
    this.animateBattery(f.night, f.battery);
  }

  /**
   * Base de comunicação (comm-base.glb): acoplada na port_b do laboratório, em HABITAT_SCALE. Sem a torre de
   * acesso (a base inteira tem uma porta só, a do laboratório). A luz de alerta e a ponta da antena seguem o
   * estado como a torre simples fazia.
   */
  useCommBase(m: SceneryModel): void {
    m.root.scale.setScalar(HABITAT_SCALE);
    m.root.position.copy(COMM_POSITION);
    const tower = m.root.getObjectByName('access_tower');
    if (tower) tower.visible = false;
    this.glbAlarm = materialsNamed(m.root, 'alarm');
    this.glbAntennaTip = materialsNamed(m.root, 'antenna_tip');
    for (const mat of materialsNamed(m.root, 'window')) {
      mat.userData.dayEmissive = mat.emissiveIntensity;
      this.glbWindows.push(mat);
    }
    this.root.add(m.root);
    this.towerFallback.visible = false;
    m.play('dish_scan');
    m.play('radome_spin');
    this.mixers.push(m.mixer);
  }

  /**
   * Placas solares com bateria (solar-panels-battery.glb): feitas com o primeiro painel em (12; 2), deslocadas em
   * SOLAR_MODEL_OFFSET para o lugar das placas simples. A poeira escurece as células; a bateria anima carga
   * (dia), descarga (noite) ou mostra o nível (cheia). A tomada vai para OUTLET_LOCAL_X, encurtando o cabo.
   */
  useSolarField(m: SceneryModel): void {
    m.root.position.copy(SOLAR_MODEL_OFFSET);
    const outlet = m.root.getObjectByName('power_outlet');
    const cableOut = m.root.getObjectByName('cable_out');
    const plug = m.root.getObjectByName('cable_plug_3');
    const from = 4.2;
    const end = 7.43; // ponta do cabo na bateria
    if (outlet) outlet.position.x = OUTLET_LOCAL_X;
    if (cableOut) {
      // Escala o cabo em X a partir da ponta da bateria, para ele terminar na tomada nova.
      const k = (end - OUTLET_LOCAL_X - 0.3) / (end - from - 0.3);
      cableOut.scale.x = k;
      cableOut.position.x = end * (1 - k);
    }
    if (plug) plug.position.x += OUTLET_LOCAL_X - from;
    this.glbPanelCells = materialsNamed(m.root, 'panel_cells');
    for (const mat of this.glbPanelCells) mat.userData.clean = mat.color.clone();
    this.root.add(m.root);
    this.panelsFallback.visible = false;
    this.batteryFallback.visible = false;
    this.battery = { model: m, level: null };
    this.batteryMode = null;
    this.mixers.push(m.mixer);
  }

  /** Bateria do .glb: dia carregando, noite descarregando, cheia mostrando o nível (clipe battery_level). */
  private animateBattery(night: boolean, batK: number): void {
    const b = this.battery;
    if (!b) return;
    const mode = night ? 'discharge' : batK < 0.98 ? 'charge' : 'level';
    if (mode !== this.batteryMode) {
      this.batteryMode = mode;
      b.model.mixer.stopAllAction();
      b.level = null;
      if (mode === 'level') b.level = b.model.play('battery_level', true);
      else b.model.play(mode === 'charge' ? 'battery_charge' : 'battery_discharge');
    }
    if (b.level) {
      b.level.timeScale = 0;
      b.level.time = Math.min(0.999, batK);
    }
  }

  private buildDome(): void {
    // ARC-002: cúpula geodésica com a estufa dentro.
    const r = DOME_RADIUS;
    const center = DOME_CENTER;
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
    // Canteiros: mais plantas na cúpula maior, fora da passarela que cruza a estufa de leste a oeste.
    const rng = seededRandom(3);
    for (let i = 0; i < 48; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * (r - 1.2);
      const px = Math.cos(a) * d;
      const pz = Math.sin(a) * d;
      // Livre: embaixo da passarela (leste-oeste e o braço da garagem, ao sul) e na frente das escadas.
      if (Math.abs(pz) < WALKWAY_WIDTH / 2 + 0.5) continue;
      if (pz > 0 && Math.abs(px) < WALKWAY_WIDTH / 2 + 0.5) continue;
      if (GREENHOUSE_STAIRS.some((st) => Math.abs(center.x + px - st.top.x) < STAIR_WIDTH / 2 + 0.5 && (pz - (st.top.z - center.z)) * st.side > -0.2 && (pz - (st.harvest.z - center.z)) * st.side < 0.6)) continue;
      const plant = toonMesh(new THREE.SphereGeometry(0.35 + rng() * 0.25, 10, 8), PALETTE.plant, 0.05);
      plant.position.set(center.x + px, 0.7 + rng() * 0.3, center.z + pz);
      this.plants.push(plant);
      this.root.add(plant);
    }
    addObstacle(this.obstacles, center.x, center.z, r * 0.8, r * 0.8);
  }

  private buildTower() {
    // ARC-003: torre com antena e luz de alarme. No lugar da base de comunicação (comm-base.glb), que a
    // substitui quando carrega.
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
    addObstacle(this.obstacles, x, z, COMM_HALF.x, COMM_HALF.z);
    return { alarm, tip };
  }

  private buildPanels(): void {
    // ARC-004: campo de painéis solares.
    const geo = new THREE.BoxGeometry(2.2, 0.08, 1.3);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        const x = PANELS_ORIGIN.x + col * 2.5;
        const z = PANELS_ORIGIN.z + row * 2.3;
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
    addObstacle(this.obstacles, PANELS_ORIGIN.x + 5, PANELS_ORIGIN.z + 1.15, 6.4, 2);
  }

  private buildBattery(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    // PRP-001: contêiner de bateria com medidor.
    const { x, z } = BATTERY_POSITION;
    const box = toonMesh(new THREE.BoxGeometry(2.6, 1.4, 1.4), PALETTE.light);
    box.position.set(x, 0.7, z);
    this.batteryFallback.add(box);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.36, 0.04), new THREE.MeshBasicMaterial({ color: PALETTE.shadow }));
    frame.position.set(x, 0.85, z + 0.71);
    this.batteryFallback.add(frame);
    const meter = new THREE.Mesh(new THREE.BoxGeometry(METER_WIDTH, 0.26, 0.05), new THREE.MeshBasicMaterial({ color: 0x5cc16b }));
    meter.position.set(x, 0.85, z + 0.73);
    this.batteryFallback.add(meter);
    this.root.add(this.batteryFallback);
    addObstacle(this.obstacles, x, z, 1.4, 0.75);
    addObstacle(this.obstacles, OUTLET_LOCAL_X + SOLAR_MODEL_OFFSET.x, z, 0.35, 0.35); // tomada
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
    addObstacle(this.obstacles, c.x, c.z, 2.6, 2.6);
  }
}
