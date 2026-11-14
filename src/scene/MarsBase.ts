import * as THREE from 'three';
import { PALETTE, toonMaterial, toonMesh } from '@/render/toon';
import { CONFIG } from '@/sim/config';
import type { Resources } from '@/sim/types';

/** O que a cena precisa saber do jogo para mostrar o estado (GDD, "A cena tem que mostrar o estado do jogo"). */
export interface SceneState {
  res: Resources;
  alert: boolean;
  night: boolean;
  stormNight: boolean;
  earthMessage: boolean;
  scienceBlocks: number;
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

const SKY_DAY = new THREE.Color(0xe8b98c);
const SKY_DUST = new THREE.Color(0xc99a6e);
const SKY_ALERT = new THREE.Color(0xd9866a);
const SKY_NIGHT = new THREE.Color(0x1c1724);
const PANEL_CLEAN = new THREE.Color(PALETTE.panel);
const PANEL_DUSTY = new THREE.Color(PALETTE.dust);
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
  /** Rover atolado: fica parado e inclinado neste ponto até alguém resolver. */
  private roverStuckAt: THREE.Vector3 | null = null;
  private nightAmount = 0;
  private roverAngle = 0;

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
      const rock = toonMesh(geo, rng() > 0.5 ? PALETTE.rock : PALETTE.soil, 0.04);
      rock.scale.set(s * (0.8 + rng() * 0.6), s * (0.5 + rng() * 0.4), s * (0.8 + rng() * 0.6));
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
        w.position.set(x, 0.3, z);
        this.rover.add(w);
      }
    }
    const mast = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), PALETTE.tech, 0);
    mast.position.set(0.7, 1.6, 0);
    this.rover.add(mast);
    const head = toonMesh(new THREE.BoxGeometry(0.35, 0.25, 0.45), PALETTE.light);
    head.position.set(0.7, 2.15, 0);
    this.rover.add(head);
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
    this.roverStuckAt = at;
    if (!at) this.rover.rotation.set(0, this.rover.rotation.y, 0);
  }

  setState(state: SceneState): void {
    this.state = state;
    const r = state.res;
    const dustK = r.dust / CONFIG.dust.max;
    for (const p of this.panels) p.material.color.copy(PANEL_CLEAN).lerp(PANEL_DUSTY, Math.min(1, dustK * 1.2));
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
  update(dt: number, time: number): void {
    const s = this.state;
    if (!s) return;

    this.nightAmount = THREE.MathUtils.damp(this.nightAmount, s.night ? 1 : 0, 2.5, dt);
    const n = this.nightAmount;
    const dustK = s.res.dust / CONFIG.dust.max;

    const sky = SKY_DAY.clone().lerp(SKY_DUST, dustK);
    if (s.alert) sky.lerp(SKY_ALERT, 0.45);
    sky.lerp(SKY_NIGHT, n);
    (this.scene.background as THREE.Color).copy(sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(sky);
    fog.near = THREE.MathUtils.lerp(45, 14, dustK);
    fog.far = THREE.MathUtils.lerp(140, 70, dustK);

    this.sun.intensity = THREE.MathUtils.lerp(2.2 * (1 - dustK * 0.5), 0.15, n);
    this.hemi.intensity = THREE.MathUtils.lerp(1.3, 0.35, n);
    (this.stars.material as THREE.PointsMaterial).opacity = n;
    (this.earthDot.material as THREE.MeshBasicMaterial).opacity = n;
    this.windows.color.setHex(PALETTE.window).multiplyScalar(0.6 + n * 0.8);

    const blink = (Math.sin(time * 6) + 1) / 2;
    const alarmOn = s.alert || s.stormNight;
    this.alarm.material.color.setHex(alarmOn ? (blink > 0.5 ? PALETTE.alarm : 0x5a2a26) : 0x5a2a26);
    this.antennaTip.material.color.setHex(s.earthMessage && Math.sin(time * 4) > 0 ? 0x9fe3ff : PALETTE.tech);

    const dp = this.dustParticles;
    (dp.material as THREE.PointsMaterial).opacity = THREE.MathUtils.lerp(0, 0.7, Math.min(1, dustK * 1.5)) * (1 - n * 0.6);
    dp.position.x = ((time * 3) % 20) - 10;

    if (this.roverStuckAt) {
      this.rover.position.set(this.roverStuckAt.x + 1.6, terrainHeight(this.roverStuckAt.x, this.roverStuckAt.z) - 0.25, this.roverStuckAt.z + 0.6);
      this.rover.rotation.set(0.18, 0.7, 0.12);
    } else if (s.scienceBlocks > 0 && !s.night) {
      this.rover.rotation.x = 0;
      this.rover.rotation.z = 0;
      // Elipse por fora da base e dos painéis (painéis vão até x ≈ 22).
      this.roverAngle += dt * 0.06 * s.scienceBlocks;
      const x = 2 + Math.cos(this.roverAngle) * 26;
      const z = 2 + Math.sin(this.roverAngle) * 15;
      const dx = -Math.sin(this.roverAngle) * 26;
      const dz = Math.cos(this.roverAngle) * 15;
      this.rover.rotation.y = Math.atan2(-dz, dx);
      this.rover.position.set(x, terrainHeight(x, z), z);
    }
  }
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
