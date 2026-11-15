import * as THREE from 'three';
import { HULL_COLORS, PALETTE, seeThroughHull, toonMaterial, toonMesh } from '@/render/toon';
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
const UP = new THREE.Vector3(0, 1, 0);
const PLANT_OK = new THREE.Color(PALETTE.plant);
const PLANT_DEAD = new THREE.Color(PALETTE.plantDead);
/** Estufa inflável: gomos da membrana, cor da fibra óptica (luz do Sol) e dos LEDs de cultivo, altura dos LEDs. */
const DOME_GORES = 12;
/** Caixas de colisão em volta do anel de regolito da estufa. */
const DOME_BERM_BOXES = 24;
const FIBER_COLOR = 0xffd27a;
const LED_COLOR = 0xe08cff;
const LED_HEIGHT = 2.7;
/** Luminárias da fibra óptica lá dentro (relativas ao centro da estufa) e a força do foco com o Sol pleno. */
const FIBER_LAMPS: readonly [number, number][] = [[0.8, -3.6], [-1.2, 3.4]];
const FIBER_LAMP_HEIGHT = 3.5;
const FIBER_SPOT_INTENSITY = 14;

/** Facho de luz visível: cone translúcido que soma luz (não escurece o que está atrás). */
function beamMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
}
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
  /** Direção do Sol (para o concentrador da estufa); abaixo do horizonte, ele fica virado para cima. */
  sunDir?: THREE.Vector3;
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
  /** Estufa: concentrador solar (gira para o Sol), fibra óptica e LEDs de cultivo. */
  private readonly collector = new THREE.Group();
  private readonly fiberMat = new THREE.MeshBasicMaterial({ color: FIBER_COLOR });
  private readonly ledMat = new THREE.MeshBasicMaterial({ color: LED_COLOR });
  private readonly ledLight = new THREE.PointLight(LED_COLOR, 2.5, 9, 1.4);
  /** Luminárias da fibra óptica lá dentro: um foco de luz do Sol sobre cada canteiro (sem sombra). */
  private readonly fiberSpots: THREE.SpotLight[] = [];
  /** Fachos visíveis (cones translúcidos): mostram de onde vem a luz das plantas, na sombra do casco. */
  private readonly fiberBeamMat = beamMaterial(FIBER_COLOR);
  private readonly ledBeamMat = beamMaterial(LED_COLOR);
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
    this.updateGreenhouse(f);
  }

  /** De dia a fibra óptica brilha com a luz do Sol; à noite as plantas ficam só com os LEDs, mais fortes. */
  private updateGreenhouse(f: StructuresFrame): void {
    const sun = f.sunDir && f.sunDir.y > 0.02 ? f.sunDir : UP;
    const target = this.collector.position.clone().add(sun);
    this.collector.lookAt(target);
    const day = 1 - f.darkness;
    this.fiberMat.color.setHex(FIBER_COLOR).multiplyScalar(0.35 + 0.65 * day * (sun === UP ? 0.3 : 1));
    this.ledMat.color.setHex(LED_COLOR).multiplyScalar(0.7 + 0.5 * f.darkness);
    this.ledLight.intensity = 1.2 + 2.3 * f.darkness;
    // De dia, a luz do Sol entra pela fibra óptica e desce em fachos sobre os canteiros (com o Sol abaixo do
    // horizonte, quase nada); à noite, os fachos dos LEDs ficam mais fortes.
    const sunlight = day * (sun === UP ? 0.15 : 1);
    for (const spot of this.fiberSpots) spot.intensity = FIBER_SPOT_INTENSITY * sunlight;
    this.fiberBeamMat.opacity = 0.2 * sunlight;
    this.ledBeamMat.opacity = 0.05 + 0.13 * f.darkness;
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

  /**
   * ARC-002: estufa fechada, do **mesmo material das cápsulas**, não de vidro (docs/ciencia-marte.md, F20). Como os
   * módulos, ela aparece translúcida só para a câmera (para ver as plantas e a tripulação lá dentro); para o sol é
   * casco e faz sombra. A luz das plantas vem de dentro, como no protótipo da NASA: de dia, o concentrador que segue o
   * Sol manda a luz por fibra óptica; à noite, os LEDs de cultivo. Regolito em volta da base protege da radiação.
   */
  private buildDome(): void {
    const r = DOME_RADIUS;
    const center = DOME_CENTER;
    // Casco: o mesmo das cápsulas (cor, translucidez e sombra), com faixas e nervuras nas cores das faixas delas.
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(r, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      seeThroughHull(toonMaterial(HULL_COLORS.shell), 0.28),
    );
    shell.position.copy(center);
    shell.renderOrder = 1;
    // Faz sombra (o sol não entra: a sombra das nervuras e do concentrador não cai lá dentro) e recebe sombra
    // por fora (a sombra do concentrador e das nervuras aparece em cima da estufa).
    shell.castShadow = true;
    shell.receiveShadow = true;
    this.root.add(shell);
    const ribMat = seeThroughHull(toonMaterial(HULL_COLORS.bandDark), 0.5);
    const orangeMat = seeThroughHull(toonMaterial(HULL_COLORS.bandOrange), 0.5);
    // Faixas horizontais, como as das cápsulas: escura e laranja perto da base.
    for (const [h, mat, order] of [[0.42, ribMat, 1.1], [0.62, orangeMat, 1.2]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(r * r - h * h * 4) + 0.02, 0.07, 6, 64).rotateX(Math.PI / 2), mat);
      ring.position.set(center.x, center.y + h * 2, center.z);
      ring.renderOrder = order;
      ring.castShadow = true;
      this.root.add(ring);
    }
    for (let i = 0; i < DOME_GORES; i++) {
      // Meio gomo de defasagem: nenhuma nervura cruza a boca de um túnel (leste, oeste e sul).
      const a = ((i + 0.5) / DOME_GORES) * Math.PI * 2;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 16; k++) {
        const phi = (k / 16) * (Math.PI / 2) * 0.97;
        pts.push(new THREE.Vector3(Math.cos(phi) * Math.cos(a), Math.sin(phi), Math.cos(phi) * Math.sin(a)).multiplyScalar(r + 0.03).add(center));
      }
      const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.06, 6), ribMat);
      rib.renderOrder = 1.1;
      rib.castShadow = true;
      this.root.add(rib);
    }
    // Anel no topo, onde as nervuras se encontram, e a base com o anel de regolito (proteção contra radiação).
    const crown = toonMesh(new THREE.TorusGeometry(r * 0.2, 0.12, 8, 24).rotateX(Math.PI / 2), HULL_COLORS.bandDark, 0.02);
    crown.position.set(center.x, center.y + r * 0.98, center.z);
    this.root.add(crown);
    const base = toonMesh(new THREE.CylinderGeometry(r + 0.1, r + 0.2, 0.4, 32), PALETTE.tech);
    base.position.set(center.x, 0.2, center.z);
    this.root.add(base);
    const berm = toonMesh(new THREE.TorusGeometry(r + 0.25, 0.32, 8, 48).rotateX(Math.PI / 2), PALETTE.rock, 0.03);
    berm.scale.set(1, 0.7, 1); // mais baixo que largo
    berm.position.set(center.x, 0.18, center.z);
    this.root.add(berm);
    this.buildSunCollector(r, center);
    this.buildGrowLights(center);
    // Canteiros: mais plantas na cúpula maior, fora da passarela que cruza a estufa de leste a oeste.
    const rng = seededRandom(3);
    // Mais tentativas numa cúpula maior (a densidade de plantas fica parecida).
    for (let i = 0; i < Math.round(48 * (r / 5) ** 2); i++) {
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
    // O anel de regolito vai além da caixa da cúpula: uma volta de caixas pequenas, sem fresta para passar.
    for (let i = 0; i < DOME_BERM_BOXES; i++) {
      const a = (i / DOME_BERM_BOXES) * Math.PI * 2;
      addObstacle(this.obstacles, center.x + Math.cos(a) * (r + 0.25), center.z + Math.sin(a) * (r + 0.25), 0.55, 0.55, 0.4);
    }
  }

  /** Concentrador solar no topo da estufa (segue o Sol) e cabos de fibra óptica descendo pela membrana. */
  private buildSunCollector(r: number, center: THREE.Vector3): void {
    const top = new THREE.Vector3(center.x, center.y + r, center.z);
    const mast = toonMesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 8), PALETTE.tech, 0.02);
    mast.position.copy(top).add(new THREE.Vector3(0, 0.55, 0));
    this.root.add(mast);
    this.collector.position.copy(top).add(new THREE.Vector3(0, 1.15, 0));
    // A "boca" do concentrador olha para +Z do grupo; o grupo gira para o Sol em update().
    const dish = toonMesh(new THREE.SphereGeometry(0.75, 20, 8, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(Math.PI / 2), PALETTE.light, 0.03);
    dish.position.z = -0.35;
    this.collector.add(dish);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20), this.fiberMat);
    lens.position.z = 0.02;
    this.collector.add(lens);
    this.root.add(this.collector);
    // Três cabos: do pé do mastro, pela membrana, até o chão da estufa.
    for (const a of [0.35, 2.45, 4.55]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 14; k++) {
        const phi = Math.PI / 2 - (k / 14) * (Math.PI / 2) * 0.92;
        pts.push(new THREE.Vector3(Math.cos(phi) * Math.cos(a), Math.sin(phi), Math.cos(phi) * Math.sin(a)).multiplyScalar(r + 0.12).add(center));
      }
      this.root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.045, 6), this.fiberMat));
    }
  }

  /** Luzes de LED de cultivo sobre os canteiros, uma de cada lado da passarela (longe das escadas). */
  private buildGrowLights(center: THREE.Vector3): void {
    for (const [dx, dz] of [[-2.4, -2.7], [2.4, 2.7]]) {
      const x = center.x + dx;
      const z = center.z + dz;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.07, 0.3), this.ledMat);
      bar.position.set(x, LED_HEIGHT, z);
      this.root.add(bar);
      // Facho magenta da barra até os canteiros.
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.75, LED_HEIGHT - 0.5, 16, 1, true), this.ledBeamMat);
      beam.scale.x = 1.5;
      beam.position.set(x, (LED_HEIGHT + 0.5) / 2, z);
      beam.renderOrder = 2;
      this.root.add(beam);
      for (const ox of [-1, 1]) {
        const post = toonMesh(new THREE.CylinderGeometry(0.035, 0.035, LED_HEIGHT - 0.4, 6), PALETTE.tech, 0);
        post.position.set(x + ox, (LED_HEIGHT + 0.4) / 2, z);
        this.root.add(post);
      }
    }
    this.ledLight.position.set(center.x, LED_HEIGHT + 0.5, center.z);
    this.root.add(this.ledLight);
    this.buildFiberLamps(center);
  }

  /**
   * Fibra óptica por dentro: os cabos entram pelo topo, sob o concentrador, até um difusor; dele saem fibras até duas
   * luminárias sobre os canteiros (longe da passarela e das escadas). Cada uma tem um foco de luz de verdade (SpotLight,
   * sem sombra) e um facho visível, para mostrar que a luz das plantas vem de dentro.
   */
  private buildFiberLamps(center: THREE.Vector3): void {
    const hub = new THREE.Vector3(center.x, center.y + DOME_RADIUS * 0.92, center.z);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 20), this.fiberMat);
    disc.position.copy(hub);
    this.root.add(disc);
    for (const [dx, dz] of FIBER_LAMPS) {
      const lamp = new THREE.Vector3(center.x + dx, FIBER_LAMP_HEIGHT, center.z + dz);
      // Fibra do difusor até a luminária.
      const mid = hub.clone().lerp(lamp, 0.5).add(new THREE.Vector3(0, 0.5, 0));
      this.root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(hub, mid, lamp), 20, 0.03, 6), this.fiberMat));
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, 0.16, 16), this.fiberMat);
      head.position.copy(lamp);
      this.root.add(head);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.3, FIBER_LAMP_HEIGHT - 0.5, 20, 1, true), this.fiberBeamMat);
      beam.position.set(lamp.x, (FIBER_LAMP_HEIGHT + 0.5) / 2, lamp.z);
      beam.renderOrder = 2;
      this.root.add(beam);
      const spot = new THREE.SpotLight(FIBER_COLOR, 0, 7, 0.55, 0.7, 1.2);
      spot.position.copy(lamp);
      spot.target.position.set(lamp.x, 0, lamp.z);
      this.root.add(spot, spot.target);
      this.fiberSpots.push(spot);
    }
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
