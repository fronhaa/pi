import * as THREE from 'three';
import { PALETTE } from '@/render/toon';
import { COLORS as C, clean, cyl, emblem, group, mk, mkBeam, rbox, rboxUV, rodsGeometry, roundedTube, smooth, sphere, type V3 } from './common';
import { boltTexture, boxTexture, hazardTexture, hullTexture, LABELS, labelGeometry, labelTexture, scaleUV, tubeUV } from './textures';

/**
 * Estação da base (ARC-001 habitat, ARC-002 cúpula da estufa, ARC-003 torre de comunicação) num arquivo só.
 *
 * Fica nas MESMAS coordenadas da cena atual (src/scene/MarsBase.ts): é só pôr o modelo na origem
 * e os obstáculos, postos e entradas (POSTS, ENTRANCES, PROBLEM_SPOTS) continuam valendo.
 *
 * Peças que o jogo muda conforme o estado têm nome fixo:
 * - material "window": janelas (acendem à noite);
 * - "alarm_light" (material "alarm"): luz de alarme no topo da torre;
 * - "antenna_tip" (material "antenna_tip"): ponta da antena, pisca com mensagem da Terra;
 * - "plant_N" (material "plant"): plantas da estufa (murcham com pouca vida);
 * - "hatch_door": porta do habitat, em ENTRANCES.habitat;
 * - "dish": grupo da antena parabólica (clipe "dish_scan" gira devagar).
 *
 * Texturas desenhadas por código (src/models/textures.ts), embutidas no .glb: painéis e rebites no casco,
 * poeira na parte de baixo, faixas de perigo no degrau e no rodapé da torre e plaquinhas com o nome dos módulos.
 * A torre agora fica no eixo do habitat (z = 0): o obstáculo dela na cena passa de z = -0,6 para z = 0.
 */

interface Tex {
  hull: THREE.Texture;
  box: THREE.Texture;
  hazard: THREE.Texture;
  bolt: THREE.Texture;
  labels: THREE.Texture;
}

/** Plaquinha com nome (atlas LABELS), olhando para +Z do grupo. */
function label(parent: THREE.Object3D, tex: Tex, text: string, w: number, h: number, pos: V3, rot: V3 = [0, 0, 0]): void {
  mk(parent, labelGeometry(LABELS.indexOf(text), w, h), 0xffffff, { name: `label_${text.replace(/\s/g, '_').toLowerCase()}`, pos, rot, outline: 0, mat: { name: 'label', map: tex.labels, alphaTest: 0.5 } });
}

const MODULE_X = [-6, -2.2, 1.6, 5.4];
const MOD_Y = 2.1;
const HALF_W = 1.45; // meia-largura (Z)
const HALF_H = 1.4; // meia-altura (Y)
const MOD_LEN = 3.4;
const HATCH_X = 1.6; // ENTRANCES.habitat.x
const DOME_C: V3 = [-1.5, 0, -4.6];
const DOME_R = 3.6;
const DOME_BASE = 0.4;
/** Torre no mesmo eixo do habitat (z = 0) e da mesma largura dos módulos. */
const TOWER: V3 = [7.4, 0, 0];
const TOWER_W = 2.9;

export interface MarsStationModel {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
}

/** Anel de seção "quadrado arredondado" (moldura laranja das pontas e da porta), olhando para +Z. */
export function squircleRing(outerW: number, outerH: number, band: number, depth: number): THREE.BufferGeometry {
  const pts = (a: number, b: number) => {
    const out: THREE.Vector2[] = [];
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      out.push(new THREE.Vector2(a * Math.sign(c) * Math.abs(c) ** 0.5, b * Math.sign(s) * Math.abs(s) ** 0.5));
    }
    return out;
  };
  const shape = new THREE.Shape(pts(outerW, outerH));
  shape.holes.push(new THREE.Path(pts(outerW - band, outerH - band).reverse()));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 40 });
  g.translate(0, 0, -depth / 2);
  return clean(g);
}

