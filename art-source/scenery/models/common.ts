import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '@/render/toon';

/**
 * Peças comuns dos modelos do cenário (estação, painéis, rover), no mesmo estilo do astronauta chibi:
 * volumes arredondados, branco do traje, cinza-chumbo nas juntas, laranja só em faixas e luzes ciano.
 *
 * Os modelos saem com MeshStandardMaterial de cor sólida (o glTF não tem material toon).
 * Ao carregar, o jogo troca por toonMaterial(cor) e põe o contorno com a espessura gravada em
 * `userData.outline` de cada peça (0 = sem contorno).
 */
export const COLORS = {
  hull: 0xf3f1ee, // branco do traje do astronauta
  hull2: 0xd9d5d2, // cinza claro da mochila do astronauta
  dark: 0x46424a, // cinza-chumbo das luvas e botas
  accent: PALETTE.accent,
  tech: PALETTE.tech,
  glow: 0x7fe6ea, // ciano das luzes do traje
  navy: PALETTE.panel, // fundo do emblema (mesmo do astronauta)
  window: PALETTE.window,
  glass: 0xd8f0f4, // vidro do visor do astronauta
  solar: PALETTE.panel,
  solarGrid: 0x7d9cc4,
  plant: PALETTE.plant,
  bed: 0x6b4434, // terra dos canteiros
  alarmOff: 0x5a2a26, // luz de alarme apagada (mesma da cena atual)
  warningOff: 0x5a4a2a, // luz de aviso do rover apagada (mesma da cena atual)
} as const;

