import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, toonMaterial, toonMesh } from '@/render/toon';

/**
 * Astronauta chibi (CHR-001, folha de conceito "Astronauta Chibi").
 * Escala: 1 unidade = 1 m; altura total 1,85 m (Art Bible), com proporções chibi (capacete ~45% da altura).
 * Eixo Y para cima. Pose neutra, sem animação. Cada articulação é um Group nomeado, para animar depois por código.
 *
 * Cores novas, fora da PALETTE (origem: folha de conceito do time). Se o modelo entrar no jogo,
 * adicione-as em PALETTE e em docs/estilo-visual.md, dizendo a origem.
 */
export const CHIBI_COLORS = {
  suit: 0xf3f1ee, // branco do traje
  dark: 0x46424a, // luvas, botas, arnês, cinto (cinza-chumbo da folha)
  pack: 0xd9d5d2, // cinza claro da mochila e do painel
  skin: 0xf0a868,
  hair: 0x3a2520,
  eye: 0x2b1d1a,
  glow: 0x7fe6ea, // luzes ciano do painel e da mochila
  glass: 0xd8f0f4, // vidro do visor
  rim: 0x8e8c94, // vedação cinza em volta do visor
  inner: 0x2e2b30, // forro interno do capacete
} as const;

export interface ChibiAstronautOptions {
  /** Cor de destaque (laranja da folha de conceito por padrão). */
  accent?: number;
  /** Direção da frente: 1 = +Z (padrão glTF), -1 = -Z (como Crew.ts). */
  facing?: 1 | -1;
  /** Contorno (inverted hull). Desligue para exportar. */
  outline?: boolean;
}

export interface ChibiAstronaut {
  root: THREE.Group;
  /** Articulações e partes: spine, head, helmet, face, hair, torso, backpack, armL/R, forearmL/R, gloveL/R, legL/R, shinL/R, tablet. */
  parts: Record<string, THREE.Object3D>;
}

type V3 = [number, number, number];

// ---------------------------------------------------------------------------------------------
// Geometrias
// ---------------------------------------------------------------------------------------------

const spow = (v: number, e: number): number => Math.sign(v) * Math.pow(Math.abs(v), e);

/**
 * Superelipsoide: e1 controla o perfil vertical, e2 o horizontal (1 = redondo, <1 = mais quadrado).
 * É a forma base de quase tudo: rosto, tronco, membros, botas, luvas, mochila.
 */
export function superEllipsoid(rx: number, ry: number, rz: number, e1 = 1, e2 = 1, wSeg = 24, hSeg = 18): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= hSeg; i++) {
    const eta = -Math.PI / 2 + (Math.PI * i) / hSeg;
    const ce = Math.cos(eta);
    const se = Math.sin(eta);
    for (let j = 0; j <= wSeg; j++) {
      const w = -Math.PI + (2 * Math.PI * j) / wSeg;
      pos.push(rx * spow(ce, e1) * spow(Math.cos(w), e2), ry * spow(se, e1), rz * spow(ce, e1) * spow(Math.sin(w), e2));
    }
  }
  for (let i = 0; i < hSeg; i++) {
    for (let j = 0; j < wSeg; j++) {
      const a = i * (wSeg + 1) + j;
      const b = a + wSeg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const merged = mergeVertices(g, 1e-6);
  merged.computeVertexNormals();
  return merged;
}

/** Mecha de cabelo: gota afinando para a ponta, com curva lateral (bendX) e para a frente (bendZ). Topo na origem. */
function hairLock(len: number, width: number, thick: number, bendX = 0, bendZ = 0): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 12, 16);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const t = (1 - y) / 2; // 0 no topo, 1 na ponta
    const taper = t < 0.3 ? 1 : Math.pow((1 - t) / 0.7, 0.85);
    p.setXYZ(i, x * width * taper + bendX * t * t, -t * len, z * thick * taper + bendZ * t * t);
  }
  const merged = mergeVertices(g, 1e-6);
  merged.computeVertexNormals();
  return merged;
}

/** Monta uma geometria não indexada a partir de triângulos, virando os que apontam para o lado errado. */
function trianglesGeometry(
  tris: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]>,
  want: (centroid: THREE.Vector3) => THREE.Vector3,
  smoothNormal?: (p: THREE.Vector3) => THREE.Vector3,
): { pos: number[]; nor: number[] } {
  const pos: number[] = [];
  const nor: number[] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const [a, b, c] of tris) {
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    n.crossVectors(e1, e2).normalize();
    const ordered = n.dot(want(centroid)) >= 0 ? [a, b, c] : [a, c, b];
    if (!ordered.includes(b) || ordered[1] !== b) n.negate();
    for (const v of ordered) {
      pos.push(v.x, v.y, v.z);
      const sn = smoothNormal ? smoothNormal(v) : n;
      nor.push(sn.x, sn.y, sn.z);
    }
  }
  return { pos, nor };
}