/** Placa plana de seção "quadrado arredondado", olhando para +Z (vão escuro da porta). */
export function squirclePlate(w: number, h: number, depth: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    pts.push(new THREE.Vector2(w * Math.sign(c) * Math.abs(c) ** 0.5, h * Math.sign(s) * Math.abs(s) ** 0.5));
  }
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth, bevelEnabled: false, curveSegments: 40 });
  g.translate(0, 0, -depth / 2);
  return clean(g);
}

/** Janela com moldura escura, olhando para +Z do grupo. */
export function windowUnit(parent: THREE.Object3D, name: string, w: number, h: number, pos: V3, rot: V3 = [0, 0, 0]): void {
  const g = group(parent, name, pos, rot);
  mk(g, rbox(w + 0.16, h + 0.16, 0.12, 0.1), C.dark, { name: `${name}_frame`, outline: 0.04 });
  mk(g, rbox(w, h, 0.1, 0.07), C.window, { name: `${name}_pane`, pos: [0, 0, 0.025], outline: 0, mat: { name: 'window', glow: 0.25 } });
  // reflexo: faixa clara na diagonal, como no visor do astronauta
  mk(g, rbox(w * 0.18, h * 0.8, 0.02, 0.01), 0xfff3d6, { name: `${name}_shine`, pos: [-w * 0.22, 0, 0.08], rot: [0, 0, -0.5], outline: 0, mat: { glow: 0.5 } });
}

