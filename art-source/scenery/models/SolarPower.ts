import * as THREE from 'three';
import { COLORS as C, clean, cyl, group, merge, mk, rbox, rboxUV, sphere, type V3 } from './common';
import { createSolarPanels } from './SolarPanels';
import { boxTexture } from './textures';

/**
 * Campo solar com bateria (ARC-004 + ARC-005): as MESMAS placas solares de `solar-panels.glb`, nas mesmas
 * posições (basta pôr o modelo na origem), mais um fio saindo da caixinha de cada painel até a calha de cabos,
 * um cabo-tronco até a bateria e um cabo de saída até a tomada da base.
 *
 * A bateria fica a oeste do campo (x ≈ 8,6; z ≈ 3,15), de frente para +Z. A tomada ("power_outlet", x ≈ 4,2) é onde o jogo
 * liga a base. O jogo manda na carga e na descarga; aqui só existem as animações (INTERPRETADO, sem valores reais):
 *
 * Clipes (todos em laço, exceto "battery_level"):
 * - "battery_charge" (3,2 s): pulsos de energia correm das placas até a bateria (fios dos painéis e cabo-tronco),
 *   as 5 células enchem de baixo para cima e a luz verde pisca;
 * - "battery_discharge" (3,2 s): pulsos saem da bateria pelo cabo de saída até a tomada, as células esvaziam
 *   de cima para baixo e a luz laranja pisca;
 * - "battery_level" (1 s, NÃO é laço): nível da bateria. Toque com timeScale 0 e ponha action.time = nível (0 a 1):
 *   0 = vazia, 1 = cheia (cada célula cresce no seu quinto do nível). Combine com os outros dois (pesos) se quiser.
 *
 * Sem clipe tocando: células cheias, pulsos escondidos, luzes meio apagadas.
 *
 * Peças com nome fixo: "battery" (grupo), "battery_cell_0..4" (material "battery_cell"; de baixo para cima),
 * "battery_led_charge" / "battery_led_discharge" (material "battery_led_charge" / "battery_led_discharge"),
 * "energy_pulse_*" (material "energy_pulse"), "power_outlet", e os materiais das placas ("panel_cells", "panel_grid").
 */

export interface SolarPowerModel {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
}

const BX = 8.6;
const BZ = 3.15;
const CELL_COUNT = 5;
const CELL_GREEN = 0x62e08a;
const LED_OFF = 0.2; // tamanho das luzes sem clipe
const PULSE_OFF = 0.0001; // "escondido": escala quase zero
const EPS = 0.002;
const CABLE = 0x2c2a31;

// ---------- cabos ----------

function cableGeometry(path: V3[], r = 0.045): { geo: THREE.BufferGeometry; curve: THREE.CatmullRomCurve3 } {
  const curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const seg = Math.max(8, Math.round(curve.getLength() / 0.12));
  return { geo: clean(new THREE.TubeGeometry(curve, seg, r, 6, false)), curve };
}

/** Caminho do cabo que sai da caixinha de cada painel até o cabo-tronco (na calha, z = 3,15). */
function dropPath(x: number, z: number, row: number): V3[] {
  const bx = x + 0.06;
  const bz = z + 0.12;
  if (row === 0) {
    return [[bx, 0.52, bz], [x + 0.1, 0.3, z + 0.32], [x + 0.4, 0.09, z + 0.62], [x + 0.4, 0.07, 2.85], [x + 0.4, 0.125, 3.15]];
  }
  return [[bx, 0.52, bz], [x + 0.25, 0.28, z + 0.34], [x + 0.45, 0.08, z + 0.2], [x + 0.45, 0.07, 3.85], [x + 0.4, 0.1, 3.45], [x + 0.4, 0.125, 3.15]];
}

const TRUNK: V3[] = [
  [22.65, 0.3, 3.15], [22.4, 0.13, 3.15], [22.1, 0.125, 3.15], [11.9, 0.125, 3.15], [11.4, 0.09, 3.15],
  [10.8, 0.07, 3.2], [10.3, 0.3, 3.15], [9.8, 0.62, 3.15],
];
const OUT: V3[] = [
  [7.4, 0.62, 3.15], [7.12, 0.4, 3.15], [6.85, 0.07, 3.2], [6.2, 0.06, 3.5], [5.4, 0.06, 3.4], [4.8, 0.1, 3.15], [4.5, 0.45, 3.15],
];

// ---------- bateria ----------

function boltGeometry(size: number): THREE.BufferGeometry {
  const pts: [number, number][] = [[0.08, 0.5], [-0.2, -0.04], [-0.03, -0.04], [-0.1, -0.5], [0.2, 0.08], [0.03, 0.08]];
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * size * 2, y * size * 2)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
  g.translate(0, 0, -0.015);
  return clean(g);
}