export interface MatOpts {
  /** Brilho próprio (emissive), para luzes e telas. */
  glow?: number;
  opacity?: number;
  /** Nome fixo: o jogo acha o material por ele (ex.: "window", "alarm"). */
  name?: string;
  /** Textura (multiplica a cor). A peça precisa ter UV. */
  map?: THREE.Texture;
  /** Recorte por transparência da textura (plaquinhas). */
  alphaTest?: number;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(color: number, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key =
    o.name ??
    `c${color.toString(16).padStart(6, '0')}${o.glow ? `_g${o.glow}` : ''}${o.opacity !== undefined ? `_a${o.opacity}` : ''}${o.map ? `_${o.map.name}` : ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, name: key });
    if (o.glow) {
      m.emissive.setHex(color);
      m.emissiveIntensity = o.glow;
    }
    if (o.map) m.map = o.map;
    if (o.alphaTest) m.alphaTest = o.alphaTest;
    if (o.opacity !== undefined && o.opacity < 1) {
      m.transparent = true;
      m.opacity = o.opacity;
      m.depthWrite = false;
    }
    matCache.set(key, m);
  }
  return m;
}

export type V3 = [number, number, number];

export interface MeshOpts {
  name?: string;
  pos?: V3;
  rot?: V3;
  scale?: V3 | number;
  /** Espessura do contorno (fração do tamanho). Padrão 0.03, como os módulos da cena. */
  outline?: number;
  mat?: MatOpts;
}

export function mk(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, o: MeshOpts = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color, o.mat));
  if (o.name) m.name = o.name;
  if (o.pos) m.position.set(...o.pos);
  if (o.rot) m.rotation.set(...o.rot);
  if (o.scale !== undefined) typeof o.scale === 'number' ? m.scale.setScalar(o.scale) : m.scale.set(...o.scale);
  m.userData.outline = o.outline ?? 0.03;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function group(parent: THREE.Object3D, name: string, pos?: V3, rot?: V3): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  if (pos) g.position.set(...pos);
  if (rot) g.rotation.set(...rot);
  parent.add(g);
  return g;
}

/** Tira UV (não há textura) e garante índice: arquivo menor. */
export function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  return g.index ? g : mergeVertices(g, 1e-5);
}

/** Igual a clean, mas recalcula normais suaves (para extrusões e lathes que saem facetados). */
export function smooth(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  return m;
}

const rboxCache = new Map<string, THREE.BufferGeometry>();

/** Caixa arredondada. Mesmas medidas = mesma geometria (o .glb guarda uma vez só). Não modifique o resultado. */
export function rbox(w: number, h: number, d: number, r: number, seg = 2): THREE.BufferGeometry {
  const key = [w, h, d, r, seg].map((n) => n.toFixed(4)).join(',');
  let g = rboxCache.get(key);
  if (!g) {
    const rr = Math.min(r, Math.min(w, h, d) / 2 - 1e-4);
    g = clean(new RoundedBoxGeometry(w, h, d, seg, rr));
    rboxCache.set(key, g);
  }
  return g;
}

/** Caixa arredondada com UV (cada face recebe a textura inteira). Geometria nova a cada chamada. */
export function rboxUV(w: number, h: number, d: number, r: number, seg = 2): THREE.BufferGeometry {
  const rr = Math.min(r, Math.min(w, h, d) / 2 - 1e-4);
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}

export function cyl(rt: number, rb: number, h: number, seg = 16, open = false): THREE.BufferGeometry {
  return clean(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
}

export function sphere(r: number, w = 16, h = 10): THREE.BufferGeometry {
  return clean(new THREE.SphereGeometry(r, w, h));
}

/** Superelipse |x/a|^p + |y/b|^p = 1 (p = 4 dá o "quadrado arredondado" dos módulos da referência). */
function superellipse(a: number, b: number, p: number, seg: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    pts.push(new THREE.Vector2(a * Math.sign(c) * Math.abs(c) ** (2 / p), b * Math.sign(s) * Math.abs(s) ** (2 / p)));
  }
  return pts;
}

/**
 * Tubo de seção "quadrado arredondado", deitado no eixo X, centrado na origem.
 * halfW = meia-largura (Z), halfH = meia-altura (Y), len = comprimento total (X), com bordas chanfradas.
 */
export function roundedTube(halfW: number, halfH: number, len: number, bevel: number, p = 4, seg = 48): THREE.BufferGeometry {
  const shape = new THREE.Shape(superellipse(halfW, halfH, p, seg));
  const depth = len - 2 * bevel;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 3,
    curveSegments: seg,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return smooth(g);
}

/** Peça reta entre dois pontos (caixa arredondada), para hastes, suspensão e braços. */
export function mkBeam(parent: THREE.Object3D, a: V3, b: V3, thick: number, color: number, o: MeshOpts = {}): THREE.Mesh {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const m = mk(parent, rbox(len + thick, thick, thick, thick * 0.35), color, o);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), vb.clone().sub(va).normalize());
  return m;
}

/** Junta várias hastes finas (cilindros) numa geometria só: treliças, cúpula, grades. */
export function rodsGeometry(segments: [THREE.Vector3, THREE.Vector3][], r: number, radial = 5): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const [a, b] of segments) {
    const len = a.distanceTo(b);
    if (len < 1e-4) continue;
    const g = new THREE.CylinderGeometry(r, r, len, radial, 1, true);
    g.deleteAttribute('uv');
    const q = new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize());
    g.applyQuaternion(q);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    parts.push(g);
  }
  return clean(mergeGeometries(parts)!);
}

/** Junta geometrias já posicionadas numa só (mesma cor, sem contorno próprio). */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const p of parts) p.deleteAttribute('uv');
  const nonIndexed = parts.some((p) => !p.index);
  return clean(mergeGeometries(nonIndexed ? parts.map((p) => (p.index ? p.toNonIndexed() : p)) : parts)!);
}

/**
 * Emblema próprio da missão (o mesmo do ombro do astronauta): fundo marinho, planeta e anel laranja.
 * Fica de frente para +Z do grupo.
 */
export function emblem(parent: THREE.Object3D, name: string, size: number, pos: V3, rot: V3 = [0, 0, 0]): THREE.Group {
  const g = group(parent, name, pos, rot);
  const disc = cyl(size, size, size * 0.12, 32);
  disc.rotateX(Math.PI / 2);
  mk(g, disc, COLORS.navy, { name: `${name}_base`, outline: 0.04 });
  const torus = new THREE.TorusGeometry(size * 0.92, size * 0.07, 6, 32);
  mk(g, clean(torus), COLORS.hull, { name: `${name}_rim`, pos: [0, 0, size * 0.06], outline: 0 });
  mk(g, sphere(size * 0.38, 16, 12), COLORS.accent, { name: `${name}_planet`, pos: [0, 0, size * 0.07], scale: [1, 1, 0.45], outline: 0 });
  const ring = new THREE.TorusGeometry(size * 0.62, size * 0.09, 6, 32);
  mk(g, clean(ring), COLORS.accent, { name: `${name}_ring`, pos: [0, 0, size * 0.1], rot: [0, 0, 0.35], scale: [1, 0.35, 0.3], outline: 0 });
  return g;
}
