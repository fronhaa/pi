import * as THREE from 'three';
import { COLORS as C, clean, cyl, emblem, group, merge, mk, mkBeam, rbox, rboxUV, rodsGeometry, roundedTube, sphere, type V3 } from './common';
import { squirclePlate, squircleRing, windowUnit } from './MarsStation';
import { boxTexture, hazardTexture, hullTexture, LABELS, labelGeometry, labelTexture, scaleUV, signTexture, tubeUV } from './textures';

/**
 * Bloco "Base da Estufa" (BASE-EST): segundo bloco da base, o mesmo na Lua e em Marte.
 * Um cilindro curto (mesmo casco, mesmas portas de acoplamento e mesma porta de 1,95 m da Base de Pesquisa)
 * ligado por um corredor a uma estufa em cúpula redonda, com plantas que balançam (INTERPRETADO a partir
 * dos habitats de superfície da NASA e dos experimentos de plantas em microgravidade/Marte).
 *
 * Referencial: origem no chão, no centro do cilindro. Eixo comprido em X; frente (porta) em +Z; estufa atrás (-Z).
 * Tamanho: ~4,9 m de porta a porta no cilindro; a cúpula tem 6,6 m de diâmetro e fica a ~6 m atrás do eixo.
 *
 * Para ligar blocos: "port_a" (ponta -X) e "port_b" (ponta +X), na mesma altura e do mesmo tamanho dos da Base de Pesquisa.
 *
 * Peças com nome fixo:
 * - "hatch_door": porta de entrada, no chão (1,0 x 1,95 m). O astronauta entra em (0; 0; 4,1) e some;
 * - material "window": janelas; material "base_lights": faixas de LED; "alarm_light" (material "alarm"): luz de alerta;
 * - "dome_glass" (material "dome_glass"): vidro da cúpula;
 * - "plant_N" (material "plant"): folhas de cada planta (o jogo pode murchar/pintar); "fruit_N" (material "fruit");
 *   "plant_pivot_N": grupo de cada planta, na base, que o clipe "plants_sway" balança (3 s, em laço);
 * - "greenhouse_entry": ponto no chão dentro da cúpula, na frente do corredor (para a tripulação aparecer ali).
 */

export interface GreenhouseBaseModel {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
}

const R = 1.6; // raio do casco (igual ao da Base de Pesquisa)
const Y0 = 2.65; // altura do eixo
const LC = 3.4; // parte reta do cilindro (a Base de Pesquisa tem 5,0)
const CAP = 0.75;
const HALF = LC / 2 + CAP; // 2,45: portas de acoplamento
const DOOR_H = 1.95;
const DOOR_W = 1.0;
const SHAFT_R = 0.85;
const SHAFT_Z = 2.35;
const SHAFT_H = 3.3;
export const LIGHTS = { name: 'base_lights', glow: 0.95 };

// estufa
const DOME_R = 3.3;
const FLOOR = Y0 - R; // 1,05: piso da cúpula na altura do piso do cilindro
const LINK_Y = FLOOR + 1.2; // centro do corredor
const LINK_HW = 0.75; // meia-largura do corredor
const LINK_HH = 1.1; // meia-altura do corredor
const LINK_LEN = 1.7; // trecho do corredor visível entre o casco e o vidro
const HULL_BACK_Z = -Math.sqrt(R * R - (LINK_Y - Y0) ** 2);
const SHELL_DX = Math.sqrt(DOME_R * DOME_R - (LINK_Y - FLOOR) ** 2); // raio do vidro na altura do corredor
const SHELL_Z = HULL_BACK_Z - LINK_LEN;
const DOME_Z = SHELL_Z - SHELL_DX; // centro da cúpula

/** Texturas que os blocos da base compartilham (peças comuns: pernas, tubo de acesso, portas de acoplamento). */
export interface BlockTex {
  hull: THREE.Texture;
  box: THREE.Texture;
  hazard: THREE.Texture;
  labels: THREE.Texture;
}
interface Tex extends BlockTex {
  estufa: THREE.Texture;
}