function buildBattery(root: THREE.Object3D, box: THREE.Texture): { cells: THREE.Mesh[]; ledC: THREE.Mesh; ledD: THREE.Mesh } {
  const b = group(root, 'battery', [BX, 0, BZ]);
  const W = 2.0;
  const H = 1.7;
  const D = 1.2;
  const y0 = 0.14;
  mk(b, rbox(W + 0.2, 0.14, D + 0.2, 0.05), C.dark, { name: 'battery_skid', pos: [0, 0.07, 0], outline: 0.03 });
  mk(b, rboxUV(W, H, D, 0.16), C.hull, { name: 'battery_body', pos: [0, y0 + H / 2, 0], outline: 0.03, mat: { map: box } });
  mk(b, rbox(W + 0.04, 0.12, D + 0.04, 0.05), C.accent, { name: 'battery_band_orange', pos: [0, y0 + H - 0.28, 0], outline: 0 });
  mk(b, rbox(W + 0.04, 0.2, D + 0.04, 0.06), C.dark, { name: 'battery_band_dark', pos: [0, y0 + 0.3, 0], outline: 0 });
  // "polo" no topo, como no ícone de bateria, e alças
  mk(b, rbox(0.7, 0.14, 0.5, 0.05), C.accent, { name: 'battery_nub', pos: [-0.45, y0 + H + 0.05, 0], outline: 0.03 });
  for (const hx of [-0.85, 0.2]) mk(b, rbox(0.1, 0.08, 0.7, 0.03), C.dark, { name: 'battery_handle', pos: [hx, y0 + H + 0.03, 0], outline: 0 });

  // janela com as 5 células
  const fz = D / 2;
  mk(b, rbox(0.88, 1.28, 0.08, 0.05), C.dark, { name: 'battery_window_frame', pos: [-0.45, 0.99, fz + 0.01], outline: 0.02 });
  mk(b, rbox(0.74, 1.14, 0.05, 0.04), 0x1c1a24, { name: 'battery_window', pos: [-0.45, 0.99, fz + 0.04], outline: 0 });
  const cells: THREE.Mesh[] = [];
  const cellGeo = rbox(0.6, 0.17, 0.05, 0.05);
  for (let i = 0; i < CELL_COUNT; i++) {
    cells.push(mk(b, cellGeo, CELL_GREEN, { name: `battery_cell_${i}`, pos: [-0.45, 0.99 - 0.46 + i * 0.23, fz + 0.075], outline: 0, mat: { name: 'battery_cell', glow: 0.85 } }));
  }
  // lado direito da frente: emblema de raio, duas luzes e fendas de ventilação
  mk(b, cyl(0.3, 0.3, 0.05, 28).rotateX(Math.PI / 2), C.navy, { name: 'battery_emblem', pos: [0.5, 1.28, fz + 0.025], outline: 0.03 });
  mk(b, boltGeometry(0.26), 0xffd23f, { name: 'battery_bolt', pos: [0.5, 1.28, fz + 0.06], outline: 0, mat: { name: 'battery_bolt', glow: 0.5 } });
  const ledC = mk(b, sphere(0.07, 12, 8), 0x62e08a, { name: 'battery_led_charge', pos: [0.32, 0.8, fz + 0.04], scale: LED_OFF, outline: 0, mat: { name: 'battery_led_charge', glow: 1 } });
  const ledD = mk(b, sphere(0.07, 12, 8), 0xff9a3c, { name: 'battery_led_discharge', pos: [0.68, 0.8, fz + 0.04], scale: LED_OFF, outline: 0, mat: { name: 'battery_led_discharge', glow: 1 } });
  for (const lx of [0.32, 0.68]) mk(b, clean(new THREE.TorusGeometry(0.1, 0.025, 6, 20)), C.dark, { name: 'battery_led_ring', pos: [lx, 0.8, fz + 0.03], outline: 0 });
  for (let i = 0; i < 3; i++) mk(b, rbox(0.6, 0.04, 0.03, 0.015), C.dark, { name: 'battery_vent', pos: [0.5, 0.52 + i * 0.1, fz + 0.01], outline: 0 });

  // terminais: entrada (leste, laranja) e saída (oeste, azul-acinzentado)
  for (const [sx, color, nm] of [[1, C.accent, 'in'], [-1, C.tech, 'out']] as [number, number, string][]) {
    const t = group(b, `battery_terminal_${nm}`, [sx * (W / 2 + 0.1), 0.62, 0]);
    mk(t, rbox(0.3, 0.46, 0.5, 0.08), C.dark, { name: `battery_terminal_${nm}_housing`, outline: 0.03 });
    mk(t, cyl(0.12, 0.12, 0.1, 16).rotateZ(Math.PI / 2), color, { name: `battery_terminal_${nm}_collar`, pos: [sx * 0.19, 0, 0], outline: 0 });
  }
  // lado de trás: painel de placas
  mk(b, rbox(1.0, 0.5, 0.06, 0.04), C.hull2, { name: 'battery_back_panel', pos: [0, 1.0, -fz - 0.01], outline: 0 });
  return { cells, ledC, ledD };
}

