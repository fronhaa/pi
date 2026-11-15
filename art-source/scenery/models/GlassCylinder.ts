import * as THREE from 'three';
import { COLORS as C, clean, cyl, emblem, group, merge, mk, rbox, rodsGeometry, type V3 } from './common';
import { buildAccessTower, buildPort, LIGHTS, type BlockTex } from './GreenhouseBase';
import { FLOOR_TOP, GLASS, sign, v, Y0 } from './GlassBlock';

/**
 * Casco cilíndrico GRANDE e transparente, compartilhado por dormitório, refeitório e academia.
 * Raio de 2,6 m (5,2 m de diâmetro), eixo na altura das portas de acoplamento (2,65 m), então liga
 * direto nos outros blocos. Trecho reto de vidro com treliça entre duas tampas opacas; a barriga (abaixo do piso
 * interno, a 1,72 m) é opaca e o bloco se apoia em quatro selas com cintas laranja.
 *
 * Origem no chão, no centro. Eixo comprido em X; frente (porta) em +Z. O tubo de acesso fica 1,0 m
 * mais à frente que o dos blocos pequenos (a barriga é mais larga).
 */

export const RC = 2.6; // raio
export const CAP = 1.1; // profundidade das tampas
export const DZ = 1.0; // deslocamento do tubo de acesso
const FLOOR_DY = FLOOR_TOP - 0.05 - Y0; // altura do piso em relação ao eixo
const PHI = Math.acos(-FLOOR_DY / RC); // meio-ângulo da barriga opaca
export const FLOOR_W = 2 * Math.sqrt(RC * RC - FLOOR_DY * FLOOR_DY) - 0.1; // largura do piso

/** Ponto do casco (para plaquinhas), na altura dy do eixo, do lado da frente (+Z). */
export function onHull(x: number, dy: number, out = 0): { pos: V3; rot: V3 } {
  const z = Math.sqrt(RC * RC - dy * dy) + out;
  return { pos: [x, Y0 + dy, z], rot: [-Math.asin(dy / RC), 0, 0] };
}

/** Meia-largura livre do casco a `h` m acima do piso (para não enfiar móvel na parede). */
export function halfWidthAt(h: number): number {
  const dy = FLOOR_TOP + h - Y0;
  return Math.sqrt(Math.max(0, RC * RC - dy * dy));
}

/** Tampa opaca em cúpula: sinal +1 = ponta +X, -1 = ponta -X. */
function capGeometry(s: 1 | -1, lc: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const a = (1 - i / N) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.001, RC * Math.sin(a)), lc / 2 + CAP * Math.cos(a)));
  }
  const g = new THREE.LatheGeometry(pts, 64);
  g.rotateZ((-s * Math.PI) / 2);
  return g;
}

export interface CylinderSpec {
  /** Comprimento do trecho reto de vidro (m). */
  lc: number;
  /** Texto, cor da faixa e nome da plaquinha da barriga (ex.: "DORMITÓRIO", "#4aa3e8", "label_dormitorio"). */
  signText: string;
  signStripe: string;
  signName: string;
}