export function label(parent: THREE.Object3D, tex: BlockTex, text: string, w: number, h: number, pos: V3, rot: V3 = [0, 0, 0]): void {
  mk(parent, labelGeometry(LABELS.indexOf(text), w, h), 0xffffff, {
    name: `label_${text.toLowerCase()}`,
    pos,
    rot,
    outline: 0,
    mat: { name: 'label', map: tex.labels, alphaTest: 0.5 },
  });
}

function onHull(x: number, dy: number, side: 1 | -1, out = 0): { pos: V3; rot: V3 } {
  const z = Math.sqrt(R * R - dy * dy) + out;
  const a = Math.asin(dy / R);
  return side > 0 ? { pos: [x, Y0 + dy, z], rot: [-a, 0, 0] } : { pos: [x, Y0 + dy, -z], rot: [a, Math.PI, 0] };
}

// ---------- casco ----------

function hullGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.001, R * Math.sin(a)), -(LC / 2 + CAP * Math.cos(a))));
  }
  for (let i = N; i >= 0; i--) {
    const a = (i / N) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.001, R * Math.sin(a)), LC / 2 + CAP * Math.cos(a)));
  }
  const g = new THREE.LatheGeometry(pts, 56, Math.PI / 2);
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const around = uv.getX(i);
    uv.setXY(i, ((p.getY(i) + HALF) / (2 * HALF)) * 1.5, around);
  }
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Porta de acoplamento (escotilha de ~1,96 m) na ponta -X (s = -1) ou +X (s = 1), a `half` m do centro. Marcador "port_a" / "port_b". */
export function buildPort(hull: THREE.Object3D, root: THREE.Object3D, s: -1 | 1, half: number): void {
  const port = group(hull, s < 0 ? 'docking_port_a' : 'docking_port_b', [s * half, Y0, 0], [0, s < 0 ? -Math.PI / 2 : Math.PI / 2, 0]);
  mk(port, cyl(1.1, 1.18, 0.5, 40).rotateX(Math.PI / 2), C.dark, { name: 'port_collar', pos: [0, 0, 0], outline: 0.025 });
  mk(port, clean(new THREE.TorusGeometry(1.08, 0.07, 8, 48)), C.accent, { name: 'port_ring', pos: [0, 0, 0.25], outline: 0 });
  mk(port, cyl(0.98, 0.98, 0.06, 40).rotateX(Math.PI / 2), C.hull2, { name: 'port_hatch', pos: [0, 0, 0.25], outline: 0 });
  mk(port, clean(new THREE.TorusGeometry(0.5, 0.035, 6, 32)), C.tech, { name: 'port_hatch_ring', pos: [0, 0, 0.29], outline: 0 });
  mk(port, rbox(0.7, 0.08, 0.06, 0.03), C.dark, { name: 'port_handle', pos: [0, 0, 0.3], outline: 0 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    mk(port, rbox(0.08, 0.08, 0.1, 0.02), C.tech, { name: 'port_latch', pos: [Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0.26], outline: 0 });
  }
  const marker = new THREE.Object3D();
  marker.name = s < 0 ? 'port_a' : 'port_b';
  marker.position.set(s * (half + 0.25), Y0, 0);
  marker.rotation.y = s < 0 ? -Math.PI / 2 : Math.PI / 2;
  root.add(marker);
}

function buildHull(root: THREE.Object3D, tex: Tex): void {
  const hull = group(root, 'hull');
  mk(hull, hullGeometry(), C.hull, { name: 'hull_shell', pos: [0, Y0, 0], outline: 0.012, mat: { map: tex.hull } });
  const band = (x: number, w: number, color: number, dr: number, name: string) => {
    const g = cyl(R + dr, R + dr, w, 56);
    g.rotateZ(Math.PI / 2);
    mk(hull, g, color, { name, pos: [x, Y0, 0], outline: 0 });
  };
  for (const s of [-1, 1]) {
    band(s * (LC / 2 - 0.1), 0.26, C.dark, 0.04, 'hull_band_dark');
    band(s * (LC / 2 - 0.28), 0.08, C.accent, 0.03, 'hull_band_orange');
  }

  // portas de acoplamento (iguais às da Base de Pesquisa)
  for (const s of [-1, 1] as const) buildPort(hull, root, s, HALF);

  // janelas (frente, dos dois lados da eclusa; trás, dos dois lados do corredor)
  for (const side of [1, -1] as const) {
    [-1.02, 1.02].forEach((x, i) => {
      const o = onHull(x, 0.4, side);
      windowUnit(hull, `window_${side > 0 ? 'front' : 'back'}_${i}`, 0.34, 0.42, o.pos, o.rot);
    });
  }
  // faixas de LED nas laterais
  for (const [x, side] of [[-1.0, 1], [1.0, 1], [-1.0, -1], [1.0, -1]] as [number, 1 | -1][]) {
    const o = onHull(x, -0.72, side, 0.01);
    mk(hull, rbox(0.8, 0.07, 0.04, 0.02), 0xe9fbff, { name: 'hull_light', pos: o.pos, rot: o.rot, outline: 0, mat: LIGHTS });
  }
  // emblema (esquerda) e plaquinha "ESTUFA" (direita), na frente
  const e = onHull(-1.0, -0.25, 1, 0.02);
  emblem(hull, 'base_emblem', 0.3, e.pos, e.rot);
  const l = onHull(1.11, -0.3, 1, 0.01);
  mk(hull, new THREE.PlaneGeometry(0.54, 0.2), 0xffffff, { name: 'label_estufa', pos: l.pos, rot: l.rot, outline: 0, mat: { name: 'label_estufa', map: tex.estufa, alphaTest: 0.5 } });
}

// ---------- pernas e barriga ----------

export function buildLegs(root: THREE.Object3D, tex: BlockTex): void {
  const legs = group(root, 'legs');
  let n = 0;
  for (const lx of [-1.4, 1.4]) {
    for (const lz of [-1, 1]) {
      const top: V3 = [lx, Y0 - 0.95, lz * 1.28];
      const foot: V3 = [lx * 1.1, 0.2, lz * 2.15];
      const knee: V3 = [lx * 1.08, 0.62, lz * 1.9];
      mkBeam(legs, top, foot, 0.13, C.tech, { name: `leg_${n}_strut`, outline: 0.03 });
      mkBeam(legs, [lx * 0.85, 1.05, lz * 0.35], knee, 0.08, C.dark, { name: `leg_${n}_brace`, outline: 0.03 });
      const mid: V3 = [(top[0] + foot[0]) / 2, (top[1] + foot[1]) / 2, (top[2] + foot[2]) / 2];
      const d = new THREE.Vector3(foot[0] - top[0], foot[1] - top[1], foot[2] - top[2]).normalize().multiplyScalar(0.17);
      mkBeam(legs, [mid[0] - d.x, mid[1] - d.y, mid[2] - d.z], [mid[0] + d.x, mid[1] + d.y, mid[2] + d.z], 0.19, C.accent, { name: `leg_${n}_damper`, outline: 0.03 });
      mk(legs, sphere(0.1, 12, 8), C.dark, { name: `leg_${n}_ankle`, pos: [foot[0], 0.2, foot[2]], outline: 0.04 });
      mk(legs, cyl(0.3, 0.36, 0.1, 20), C.dark, { name: `leg_${n}_pad`, pos: [foot[0], 0.05, foot[2]], outline: 0.03 });
      n++;
    }
  }
  // barriga: baia de equipamentos e dois tanques d'água (alimentam a estufa)
  mk(legs, rboxUV(2.4, 0.42, 1.5, 0.12), C.hull2, { name: 'equipment_bay', pos: [0, 1.0, 0], outline: 0.03, mat: { map: tex.box } });
  for (const tz of [-0.5, 0.5]) {
    const t = cyl(0.28, 0.28, 1.9, 18);
    t.rotateZ(Math.PI / 2);
    mk(legs, t, C.hull, { name: 'tank', pos: [0, 0.68, tz], outline: 0.03 });
    for (const sx of [-0.95, 0.95]) mk(legs, sphere(0.28, 16, 10), C.hull, { name: 'tank_end', pos: [sx, 0.68, tz], scale: [0.45, 1, 1], outline: 0.03 });
    for (const sx of [-0.5, 0.5]) {
      const strap = cyl(0.3, 0.3, 0.07, 18);
      strap.rotateZ(Math.PI / 2);
      mk(legs, strap, C.accent, { name: 'tank_strap', pos: [sx, 0.68, tz], outline: 0 });
    }
  }
}

// ---------- tubo de acesso (igual ao da Base de Pesquisa) ----------

export function buildAccessTower(root: THREE.Object3D, tex: BlockTex): void {
  const tw = group(root, 'access_tower');
  const body = scaleUV(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, SHAFT_H, 40, 1, true), 3);
  mk(tw, body, C.hull, { name: 'access_tower_body', pos: [0, SHAFT_H / 2, SHAFT_Z], outline: 0.02, mat: { map: tex.box } });
  mk(tw, clean(new THREE.SphereGeometry(SHAFT_R, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2)), C.hull, { name: 'access_tower_top', pos: [0, SHAFT_H, SHAFT_Z], scale: [1, 0.45, 1], outline: 0.025 });
  mk(tw, cyl(SHAFT_R + 0.04, SHAFT_R + 0.04, 0.22, 40), C.dark, { name: 'access_tower_band', pos: [0, SHAFT_H - 0.05, SHAFT_Z], outline: 0 });
  mk(tw, cyl(SHAFT_R + 0.03, SHAFT_R + 0.03, 0.07, 40), C.accent, { name: 'access_tower_stripe', pos: [0, 2.62, SHAFT_Z], outline: 0 });
  mk(tw, cyl(SHAFT_R + 0.06, SHAFT_R + 0.1, 0.16, 40), C.dark, { name: 'access_tower_skirt', pos: [0, 0.08, SHAFT_Z], outline: 0.02 });
  const neckY = Y0 + 0.25;
  const neck = roundedTube(0.62, 0.7, 1.1, 0.12);
  neck.rotateY(Math.PI / 2);
  mk(tw, neck, C.hull2, { name: 'access_tower_neck', pos: [0, neckY, 1.45], outline: 0.025 });
  const collar = roundedTube(0.68, 0.76, 0.12, 0.04);
  collar.rotateY(Math.PI / 2);
  mk(tw, collar, C.accent, { name: 'access_tower_neck_ring', pos: [0, neckY, 1.62], outline: 0 });
  for (const sx of [-1, 1]) {
    const g = group(tw, `access_tower_porthole_${sx > 0 ? 'r' : 'l'}`, [sx * (SHAFT_R - 0.02), 2.95, SHAFT_Z], [0, sx * (Math.PI / 2), 0]);
    mk(g, clean(new THREE.TorusGeometry(0.17, 0.045, 8, 24)), C.dark, { name: 'porthole_rim', outline: 0 });
    mk(g, cyl(0.16, 0.16, 0.04, 20).rotateX(Math.PI / 2), C.window, { name: 'porthole_glass', outline: 0, mat: { name: 'window', glow: 0.25 } });
  }

  const fz = SHAFT_Z + SHAFT_R + 0.08;
  const fh = DOOR_H + 0.5;
  mk(tw, rboxUV(DOOR_W + 0.5, fh, 0.58, 0.14), C.hull, { name: 'door_housing', pos: [0, fh / 2, fz - 0.25], outline: 0.025, mat: { map: tex.box } });
  mk(tw, rbox(DOOR_W + 0.56, 0.12, 0.64, 0.05), C.accent, { name: 'door_housing_cap', pos: [0, fh, fz - 0.25], outline: 0 });
  const doorY = 0.04 + DOOR_H / 2;
  mk(tw, squirclePlate(DOOR_W / 2, DOOR_H / 2, 0.04), 0x473c3a, { name: 'hatch_door', pos: [0, doorY, fz + 0.05], outline: 0 });
  mk(tw, squircleRing(DOOR_W / 2 + 0.12, DOOR_H / 2 + 0.12, 0.13, 0.08), C.accent, { name: 'hatch_frame', pos: [0, doorY, fz + 0.06], outline: 0 });
  mk(tw, rbox(0.08, 0.36, 0.06, 0.03), C.dark, { name: 'hatch_handle', pos: [DOOR_W / 2 - 0.16, doorY, fz + 0.1], outline: 0 });
  for (const sx of [-1, 1]) mk(tw, rbox(0.07, 0.6, 0.05, 0.02), 0xe9fbff, { name: 'hatch_side_light', pos: [sx * (DOOR_W / 2 + 0.2), doorY + 0.25, fz + 0.04], outline: 0, mat: LIGHTS });
  label(tw, tex, 'AIRLOCK', 0.74, 0.18, [0, DOOR_H + 0.3, fz + 0.045]);
  mk(tw, scaleUV(rboxUV(DOOR_W + 0.4, 0.05, 0.55, 0.02), 4), 0xffffff, { name: 'door_mat', pos: [0, 0.025, fz + 0.32], outline: 0.03, mat: { map: tex.hazard } });
  mk(tw, cyl(0.13, 0.16, 0.1, 14), C.dark, { name: 'alarm_base', pos: [0, SHAFT_H + 0.4, SHAFT_Z], outline: 0.04 });
  mk(tw, sphere(0.15, 16, 10), C.alarmOff, { name: 'alarm_light', pos: [0, SHAFT_H + 0.52, SHAFT_Z], outline: 0.04, mat: { name: 'alarm' } });
}