function buildOutlet(root: THREE.Object3D, box: THREE.Texture): void {
  const o = group(root, 'power_outlet', [4.2, 0, 3.15]);
  mk(o, rboxUV(0.5, 0.8, 0.5, 0.1), C.hull, { name: 'outlet_body', pos: [0, 0.4, 0], outline: 0.035, mat: { map: box } });
  mk(o, rbox(0.56, 0.1, 0.56, 0.04), C.accent, { name: 'outlet_cap', pos: [0, 0.82, 0], outline: 0 });
  mk(o, rbox(0.6, 0.1, 0.6, 0.04), C.dark, { name: 'outlet_base', pos: [0, 0.05, 0], outline: 0.02 });
  mk(o, cyl(0.1, 0.1, 0.12, 16).rotateZ(Math.PI / 2), C.tech, { name: 'outlet_socket', pos: [0.27, 0.45, 0], outline: 0 });
  mk(o, rbox(0.06, 0.06, 0.03, 0.015), C.glow, { name: 'outlet_led', pos: [0, 0.62, 0.26], outline: 0, mat: { glow: 0.9 } });
}

// ---------- animações ----------

interface Run {
  ta: number; // início (s)
  tb: number; // fim (s)
  ua: number; // posição inicial no cabo (0 a 1)
  ub: number; // posição final no cabo
}

/** Trilhas de posição e escala de um pulso que corre pelo cabo nas janelas `runs`; fora delas fica escondido. */
function pulseTracks(node: string, curve: THREE.CatmullRomCurve3, runs: Run[]): THREE.KeyframeTrack[] {
  const times: number[] = [];
  const pos: number[] = [];
  const scl: number[] = [];
  const len = curve.getLength();
  const push = (t: number, u: number, s: number) => {
    const p = curve.getPointAt(THREE.MathUtils.clamp(u, 0, 1));
    times.push(t);
    pos.push(p.x, p.y, p.z);
    scl.push(s, s, s);
  };
  for (const r of runs) {
    const n = Math.max(2, Math.ceil(Math.abs(r.ub - r.ua) * len * 2));
    push(r.ta + EPS, r.ua, PULSE_OFF);
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      push(r.ta + 2 * EPS + (r.tb - r.ta - 4 * EPS) * f, r.ua + (r.ub - r.ua) * f, 1);
    }
    push(r.tb - EPS, r.ub, PULSE_OFF);
  }
  return [new THREE.VectorKeyframeTrack(`${node}.position`, times, pos), new THREE.VectorKeyframeTrack(`${node}.scale`, times, scl)];
}

/** Pulso contínuo com fase φ (0 a 1): sai de φ até o fim e recomeça do início, fechando o laço. */
function loopRuns(T: number, phase: number): Run[] {
  if (phase <= 0) return [{ ta: 0, tb: T, ua: 0, ub: 1 }];
  return [{ ta: 0, tb: (1 - phase) * T, ua: phase, ub: 1 }, { ta: (1 - phase) * T, tb: T, ua: 0, ub: phase }];
}

const scaleTrack = (node: string, times: number[], values: number[]) => new THREE.VectorKeyframeTrack(`${node}.scale`, times, values.flatMap((s) => [s, s, s]));

function blinkTrack(node: string, T: number, period: number, lo: number): THREE.KeyframeTrack {
  const times: number[] = [];
  const vals: number[] = [];
  for (let t = 0; t < T - 1e-6; t += period / 2) {
    times.push(t);
    vals.push(Math.round(t / (period / 2)) % 2 === 0 ? 1 : lo);
  }
  times.push(T);
  vals.push(1);
  return scaleTrack(node, times, vals);
}

