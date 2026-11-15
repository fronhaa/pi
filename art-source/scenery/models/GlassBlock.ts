import * as THREE from 'three';
import { PALETTE } from '@/render/toon';
import { COLORS as C, cyl, group, mk, rbox, rboxUV, rodsGeometry, sphere, type V3 } from './common';
import { type BlockTex, LIGHTS } from './GreenhouseBase';
import { signTexture } from './textures';

/**
 * Peças compartilhadas dos blocos TRANSPARENTES da base (dormitório, refeitório e academia): vidro e treliça
 * como os da estufa, base opaca com equipamentos e móveis dentro. Mesmo piso, mesma altura e mesmas portas
 * de acoplamento dos outros blocos; porta de 1,95 m no chão (tubo de acesso, de GreenhouseBase.ts).
 */

export const Y0 = 2.65; // altura do eixo das portas de acoplamento
export const R = 1.6; // raio dos blocos cilíndricos
export const FLOOR_TOP = 1.72; // topo do piso interno (as escotilhas começam em ~1,67 m)
export const TOP = 4.25; // topo dos blocos em caixa
export const GLASS = { name: 'dome_glass', opacity: 0.26 };
export const WARM = { name: 'window', glow: 0.9 }; // lâmpadas de dentro: acendem com as janelas, à noite

export const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Vidro: plano fino translúcido (material "dome_glass", igual ao da estufa). */
export function glassPane(parent: THREE.Object3D, name: string, w: number, h: number, pos: V3, rot: V3 = [0, 0, 0]): void {
  mk(parent, rbox(w, h, 0.03, 0.012), C.glass, { name, pos, rot, outline: 0, mat: GLASS });
}

/** Plaquinha avulsa (texto) olhando para +Z do grupo. */
export function sign(parent: THREE.Object3D, name: string, text: string, stripe: string, w: number, h: number, pos: V3, rot: V3 = [0, 0, 0]): void {
  mk(parent, new THREE.PlaneGeometry(w, h), 0xffffff, { name, pos, rot, outline: 0, mat: { name: name, map: signTexture(text, stripe), alphaTest: 0.5 } });
}

// ---------- blocos em caixa ----------

/** Base opaca da caixa (de 1,05 a 1,65 m): equipamentos, faixas e o piso interno. */
export function buildPlinth(root: THREE.Object3D, tex: BlockTex, bw: number, bd: number): void {
  const g = group(root, 'plinth');
  mk(g, rboxUV(bw, 0.6, bd, 0.12), C.hull, { name: 'plinth_shell', pos: [0, 1.35, 0], outline: 0.025, mat: { map: tex.box } });
  mk(g, rbox(bw + 0.05, 0.14, bd + 0.05, 0.05), C.dark, { name: 'plinth_band_dark', pos: [0, 1.2, 0], outline: 0 });
  mk(g, rbox(bw + 0.05, 0.07, bd + 0.05, 0.03), C.accent, { name: 'plinth_band_orange', pos: [0, 1.52, 0], outline: 0 });
  mk(g, rbox(bw - 0.1, 0.1, bd - 0.1, 0.03), C.hull2, { name: 'deck_floor', pos: [0, FLOOR_TOP - 0.05, 0], outline: 0.02 });
}

/**
 * Paredes e teto de vidro com moldura e treliça (cantos, vigas, montantes e X nas paredes da frente e de trás).
 * As paredes das pontas (±X) são lisas: a escotilha da porta de acoplamento fica no meio.
 */