// ---------- teto: ventilação e caixa de equipamentos ----------

function buildRoof(root: THREE.Object3D): void {
  const roof = group(root, 'roof');
  const top = Y0 + R;
  for (const vx of [-1.0, -0.45]) {
    mk(roof, cyl(0.2, 0.24, 0.26, 16), C.hull2, { name: 'roof_vent', pos: [vx, top - 0.02, -0.15], outline: 0.04 });
    mk(roof, cyl(0.16, 0.16, 0.07, 16), C.dark, { name: 'roof_vent_top', pos: [vx, top + 0.14, -0.15], outline: 0 });
  }
  mk(roof, rbox(0.9, 0.3, 0.7, 0.08), C.hull2, { name: 'roof_box', pos: [0.95, top - 0.02, -0.1], outline: 0.04 });
  mk(roof, rbox(0.3, 0.05, 0.04, 0.015), 0xe9fbff, { name: 'roof_box_light', pos: [0.95, top + 0.02, 0.26], outline: 0, mat: LIGHTS });
  mk(roof, rbox(0.92, 0.05, 0.72, 0.02), C.accent, { name: 'roof_box_band', pos: [0.95, top + 0.08, -0.1], outline: 0 });
}

// ---------- corredor até a estufa ----------

function buildLink(root: THREE.Object3D, tex: Tex): void {
  const lk = group(root, 'greenhouse_link');
  const z0 = HULL_BACK_Z + 0.35; // começa dentro do casco
  const z1 = SHELL_Z + 0.3; // entra um pouco na cúpula
  const len = z0 - z1;
  const tube = roundedTube(LINK_HW, LINK_HH, len, 0.16);
  tubeUV(tube, len);
  mk(lk, tube, C.hull, { name: 'link_tube', pos: [0, LINK_Y, (z0 + z1) / 2], rot: [0, Math.PI / 2, 0], outline: 0.025, mat: { map: tex.hull } });
  // anéis laranja nas duas pontas
  const ring = () => roundedTube(LINK_HW + 0.07, LINK_HH + 0.07, 0.16, 0.05);
  mk(lk, ring(), C.accent, { name: 'link_ring_hull', pos: [0, LINK_Y, HULL_BACK_Z - 0.08], rot: [0, Math.PI / 2, 0], outline: 0 });
  mk(lk, ring(), C.accent, { name: 'link_ring_dome', pos: [0, LINK_Y, SHELL_Z + 0.08], rot: [0, Math.PI / 2, 0], outline: 0 });
  // faixas de LED e janelinha de cada lado
  for (const sx of [-1, 1]) {
    mk(lk, rbox(0.04, 0.07, 0.8, 0.02), 0xe9fbff, { name: 'link_light', pos: [sx * (LINK_HW + 0.01), LINK_Y - 0.5, (z0 + z1) / 2], outline: 0, mat: LIGHTS });
    windowUnit(lk, `link_window_${sx > 0 ? 'r' : 'l'}`, 0.4, 0.34, [sx * (LINK_HW + 0.01), LINK_Y + 0.2, (z0 + z1) / 2], [0, sx * (Math.PI / 2), 0]);
  }
  mk(lk, rbox(0.7, 0.05, 0.04, 0.02), 0xe9fbff, { name: 'link_light_top', pos: [0, LINK_Y + LINK_HH + 0.01, (z0 + z1) / 2], rot: [Math.PI / 2, 0, 0], outline: 0, mat: LIGHTS });
  // dois pilares sob o corredor
  for (const sx of [-1, 1]) {
    const pz = HULL_BACK_Z - 0.9;
    mk(lk, cyl(0.1, 0.13, LINK_Y - LINK_HH - 0.1, 12), C.tech, { name: 'link_post', pos: [sx * 0.55, (LINK_Y - LINK_HH) / 2, pz], outline: 0.03 });
    mk(lk, cyl(0.28, 0.32, 0.1, 18), C.dark, { name: 'link_post_pad', pos: [sx * 0.55, 0.05, pz], outline: 0.03 });
    mk(lk, cyl(0.15, 0.15, 0.1, 14), C.accent, { name: 'link_post_band', pos: [sx * 0.55, LINK_Y - LINK_HH - 0.2, pz], outline: 0 });
  }
}