function buildHabitat(root: THREE.Object3D, tex: Tex): void {
  const hab = group(root, 'habitat');
  const tube = roundedTube(HALF_W, HALF_H, MOD_LEN, 0.24);
  tubeUV(tube, MOD_LEN);
  const rib = roundedTube(HALF_W + 0.025, HALF_H + 0.025, 0.12, 0.04);
  const collar = roundedTube(HALF_W + 0.11, HALF_H + 0.11, 0.5, 0.1);
  const legGeo = cyl(0.07, 0.09, 0.72, 10);
  const footGeo = cyl(0.19, 0.22, 0.08, 14);

  MODULE_X.forEach((x, i) => {
    const mod = group(hab, `module_${i}`, [x, 0, 0]);
    mk(mod, tube, C.hull, { name: `module_${i}_hull`, pos: [0, MOD_Y, 0], outline: 0.025, mat: { map: tex.hull } });
    label(mod, tex, LABELS[i], 0.8, 0.3, [x === HATCH_X ? -0.9 : 0, MOD_Y + 0.8, 1.415], [-0.32, 0, 0]);
    for (const dx of [-0.95, 0.95]) mk(mod, rib, C.hull2, { name: `module_${i}_rib`, pos: [dx, MOD_Y, 0], outline: 0 });
    // pernas com sapatas e travessa
    for (const lx of [-1.15, 1.15]) {
      for (const lz of [-0.9, 0.9]) {
        mk(mod, legGeo, C.tech, { name: `module_${i}_leg`, pos: [lx, 0.4, lz], outline: 0.04 });
        mk(mod, footGeo, C.dark, { name: `module_${i}_foot`, pos: [lx, 0.04, lz], outline: 0.04 });
      }
    }
    for (const lz of [-0.9, 0.9]) mkBeam(mod, [-1.15, 0.42, lz], [1.15, 0.42, lz], 0.08, C.tech, { name: `module_${i}_brace`, outline: 0 });
    // janelas da frente (o módulo da porta tem a escotilha no lugar)
    if (x !== HATCH_X) for (const wx of [-0.75, 0.75]) windowUnit(mod, `module_${i}_window_${wx > 0 ? 'r' : 'l'}`, 0.66, 0.42, [wx, MOD_Y + 0.35, HALF_W - 0.02]);
    // janelas de trás (lado da estufa)
    windowUnit(mod, `module_${i}_window_back`, 0.66, 0.42, [0, MOD_Y + 0.35, -HALF_W + 0.02], [0, Math.PI, 0]);
  });

  // colares laranja nas juntas e na ponta esquerda
  for (const cx of [-4.1, -0.3, 3.5, -7.35]) mk(hab, collar, C.accent, { name: 'habitat_collar', pos: [cx, MOD_Y, 0], outline: 0.02 });

  // ponta esquerda: moldura laranja e escotilha redonda, como na referência do time
  const endX = MODULE_X[0] - MOD_LEN / 2;
  const end = group(hab, 'habitat_end', [endX - 0.01, MOD_Y, 0], [0, -Math.PI / 2, 0]);
  mk(end, squircleRing(1.05, 1.0, 0.16, 0.08), C.accent, { name: 'habitat_end_frame', outline: 0 });
  mk(end, clean(new THREE.TorusGeometry(0.42, 0.08, 10, 28)), C.dark, { name: 'habitat_end_porthole', pos: [0, 0.15, 0.03], outline: 0 });
  mk(end, cyl(0.38, 0.38, 0.05, 28).rotateX(Math.PI / 2), C.window, { name: 'habitat_end_glass', pos: [0, 0.15, 0.02], outline: 0, mat: { name: 'window', glow: 0.25 } });

  // escotilha de entrada (ENTRANCES.habitat), com moldura laranja e luz ciano
  const hatch = group(hab, 'hatch', [HATCH_X, 0, 0]);
  mk(hatch, rboxUV(1.5, 2.3, 1.0, 0.2), C.hull, { name: 'hatch_body', pos: [0, 1.15, 1.35], outline: 0.03, mat: { map: tex.box } });
  label(hatch, tex, 'AIRLOCK', 0.74, 0.19, [0, 2.08, 1.87]);
  mk(hatch, rbox(1.56, 0.16, 1.06, 0.06), C.accent, { name: 'hatch_roof', pos: [0, 2.28, 1.35], outline: 0 });
  mk(hatch, squirclePlate(0.4, 0.66, 0.04), PALETTE.shadow, { name: 'hatch_door', pos: [0, 0.95, 1.86], outline: 0 });
  mk(hatch, squircleRing(0.52, 0.78, 0.13, 0.08), C.accent, { name: 'hatch_frame', pos: [0, 0.95, 1.87], outline: 0 });
  mk(hatch, rbox(0.12, 0.38, 0.06, 0.03), C.dark, { name: 'hatch_handle', pos: [0.22, 0.9, 1.9], outline: 0 });
  mk(hatch, rbox(0.56, 0.09, 0.06, 0.04), C.glow, { name: 'hatch_light', pos: [0, 1.86, 1.87], outline: 0, mat: { glow: 0.9 } });
  for (const sx of [-0.62, 0.62]) mk(hatch, rbox(0.08, 0.3, 0.05, 0.03), C.glow, { name: 'hatch_side_light', pos: [sx, 1.2, 1.86], outline: 0, mat: { glow: 0.9 } });
  mk(hatch, scaleUV(rboxUV(1.1, 0.1, 0.42, 0.04), 3), 0xffffff, { name: 'hatch_step', pos: [0, 0.05, 2.02], outline: 0.03, mat: { map: tex.hazard } });

  // cano no alto, por trás, e caixas de equipamento no teto
  const pipe = cyl(0.08, 0.08, 13.6, 10).rotateZ(Math.PI / 2);
  mk(hab, pipe, C.tech, { name: 'habitat_pipe', pos: [-0.6, 3.42, -1.05], outline: 0 });
  for (const px of [-6.6, -3.0, 0.8, 4.4]) mk(hab, rbox(0.14, 0.14, 0.26, 0.04), C.dark, { name: 'habitat_pipe_clamp', pos: [px, 3.42, -1.05], outline: 0 });
  mk(hab, rbox(1.0, 0.36, 0.8, 0.1), C.hull2, { name: 'habitat_roof_box', pos: [-6.2, 3.56, 0.25], outline: 0.04 });
  mk(hab, rbox(0.5, 0.06, 0.06, 0.03), C.glow, { name: 'habitat_roof_light', pos: [-6.2, 3.58, 0.66], outline: 0, mat: { glow: 0.9 } });
  mk(hab, cyl(0.3, 0.34, 0.3, 16), C.hull2, { name: 'habitat_vent', pos: [-2.4, 3.52, 0.3], outline: 0.04 });
  mk(hab, cyl(0.22, 0.22, 0.08, 16), C.dark, { name: 'habitat_vent_top', pos: [-2.4, 3.7, 0.3], outline: 0 });
  mk(hab, rbox(0.9, 0.3, 0.7, 0.1), C.hull2, { name: 'habitat_roof_box', pos: [4.8, 3.55, 0.2], outline: 0.04 });
  mk(hab, rbox(0.28, 0.08, 0.06, 0.03), C.accent, { name: 'habitat_roof_tag', pos: [4.8, 3.58, 0.56], outline: 0 });
}

