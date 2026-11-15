import * as THREE from 'three';
import { HULL_COLORS, PALETTE, seeThroughHull, toonMaterial, toonMesh } from '@/render/toon';
import type { SceneryModel } from '@/render/sceneryModel';
import { BIKE_FIT } from '@/render/chibiPedal';
import {
  BACK_Z,
  BIKE_Z,
  BED_LEVEL,
  BED_Z,
  BED_DEPTH,
  BED_THICKNESS,
  GREENHOUSE_STAIRS,
  STAIR_RUN,
  STAIR_STEPS,
  STAIR_WIDTH,
  TUBE_RADIUS,
  WALKWAY,
  WALKWAY_WIDTH,
  BIKE_DX,
  GYM_DX,
  TREADMILL_DX,
  GYM_OFFSET_X,
  HABITAT_FLOOR_Y,
  HABITAT_POSITION,
  HABITAT_SCALE,
  MODULE_FLOOR_LENGTH,
  MODULE_FLOOR_WIDTH,
  QUARTERS_CENTERS,
  QUARTERS_YAW,
  ROOM_BED_DX,
  ROOM_FURNITURE_FRONT_Z,
  ROOM_LOCKER_Z,
  ROOM_LOCKER_DX,
  TUBES,
  addObstacle,
  type Obstacle,
} from './layout';


/** Divisória entre os quartos: altura e até onde vai no fundo (z relativo ao eixo do casco). */
const ROOM_WALL_HEIGHT = 2.2;
const ROOM_WALL_BACK_Z = -1.15;

/** Força da luminária de cada cabine (PointLight, sem sombra). */
const CABIN_LIGHT_INTENSITY = 6;

/**
 * Ordem fixa de desenho das peças translúcidas do casco. Faixas, colar e anel da porta de acoplamento se
 * cruzam (e encostam no módulo vizinho) sem gravar profundidade: sem ordem fixa, o Three.js reordena pela
 * distância do centro de cada peça e, ao girar a câmera, a ordem troca e o preto/laranja das pontas pisca.
 * Fica abaixo de 5 para os marcadores de problema (ProblemMarkers) continuarem por cima.
 */
const GLASS_ORDER: [RegExp, number][] = [
  [/^hull_shell/, 1],
  [/^hull_band_dark/, 1.1],
  [/^hull_band_orange/, 1.2],
  [/^port_collar/, 1.3],
  [/^port_ring/, 1.4],
  [/^port_hatch(?!_ring)/, 1.5],
  [/^port_/, 1.6],
  [/_frame/, 1.7],
  [/_pane/, 1.8],
  [/_shine/, 1.9],
];

function glassRenderOrder(name: string): number {
  return GLASS_ORDER.find(([re]) => re.test(name))?.[1] ?? 1.65;
}

/**
 * Habitat (ARC-001): laboratório, alojamento e academia, com o interior visível pelo casco translúcido.
 * Começa com um módulo simples e troca pela base de pesquisa .glb do Grégor quando ela carrega
 * (docs/rover-e-base-de-pesquisa.md). Onde cada um fica dentro: src/scene/base/layout.ts.
 */
export class Habitat {
  readonly root = new THREE.Group();
  /** Habitat simples, só até a base de pesquisa (.glb) carregar ou se ela falhar. */
  private readonly fallback = new THREE.Group();
  /** Cascos simples dos módulos de quartos (raio sul, girados; fora do grupo `fallback`). */
  private readonly southFallback: THREE.Object3D[] = [];
  private readonly windows = new THREE.MeshBasicMaterial({ color: PALETTE.window });
  /** Vidros das janelas dos módulos .glb: acendem à noite (luz de dentro). */
  private readonly windowGlass: THREE.MeshToonMaterial[] = [];
  /** Luminárias das cabines: apagam com o casco fechado (a luz do three.js atravessa paredes e vazaria para fora). */
  private readonly cabinLights: THREE.PointLight[] = [];
  /** Animações do .glb (observatório, cata-vento). */
  mixer: THREE.AnimationMixer | null = null;