/**
 * Placa grossa moldada numa esfera de raio r (peças laranja do capacete, ventilação).
 * dirFn leva (s, t) ∈ [-1, 1]² para uma direção; os cantos são arredondados (superelipse de expoente roundP).
 * Retorna a geometria já centrada e o centro, para o contorno escalar em volta da própria peça.
 */
function shellPatch(
  dirFn: (s: number, t: number) => THREE.Vector3,
  r: number,
  thickness: number,
  n = 18,
  roundP = 4,
): { geo: THREE.BufferGeometry; center: THREE.Vector3 } {
  const map = (s: number, t: number): [number, number] => {
    const m = Math.max(Math.abs(s), Math.abs(t));
    if (m === 0) return [0, 0];
    const k = Math.pow(Math.pow(Math.abs(s), roundP) + Math.pow(Math.abs(t), roundP), 1 / roundP);
    return [(s * m) / k, (t * m) / k];
  };
  const r0 = r - 0.006;
  const r1 = r + thickness;
  const dirs: THREE.Vector3[][] = [];
  for (let i = 0; i <= n; i++) {
    dirs.push([]);
    for (let j = 0; j <= n; j++) {
      const [s, t] = map(-1 + (2 * i) / n, -1 + (2 * j) / n);
      dirs[i].push(dirFn(s, t).normalize());
    }
  }
  const mid = dirFn(0, 0).normalize();
  const outer: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [];
  const inner: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [];
  const walls: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [];
  const O = (i: number, j: number) => dirs[i][j].clone().multiplyScalar(r1);
  const I = (i: number, j: number) => dirs[i][j].clone().multiplyScalar(r0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      outer.push([O(i, j), O(i + 1, j), O(i + 1, j + 1)], [O(i, j), O(i + 1, j + 1), O(i, j + 1)]);
      inner.push([I(i, j), I(i + 1, j), I(i + 1, j + 1)], [I(i, j), I(i + 1, j + 1), I(i, j + 1)]);
    }
  }
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) ring.push([i, 0]);
  for (let j = 0; j < n; j++) ring.push([n, j]);
  for (let i = n; i > 0; i--) ring.push([i, n]);
  for (let j = n; j > 0; j--) ring.push([0, j]);
  for (let k = 0; k < ring.length; k++) {
    const [ai, aj] = ring[k];
    const [bi, bj] = ring[(k + 1) % ring.length];
    walls.push([O(ai, aj), O(bi, bj), I(bi, bj)], [O(ai, aj), I(bi, bj), I(ai, aj)]);
  }
  const radial = (c: THREE.Vector3) => c.clone().normalize();
  const A = trianglesGeometry(outer, radial, (p) => p.clone().normalize());
  const B = trianglesGeometry(inner, (c) => radial(c).negate(), (p) => p.clone().normalize().negate());
  const C = trianglesGeometry(walls, (c) => {
    const d = c.clone().normalize();
    return d.sub(mid.clone().multiplyScalar(d.dot(mid)));
  });
  const pos = [...A.pos, ...B.pos, ...C.pos];
  const nor = [...A.nor, ...B.nor, ...C.nor];
  const center = mid.clone().multiplyScalar((r0 + r1) / 2);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] -= center.x;
    pos[i + 1] -= center.y;
    pos[i + 2] -= center.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return { geo, center };
}