function buildDome(root: THREE.Object3D, tex: Tex): void {
  const dome = group(root, 'greenhouse_dome', DOME_C);
  const baseGeo = scaleUV(new THREE.CylinderGeometry(DOME_R + 0.15, DOME_R + 0.28, DOME_BASE, 44), 16);
  mk(dome, baseGeo, C.tech, { name: 'dome_base', pos: [0, DOME_BASE / 2, 0], outline: 0.015, mat: { map: tex.bolt } });
  mk(dome, cyl(DOME_R + 0.08, DOME_R + 0.08, 0.14, 44, true), C.accent, { name: 'dome_band', pos: [0, DOME_BASE - 0.02, 0], outline: 0 });
  mk(dome, cyl(DOME_R, DOME_R, 0.02, 44), C.hull2, { name: 'dome_floor', pos: [0, DOME_BASE + 0.005, 0], outline: 0 });

  // vidro (meia esfera) e treliça geodésica por cima
  const glass = new THREE.SphereGeometry(DOME_R, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  mk(dome, clean(glass), C.glass, { name: 'dome_glass', pos: [0, DOME_BASE, 0], outline: 0, mat: { name: 'dome_glass', opacity: 0.28 } });
  const ico = new THREE.IcosahedronGeometry(DOME_R + 0.02, 2);
  const p = ico.getAttribute('position');
  const key = (v: THREE.Vector3) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
  const seen = new Set<string>();
  const segs: [THREE.Vector3, THREE.Vector3][] = [];
  for (let t = 0; t < p.count; t += 3) {
    const tri = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, t + k));
    for (let k = 0; k < 3; k++) {
      const a = tri[k];
      const b = tri[(k + 1) % 3];
      if (a.y < -0.01 || b.y < -0.01) continue;
      const id = [key(a), key(b)].sort().join('|');
      if (seen.has(id)) continue;
      seen.add(id);
      segs.push([a.clone().setY(a.y + DOME_BASE), b.clone().setY(b.y + DOME_BASE)]);
    }
  }
  mk(dome, rodsGeometry(segs, 0.04, 5), C.hull, { name: 'dome_frame', outline: 0 });
  mk(dome, clean(new THREE.TorusGeometry(DOME_R, 0.07, 6, 48).rotateX(Math.PI / 2)), C.hull, { name: 'dome_ring', pos: [0, DOME_BASE + 0.02, 0], outline: 0 });
  // escotilha da cúpula para o habitat (ligação)
  mk(dome, rbox(1.3, 1.9, 1.2, 0.2), C.hull, { name: 'dome_airlock', pos: [-0.7, 1.15, 3.1], outline: 0.03 });
  mk(dome, rbox(1.36, 0.14, 1.26, 0.06), C.accent, { name: 'dome_airlock_band', pos: [-0.7, 1.95, 3.1], outline: 0 });

  // canteiros e plantas (mesmas quantidades da cena atual: 16 plantas)
  mk(dome, cyl(1.05, 1.1, 0.4, 28), C.hull2, { name: 'dome_bed_center', pos: [0, DOME_BASE + 0.2, 0], outline: 0.03 });
  mk(dome, cyl(0.95, 0.95, 0.06, 28), C.bed, { name: 'dome_bed_center_soil', pos: [0, DOME_BASE + 0.41, 0], outline: 0 });
  const bedGeo = rbox(1.25, 0.34, 0.6, 0.08);
  const soilGeo = rbox(1.1, 0.06, 0.46, 0.03);
  const bush = clean(new THREE.IcosahedronGeometry(1, 1));
  const plants: [number, number, number][] = [];
  const BEDS = 6;
  for (let i = 0; i < BEDS; i++) {
    const a = (i / BEDS) * Math.PI * 2 + 0.3;
    const r = 2.35;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    mk(dome, bedGeo, C.hull2, { name: `dome_bed_${i}`, pos: [bx, DOME_BASE + 0.17, bz], rot: [0, -a + Math.PI / 2, 0], outline: 0.04 });
    mk(dome, soilGeo, C.bed, { name: `dome_bed_${i}_soil`, pos: [bx, DOME_BASE + 0.35, bz], rot: [0, -a + Math.PI / 2, 0], outline: 0 });
    for (const t of [-0.3, 0.3]) {
      const tx = -Math.sin(a) * t;
      const tz = Math.cos(a) * t;
      plants.push([bx + tx, DOME_BASE + 0.58, bz + tz]);
    }
  }
  plants.push([0.35, DOME_BASE + 0.72, 0.25], [-0.4, DOME_BASE + 0.7, 0.2], [0, DOME_BASE + 0.72, -0.4], [0.05, DOME_BASE + 1.05, 0.0]);
  plants.forEach(([x, y, z], i) => {
    const s = i === plants.length - 1 ? 0.42 : 0.26 + ((i * 37) % 10) * 0.012;
    mk(dome, bush, C.plant, { name: `plant_${i}`, pos: [x, y, z], scale: [s * 1.1, s, s * 1.1], rot: [0, i * 1.3, 0], outline: 0.05, mat: { name: 'plant' } });
  });
}