export function buildGlassHall(root: THREE.Object3D, bw: number, bd: number): void {
  const h = group(root, 'glass_hall');
  const y0 = FLOOR_TOP;
  const y1 = TOP;
  const hh = y1 - y0;
  const cy = (y0 + y1) / 2;
  const ex = bw / 2;
  const ez = bd / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(h, rbox(0.2, hh, 0.2, 0.06), C.hull, { name: 'hall_post', pos: [sx * (ex - 0.1), cy, sz * (ez - 0.1)], outline: 0.02 });
  for (const y of [y0 + 0.06, y1 - 0.07]) {
    for (const sz of [-1, 1]) mk(h, rbox(bw, 0.14, 0.2, 0.05), C.hull, { name: 'hall_beam', pos: [0, y, sz * (ez - 0.1)], outline: 0.02 });
    for (const sx of [-1, 1]) mk(h, rbox(0.2, 0.14, bd - 0.4, 0.05), C.hull, { name: 'hall_beam', pos: [sx * (ex - 0.1), y, 0], outline: 0.02 });
  }
  mk(h, rbox(bw - 0.4, 0.06, 0.1, 0.02), C.accent, { name: 'hall_rail_front', pos: [0, y1 - 0.45, ez - 0.1], outline: 0 });
  mk(h, rbox(bw - 0.4, 0.06, 0.1, 0.02), C.accent, { name: 'hall_rail_back', pos: [0, y1 - 0.45, -ez + 0.1], outline: 0 });
  // montantes e X de treliça (frente e trás)
  const n = Math.max(2, Math.round((bw - 0.4) / 1.3));
  const xs: number[] = [];
  for (let k = 0; k <= n; k++) xs.push(-ex + 0.2 + (k * (bw - 0.4)) / n);
  const braces: [THREE.Vector3, THREE.Vector3][] = [];
  for (const sz of [-1, 1]) {
    const z = sz * (ez - 0.1);
    for (let k = 1; k < n; k++) mk(h, rbox(0.1, hh - 0.28, 0.12, 0.03), C.hull, { name: 'hall_mullion', pos: [xs[k], cy, z], outline: 0 });
    for (let k = 0; k < n; k++) {
      braces.push([v(xs[k], y0 + 0.15, z), v(xs[k + 1], y1 - 0.15, z)], [v(xs[k + 1], y0 + 0.15, z), v(xs[k], y1 - 0.15, z)]);
    }
  }
  mk(h, rodsGeometry(braces, 0.03, 5), C.hull, { name: 'hall_braces', outline: 0 });
  // vidros
  for (const sz of [-1, 1]) glassPane(h, 'hall_glass_wall', bw - 0.2, hh - 0.15, [0, cy, sz * (ez - 0.12)]);
  for (const sx of [-1, 1]) glassPane(h, 'hall_glass_end', bd - 0.2, hh - 0.15, [sx * (ex - 0.12), cy, 0], [0, Math.PI / 2, 0]);
  // teto de vidro com caibros
  glassPane(h, 'hall_glass_roof', bw - 0.2, bd - 0.2, [0, y1 - 0.02, 0], [Math.PI / 2, 0, 0]);
  const rafters: [THREE.Vector3, THREE.Vector3][] = [];
  for (let k = 0; k <= n; k++) rafters.push([v(xs[k], y1 - 0.03, -ez + 0.1), v(xs[k], y1 - 0.03, ez - 0.1)]);
  rafters.push([v(-ex + 0.2, y1 - 0.03, 0), v(ex - 0.2, y1 - 0.03, 0)]);
  mk(h, rodsGeometry(rafters, 0.035, 5), C.hull, { name: 'hall_rafters', outline: 0 });
  // faixas de luz no teto, dentro
  for (const sz of [-1, 1]) mk(h, rbox(bw - 1.2, 0.05, 0.12, 0.02), 0xe9fbff, { name: 'ceiling_light', pos: [0, y1 - 0.2, sz * 0.7], outline: 0, mat: LIGHTS });
}

// ---------- móveis ----------

const SHEET = [0x33577f, 0xe8792b, 0x5aa5a0, 0x7b6aa8]; // cobertores
const FOOD = [0xe8792b, PALETTE.plant, 0xe5573d, 0xf3d36b];