/** Casco inteiro: tampas, portas, barriga, vidro, treliça, piso, luzes, plaquinha, selas e tubo de acesso. */
export function buildGlassCylinder(root: THREE.Object3D, tex: BlockTex, spec: CylinderSpec): void {
  const LC = spec.lc;
  const HALF = LC / 2 + CAP;
  const hull = group(root, 'hull');

  // tampas opacas com a escotilha de acoplamento
  for (const s of [-1, 1] as const) mk(hull, capGeometry(s, LC), C.hull, { name: 'hull_cap', pos: [0, Y0, 0], outline: 0.012, mat: { map: tex.hull } });
  for (const s of [-1, 1] as const) {
    const g = cyl(RC + 0.05, RC + 0.05, 0.36, 64).rotateZ(Math.PI / 2);
    mk(hull, g, C.dark, { name: 'hull_band_dark', pos: [s * (LC / 2 + 0.02), Y0, 0], outline: 0 });
    const o = cyl(RC + 0.04, RC + 0.04, 0.1, 64).rotateZ(Math.PI / 2);
    mk(hull, o, C.accent, { name: 'hull_band_orange', pos: [s * (LC / 2 - 0.28), Y0, 0], outline: 0 });
    buildPort(hull, root, s, HALF);
  }

  // barriga opaca (abaixo do piso) e vidro (acima)
  const belly = new THREE.CylinderGeometry(RC, RC, LC, 64, 1, true, Math.PI / 2 - PHI, 2 * PHI).rotateZ(-Math.PI / 2);
  mk(hull, belly, C.hull, { name: 'belly_shell', pos: [0, Y0, 0], outline: 0.012, mat: { map: tex.box } });
  const glass = new THREE.CylinderGeometry(RC, RC, LC, 64, 1, true, Math.PI / 2 + PHI, 2 * Math.PI - 2 * PHI).rotateZ(-Math.PI / 2);
  mk(hull, clean(glass), C.glass, { name: 'dome_glass', pos: [0, Y0, 0], outline: 0, mat: GLASS });

  // treliça leve: poucos anéis finos e diagonais espaçadas (só acima do piso), para ver bem o interior
  const Rf = RC + 0.025;
  const RINGS = Math.max(3, Math.round(LC / 3));
  const arcs: THREE.BufferGeometry[] = [];
  for (let k = 0; k <= RINGS; k++) {
    const x = -LC / 2 + (k * LC) / RINGS;
    const t = new THREE.TorusGeometry(Rf, 0.04, 6, 64, 2 * Math.PI - 2 * PHI);
    t.rotateZ(-Math.PI / 2 + PHI);
    t.rotateY(Math.PI / 2);
    t.translate(x, Y0, 0);
    arcs.push(t);
  }
  mk(hull, merge(arcs), C.hull, { name: 'frame_rings', outline: 0 });
  const NJ = 8;
  const pt = (x: number, j: number) => {
    const th = -Math.PI / 2 + PHI + ((2 * Math.PI - 2 * PHI) * j) / NJ;
    return v(x, Y0 + Rf * Math.sin(th), -Rf * Math.cos(th));
  };
  const diag: [THREE.Vector3, THREE.Vector3][] = [];
  for (let k = 0; k < RINGS; k++) {
    const xa = -LC / 2 + (k * LC) / RINGS;
    const xb = -LC / 2 + ((k + 1) * LC) / RINGS;
    for (let j = 0; j < NJ; j++) {
      const jb = k % 2 ? j : j + 1;
      const ja = k % 2 ? j + 1 : j;
      if (jb < 0 || jb > NJ || ja > NJ) continue;
      diag.push([pt(xa, ja), pt(xb, jb)]);
    }
  }
  mk(hull, rodsGeometry(diag, 0.022, 5), C.hull, { name: 'frame_braces', outline: 0 });
  // vigas longitudinais no topo e nas laterais (amarram os anéis)
  const lon: [THREE.Vector3, THREE.Vector3][] = [];
  for (const j of [0, NJ / 3, (2 * NJ) / 3, NJ]) lon.push([pt(-LC / 2, j), pt(LC / 2, j)]);
  mk(hull, rodsGeometry(lon, 0.032, 6), C.hull, { name: 'frame_beams', outline: 0 });

  // piso interno e faixas de luz acompanhando a curva do teto
  mk(hull, rbox(LC, 0.1, FLOOR_W, 0.03), C.hull2, { name: 'deck_floor', pos: [0, FLOOR_TOP - 0.05, 0], outline: 0.02 });
  mk(hull, rbox(LC - 0.4, 0.012, 0.08, 0.004), C.accent, { name: 'floor_stripe', pos: [0, FLOOR_TOP + 0.002, 0], outline: 0 });
  for (const sg of [-1, 1]) {
    const a = 0.42; // ângulo a partir do topo
    const r = RC - 0.12;
    mk(hull, rbox(LC - 1.4, 0.05, 0.14, 0.02), 0xe9fbff, { name: 'ceiling_light', pos: [0, Y0 + r * Math.cos(a), sg * r * Math.sin(a)], rot: [sg * a, 0, 0], outline: 0, mat: LIGHTS });
  }

  // luzes, emblema e plaquinha na barriga (frente), um de cada lado do tubo de acesso
  const lx = LC / 2 - 1.6;
  for (const x of [-lx, lx]) {
    const o = onHull(x, -1.7, 0.012);
    mk(hull, rbox(1.2, 0.07, 0.04, 0.02), 0xe9fbff, { name: 'hull_light', pos: o.pos, rot: o.rot, outline: 0, mat: LIGHTS });
  }
  const e = onHull(-lx + 0.0, -1.3, 0.02);
  emblem(hull, 'base_emblem', 0.3, e.pos, e.rot);
  const l = onHull(lx, -1.3, 0.015);
  sign(hull, spec.signName, spec.signText, spec.signStripe, 1.4, 0.4, l.pos, l.rot);

  buildSaddles(root, LC);
  buildAccessTower(root, tex, DZ);
}

/** Quatro selas de apoio com cinta laranja e uma caixa de cabos entre elas. */
function buildSaddles(root: THREE.Object3D, lc: number): void {
  const sd = group(root, 'saddles');
  const xs = [-0.36 * lc, -0.12 * lc, 0.12 * lc, 0.36 * lc];
  const Ro = RC + 0.05;
  const zmax = 1.95;
  const yEdge = Y0 - Math.sqrt(Ro * Ro - zmax * zmax);
  // perfil da sela no plano (z, y): do chão até a curva do casco
  const shape = new THREE.Shape();
  shape.moveTo(-zmax, 0);
  shape.lineTo(zmax, 0);
  shape.lineTo(zmax, yEdge);
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const z = zmax - (2 * zmax * i) / steps;
    shape.lineTo(z, Y0 - Math.sqrt(Ro * Ro - z * z));
  }
  shape.lineTo(-zmax, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.46, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, steps: 1 });
  geo.translate(0, 0, -0.23);
  geo.rotateY(-Math.PI / 2); // extrusão passa a correr em X, perfil em (z, y)
  geo.deleteAttribute('uv');
  const saddle = clean(geo);
  const strap = new THREE.TorusGeometry(RC + 0.07, 0.05, 6, 48, Math.PI * 1.1);
  strap.rotateZ(-Math.PI / 2 - Math.PI * 0.55);
  strap.rotateY(Math.PI / 2);
  strap.deleteAttribute('uv');
  const strapG = clean(strap);
  xs.forEach((x, i) => {
    mk(sd, saddle, C.tech, { name: `saddle_${i}`, pos: [x, 0, 0], outline: 0.02 });
    mk(sd, strapG, C.accent, { name: `saddle_strap_${i}`, pos: [x, Y0, 0], outline: 0 });
  });
  // pés escuros no chão sob cada sela
  xs.forEach((x, i) => mk(sd, rbox(0.7, 0.1, 4.1, 0.04), C.dark, { name: `saddle_foot_${i}`, pos: [x, 0.05, 0], outline: 0.02 }));
}