/** Direções de uma placa retangular em volta de `center`, com meia-largura a e meia-altura b (radianos), girada `roll`. */
function plateDirs(center: THREE.Vector3, a: number, b: number, roll = 0): (s: number, t: number) => THREE.Vector3 {
  const c = center.clone().normalize();
  const up = Math.abs(c.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const e1 = new THREE.Vector3().crossVectors(up, c).normalize();
  const e2 = new THREE.Vector3().crossVectors(c, e1).normalize();
  const q = new THREE.Quaternion().setFromAxisAngle(c, roll);
  e1.applyQuaternion(q);
  e2.applyQuaternion(q);
  return (s, t) => c.clone().add(e1.clone().multiplyScalar(Math.tan(s * a))).add(e2.clone().multiplyScalar(Math.tan(t * b)));
}

/** Direções de uma faixa que passa por cima da cabeça no plano YZ: u vai de u0 a u1 (0 = topo, + = frente), meia-largura w. */
function bandDirs(u0: number, u1: number, w: number): (s: number, t: number) => THREE.Vector3 {
  return (s, t) => {
    const u = u0 + ((u1 - u0) * (s + 1)) / 2;
    const v = t * w;
    return new THREE.Vector3(Math.sin(v), Math.cos(v) * Math.cos(u), Math.cos(v) * Math.sin(u));
  };
}

// ---------------------------------------------------------------------------------------------
// Capacete
// ---------------------------------------------------------------------------------------------

/** Escala do tablet quando guardado (glTF não anima visibilidade; escala quase zero o esconde). */
export const TABLET_HIDDEN = 0.0001;

const HELMET_R = 0.42;
/** Achatamento lateral do capacete (mais largo que alto, como na folha). */
const HELMET_SX = 1.08;
/** Janela do visor: elipse no plano XY, só na frente. */
const WINDOW = { cx: 0, cy: -0.035, a: 0.355, b: 0.33 };
/** Abaixo disso o casco é aberto para o pescoço. */
const NECK_Y = -0.355;

function insideWindow(x: number, y: number, z: number): boolean {
  return z > 0 && ((x - WINDOW.cx) / WINDOW.a) ** 2 + ((y - WINDOW.cy) / WINDOW.b) ** 2 < 1;
}

function helmetGeometries(): { shell: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const src = new THREE.SphereGeometry(HELMET_R, 64, 48).toNonIndexed();
  const pos = src.getAttribute('position');
  const nor = src.getAttribute('normal');
  const shellP: number[] = [];
  const shellN: number[] = [];
  const glassP: number[] = [];
  const glassN: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    if (cy < NECK_Y) continue;
    const inside = insideWindow(cx, cy, cz);
    const P = inside ? glassP : shellP;
    const N = inside ? glassN : shellN;
    for (let k = 0; k < 3; k++) {
      P.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      N.push(nor.getX(i + k), nor.getY(i + k), nor.getZ(i + k));
    }
  }
  const build = (p: number[], n: number[]): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    return mergeVertices(g, 1e-6);
  };
  return { shell: build(shellP, shellN), glass: build(glassP, glassN) };
}

/** Vedação em volta da janela, seguindo a superfície do capacete. */
function windowRim(radius: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const n = 96;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = WINDOW.cx + WINDOW.a * Math.cos(t);
    const y = WINDOW.cy + WINDOW.b * Math.sin(t);
    const z = Math.sqrt(Math.max(HELMET_R * HELMET_R - x * x - y * y, 0));
    pts.push(new THREE.Vector3(x, y, z));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 128, radius, 10, true);
}

// ---------------------------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------------------------