/**
 * Medidas do astronauta (para os móveis): 1,87 m de altura, capacete de 1,03 m de largura e 0,87 m de
 * profundidade, quadril a 0,55 m, ombro a 0,95 m. Assento confortável a ~0,33 m; tampo de mesa a ~0,58 m.
 */
export const SEAT_Y = 0.33;
export const TABLE_Y = 0.58;

/**
 * Cama de solteiro (2,15 x 1,25 m), cabeceira em -X, colchão a 0,36 m (dá para sentar com o pé no chão
 * e deitar com o capacete inteiro no colchão). Pontos de interação: `<nome>_sit` (beirada, olhando para +Z)
 * e `<nome>_lie` (deitado, cabeça em -X).
 */
export function bed(parent: THREE.Object3D, name: string, pos: V3, rotY = 0, color = 0): void {
  const b = group(parent, name, pos, [0, rotY, 0]);
  const L = 2.15;
  const D = 1.25;
  mk(b, rbox(L, 0.14, D, 0.05), C.dark, { name: 'bed_frame', pos: [0, 0.16, 0], outline: 0.02 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(b, rbox(0.1, 0.1, 0.1, 0.03), C.tech, { name: 'bed_foot', pos: [sx * (L / 2 - 0.12), 0.05, sz * (D / 2 - 0.12)], outline: 0.02 });
  mk(b, rbox(L - 0.1, 0.13, D - 0.1, 0.05), 0xf0e7dc, { name: 'bed_mattress', pos: [0, 0.295, 0], outline: 0.02 });
  mk(b, rbox(1.25, 0.04, D - 0.06, 0.02), SHEET[color % SHEET.length], { name: 'bed_blanket', pos: [0.4, 0.37, 0], outline: 0.02 });
  mk(b, rbox(0.5, 0.12, 0.8, 0.05), 0xffffff, { name: 'bed_pillow', pos: [-L / 2 + 0.38, 0.42, 0], outline: 0.02 });
  // cabeceira com lâmpada
  mk(b, rbox(0.1, 0.85, D, 0.05), C.hull2, { name: 'bed_headboard', pos: [-L / 2 - 0.02, 0.43, 0], outline: 0.02 });
  mk(b, rbox(0.12, 0.08, D + 0.02, 0.03), C.accent, { name: 'bed_headboard_cap', pos: [-L / 2 - 0.02, 0.88, 0], outline: 0 });
  mk(b, sphere(0.07, 10, 8), 0xffe2a8, { name: 'bed_lamp', pos: [-L / 2 + 0.06, 0.8, D / 2 - 0.22], outline: 0, mat: WARM });
  const sit = new THREE.Object3D();
  sit.name = `${name}_sit`;
  sit.position.set(0.15, SEAT_Y + 0.03, D / 2 - 0.3);
  b.add(sit);
  const lie = new THREE.Object3D();
  lie.name = `${name}_lie`;
  lie.position.set(-0.05, 0.36, 0);
  lie.rotation.set(0, 0, 0);
  b.add(lie);
}

/** Armário alto com porta e puxador. Frente em +Z. Ponto de interação `<nome>_use` (na frente, olhando para o armário). */
export function locker(parent: THREE.Object3D, name: string, pos: V3, rotY = 0): void {
  const l = group(parent, name, pos, [0, rotY, 0]);
  mk(l, rbox(0.55, 1.7, 0.5, 0.06), C.hull2, { name: 'locker_body', pos: [0, 0.85, 0], outline: 0.03 });
  mk(l, rbox(0.02, 1.4, 0.02, 0.008), C.dark, { name: 'locker_split', pos: [0, 0.85, 0.26], outline: 0 });
  mk(l, rbox(0.05, 0.2, 0.04, 0.015), C.accent, { name: 'locker_handle', pos: [0.05, 0.9, 0.28], outline: 0 });
  mk(l, rbox(0.59, 0.07, 0.54, 0.03), C.accent, { name: 'locker_cap', pos: [0, 1.72, 0], outline: 0 });
  const use = new THREE.Object3D();
  use.name = `${name}_use`;
  use.position.set(0, 0, 0.75);
  use.rotation.y = Math.PI;
  l.add(use);
}

/**
 * Mesa comprida (tampo a 0,58 m, 0,9 m de largura) com dois bancos a 0,33 m, afastados para caber o
 * capacete. Comprimento em X; lugares a cada 1,1 m. Pontos de interação `<nome>_seat_K` (olhando para a mesa).
 */
export function table(parent: THREE.Object3D, name: string, pos: V3, len: number): void {
  const t = group(parent, name, pos);
  mk(t, rbox(len, 0.07, 0.9, 0.03), C.hull2, { name: 'table_top', pos: [0, TABLE_Y - 0.035, 0], outline: 0.03 });
  mk(t, rbox(len + 0.02, 0.03, 0.92, 0.012), C.accent, { name: 'table_edge', pos: [0, TABLE_Y - 0.075, 0], outline: 0 });
  for (const sx of [-1, 1]) mk(t, cyl(0.08, 0.14, TABLE_Y - 0.07, 12), C.tech, { name: 'table_leg', pos: [sx * (len / 2 - 0.35), (TABLE_Y - 0.07) / 2, 0], outline: 0.025 });
  const n = Math.max(1, Math.floor(len / 1.1 + 1e-6));
  let k = 0;
  for (const sz of [-1, 1]) {
    mk(t, rbox(len - 0.1, 0.07, 0.4, 0.03), C.navy, { name: 'bench_seat', pos: [0, SEAT_Y - 0.035, sz * 0.75], outline: 0.025 });
    for (const sx of [-1, 1]) mk(t, rbox(0.08, SEAT_Y - 0.07, 0.12, 0.02), C.dark, { name: 'bench_leg', pos: [sx * (len / 2 - 0.4), (SEAT_Y - 0.07) / 2, sz * 0.75], outline: 0.02 });
    for (let i = 0; i < n; i++) {
      const seat = new THREE.Object3D();
      seat.name = `${name}_seat_${k++}`;
      seat.position.set(-((n - 1) * 1.1) / 2 + i * 1.1, SEAT_Y, sz * 0.75);
      seat.rotation.y = sz > 0 ? Math.PI : 0;
      t.add(seat);
    }
  }
}

const trayGeo: Record<string, THREE.BufferGeometry> = {};
/** Geometria da bandeja, criada uma vez só (o .glb guarda uma cópia por forma). */
function tg(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  return (trayGeo[key] ??= make());
}

/** Bandeja com prato, comida e copo. */
export function tray(parent: THREE.Object3D, pos: V3, k = 0): void {
  const g = group(parent, 'tray', pos);
  mk(g, rbox(0.34, 0.025, 0.24, 0.01), C.dark, { name: 'tray_base', pos: [0, 0.0125, 0], outline: 0.02 });
  mk(g, tg('plate', () => cyl(0.1, 0.09, 0.025, 12)), 0xffffff, { name: 'tray_plate', pos: [-0.05, 0.038, 0], outline: 0.02 });
  mk(g, tg('food', () => sphere(0.05, 8, 6)), FOOD[k % FOOD.length], { name: 'tray_food', pos: [-0.05, 0.07, 0], scale: [1, 0.7, 1], outline: 0.03 });
  mk(g, tg('cup', () => cyl(0.032, 0.026, 0.07, 8)), C.glass, { name: 'tray_cup', pos: [0.11, 0.06, 0.03], outline: 0.03 });
}

// ---------- esteira ----------

export const BELT_STRIPES = 6;
export const BELT_LEN = 1.5;

/**
 * Esteira larga (1,1 x 1,9 m) com o console no lado +Z (quem corre olha para +Z). Corrimãos a 0,75 m e a
 * 0,55 m do meio, por fora dos braços do astronauta. As listras `<nome>_stripe_k` correm pela correia
 * (clipe "treadmills_run"). Ponto de interação `<nome>_run` (no meio da correia, olhando para +Z).
 */
export function treadmill(parent: THREE.Object3D, name: string, pos: V3): void {
  const t = group(parent, name, pos);
  mk(t, rbox(1.1, 0.2, 1.9, 0.06), C.dark, { name: `${name}_base`, pos: [0, 0.1, 0], outline: 0.03 });
  for (const sx of [-1, 1]) mk(t, rbox(0.12, 0.1, 1.92, 0.03), C.accent, { name: `${name}_rail`, pos: [sx * 0.5, 0.23, 0], outline: 0 });
  mk(t, rbox(0.82, 0.03, BELT_LEN + 0.1, 0.012), 0x3a3640, { name: `${name}_belt`, pos: [0, 0.215, -0.05], outline: 0 });
  for (const sx of [-1, 1]) mk(t, rbox(0.06, 0.95, 0.06, 0.02), C.tech, { name: `${name}_post`, pos: [sx * 0.55, 0.68, 0.85], outline: 0.02 });
  mk(t, rbox(0.9, 0.3, 0.1, 0.05), C.dark, { name: `${name}_console`, pos: [0, 1.08, 0.85], rot: [-0.45, 0, 0], outline: 0.03 });
  mk(t, rbox(0.62, 0.18, 0.02, 0.01), C.glow, { name: `${name}_screen`, pos: [0, 1.09, 0.905], rot: [-0.45, 0, 0], outline: 0, mat: { name: 'treadmill_screen', glow: 0.7 } });
  for (const sx of [-1, 1]) mk(t, rbox(0.05, 0.05, 0.75, 0.02), C.hull2, { name: `${name}_handrail`, pos: [sx * 0.55, 0.75, 0.48], outline: 0.02 });
  const stripe = rbox(0.76, 0.014, 0.06, 0.005);
  for (let k = 0; k < BELT_STRIPES; k++) {
    mk(t, stripe, 0x58535f, { name: `${name}_stripe_${k}`, pos: [0, 0.237, -BELT_LEN / 2 + (k * BELT_LEN) / BELT_STRIPES + 0.1], outline: 0 });
  }
  const run = new THREE.Object3D();
  run.name = `${name}_run`;
  run.position.set(0, 0.23, -0.1);
  t.add(run);
}

/** Pontos de um retângulo/círculo para tapetes e luminárias. */
export function rug(parent: THREE.Object3D, name: string, pos: V3, w: number, d: number, color: number): void {
  mk(parent, rbox(w, 0.025, d, 0.012), color, { name, pos, outline: 0.02 });
}


/**
 * Trilhas de um objeto que corre em linha reta de `from` até `to` em loop (período T, fase 0 a 1),
 * escondendo-se (escala quase zero) na emenda do laço.
 */
export function lineRunTracks(node: string, from: THREE.Vector3, to: THREE.Vector3, T: number, phase: number, steps = 6): THREE.KeyframeTrack[] {
  const EPS = 0.002;
  const times: number[] = [];
  const pos: number[] = [];
  const scl: number[] = [];
  const push = (t: number, u: number, s: number) => {
    const p = from.clone().lerp(to, THREE.MathUtils.clamp(u, 0, 1));
    times.push(t);
    pos.push(p.x, p.y, p.z);
    scl.push(s, s, s);
  };
  const runs = phase <= 0 ? [[0, T, 0, 1]] : [[0, (1 - phase) * T, phase, 1], [(1 - phase) * T, T, 0, phase]];
  for (const [ta, tb, ua, ub] of runs) {
    push(ta + EPS, ua, 0.0001);
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      push(ta + 2 * EPS + (tb - ta - 4 * EPS) * f, ua + (ub - ua) * f, 1);
    }
    push(tb - EPS, ub, 0.0001);
  }
  return [new THREE.VectorKeyframeTrack(`${node}.position`, times, pos), new THREE.VectorKeyframeTrack(`${node}.scale`, times, scl)];
}
