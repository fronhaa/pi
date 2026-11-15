import * as THREE from 'three';
import { PALETTE, toonMaterial, toonMesh } from '@/render/toon';
import type { SceneryModel } from '@/render/sceneryModel';
import { BIKE_FIT } from '@/render/chibiPedal';
import {
  BACK_Z,
  BIKE_Z,
  BUNK_Z,
  BED_DEPTH,
  BED_THICKNESS,
  GREENHOUSE_STAIRS,
  STAIR_RUN,
  STAIR_STEPS,
  STAIR_WIDTH,
  TUBE_RADIUS,
  WALKWAY,
  WALKWAY_WIDTH,
  BUNK_DX,
  BUNK_LEVELS,
  GARAGE_FLOOR_Y,
  GARAGE_POSITION,
  GARAGE_RAMP,
  GARAGE_ROTATION_Y,
  GARAGE_SCALE,
  GYM_DX,
  GYM_OFFSET_X,
  HABITAT_FLOOR_Y,
  HABITAT_POSITION,
  HABITAT_SCALE,
  MODULE_FLOOR_LENGTH,
  QUARTERS_OFFSET_X,
  TUBES,
  addObstacle,
  type Obstacle,
} from './layout';

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
  /** Casco simples da garagem (fora do grupo `fallback`, que está em outra escala). */
  private garageFallback: THREE.Object3D | null = null;
  private readonly windows = new THREE.MeshBasicMaterial({ color: PALETTE.window });
  /** Vidros das janelas dos módulos .glb: acendem à noite (luz de dentro). */
  private readonly windowGlass: THREE.MeshToonMaterial[] = [];
  /** Animações do .glb (observatório, cata-vento). */
  mixer: THREE.AnimationMixer | null = null;

  constructor(obstacles: Obstacle[]) {
    // ARC-001: base de pesquisa do Grégor (research-base.glb), carregada em useModel().
    // Até lá (ou se falhar), um módulo simples no mesmo lugar: casco translúcido e torre com a porta.
    const fb = this.fallback;
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

    const garageHull = hull.clone();
    garageHull.scale.setScalar(GARAGE_SCALE);
    garageHull.position.set(GARAGE_POSITION.x, 2.65 * GARAGE_SCALE, GARAGE_POSITION.z);
    garageHull.rotation.y = GARAGE_ROTATION_Y;
    this.garageFallback = garageHull;
    this.root.add(garageHull);

    this.buildInterior();
    this.buildGarage();
    this.buildTubes();

    // Colisão: laboratório (raio leste), alojamento + academia (raio oeste), garagem e rampa (raio sul),
    // túneis, torre do airlock e o armário de amostras ao lado da porta.
    const { x, z } = HABITAT_POSITION;
    const halfX = 3.6 * HABITAT_SCALE;
    const halfZ = 2.5 * HABITAT_SCALE;
    addObstacle(obstacles, x, z, halfX, halfZ);
    addObstacle(obstacles, x + (QUARTERS_OFFSET_X + GYM_OFFSET_X) / 2, z, halfX + (QUARTERS_OFFSET_X - GYM_OFFSET_X) / 2, halfZ);
    addObstacle(obstacles, x, z + 2.4, 1.0, 1.5);
    addObstacle(obstacles, x - 1.5, z + 3.06, 0.6, 0.35);
    addObstacle(obstacles, GARAGE_POSITION.x, GARAGE_POSITION.z, 2.5 * GARAGE_SCALE, 3.6 * GARAGE_SCALE);
    const ramp = GARAGE_RAMP;
    addObstacle(obstacles, ramp.foot.x, (ramp.top.z + ramp.foot.z) / 2, ramp.width / 2, (ramp.foot.z - ramp.top.z) / 2);
    for (const t of TUBES) {
      const len = t.from.distanceTo(t.to);
      const alongX = Math.abs(t.to.x - t.from.x) > Math.abs(t.to.z - t.from.z);
      addObstacle(obstacles, (t.from.x + t.to.x) / 2, (t.from.z + t.to.z) / 2, alongX ? len / 2 : 0.9, alongX ? 0.9 : len / 2);
    }
  }

  /**
   * Garagem do rover: piso dentro do casco (o rover estaciona aqui) e a rampa da ponta até o chão,
   * com corrimãos. O módulo em si é o mesmo dos outros (modelo simples ou .glb).
   */
  private buildGarage(): void {
    const g = GARAGE_POSITION;
    const floor = toonMesh(new THREE.BoxGeometry(2.2, 0.08, MODULE_FLOOR_LENGTH / HABITAT_SCALE), PALETTE.tech, 0);
    floor.position.set(g.x, GARAGE_FLOOR_Y - 0.04, g.z);
    this.root.add(floor);
    // Luminária, como nas cabines: o casco faz sombra e o rover estacionado não fica no escuro.
    const light = new THREE.PointLight(0xffe6c0, CABIN_LIGHT_INTENSITY, 6, 1.6);
    light.position.set(g.x, GARAGE_FLOOR_Y + 2.6 * GARAGE_SCALE, g.z);
    this.root.add(light);

    const { top, foot, width } = GARAGE_RAMP;
    const run = foot.z - top.z;
    const rise = top.y - foot.y;
    const length = Math.hypot(run, rise);
    const slope = Math.atan2(rise, run);
    const ramp = new THREE.Group();
    ramp.position.set(top.x, (top.y + foot.y) / 2, (top.z + foot.z) / 2);
    ramp.rotation.x = slope; // a ponta de +Z (o pé) desce até o chão
    const deck = toonMesh(new THREE.BoxGeometry(width, 0.12, length), PALETTE.tech, 0.03);
    ramp.add(deck);
    // Faixas de aderência, para ler como rampa de longe.
    for (let i = 0; i < 6; i++) {
      const strip = toonMesh(new THREE.BoxGeometry(width * 0.9, 0.03, 0.12), PALETTE.light, 0);
      strip.position.set(0, 0.075, -length / 2 + ((i + 0.5) / 6) * length);
      ramp.add(strip);
    }
    for (const side of [-1, 1]) {
      const rail = toonMesh(new THREE.BoxGeometry(0.08, 0.08, length), PALETTE.accent, 0);
      rail.position.set((side * width) / 2, 0.55, 0);
      ramp.add(rail);
      for (const k of [-0.45, 0, 0.45]) {
        const post = toonMesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), PALETTE.tech, 0);
        post.position.set((side * width) / 2, 0.28, k * length);
        ramp.add(post);
      }
    }
    this.root.add(ramp);
  }

  /** Túneis pressurizados ligando a cúpula a cada módulo (vista superior do concept art). */
  private buildTubes(): void {
    this.buildWalkway();
    for (const t of TUBES) {
      const len = t.from.distanceTo(t.to);
      const geo = new THREE.CylinderGeometry(TUBE_RADIUS, TUBE_RADIUS, len, 16);
      const tube = toonMesh(geo, PALETTE.light, 0.03);
      tube.position.copy(t.from).add(t.to).multiplyScalar(0.5);
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.to.clone().sub(t.from).normalize());
      this.root.add(tube);
      const ring = toonMesh(new THREE.CylinderGeometry(TUBE_RADIUS + 0.1, TUBE_RADIUS + 0.1, 0.16, 16), PALETTE.accent, 0);
      ring.position.copy(t.to);
      ring.quaternion.copy(tube.quaternion);
      this.root.add(ring);
    }
  }

  /**
   * Passarela da cúpula, na altura do piso dos módulos (src/scene/crewRoutine.ts anda por ela): cruza de leste a
   * oeste (laboratório ↔ alojamento) e tem um braço para o sul, até o túnel da garagem. Dos dois lados, uma escada
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
    // Trechos entre as aberturas (escadas e braço da garagem) de cada lado da passarela leste-oeste.
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

  /** Janelas acendem à noite (`night` de 0 a 1). */
  update(night: number): void {
    this.windows.color.setHex(PALETTE.window).multiplyScalar(0.6 + night * 0.8);
    for (const mat of this.windowGlass) {
      mat.emissive.setHex(0xffd27a);
      mat.emissiveIntensity = ((mat.userData.dayEmissive as number) ?? 0) + night * 1.2;
    }
  }

  /**
   * Por dentro do habitat (visto pelo casco translúcido): um piso em cada módulo, console no
   * laboratório, dois beliches (4 camas, uma por astronauta) no alojamento e a academia (esteira,
   * bicicleta e aparelho de força, como na Estação Espacial, F9). Serve para os dois modelos.
   */
  private buildInterior(): void {
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
        const bed = toonMesh(new THREE.BoxGeometry(1.9, BED_THICKNESS, BED_DEPTH), PALETTE.light, 0.04);
        bed.position.set(bx, y + level, BUNK_Z);
        inside.add(bed);
        const blanket = toonMesh(new THREE.BoxGeometry(1.3, 0.08, BED_DEPTH + 0.02), PALETTE.panel, 0);
        blanket.position.set(bx + 0.25, y + level + 0.12, BUNK_Z);
        inside.add(blanket);
        const pillow = toonMesh(new THREE.BoxGeometry(0.4, 0.12, BED_DEPTH - 0.15), 0xffffff, 0);
        pillow.position.set(bx - 0.7, y + level + 0.14, BUNK_Z);
        inside.add(pillow);
      }
      for (const px of [-0.93, 0.93]) {
        const post = toonMesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), PALETTE.tech, 0);
        post.position.set(bx + px, y + 0.7, BUNK_Z + BED_DEPTH / 2 - 0.02);
        inside.add(post);
      }
    }

    // Academia: esteira e bicicleta viradas para a frente (GYM_STATIONS) e um aparelho de força no fundo.
    const g = GYM_OFFSET_X;
    const treadBase = toonMesh(new THREE.BoxGeometry(0.8, 0.12, 1.7), PALETTE.light, 0.04);
    treadBase.position.set(g - GYM_DX, y + 0.06, 0);
    inside.add(treadBase);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 1.5), new THREE.MeshBasicMaterial({ color: PALETTE.shadow }));
    belt.position.set(g - GYM_DX, y + 0.13, 0);
    inside.add(belt);
    for (const side of [-0.38, 0.38]) {
      const rail = toonMesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), PALETTE.tech, 0);
      rail.position.set(g - GYM_DX + side, y + 0.6, 0.75);
      inside.add(rail);
    }
    const panel = toonMesh(new THREE.BoxGeometry(0.85, 0.2, 0.12), PALETTE.accent, 0);
    panel.position.set(g - GYM_DX, y + 1.1, 0.75);
    inside.add(panel);

    // Bicicleta montada a partir de BIKE_FIT, para banco, pedal e guidão baterem com o clipe `pedal`.
    const hipY = y + BIKE_FIT.seatedHipHeight;
    const bike = (w: number, h: number, d: number, color: number, bx: number, by: number, bz: number, outline = 0.04) => {
      const mesh = toonMesh(new THREE.BoxGeometry(w, h, d), color, outline);
      mesh.position.set(g + bx, by, BIKE_Z + bz);
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
    hub.position.set(g, crankY, BIKE_Z + BIKE_FIT.crank.z);
    inside.add(hub);
    bike(0.05, crankY - y, 0.05, PALETTE.tech, 0, (y + crankY) / 2, BIKE_FIT.crank.z, 0); // suporte do eixo
    // Volante (a "roda" da bicicleta ergométrica), entre o pedal e o guidão.
    const wheel = toonMesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 18).rotateZ(Math.PI / 2), PALETTE.accent, 0.04);
    wheel.position.set(g, y + 0.25, BIKE_Z + 0.4);
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
    // Garagem do rover: o mesmo módulo (sem torre, armário, observatório e placa), virado para a câmera.
    const garage = extras[0].clone(true);
    garage.scale.setScalar(GARAGE_SCALE);
    garage.position.copy(GARAGE_POSITION);
    garage.rotation.y = GARAGE_ROTATION_Y;
    this.root.add(garage);
    extras.push(garage);
    if (this.garageFallback) this.garageFallback.visible = false;

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
          mat = glassMaterial(src, mesh.name === 'hull_shell' ? 0.28 : 0.5);
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