export function createChibiAstronaut(options: ChibiAstronautOptions = {}): ChibiAstronaut {
  const accent = options.accent ?? PALETTE.accent;
  const facing = options.facing ?? 1;
  const useOutline = options.outline ?? true;
  const C = CHIBI_COLORS;
  const parts: Record<string, THREE.Object3D> = {};

  interface MkOpts {
    name: string;
    pos?: V3;
    rot?: V3;
    scale?: V3;
    outline?: number;
    glow?: number;
  }
  const mk = (geo: THREE.BufferGeometry, color: number, o: MkOpts): THREE.Mesh => {
    const m = toonMesh(geo, color, useOutline ? (o.outline ?? 0.03) : 0);
    m.name = o.name;
    if (o.pos) m.position.set(...o.pos);
    if (o.rot) m.rotation.set(...o.rot);
    if (o.scale) m.scale.set(...o.scale);
    if (o.glow) {
      m.material.emissive.setHex(color);
      m.material.emissiveIntensity = o.glow;
    }
    return m;
  };
  const se = superEllipsoid;
  const group = (name: string, pos: V3 = [0, 0, 0], parent?: THREE.Object3D): THREE.Group => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...pos);
    parts[name] = g;
    parent?.add(g);
    return g;
  };

  const root = new THREE.Group();
  root.name = 'ChibiAstronaut';
  const body = new THREE.Group();
  body.name = 'body';
  body.rotation.y = facing === 1 ? 0 : Math.PI;
  root.add(body);

  // ---------- pernas (pivô no quadril, y = 0.55) e canelas com botas (pivô no joelho) ----------
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'R' : 'L'; // lados do personagem: frente em +Z, direita em -X
    const leg = group(`leg${tag}`, [side * 0.122, 0.55, 0], body);
    leg.add(mk(se(0.118, 0.14, 0.13, 0.45, 0.9), C.suit, { name: `thigh${tag}_suit`, pos: [0, -0.1, 0] }));
    const shin = group(`shin${tag}`, [0, -0.22, 0], leg);
    shin.add(mk(se(0.114, 0.13, 0.125, 0.45, 0.9), C.suit, { name: `shin${tag}_suit`, pos: [0, -0.08, 0] }));
    // joelheira laranja: faixa em volta + almofada na frente, com tira escura (cobre a junta do joelho)
    shin.add(mk(se(0.127, 0.042, 0.138, 0.3, 0.9), accent, { name: `knee${tag}_band`, pos: [0, 0, 0], outline: 0.02 }));
    shin.add(mk(se(0.1, 0.07, 0.05, 0.4, 0.5), accent, { name: `knee${tag}_pad`, pos: [0, 0, 0.115], outline: 0.025 }));
    shin.add(mk(se(0.102, 0.011, 0.05, 0.3, 0.5), C.dark, { name: `knee${tag}_strap`, pos: [0, 0, 0.123], outline: 0 }));
    // bota: sola e biqueira escuras, cano branco, tira laranja
    shin.add(mk(se(0.138, 0.036, 0.19, 0.35, 0.55), C.dark, { name: `boot${tag}_sole`, pos: [0, -0.293, 0.035] }));
    shin.add(mk(se(0.132, 0.08, 0.178, 0.55, 0.65), C.dark, { name: `boot${tag}_toe`, pos: [0, -0.22, 0.04] }));
    shin.add(mk(se(0.126, 0.075, 0.135, 0.5, 0.8), C.suit, { name: `boot${tag}_upper`, pos: [0, -0.15, -0.005] }));
    shin.add(mk(se(0.131, 0.026, 0.142, 0.3, 0.8), accent, { name: `boot${tag}_strap`, pos: [0, -0.18, 0.0], outline: 0.02 }));
  }

  // ---------- tronco ----------
  const torso = group('torso', [0, 0.77, 0], body);
  torso.add(mk(se(0.26, 0.275, 0.19, 0.55, 0.75), C.suit, { name: 'torso_suit' }));
  torso.add(mk(se(0.268, 0.042, 0.198, 0.3, 0.75), C.dark, { name: 'belt', pos: [0, -0.17, 0], outline: 0.02 }));
  torso.add(mk(se(0.06, 0.038, 0.02, 0.3, 0.3), C.suit, { name: 'belt_buckle', pos: [0, -0.17, 0.205], outline: 0.03 }));
  for (const side of [-1, 1]) {
    torso.add(mk(se(0.045, 0.045, 0.035, 0.4, 0.4), C.dark, { name: `belt_pouch${side < 0 ? 'R' : 'L'}`, pos: [side * 0.2, -0.17, 0.15], rot: [0, side * 0.6, 0] }));
    // tiras do arnês, descendo dos ombros até o cinto
    torso.add(mk(se(0.03, 0.175, 0.016, 0.3, 0.4), C.dark, { name: `harness${side < 0 ? 'R' : 'L'}`, pos: [side * 0.115, 0.03, 0.188], rot: [0, 0, side * 0.06], outline: 0.02 }));
  }
  torso.add(mk(se(0.12, 0.02, 0.016, 0.3, 0.4), C.dark, { name: 'harness_chest', pos: [0, 0.07, 0.19], outline: 0.02 }));
  // painel do peito: moldura clara, tela escura, duas luzes ciano; triângulo laranja abaixo
  const panel = group('chest_panel', [0.04, 0.08, 0.212], torso);
  panel.add(mk(se(0.085, 0.058, 0.026, 0.35, 0.35), C.pack, { name: 'chest_panel_frame', outline: 0.03 }));
  panel.add(mk(se(0.064, 0.034, 0.012, 0.3, 0.3), C.dark, { name: 'chest_panel_screen', pos: [0, 0.006, 0.02], outline: 0 }));
  for (const dx of [-0.026, 0.026]) {
    panel.add(mk(se(0.018, 0.014, 0.006, 0.3, 0.3), C.glow, { name: 'chest_light', pos: [dx, 0.006, 0.031], outline: 0, glow: 0.9 }));
  }
  torso.add(mk(new THREE.CylinderGeometry(0.034, 0.034, 0.008, 3), accent, { name: 'chest_triangle', pos: [0.04, -0.035, 0.188], rot: [-Math.PI / 2, 0, 0], outline: 0 }));

  // ---------- mochila ----------
  const backpack = group('backpack', [0, 0.8, -0.285], body);
  backpack.add(mk(se(0.19, 0.2, 0.1, 0.4, 0.45), C.pack, { name: 'backpack_body', pos: [0, 0.03, 0] }));
  backpack.add(mk(se(0.186, 0.08, 0.106, 0.35, 0.45), C.dark, { name: 'backpack_base', pos: [0, -0.13, 0] }));
  backpack.add(mk(se(0.196, 0.045, 0.11, 0.3, 0.45), accent, { name: 'backpack_cap', pos: [0, 0.21, 0], outline: 0.02 }));
  backpack.add(mk(new THREE.TorusGeometry(0.06, 0.016, 8, 20, Math.PI), C.dark, { name: 'backpack_handle', pos: [0, 0.245, 0], outline: 0.03 }));
  backpack.add(mk(se(0.1, 0.05, 0.012, 0.3, 0.3), C.dark, { name: 'backpack_screen', pos: [0, 0.08, -0.098], outline: 0 }));
  for (const dx of [-0.035, 0.035]) {
    backpack.add(mk(se(0.02, 0.016, 0.006, 0.3, 0.3), C.glow, { name: 'backpack_light', pos: [dx, 0.08, -0.111], outline: 0, glow: 0.9 }));
  }
  for (const side of [-1, 1]) {
    for (const dy of [0.09, 0.03, -0.03]) {
      backpack.add(mk(new THREE.BoxGeometry(0.01, 0.042, 0.04), C.glow, { name: 'backpack_led', pos: [side * 0.191, dy, 0.0], outline: 0, glow: 0.9 }));
    }
  }

  // ---------- braços (pivô no ombro; antebraço com pivô no cotovelo) ----------
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'R' : 'L'; // lados do personagem: frente em +Z, direita em -X
    const arm = group(`arm${tag}`, [side * 0.272, 0.95, 0], body);
    arm.rotation.z = side * 0.2;
    arm.add(mk(new THREE.SphereGeometry(0.1, 20, 16), C.suit, { name: `shoulder${tag}` }));
    arm.add(mk(se(0.088, 0.13, 0.092, 0.55, 0.9), C.suit, { name: `arm${tag}_suit`, pos: [0, -0.11, 0] }));
    arm.add(mk(se(0.096, 0.034, 0.1, 0.3, 0.9), accent, { name: `arm${tag}_band`, pos: [0, -0.165, 0], outline: 0.02 }));
    const fore = group(`forearm${tag}`, [0, -0.21, 0], arm);
    fore.rotation.set(-0.25, 0, -side * 0.12);
    fore.add(mk(se(0.08, 0.1, 0.084, 0.55, 0.9), C.suit, { name: `forearm${tag}_suit`, pos: [0, -0.08, 0] }));
    // luva: punho, palma e polegar
    fore.add(mk(se(0.088, 0.032, 0.09, 0.35, 0.9), C.dark, { name: `glove${tag}_cuff`, pos: [0, -0.16, 0], outline: 0.02 }));
    const glove = mk(se(0.09, 0.1, 0.082, 0.7, 0.8), C.dark, { name: `glove${tag}`, pos: [0, -0.24, 0.01] });
    fore.add(glove);
    parts[`glove${tag}`] = glove;
    fore.add(mk(se(0.032, 0.05, 0.034, 0.8, 0.9), C.dark, { name: `glove${tag}_thumb`, pos: [-side * 0.06, -0.2, 0.06], rot: [0.3, 0, side * 0.55] }));
    if (side < 0) {
      // emblema do planeta (marinho, planeta e anel laranja) no ombro direito do personagem
      const patch = group('patch', [-0.082, -0.07, 0.045], arm);
      patch.rotation.y = -Math.PI / 4;
      patch.add(mk(se(0.056, 0.056, 0.012, 0.35, 0.35), PALETTE.panel, { name: 'patch_base', outline: 0.03 }));
      patch.add(mk(new THREE.SphereGeometry(0.022, 16, 12), accent, { name: 'patch_planet', pos: [0, 0, 0.012], scale: [1, 1, 0.45], outline: 0 }));
      patch.add(mk(new THREE.TorusGeometry(0.036, 0.0055, 6, 24), accent, { name: 'patch_ring', pos: [0, 0, 0.014], rot: [0, 0, 0.35], scale: [1, 0.35, 0.3], outline: 0 }));
    }
  }

  // ---------- cabeça (pivô no pescoço) ----------
  const head = group('head', [0, 1.43, 0], body);
  body.add(mk(new THREE.TorusGeometry(0.205, 0.05, 12, 36), C.dark, { name: 'collar', pos: [0, 1.43 + NECK_Y - 0.01, 0], rot: [Math.PI / 2, 0, 0], outline: 0.02 }));

  const helmet = group('helmet', [0, 0, 0], head);
  helmet.scale.set(HELMET_SX, 1, 1);
  const { shell, glass } = helmetGeometries();
  helmet.add(mk(shell, C.suit, { name: 'helmet_shell', outline: 0.02 }));
  // forro interno: esfera com as faces viradas para dentro (funciona igual no jogo e no .glb, sem BackSide)
  const liningGeo = new THREE.SphereGeometry(HELMET_R - 0.012, 40, 30);
  const li = liningGeo.getIndex()!;
  for (let i = 0; i < li.count; i += 3) {
    const b = li.getX(i + 1);
    li.setX(i + 1, li.getX(i + 2));
    li.setX(i + 2, b);
  }
  const ln = liningGeo.getAttribute('normal');
  for (let i = 0; i < ln.count; i++) ln.setXYZ(i, -ln.getX(i), -ln.getY(i), -ln.getZ(i));
  const lining = new THREE.Mesh(liningGeo, toonMaterial(C.inner));
  lining.name = 'helmet_lining';
  helmet.add(lining);
  const glassMesh = new THREE.Mesh(glass, toonMaterial(C.glass, { transparent: true, opacity: 0.16, depthWrite: false }));
  glassMesh.name = 'visor_glass';
  helmet.add(glassMesh);
  helmet.add(mk(windowRim(0.018), C.rim, { name: 'visor_rim', outline: 0 }));
  // brilho do vidro, no alto à direita
  {
    const d = new THREE.Vector3(0.2, 0.17, 0.328).normalize();
    const hl = mk(new THREE.SphereGeometry(1, 16, 10), 0xffffff, { name: 'visor_highlight', outline: 0, glow: 0.8 });
    hl.position.copy(d.clone().multiplyScalar(HELMET_R + 0.002));
    hl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    hl.scale.set(0.03, 0.019, 0.003);
    hl.rotateZ(-0.6);
    helmet.add(hl);
  }
  const addPatch = (name: string, dirFn: (s: number, t: number) => THREE.Vector3, thick: number, color: number, roundP = 4, outline = 0.02) => {
    const { geo, center } = shellPatch(dirFn, HELMET_R, thick, 18, roundP);
    helmet.add(mk(geo, color, { name, pos: [center.x, center.y, center.z], outline }));
  };
  // faixa laranja: do alto da testa, por cima, descendo pelas costas
  addPatch('helmet_stripe', bandDirs(0.5, -2.05, 0.2), 0.018, accent, 10);
  // bloco laranja na frente do topo
  addPatch('helmet_top_block', plateDirs(new THREE.Vector3(0, 0.88, 0.47), 0.2, 0.13), 0.045, accent, 4);
  // placas laranja nos dois lados de cima do visor
  for (const side of [-1, 1]) {
    addPatch(`helmet_plate${side < 0 ? 'R' : 'L'}`, plateDirs(new THREE.Vector3(side * 0.62, 0.58, 0.53), 0.11, 0.2, side * -0.75), 0.022, accent, 4);
  }
  // ventilação cinza nas costas, sobre a faixa
  addPatch('helmet_vent', plateDirs(new THREE.Vector3(0, 0.22, -1), 0.17, 0.07), 0.03, C.pack, 4);
  for (const dy of [-0.025, 0.0, 0.025]) {
    const d = new THREE.Vector3(0, 0.22 + dy * 2.4, -1).normalize();
    const slot = mk(se(0.05, 0.005, 0.006, 0.3, 0.3), C.dark, { name: 'helmet_vent_slot', outline: 0 });
    slot.position.copy(d.clone().multiplyScalar(HELMET_R + 0.032));
    slot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    helmet.add(slot);
  }

  // fones laterais: aro branco, disco escuro, anel laranja aceso
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'R' : 'L'; // lados do personagem: frente em +Z, direita em -X
    const ear = group(`earcup${tag}`, [side * 0.455, -0.04, 0.03], head);
    ear.rotation.z = (-side * Math.PI) / 2; // eixo do cilindro (Y local) apontando para fora
    ear.add(mk(new THREE.CylinderGeometry(0.128, 0.132, 0.08, 40), C.suit, { name: `earcup${tag}_shell`, outline: 0.025 }));
    ear.add(mk(new THREE.CylinderGeometry(0.098, 0.098, 0.03, 36), C.dark, { name: `earcup${tag}_disc`, pos: [0, 0.03, 0], outline: 0 }));
    ear.add(mk(new THREE.TorusGeometry(0.062, 0.015, 10, 36), accent, { name: `earcup${tag}_ring`, pos: [0, 0.047, 0], rot: [Math.PI / 2, 0, 0], outline: 0, glow: 0.55 }));
    ear.add(mk(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 24), C.dark, { name: `earcup${tag}_core`, pos: [0, 0.048, 0], outline: 0 }));
  }

  // rosto: bloco arredondado grande, quase enchendo o visor
  const FACE = { x: 0, y: -0.06, z: 0.06, rx: 0.31, ry: 0.27, rz: 0.27, p: 2 / 0.55 };
  const face = group('face', [FACE.x, FACE.y, FACE.z], head);
  face.add(mk(se(FACE.rx, FACE.ry, FACE.rz, 0.55, 0.55, 40, 32), C.skin, { name: 'face_skin', outline: 0 }));
  /** Ponto na frente do rosto (x, y relativos ao centro do rosto) e a orientação da superfície ali. */
  const onFace = (x: number, y: number, off = 0.002): { pos: V3; quat: THREE.Quaternion } => {
    const ax = Math.pow(Math.abs(x / FACE.rx), FACE.p);
    const ay = Math.pow(Math.abs(y / FACE.ry), FACE.p);
    const z = FACE.rz * Math.pow(Math.max(1 - ax - ay, 0), 1 / FACE.p);
    // normal pelo gradiente da superfície implícita
    const g = new THREE.Vector3(
      (Math.sign(x) * Math.pow(Math.abs(x / FACE.rx), FACE.p - 1)) / FACE.rx,
      (Math.sign(y) * Math.pow(Math.abs(y / FACE.ry), FACE.p - 1)) / FACE.ry,
      Math.pow(Math.max(z, 1e-4) / FACE.rz, FACE.p - 1) / FACE.rz,
    ).normalize();
    const p = new THREE.Vector3(x, y, z).add(g.clone().multiplyScalar(off));
    return { pos: [p.x, p.y, p.z], quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), g) };
  };
  const decal = (geo: THREE.BufferGeometry, color: number, name: string, x: number, y: number, off: number, roll = 0, glow?: number) => {
    const at = onFace(x, y, off);
    const m = mk(geo, color, { name, pos: at.pos, outline: 0, glow });
    m.quaternion.copy(at.quat);
    m.rotateZ(roll);
    face.add(m);
    return m;
  };
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'R' : 'L'; // lados do personagem: frente em +Z, direita em -X
    // olhos: ovais altos e escuros, com um brilho pequeno
    decal(se(0.044, 0.072, 0.012, 0.8, 0.8), C.eye, `eye${tag}`, side * 0.12, -0.005, 0.002);
    decal(new THREE.CircleGeometry(0.012, 12), 0xffffff, `eye${tag}_shine`, side * 0.12 + 0.014, 0.025, 0.016, 0, 0.6);
    // sobrancelhas grossas
    decal(se(0.05, 0.019, 0.008, 0.6, 0.6), C.hair, `brow${tag}`, side * 0.125, 0.098, 0.003, side * -0.1);
    // triângulo laranja na bochecha
    decal(new THREE.CircleGeometry(0.028, 3), accent, `cheek${tag}`, side * 0.2, -0.09, 0.003, Math.PI / 2 + side * 0.15);
  }
  decal(new THREE.TorusGeometry(0.045, 0.0075, 8, 24, Math.PI * 0.85), C.eye, 'mouth', 0.0, -0.125, 0.004, Math.PI + Math.PI * 0.075);

  // cabelo: massa no topo e atrás, mechas na testa (franja varrida) e nas têmporas
  const hair = group('hair', [0, 0, 0], head);
  hair.add(mk(se(0.355, 0.29, 0.34, 0.8, 0.9, 40, 30), C.hair, { name: 'hair_mass', pos: [0, 0.08, -0.01], outline: 0 }));
  hair.add(mk(se(0.36, 0.2, 0.3, 0.9, 0.9), C.hair, { name: 'hair_back', pos: [0, -0.07, -0.08], outline: 0 }));
  /** Profundidade da casca do capacete num ponto (x, y) da cabeça: as mechas nascem por dentro dela. */
  const shellZ = (x: number, y: number) => Math.sqrt(Math.max(HELMET_R ** 2 - (x / HELMET_SX) ** 2 - y ** 2, 0));
  // franja: [x, yTopo, comprimento, largura, inclinação lateral, inclinação para a frente]
  const fringe: Array<[number, number, number, number, number, number]> = [
    [-0.27, 0.21, 0.22, 0.08, -0.3, -0.4],
    [-0.19, 0.26, 0.26, 0.088, -0.22, -0.43],
    [-0.1, 0.28, 0.27, 0.092, -0.12, -0.45],
    [-0.01, 0.285, 0.25, 0.09, -0.04, -0.45],
    [0.11, 0.28, 0.24, 0.088, 0.1, -0.45],
    [0.2, 0.26, 0.26, 0.085, 0.2, -0.43],
    [0.27, 0.21, 0.22, 0.078, 0.3, -0.4],
  ];
  fringe.forEach(([x, y, len, w, roll, tilt], i) => {
    const z = shellZ(x, y) - 0.065;
    hair.add(mk(hairLock(len, w, 0.055, roll * 0.08, 0.0), C.hair, { name: `hair_fringe${i}`, pos: [x, y, z], rot: [tilt, 0, roll], outline: 0 }));
  });
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'R' : 'L'; // lados do personagem: frente em +Z, direita em -X
    hair.add(mk(hairLock(0.3, 0.075, 0.065, side * 0.02, 0.02), C.hair, { name: `hair_temple${tag}`, pos: [side * 0.29, 0.2, 0.13], rot: [-0.15, 0, side * 0.1], outline: 0 }));
    hair.add(mk(hairLock(0.26, 0.07, 0.06, side * 0.03, 0.0), C.hair, { name: `hair_side${tag}`, pos: [side * 0.33, 0.16, 0.0], rot: [0, 0, side * 0.12], outline: 0 }));
  }

  // ---------- coluna: tronco, mochila, braços e cabeça giram juntos a partir do quadril ----------
  const spine = group('spine', [0, 0.55, 0], body);
  root.updateMatrixWorld(true);
  for (const name of ['torso', 'backpack', 'armL', 'armR', 'head']) spine.attach(parts[name]);
  const collar = body.getObjectByName('collar');
  if (collar) spine.attach(collar);

  // ---------- tablet (escondido: escala ~0; a animação "interact" o faz aparecer) ----------
  const tablet = group('tablet', [0, 0.2, 0.34], spine);
  tablet.add(mk(se(0.165, 0.115, 0.014, 0.25, 0.25), C.pack, { name: 'tablet_body', outline: 0.03 }));
  tablet.add(mk(se(0.17, 0.12, 0.009, 0.25, 0.25), accent, { name: 'tablet_bumper', outline: 0 }));
  tablet.add(mk(se(0.06, 0.012, 0.003, 0.3, 0.3), accent, { name: 'tablet_back_stripe', pos: [0, 0.06, -0.016], outline: 0 }));
  tablet.add(mk(se(0.145, 0.096, 0.004, 0.2, 0.2), PALETTE.panel, { name: 'tablet_screen', pos: [0, 0, 0.013], outline: 0, glow: 0.35 }));
  tablet.add(mk(se(0.05, 0.05, 0.003, 0.3, 0.3), accent, { name: 'tablet_icon', pos: [-0.08, 0.035, 0.017], outline: 0, glow: 0.4 }));
  for (const [i, w] of [0.075, 0.055, 0.065].entries()) {
    tablet.add(mk(se(w, 0.009, 0.003, 0.3, 0.3), C.glow, { name: `tablet_line${i}`, pos: [0.04 + (w - 0.075), 0.05 - i * 0.035, 0.017], outline: 0, glow: 0.8 }));
  }
  tablet.add(mk(se(0.12, 0.012, 0.003, 0.3, 0.3), C.glow, { name: 'tablet_bar', pos: [0, -0.07, 0.017], outline: 0, glow: 0.8 }));
  tablet.scale.setScalar(TABLET_HIDDEN);

  return { root, parts };
}