export function createSolarPower(): SolarPowerModel {
  const base = createSolarPanels();
  const root = base.root;
  root.name = 'solar_power';
  const box = boxTexture('neutral');

  // cabos
  const drops: { curve: THREE.CatmullRomCurve3; col: number }[] = [];
  const dropGeos: THREE.BufferGeometry[] = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      const { geo, curve } = cableGeometry(dropPath(12 + col * 2.5, 2 + row * 2.3, row), 0.035);
      dropGeos.push(geo);
      drops.push({ curve, col: row * 5 + col });
    }
  }
  mk(root, merge(dropGeos), CABLE, { name: 'panel_cables', outline: 0 });
  const trunk = cableGeometry(TRUNK, 0.05);
  mk(root, trunk.geo, CABLE, { name: 'cable_trunk', outline: 0 });
  const out = cableGeometry(OUT, 0.05);
  mk(root, out.geo, CABLE, { name: 'cable_out', outline: 0 });
  // presilhas laranja no cabo-tronco e conectores nas pontas
  for (let x = 13; x <= 21.5; x += 2) mk(root, rbox(0.1, 0.1, 0.14, 0.03), C.accent, { name: 'cable_clip', pos: [x, 0.13, 3.15], outline: 0 });
  for (const [x, y, z] of [[22.65, 0.3, 3.15], [9.8, 0.62, 3.15], [7.4, 0.62, 3.15], [4.5, 0.45, 3.15]] as V3[]) {
    mk(root, cyl(0.075, 0.075, 0.12, 12).rotateZ(Math.PI / 2), C.dark, { name: 'cable_plug', pos: [x, y, z], outline: 0 });
  }
  for (const d of drops) {
    const end = d.curve.getPointAt(1);
    mk(root, rbox(0.1, 0.07, 0.1, 0.03), C.accent, { name: 'cable_junction', pos: [end.x, 0.13, 3.15], outline: 0 });
  }

  const { cells } = buildBattery(root, box);
  buildOutlet(root, box);

  // pulsos de energia (escondidos até algum clipe tocar)
  const pulseGeo = sphere(0.12, 10, 8);
  const pulse = (name: string) =>
    mk(root, pulseGeo, C.glow, { name, scale: PULSE_OFF, outline: 0, mat: { name: 'energy_pulse', glow: 1 } });

  const T = 3.2;
  const charge: THREE.KeyframeTrack[] = [];
  const discharge: THREE.KeyframeTrack[] = [];
  // carga: 4 pulsos no cabo-tronco; 1 pulso (2 passadas) em cada fio de painel
  [0, 0.25, 0.5, 0.75].forEach((ph, k) => {
    pulse(`energy_pulse_charge_trunk_${k}`);
    charge.push(...pulseTracks(`energy_pulse_charge_trunk_${k}`, trunk.curve, loopRuns(T, ph)));
  });
  drops.forEach((d, i) => {
    const name = `energy_pulse_charge_panel_${i}`;
    pulse(name);
    const off = (d.col % 5) * 0.12;
    const runs: Run[] = [0, 1].map((p) => ({ ta: p * (T / 2) + off, tb: p * (T / 2) + off + 0.9, ua: 0, ub: 1 }));
    charge.push(...pulseTracks(name, d.curve, runs));
  });
  // descarga: 3 pulsos no cabo de saída, da bateria até a tomada
  [0, 1 / 3, 2 / 3].forEach((ph, k) => {
    pulse(`energy_pulse_discharge_${k}`);
    discharge.push(...pulseTracks(`energy_pulse_discharge_${k}`, out.curve, loopRuns(T, ph)));
  });

  // células: carga enche de baixo para cima; descarga esvazia de cima para baixo
  const FULL = 1;
  const NONE = 0.001;
  cells.forEach((_, i) => {
    const n = `battery_cell_${i}`;
    const a = 0.35 + 0.5 * i;
    charge.push(scaleTrack(n, [0, a, a + 0.15, 3.0, T], [NONE, NONE, FULL, FULL, NONE]));
    const d = 0.3 + 0.5 * (CELL_COUNT - 1 - i);
    discharge.push(scaleTrack(n, [0, d, d + 0.15, 3.0, T], [FULL, FULL, NONE, NONE, FULL]));
  });
  // luzes: carga pisca a verde, descarga pisca a laranja
  charge.push(blinkTrack('battery_led_charge', T, 0.8, 0.35), scaleTrack('battery_led_discharge', [0, T], [LED_OFF, LED_OFF]));
  discharge.push(blinkTrack('battery_led_discharge', T, 1.6, 0.35), scaleTrack('battery_led_charge', [0, T], [LED_OFF, LED_OFF]));

  // nível: o tempo do clipe (0 a 1) é o nível da bateria
  const level: THREE.KeyframeTrack[] = cells.map((_, i) => {
    const n = `battery_cell_${i}`;
    const lo = i / CELL_COUNT;
    const hi = (i + 1) / CELL_COUNT;
    if (i === 0) return scaleTrack(n, [0, hi, 1], [NONE, FULL, FULL]);
    if (i === CELL_COUNT - 1) return scaleTrack(n, [0, lo, 1], [NONE, NONE, FULL]);
    return scaleTrack(n, [0, lo, hi, 1], [NONE, NONE, FULL, FULL]);
  });

  return {
    root,
    clips: [new THREE.AnimationClip('battery_charge', T, charge), new THREE.AnimationClip('battery_discharge', T, discharge), new THREE.AnimationClip('battery_level', 1, level)],
  };
}