function buildTower(root: THREE.Object3D, tex: Tex): THREE.Group {
  const tw = group(root, 'comm_tower', TOWER);
  const hw = TOWER_W / 2;
  mk(tw, rboxUV(TOWER_W, 3.6, TOWER_W, 0.24), C.hull, { name: 'tower_base', pos: [0, 1.8, 0], outline: 0.025, mat: { map: tex.box } });
  mk(tw, scaleUV(rboxUV(TOWER_W + 0.14, 0.3, TOWER_W + 0.14, 0.1), 7), 0xffffff, { name: 'tower_skirt', pos: [0, 0.15, 0], outline: 0.02, mat: { map: tex.hazard } });
  mk(tw, rbox(TOWER_W + 0.08, 0.26, TOWER_W + 0.08, 0.1), C.accent, { name: 'tower_band', pos: [0, 2.55, 0], outline: 0 });
  emblem(tw, 'tower_emblem', 0.55, [0, 1.45, hw + 0.02]);
  label(tw, tex, 'JZ-1', 0.8, 0.3, [0, 2.2, hw + 0.015]);
  mk(tw, rbox(TOWER_W + 0.08, 0.14, TOWER_W + 0.08, 0.06), C.accent, { name: 'tower_band_top', pos: [0, 3.5, 0], outline: 0 });
  for (let i = 0; i < 3; i++) mk(tw, rbox(0.14, 0.14, 0.05, 0.04), C.glow, { name: 'tower_status_light', pos: [1.0, 1.05 + i * 0.26, hw + 0.01], outline: 0, mat: { glow: 0.9 } });
  for (const wz of [-0.78, 0.78]) windowUnit(tw, `tower_window_${wz > 0 ? 'f' : 'b'}`, 0.5, 0.36, [hw + 0.01, 1.55, wz], [0, Math.PI / 2, 0]);
  mk(tw, rbox(0.9, 0.5, 0.08, 0.06), C.hull2, { name: 'tower_panel', pos: [-0.8, 1.0, hw + 0.02], outline: 0 });
  for (let i = 0; i < 3; i++) mk(tw, rbox(0.6, 0.05, 0.04, 0.02), C.dark, { name: 'tower_panel_slot', pos: [-0.8, 0.88 + i * 0.12, hw + 0.06], outline: 0 });

  // escada de serviço no lado +X (perto de PROBLEM_SPOTS.antenna), do chão até o teto da base
  {
    const lx = hw + 0.13;
    const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const segs: [THREE.Vector3, THREE.Vector3][] = [];
    for (const z of [-0.22, 0.22]) {
      segs.push([v3(lx, 0.25, z), v3(lx, 3.95, z)]);
      for (const y of [0.6, 2.0, 3.3]) segs.push([v3(hw - 0.02, y, z), v3(lx, y, z)]);
    }
    for (let y = 0.45; y < 3.7; y += 0.3) segs.push([v3(lx, y, -0.22), v3(lx, y, 0.22)]);
    mk(tw, rodsGeometry(segs, 0.025, 6), C.tech, { name: 'tower_ladder', outline: 0 });
  }

  mk(tw, rboxUV(2.0, 2.0, 2.0, 0.2), C.hull2, { name: 'tower_mid', pos: [0, 4.6, 0], outline: 0.03, mat: { map: tex.box } });
  mk(tw, rbox(2.04, 0.14, 2.04, 0.06), C.accent, { name: 'tower_mid_band', pos: [0, 5.35, 0], outline: 0 });
  for (const wx of [-0.45, 0.45]) windowUnit(tw, `tower_mid_window_${wx > 0 ? 'r' : 'l'}`, 0.4, 0.5, [wx, 4.5, 1.01]);
  label(tw, tex, 'COM', 0.56, 0.21, [0, 5.07, 1.012]);
  mk(tw, rbox(TOWER_W, 0.16, TOWER_W, 0.06), C.dark, { name: 'tower_platform', pos: [0, 5.68, 0], outline: 0.02 });

  // grade da plataforma e treliça do mastro (hastes finas: sem contorno, cor escura)
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const rail: [THREE.Vector3, THREE.Vector3][] = [];
  const e = TOWER_W / 2 - 0.08;
  const corners = [v(-e, 0, -e), v(e, 0, -e), v(e, 0, e), v(-e, 0, e)];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    rail.push([a.clone().setY(6.1), b.clone().setY(6.1)]);
    for (const t of [0, 0.25, 0.5, 0.75]) {
      const pt = a.clone().lerp(b, t);
      rail.push([pt.clone().setY(5.76), pt.clone().setY(6.1)]);
    }
  }
  mk(tw, rodsGeometry(rail, 0.03, 5), C.tech, { name: 'tower_railing', outline: 0 });

  const m = 0.38;
  const y0 = 5.76;
  const y1 = 9.6;
  const lattice: [THREE.Vector3, THREE.Vector3][] = [];
  const mc = [v(-m, 0, -m), v(m, 0, -m), v(m, 0, m), v(-m, 0, m)];
  for (const c of mc) lattice.push([c.clone().setY(y0), c.clone().setY(y1)]);
  const levels = 4;
  for (let l = 0; l <= levels; l++) {
    const y = y0 + ((y1 - y0) * l) / levels;
    for (let i = 0; i < 4; i++) {
      const a = mc[i];
      const b = mc[(i + 1) % 4];
      lattice.push([a.clone().setY(y), b.clone().setY(y)]);
      if (l < levels) {
        const yn = y0 + ((y1 - y0) * (l + 1)) / levels;
        lattice.push([(l % 2 ? a : b).clone().setY(y), (l % 2 ? b : a).clone().setY(yn)]);
      }
    }
  }
  mk(tw, rodsGeometry(lattice, 0.045, 6), C.dark, { name: 'tower_mast', outline: 0 });
  mk(tw, rbox(1.0, 0.14, 1.0, 0.05), C.dark, { name: 'tower_top', pos: [0, 9.65, 0], outline: 0.03 });
  mk(tw, cyl(0.2, 0.25, 0.16, 16), C.hull2, { name: 'alarm_base', pos: [0, 9.8, 0], outline: 0.04 });
  mk(tw, sphere(0.27, 18, 12), C.alarmOff, { name: 'alarm_light', pos: [0, 10.02, 0], outline: 0.04, mat: { name: 'alarm' } });
  const whips: [THREE.Vector3, THREE.Vector3][] = [
    [v(0.38, 9.7, 0.38), v(0.38, 10.7, 0.38)],
    [v(-0.38, 9.7, -0.38), v(-0.38, 10.4, -0.38)],
  ];
  mk(tw, rodsGeometry(whips, 0.02, 5), C.dark, { name: 'tower_whips', outline: 0 });
  mk(tw, sphere(0.05, 8, 6), C.accent, { name: 'tower_whip_tip', pos: [0.38, 10.72, 0.38], outline: 0 });
  mk(tw, sphere(0.05, 8, 6), C.accent, { name: 'tower_whip_tip', pos: [-0.38, 10.42, -0.38], outline: 0 });

  // antena parabólica: o grupo "dish" gira no eixo Y (clipe "dish_scan")
  const dish = group(tw, 'dish', [0, 7.6, 0]);
  mkBeam(dish, [0, 0, 0], [1.0, 0.12, 0], 0.11, C.hull2, { name: 'dish_arm', outline: 0.03 });
  mk(dish, sphere(0.13, 14, 10), C.dark, { name: 'dish_gimbal', pos: [1.02, 0.12, 0], outline: 0.04 });
  const refl = group(dish, 'dish_reflector', [1.02, 0.12, 0], [0, 0, -0.95]);
  const R = 0.85;
  const f = 0.6;
  const prof: THREE.Vector2[] = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const r = (R * i) / N;
    prof.push(new THREE.Vector2(Math.max(r, 0.001), 0.1 + (r * r) / (4 * f)));
  }
  const rimY = 0.1 + (R * R) / (4 * f);
  prof.push(new THREE.Vector2(R + 0.04, rimY + 0.01));
  for (let i = N; i >= 0; i--) {
    const r = (R * i) / N;
    prof.push(new THREE.Vector2(Math.max(r * 0.97, 0.001), 0.04 + (r * r) / (4 * f)));
  }
  mk(refl, smooth(new THREE.LatheGeometry(prof.reverse(), 32)), C.hull, { name: 'dish_bowl', outline: 0.03 });
  mk(refl, cyl(0.12, 0.14, 0.08, 14), C.accent, { name: 'dish_hub', pos: [0, 0.12, 0], outline: 0 });
  const feed: [THREE.Vector3, THREE.Vector3][] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    feed.push([v(Math.cos(a) * R * 0.95, rimY, Math.sin(a) * R * 0.95), v(0, 0.1 + f, 0)]);
  }
  mk(refl, rodsGeometry(feed, 0.015, 4), C.dark, { name: 'dish_feed_struts', outline: 0 });
  mk(refl, sphere(0.1, 12, 8), PALETTE.tech, { name: 'antenna_tip', pos: [0, 0.1 + f, 0], outline: 0.04, mat: { name: 'antenna_tip' } });
  return dish;
}

/** Clipe "dish_scan": a parabólica varre ±20° devagar (8 s, em loop). Só visual. */
function dishScanClip(): THREE.AnimationClip {
  const times = [0, 2, 4, 6, 8];
  const angles = [0, 0.35, 0, -0.35, 0];
  const q = new THREE.Quaternion();
  const values: number[] = [];
  for (const a of angles) values.push(...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a).toArray());
  return new THREE.AnimationClip('dish_scan', 8, [new THREE.QuaternionKeyframeTrack('dish.quaternion', times, values)]);
}

export function createMarsStation(): MarsStationModel {
  const root = new THREE.Group();
  root.name = 'mars_station';
  const tex: Tex = { hull: hullTexture(), box: boxTexture(), hazard: hazardTexture(), bolt: boltTexture(), labels: labelTexture() };
  buildHabitat(root, tex);
  buildDome(root, tex);
  buildTower(root, tex);
  return { root, clips: [dishScanClip()] };
}