// ---------- plantas ----------

/** Planta: caule e folhas achatadas em volta. Origem no chão do canteiro. 3 variantes. */
function plantGeometry(variant: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stemH = [0.3, 0.38, 0.24][variant];
  parts.push(cyl(0.025, 0.04, stemH, 7).translate(0, stemH / 2, 0));
  const n = [6, 7, 5][variant];
  const m = new THREE.Matrix4();
  const qy = new THREE.Quaternion();
  const qz = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const fwd = new THREE.Vector3(0, 0, 1);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + variant * 0.6;
    const tier = k % 2;
    const tilt = 0.35 + tier * 0.45;
    const len = 0.17 + (variant === 1 ? 0.04 : 0);
    qy.setFromAxisAngle(up, -a);
    qz.setFromAxisAngle(fwd, tilt);
    const q = qy.clone().multiply(qz);
    const y = stemH * (0.62 + 0.38 * tier) + 0.02;
    const r = 0.09 + 0.03 * (1 - tier);
    m.compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), q, new THREE.Vector3(len, 0.035, 0.1));
    parts.push(new THREE.SphereGeometry(1, 8, 6).applyMatrix4(m));
  }
  parts.push(new THREE.SphereGeometry(0.1, 9, 7).scale(1, 0.85, 1).translate(0, stemH + 0.04, 0));
  return merge(parts);
}

