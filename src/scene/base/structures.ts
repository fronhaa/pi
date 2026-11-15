import * as THREE from 'three';
import { PALETTE, toonMesh } from '@/render/toon';
import { CONFIG } from '@/sim/config';
import type { Resources } from '@/sim/types';
import { BATTERY_POSITION, PANELS_ORIGIN, DOME_CENTER, DOME_RADIUS, SHELTER_CENTER, TOWER_POSITION, addObstacle, seededRandom, type Obstacle } from './layout';

const PANEL_CLEAN = new THREE.Color(PALETTE.panel);
const PLANT_OK = new THREE.Color(PALETTE.plant);
const PLANT_DEAD = new THREE.Color(PALETTE.plantDead);
/** Largura do medidor de bateria (m). */
const METER_WIDTH = 1.8;

/**
 * Prédios que MOSTRAM o estado do jogo (GDD, "A cena tem que mostrar o estado do jogo"):
 * cúpula com a estufa (suporte de vida), torre da antena com alarme (mensagens e tempestade),
 * painéis solares (poeira), bateria (medidor) e abrigo de regolito (sacos = blindagem).
 */
export class BaseStructures {
  private readonly panels: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>[] = [];
  private readonly plants: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>[] = [];
  private readonly sandbags: THREE.Object3D[] = [];
  private readonly alarm: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly antennaTip: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly batteryMeter: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

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
    const lifeK = THREE.MathUtils.clamp((r.life - 15) / 45, 0, 1);
    for (const p of this.plants) p.material.color.copy(PLANT_DEAD).lerp(PLANT_OK, lifeK);
    const bags = Math.min(this.sandbags.length, Math.floor(r.shield / 8));
    this.sandbags.forEach((b, i) => (b.visible = i < bags));
    const batK = r.battery / CONFIG.battery.max;
    this.batteryMeter.scale.x = Math.max(0.02, batK);
    this.batteryMeter.position.x = BATTERY_POSITION.x - (METER_WIDTH * (1 - this.batteryMeter.scale.x)) / 2;
    this.batteryMeter.material.color.set(batK > 0.5 ? 0x5cc16b : batK > 0.25 ? 0xf2c14e : 0xe0503a);
  }

  /** Alarme piscando (alerta ou noite de tempestade) e a ponta da antena (mensagem da Terra). */
  update(time: number, alarmOn: boolean, earthMessage: boolean): void {
    const blink = (Math.sin(time * 6) + 1) / 2;
    this.alarm.material.color.setHex(alarmOn ? (blink > 0.5 ? PALETTE.alarm : 0x5a2a26) : 0x5a2a26);
    this.antennaTip.material.color.setHex(earthMessage && Math.sin(time * 4) > 0 ? 0x9fe3ff : PALETTE.tech);
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
    for (let i = 0; i < 34; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * (r - 1.2);
      if (Math.abs(Math.sin(a) * d) < 1.1) continue;
      const plant = toonMesh(new THREE.SphereGeometry(0.35 + rng() * 0.25, 10, 8), PALETTE.plant, 0.05);
      plant.position.set(center.x + Math.cos(a) * d, 0.7 + rng() * 0.3, center.z + Math.sin(a) * d);
      this.plants.push(plant);
      this.root.add(plant);
    }
    addObstacle(this.obstacles, center.x, center.z, r * 0.8, r * 0.8);
  }

  private buildTower() {
    // ARC-003: torre com antena e luz de alarme.
    const { x, z } = TOWER_POSITION;
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
    addObstacle(this.obstacles, x, z, 1.4, 1.4);
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
        this.root.add(p);
        const post = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 5), PALETTE.tech, 0);
        post.position.set(x, 0.55, z);
        this.root.add(post);
      }
    }
    addObstacle(this.obstacles, PANELS_ORIGIN.x + 5, PANELS_ORIGIN.z + 1.15, 6.4, 2);
  }

  private buildBattery(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    // PRP-001: contêiner de bateria com medidor.
    const { x, z } = BATTERY_POSITION;
    const box = toonMesh(new THREE.BoxGeometry(2.6, 1.4, 1.4), PALETTE.light);
    box.position.set(x, 0.7, z);
    this.root.add(box);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.36, 0.04), new THREE.MeshBasicMaterial({ color: PALETTE.shadow }));
    frame.position.set(x, 0.85, z + 0.71);
    this.root.add(frame);
    const meter = new THREE.Mesh(new THREE.BoxGeometry(METER_WIDTH, 0.26, 0.05), new THREE.MeshBasicMaterial({ color: 0x5cc16b }));
    meter.position.set(x, 0.85, z + 0.73);
    this.root.add(meter);
    addObstacle(this.obstacles, x, z, 1.3, 0.7);
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