  constructor(obstacles: Obstacle[]) {
    // ARC-001: base de pesquisa do Grégor (research-base.glb), carregada em useModel().
    // Até lá (ou se falhar), um módulo simples no mesmo lugar: casco translúcido e torre com a porta.
    const fb = this.fallback;
    const hullGeo = new THREE.CylinderGeometry(1.6, 1.6, 7.2, 20);
    hullGeo.rotateZ(Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, seeThroughHull(toonMaterial(PALETTE.light), 0.3));
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
    for (const ox of [GYM_OFFSET_X]) {
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

    // Quartos no raio sul: o mesmo casco, girado (o casco corre em Z).
    for (const c of QUARTERS_CENTERS) {
      const q = hull.clone();
      q.scale.setScalar(HABITAT_SCALE);
      q.position.set(c.x, 2.65 * HABITAT_SCALE, c.z);
      q.rotation.y = QUARTERS_YAW;
      this.southFallback.push(q);
      this.root.add(q);
    }

    this.buildInterior();
    this.buildQuarters();
    this.buildTubes();

    // Colisão: laboratório (raio leste), academia (raio oeste), os dois módulos de quartos (raio sul), túneis, torre
    // do airlock e o armário de amostras ao lado da porta.
    const { x, z } = HABITAT_POSITION;
    const halfX = 3.6 * HABITAT_SCALE;
    const halfZ = 2.5 * HABITAT_SCALE;
    addObstacle(obstacles, x, z, halfX, halfZ);
    addObstacle(obstacles, x + GYM_OFFSET_X, z, halfX, halfZ);
    addObstacle(obstacles, x, z + 2.4, 1.0, 1.5);
    addObstacle(obstacles, x - 1.5, z + 3.06, 0.6, 0.35);
    const q0 = QUARTERS_CENTERS[0];
    const q1 = QUARTERS_CENTERS[QUARTERS_CENTERS.length - 1];
    addObstacle(obstacles, q0.x, (q0.z + q1.z) / 2, halfZ, (q1.z - q0.z) / 2 + halfX);
    for (const t of TUBES) {
      const len = t.from.distanceTo(t.to);
      const alongX = Math.abs(t.to.x - t.from.x) > Math.abs(t.to.z - t.from.z);
      addObstacle(obstacles, (t.from.x + t.to.x) / 2, (t.from.z + t.to.z) / 2, alongX ? len / 2 : 0.9, alongX ? 0.9 : len / 2);
    }
  }

  /**
   * Alojamento: quartos individuais (ADR 0010) nos dois módulos do raio sul (ADR 0011). Cada módulo é montado no
   * referencial dele (x ao longo do casco, fundo dos quartos em −z) e girado com QUARTERS_YAW. Piso e luminária, uma
   * divisória entre os dois quartos (do fundo até a frente das camas: o corredor do meio fica livre) e, em cada quarto,
   * uma cama baixa (de um andar) e um armário ao lado da divisória.
   */
  private buildQuarters(): void {
    const y = HABITAT_FLOOR_Y;
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
    const wallMat = seeThroughHull(toonMaterial(HULL_COLORS.shell), 0.45);
    const wallFront = ROOM_FURNITURE_FRONT_Z;
    for (const c of QUARTERS_CENTERS) {
      const room = new THREE.Group();
      room.position.set(c.x, 0, c.z);
      room.rotation.y = QUARTERS_YAW;
      const floor = toonMesh(new THREE.BoxGeometry(MODULE_FLOOR_LENGTH, 0.08, MODULE_FLOOR_WIDTH), PALETTE.tech, 0);
      floor.position.set(0, y - 0.04, 0);
      room.add(floor);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(MODULE_FLOOR_LENGTH * 0.6, 0.05, 0.25), lampMat);
      lamp.position.set(0, y + 2.45, 0);
      room.add(lamp);
      const light = new THREE.PointLight(0xffe6c0, CABIN_LIGHT_INTENSITY, 4.5, 1.6);
      this.cabinLights.push(light);
      light.position.set(0, y + 2.3, 0.2);
      room.add(light);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.05, ROOM_WALL_HEIGHT, wallFront - ROOM_WALL_BACK_Z), wallMat);
      wall.position.set(0, y + ROOM_WALL_HEIGHT / 2, (wallFront + ROOM_WALL_BACK_Z) / 2);
      wall.renderOrder = 1.5;
      room.add(wall);
      for (const side of [-1, 1]) {
        const bx = side * ROOM_BED_DX;
        // Estrado com quatro pés, aberto embaixo: sentado na beirada, ele recolhe os pés para baixo da cama.
        for (const [lx, lz] of [[-0.88, -1], [0.88, -1], [-0.88, 1], [0.88, 1]]) {
          const leg = toonMesh(new THREE.BoxGeometry(0.06, BED_LEVEL - 0.09, 0.06), PALETTE.tech, 0);
          leg.position.set(bx + lx, y + (BED_LEVEL - 0.09) / 2, BED_Z + lz * (BED_DEPTH / 2 - 0.05));
          room.add(leg);
        }
        const bed = toonMesh(new THREE.BoxGeometry(1.9, BED_THICKNESS, BED_DEPTH), PALETTE.light, 0.04);
        bed.position.set(bx, y + BED_LEVEL, BED_Z);
        room.add(bed);
        const blanket = toonMesh(new THREE.BoxGeometry(1.3, 0.08, BED_DEPTH + 0.02), PALETTE.panel, 0);
        blanket.position.set(bx + 0.25, y + BED_LEVEL + 0.12, BED_Z);
        room.add(blanket);
        const pillow = toonMesh(new THREE.BoxGeometry(0.4, 0.12, BED_DEPTH - 0.15), 0xffffff, 0);
        pillow.position.set(bx - 0.7, y + BED_LEVEL + 0.14, BED_Z);
        room.add(pillow);
        const locker = toonMesh(new THREE.BoxGeometry(0.36, 1.6, 0.5), PALETTE.tech, 0.03);
        locker.position.set(side * ROOM_LOCKER_DX, y + 0.8, ROOM_LOCKER_Z);
        room.add(locker);
      }
      this.root.add(room);
    }
  }

  /** Túneis pressurizados ligando a cúpula a cada módulo (vista superior do concept art). */
  private buildTubes(): void {
    this.buildWalkway();
    // Túneis do mesmo casco das cápsulas, translúcidos para a câmera (dá para ver quem passa), com piso e um anel em
    // cada ponta: na porta do módulo e dentro da estufa, onde o túnel termina.
    const tubeMat = seeThroughHull(toonMaterial(HULL_COLORS.shell), 0.32);
    for (const t of TUBES) {
      const len = t.from.distanceTo(t.to);
      const dir = t.to.clone().sub(t.from).normalize();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_RADIUS, TUBE_RADIUS, len, 24, 1, true), tubeMat);
      tube.position.copy(t.from).add(t.to).multiplyScalar(0.5);
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      tube.renderOrder = 1;
      tube.castShadow = true;
      this.root.add(tube);
      for (const end of [t.from, t.to]) {
        const ring = toonMesh(new THREE.CylinderGeometry(TUBE_RADIUS + 0.1, TUBE_RADIUS + 0.1, 0.16, 24, 1, true), PALETTE.accent, 0);
        ring.position.copy(end);
        ring.quaternion.copy(tube.quaternion);
        this.root.add(ring);
      }
      const alongX = Math.abs(dir.x) > Math.abs(dir.z);
      const deck = toonMesh(new THREE.BoxGeometry(alongX ? len : WALKWAY_WIDTH, 0.08, alongX ? WALKWAY_WIDTH : len), PALETTE.tech, 0.02);
      deck.position.set(tube.position.x, HABITAT_FLOOR_Y - 0.04, tube.position.z);
      this.root.add(deck);
    }
  }

  /**
   * Passarela da cúpula, na altura do piso dos módulos (src/scene/crewRoutine.ts anda por ela): cruza de leste a
   * oeste (laboratório ↔ academia) e tem um braço para o sul, até o túnel dos quartos. Dos dois lados, uma escada
   * desce até os canteiros (colheita e manutenção das plantas). Corrimão laranja com abertura nas escadas e no braço.
   */
  private buildWalkway(): void {
    const y = HABITAT_FLOOR_Y;
    const { east, west, south } = WALKWAY;
    const half = WALKWAY_WIDTH / 2;
    const cz = east.z;
    const deckAt = (x0: number, x1: number, z0: number, z1: number) => {
      const deck = toonMesh(new THREE.BoxGeometry(x1 - x0, 0.08, z1 - z0), PALETTE.tech, 0.02);
      deck.position.set((x0 + x1) / 2, y - 0.04, (z0 + z1) / 2);
      this.root.add(deck);
    };
    deckAt(west.x, east.x, cz - half, cz + half);
    deckAt(south.x - half, south.x + half, cz + half, south.z);

    // Corrimão em trechos: um trecho [a, b] ao longo de X (numa linha z) ou de Z (numa linha x).
    const RAIL_Y = y + 0.75;
    const rail = (a: number, b: number, at: number, alongX: boolean) => {
      if (b - a < 0.1) return;
      const r = toonMesh(new THREE.BoxGeometry(alongX ? b - a : 0.05, 0.05, alongX ? 0.05 : b - a), PALETTE.accent, 0);
      r.position.set(alongX ? (a + b) / 2 : at, RAIL_Y, alongX ? at : (a + b) / 2);
      this.root.add(r);
      for (const p of [a + 0.05, b - 0.05]) {
        const post = toonMesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), PALETTE.tech, 0);
        post.position.set(alongX ? p : at, y + 0.375, alongX ? at : p);
        this.root.add(post);
      }
    };
    // Trechos entre as aberturas (escadas e braço dos quartos) de cada lado da passarela leste-oeste.
    const sideRail = (z: number, gaps: [number, number][]) => {
      let from = west.x;
      for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
        rail(from, g0, z, true);
        from = g1;
      }
      rail(from, east.x, z, true);
    };
    const stairGap = (side: number): [number, number][] =>
      GREENHOUSE_STAIRS.filter((st) => st.side === side).map((st) => [st.top.x - STAIR_WIDTH / 2, st.top.x + STAIR_WIDTH / 2]);
    sideRail(cz - half, stairGap(-1));
    sideRail(cz + half, [...stairGap(1), [south.x - half, south.x + half]]);
    rail(cz + half, south.z, south.x - half, false);
    rail(cz + half, south.z, south.x + half, false);

    // Escadas até o chão da estufa: degraus e corrimão inclinado dos dois lados.
    for (const st of GREENHOUSE_STAIRS) {
      const rise = (st.top.y - st.bottom.y) / STAIR_STEPS;
      for (let i = 0; i < STAIR_STEPS; i++) {
        const top = st.top.y - rise * (i + 1);
        const stepH = top - st.bottom.y + 0.04;
        const step = toonMesh(new THREE.BoxGeometry(STAIR_WIDTH, stepH, STAIR_RUN), PALETTE.tech, 0.02);
        // Cada degrau é um bloco do chão da estufa (um pouco enterrado) até a pisada.
        step.position.set(st.top.x, st.bottom.y - 0.04 + stepH / 2, st.top.z + st.side * STAIR_RUN * (i + 0.5));
        this.root.add(step);
      }
      const length = Math.hypot(STAIR_STEPS * STAIR_RUN, st.top.y - st.bottom.y);
      const slope = Math.atan2(st.top.y - st.bottom.y, STAIR_STEPS * STAIR_RUN);
      for (const dx of [-STAIR_WIDTH / 2, STAIR_WIDTH / 2]) {
        const hand = toonMesh(new THREE.BoxGeometry(0.05, 0.05, length), PALETTE.accent, 0);
        hand.position.set(st.top.x + dx, (st.top.y + st.bottom.y) / 2 + 0.75, (st.top.z + st.bottom.z) / 2);
        hand.rotation.x = st.side * slope;
        this.root.add(hand);
      }
    }
  }

  /**
   * Janelas acendem à noite (`night` de 0 a 1). `inside` (0–1) é o quanto o casco está aberto: fechado, as luzes de
   * dentro apagam, senão iluminariam o chão e os prédios de fora através do casco.
   */
  update(night: number, inside = 1): void {
    for (const l of this.cabinLights) l.intensity = CABIN_LIGHT_INTENSITY * inside;
    this.windows.color.setHex(PALETTE.window).multiplyScalar(0.6 + night * 0.8);
    for (const mat of this.windowGlass) {
      mat.emissive.setHex(0xffd27a);
      mat.emissiveIntensity = ((mat.userData.dayEmissive as number) ?? 0) + night * 1.2;
    }
  }

  /**
   * Por dentro do habitat (visto pelo casco translúcido): um piso em cada módulo, console no
   * laboratório, quatro quartos individuais (dois em cada módulo de quartos, uma cama cada) e a academia (esteira,
   * bicicleta e aparelho de força, como na Estação Espacial, F9). Serve para os dois modelos.
   */
  private buildInterior(): void {
    const { x, z } = HABITAT_POSITION;
    const y = HABITAT_FLOOR_Y;
    const inside = new THREE.Group();
    // Um piso por módulo: entre eles ficam as portas de acoplamento (um piso contínuo aparecia por fora).
    // Cada cabine tem luminária no teto: o casco faz sombra e o sol não entra, então a luz de dentro é dela.
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
    for (const ox of [0, GYM_OFFSET_X]) {
      const floor = toonMesh(new THREE.BoxGeometry(MODULE_FLOOR_LENGTH, 0.08, MODULE_FLOOR_WIDTH), PALETTE.tech, 0);
      floor.position.set(ox, y - 0.04, 0);
      inside.add(floor);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(MODULE_FLOOR_LENGTH * 0.6, 0.05, 0.25), lampMat);
      lamp.position.set(ox, y + 2.45, 0);
      inside.add(lamp);
      const light = new THREE.PointLight(0xffe6c0, CABIN_LIGHT_INTENSITY, 4.5, 1.6);
      this.cabinLights.push(light);
      light.position.set(ox, y + 2.3, 0.2);
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

    // Bicicleta montada a partir de BIKE_FIT, para banco, pedal e guidão baterem com o clipe `pedal`.
    const hipY = y + BIKE_FIT.seatedHipHeight;
    const bike = (w: number, h: number, d: number, color: number, bx: number, by: number, bz: number, outline = 0.04) => {
      const mesh = toonMesh(new THREE.BoxGeometry(w, h, d), color, outline);
      mesh.position.set(g + BIKE_DX + bx, by, BIKE_Z + bz);
      inside.add(mesh);
    };
    const front = BIKE_FIT.bars.z + 0.2; // coluna do guidão à frente do volante
    bike(0.3, 0.1, front + 0.35, PALETTE.light, 0, y + 0.05, (front - 0.35) / 2); // base no piso
    bike(0.06, hipY - 0.12 - y, 0.06, PALETTE.tech, 0, (y + hipY - 0.12) / 2, -0.05, 0); // canote
    bike(0.32, 0.07, 0.3, PALETTE.shadow, 0, hipY - 0.12, -0.02, 0.03); // banco
    const barsY = hipY + BIKE_FIT.bars.y;
    bike(0.06, barsY - y, 0.06, PALETTE.tech, 0, (y + barsY) / 2, front, 0); // coluna do guidão
    bike(0.75, 0.05, 0.05, PALETTE.tech, 0, barsY, BIKE_FIT.bars.z, 0); // guidão
    bike(0.06, 0.04, front - BIKE_FIT.bars.z + 0.03, PALETTE.tech, 0, barsY, (front + BIKE_FIT.bars.z) / 2, 0);
    const crankY = hipY + BIKE_FIT.crank.y;
    const hub = toonMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 14).rotateZ(Math.PI / 2), PALETTE.tech, 0.03);
    hub.position.set(g + BIKE_DX, crankY, BIKE_Z + BIKE_FIT.crank.z);
    inside.add(hub);
    bike(0.05, crankY - y, 0.05, PALETTE.tech, 0, (y + crankY) / 2, BIKE_FIT.crank.z, 0); // suporte do eixo
    // Volante (a "roda" da bicicleta ergométrica), entre o pedal e o guidão.
    const wheel = toonMesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 18).rotateZ(Math.PI / 2), PALETTE.accent, 0.04);
    wheel.position.set(g + BIKE_DX, y + 0.25, BIKE_Z + 0.4);
    inside.add(wheel);

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

  /** Troca o módulo simples pela base de pesquisa .glb. */
  useModel(m: SceneryModel): void {
    // Academia (oeste) e quartos (sul): o mesmo bloco, acoplado pelas portas de acoplamento (como o doc do modelo
    // prevê). Uma porta só para a base inteira: sem torre do airlock, sem armário, sem observatório.
    // Cabines em HABITAT_SCALE; a torre do airlock e o armário ficam em 100% e no mesmo lugar de antes.
    m.root.scale.setScalar(HABITAT_SCALE);
    const extras = [GYM_OFFSET_X].map((ox) => {
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
    // Quartos no raio sul: o mesmo módulo (sem torre, armário, observatório e placa), girado.
    for (const c of QUARTERS_CENTERS) {
      const q = extras[0].clone(true);
      q.position.copy(c);
      q.rotation.y = QUARTERS_YAW;
      this.root.add(q);
      extras.push(q);
    }
    for (const f of this.southFallback) f.visible = false;

    for (const name of ['access_tower', 'sample_station']) {
      const o = m.root.getObjectByName(name);
      if (!o) continue;
      o.scale.setScalar(1 / HABITAT_SCALE);
      o.position.divideScalar(HABITAT_SCALE);
    }

    // Cabines transparentes: TODAS as peças do casco ficam translúcidas (o casco mais claro, faixas e janelas um
    // pouco mais visíveis), para nada opaco cortar a tripulação. Sem contorno (ele é opaco).
    const cut = new Map<THREE.Material, THREE.Material>();
    for (const module of [m.root, ...extras]) {
      module.getObjectByName('hull')?.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData.isOutline) return;
        const src = mesh.material as THREE.Material;
        let mat = cut.get(src);
        if (!mat) {
          mat = seeThroughHull(src, mesh.name === 'hull_shell' ? 0.28 : 0.5);
          cut.set(src, mat);
        }
        mesh.material = mat;
        // Transparente só para a câmera: para o sol o casco é metal e faz sombra lá dentro.
        mesh.renderOrder = glassRenderOrder(mesh.name);
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
    this.fallback.visible = false;
    m.play('observatory_scan');
    m.play('weather_spin');
    this.mixer = m.mixer;
  }
}