/** Pontos dos canteiros: arco aberto na frente (do corredor) para a tripulação passar. */
function bedPositions(): { x: number; z: number; a: number }[] {
  const out: { x: number; z: number; a: number }[] = [];
  const gap = 0.62;
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = Math.PI / 2 + gap + (i * (Math.PI * 2 - 2 * gap)) / (N - 1);
    out.push({ x: Math.cos(a) * 2.35, z: Math.sin(a) * 2.35, a });
  }
  return out;
}

// ---------- estufa (cúpula) ----------

function buildDome(root: THREE.Object3D, tex: Tex): string[] {
  const dome = group(root, 'greenhouse_dome', [0, 0, DOME_Z]);
  // pedestal: tambor sobre o chão, com rodapé escuro e faixa laranja
  const ped = scaleUV(new THREE.CylinderGeometry(DOME_R + 0.2, DOME_R + 0.32, FLOOR, 48, 1, true), 9);
  mk(dome, ped, C.hull, { name: 'dome_pedestal', pos: [0, FLOOR / 2, 0], outline: 0.02, mat: { map: tex.box } });
  mk(dome, cyl(DOME_R + 0.34, DOME_R + 0.34, 0.14, 48), C.dark, { name: 'dome_skirt', pos: [0, 0.07, 0], outline: 0.02 });
  mk(dome, cyl(DOME_R + 0.23, DOME_R + 0.23, 0.12, 48), C.accent, { name: 'dome_band', pos: [0, FLOOR - 0.08, 0], outline: 0 });
  mk(dome, cyl(DOME_R + 0.2, DOME_R + 0.2, 0.04, 48), C.dark, { name: 'dome_ledge', pos: [0, FLOOR - 0.02, 0], outline: 0 });
  // contrafortes do pedestal
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const rr = DOME_R + 0.28;
    mk(dome, rbox(0.2, FLOOR - 0.25, 0.2, 0.06), C.hull2, { name: 'dome_buttress', pos: [Math.cos(a) * rr, 0.14 + (FLOOR - 0.25) / 2, Math.sin(a) * rr], rot: [0, -a, 0], outline: 0.025 });
  }
  // piso interno
  mk(dome, cyl(DOME_R, DOME_R, 0.02, 48), C.hull2, { name: 'dome_floor', pos: [0, FLOOR + 0.005, 0], outline: 0 });

  // vidro e treliça geodésica
  const glass = new THREE.SphereGeometry(DOME_R, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  mk(dome, clean(glass), C.glass, { name: 'dome_glass', pos: [0, FLOOR, 0], outline: 0, mat: { name: 'dome_glass', opacity: 0.26 } });
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
      segs.push([a.clone().setY(a.y + FLOOR), b.clone().setY(b.y + FLOOR)]);
    }
  }
  mk(dome, rodsGeometry(segs, 0.04, 4), C.hull, { name: 'dome_frame', outline: 0 });
  mk(dome, clean(new THREE.TorusGeometry(DOME_R + 0.02, 0.08, 6, 56).rotateX(Math.PI / 2)), C.hull, { name: 'dome_ring', pos: [0, FLOOR + 0.03, 0], outline: 0 });
  // topo: clarabóia com luz de cultivo
  mk(dome, cyl(0.28, 0.34, 0.14, 18), C.dark, { name: 'dome_cap', pos: [0, FLOOR + DOME_R + 0.06, 0], outline: 0.03 });
  mk(dome, sphere(0.14, 12, 8), C.glow, { name: 'dome_cap_light', pos: [0, FLOOR + DOME_R + 0.16, 0], scale: [1, 0.55, 1], outline: 0, mat: { glow: 0.7 } });

  // canteiros, terra e plantas
  const bedGeo = rbox(1.25, 0.34, 0.6, 0.08);
  const soilGeo = rbox(1.1, 0.06, 0.46, 0.03);
  const variants = [plantGeometry(0), plantGeometry(1), plantGeometry(2)];
  const pivots: string[] = [];
  let pi = 0;
  const addPlant = (x: number, y: number, z: number, s: number, fruit: boolean) => {
    const i = pi++;
    const name = `plant_pivot_${i}`;
    pivots.push(name);
    const pv = group(dome, name, [x, y, z], [0, i * 1.3, 0]);
    mk(pv, variants[i % 3], C.plant, { name: `plant_${i}`, scale: [s, s, s], outline: 0.05, mat: { name: 'plant' } });
    if (fruit) {
      for (let k = 0; k < 2; k++) {
        const a = i + k * Math.PI;
        mk(pv, sphere(0.055, 8, 6), 0xe5573d, { name: `fruit_${i}_${k}`, pos: [Math.cos(a) * 0.11 * s, 0.2 * s, Math.sin(a) * 0.11 * s], outline: 0.05, mat: { name: 'fruit' } });
      }
    }
  };
  mk(dome, cyl(1.05, 1.1, 0.4, 28), C.hull2, { name: 'dome_bed_center', pos: [0, FLOOR + 0.2, 0], outline: 0.03 });
  mk(dome, cyl(0.95, 0.95, 0.06, 28), C.bed, { name: 'dome_bed_center_soil', pos: [0, FLOOR + 0.41, 0], outline: 0 });
  bedPositions().forEach(({ x, z, a }, i) => {
    mk(dome, bedGeo, C.hull2, { name: `dome_bed_${i}`, pos: [x, FLOOR + 0.17, z], rot: [0, -a + Math.PI / 2, 0], outline: 0.04 });
    mk(dome, soilGeo, C.bed, { name: `dome_bed_${i}_soil`, pos: [x, FLOOR + 0.35, z], rot: [0, -a + Math.PI / 2, 0], outline: 0 });
    for (const t of [-0.3, 0.3]) addPlant(x - Math.sin(a) * t, FLOOR + 0.38, z + Math.cos(a) * t, 1.05 + ((i * 3 + (t > 0 ? 1 : 0)) % 4) * 0.08, (i + (t > 0 ? 1 : 0)) % 3 === 0);
  });
  addPlant(0.4, FLOOR + 0.44, 0.25, 1.0, true);
  addPlant(-0.45, FLOOR + 0.44, 0.15, 1.1, false);
  addPlant(0.0, FLOOR + 0.44, -0.45, 1.05, true);
  addPlant(0.0, FLOOR + 0.44, 0.0, 1.9, true);

  // ponto de chegada da tripulação, dentro da cúpula, de frente para o corredor
  group(dome, 'greenhouse_entry', [0, FLOOR, DOME_R - 0.9]);
  return pivots;
}

// ---------- animações ----------

/** Balanço suave em volta da base da planta (mantém o giro inicial `yaw` da planta). Começa e termina igual: laço sem pulo. */
function swayTrack(node: string, yaw: number, phase: number, period: number, steps: number, amp: number): THREE.QuaternionKeyframeTrack {
  const times: number[] = [];
  const values: number[] = [];
  const q = new THREE.Quaternion();
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const e = new THREE.Euler();
  for (let i = 0; i <= steps; i++) {
    const w = (i / steps) * Math.PI * 2 + phase;
    times.push((period * i) / steps);
    values.push(...qy.clone().multiply(q.setFromEuler(e.set(amp * Math.sin(w), 0, amp * 0.8 * Math.cos(w + 0.6)))).toArray());
  }
  return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, values);
}

export function createGreenhouseBase(): GreenhouseBaseModel {
  const root = new THREE.Group();
  root.name = 'greenhouse_base';
  const tex: Tex = { hull: hullTexture('neutral'), box: boxTexture('neutral'), hazard: hazardTexture(), labels: labelTexture(), estufa: signTexture('ESTUFA', '#58b947') };
  buildHull(root, tex);
  buildLegs(root, tex);
  buildAccessTower(root, tex);
  buildRoof(root);
  buildLink(root, tex);
  const pivots = buildDome(root, tex);
  const sway = pivots.map((name, i) => swayTrack(name, i * 1.3, i * 0.9, 3, 8, 0.12));
  return { root, clips: [new THREE.AnimationClip('plants_sway', 3, sway)] };
}
