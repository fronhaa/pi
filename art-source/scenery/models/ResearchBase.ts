import * as THREE from 'three';
import { COLORS as C, clean, cyl, emblem, group, merge, mk, mkBeam, rbox, rboxUV, rodsGeometry, roundedTube, smooth, sphere, type V3 } from './common';
import { squirclePlate, squircleRing, windowUnit } from './MarsStation';
import { boxTexture, hazardTexture, hullTexture, LABELS, labelGeometry, labelTexture, scaleUV } from './textures';

/**
 * Bloco "Base de Pesquisa" (BASE-RES): o primeiro dos blocos da base, o mesmo na Lua e em Marte.
 * Inspirado nos módulos de habitat de superfície que a NASA projeta para o programa Artemis
 * (INTERPRETADO): cilindro deitado sobre pernas de pouso, com portas de acoplamento nas pontas.
 * Estilo cartoon do astronauta chibi; cores e poeira neutras (servem nos dois mundos).
 *
 * Referencial: origem no chão, no centro do bloco. Eixo comprido em X; frente (eclusa e escada) em +Z.
 * Tamanho: ~7,1 m (de porta a porta) x ~5,3 m de altura no mastro.
 *
 * As portas de acoplamento também têm escala de gente (escotilha de ~1,96 m de diâmetro).
 *
 * Para ligar blocos: os nós vazios "port_a" (ponta -X) e "port_b" (ponta +X) marcam o centro de cada
 * porta de acoplamento, olhando para fora. Outro bloco encaixa pondo a porta dele no mesmo ponto.
 *
 * Peças com nome fixo:
 * - "hatch_door": porta de entrada, no chão, na frente do tubo de acesso (1,0 x 1,95 m; o astronauta tem 1,85 m).
 *   A tripulação entra andando por ela, em (0; 0; 4,1), e some: a subida acontece dentro do tubo, sem animação;
 * - material "window": janelas (acendem à noite);
 * - material "base_lights": faixas de LED do casco;
 * - "alarm_light" (material "alarm"): luz de alerta no topo do tubo de acesso;
 * - "observatory" (clipe "observatory_scan" gira a cúpula), "anemometer" (clipe "weather_spin").
 */

export interface ResearchBaseModel {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
}

const R = 1.6; // raio do casco
const Y0 = 2.65; // altura do eixo (casco começa a 1,05 m do chão)
const LC = 5.0; // parte reta do cilindro
const CAP = 0.75; // profundidade das tampas
const HALF = LC / 2 + CAP; // 3,25
const AX = 0; // posição do tubo de acesso no eixo X (entre as pernas da frente)
/** Porta de entrada: poucos cm mais alta que o astronauta (1,85 m). */
const DOOR_H = 1.95;
const DOOR_W = 1.0;
const SHAFT_R = 0.85;
const SHAFT_Z = 2.35; // centro do tubo de acesso
const SHAFT_H = 3.3;
const LIGHTS = { name: 'base_lights', glow: 0.95 };

interface Tex {
  hull: THREE.Texture;
  box: THREE.Texture;
  hazard: THREE.Texture;
  labels: THREE.Texture;
}

function label(parent: THREE.Object3D, tex: Tex, text: string, w: number, h: number, pos: V3, rot: V3 = [0, 0, 0]): void {
  mk(parent, labelGeometry(LABELS.indexOf(text), w, h), 0xffffff, {
    name: `label_${text.toLowerCase()}`,
    pos,
    rot,
    outline: 0,
    mat: { name: 'label', map: tex.labels, alphaTest: 0.5 },
  });
}

/** Ponto na superfície do casco, na altura dy acima do eixo, do lado da frente (+Z) ou de trás (-Z). */
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
  // fecho da volta embaixo (phiStart = π/2), onde a textura é lisa
  const g = new THREE.LatheGeometry(pts, 56, Math.PI / 2);
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const around = uv.getX(i);
    uv.setXY(i, ((p.getY(i) + HALF) / (2 * HALF)) * 2, around);
  }
  g.rotateZ(-Math.PI / 2);
  return g;
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
    band(s * (LC / 2 - 0.12), 0.3, C.dark, 0.04, 'hull_band_dark');
    band(s * (LC / 2 - 0.42), 0.08, C.accent, 0.03, 'hull_band_orange');
  }

  // portas de acoplamento nas pontas (onde outros blocos encaixam)
  for (const s of [-1, 1] as const) {
    const port = group(hull, s < 0 ? 'docking_port_a' : 'docking_port_b', [s * HALF, Y0, 0], [0, s < 0 ? -Math.PI / 2 : Math.PI / 2, 0]);
    // dentro do grupo, +Z aponta para fora do bloco
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
    marker.position.set(s * (HALF + 0.25), Y0, 0);
    marker.rotation.y = s < 0 ? -Math.PI / 2 : Math.PI / 2;
    root.add(marker);
  }

  // janelas: frente (dos dois lados da eclusa) e trás
  [-2.05, -1.15, 1.15, 2.05].forEach((x, i) => {
    const o = onHull(x, 0.4, 1);
    windowUnit(hull, `window_front_${i}`, 0.66, 0.42, o.pos, o.rot);
  });
  [-1.7, -0.3, 1.1, 2.1].forEach((x, i) => {
    const o = onHull(x, 0.4, -1);
    windowUnit(hull, `window_back_${i}`, 0.66, 0.42, o.pos, o.rot);
  });
  // faixas de LED nas laterais
  for (const [x, side] of [[-1.6, 1], [1.6, 1], [-1.5, -1], [0.4, -1], [1.9, -1]] as [number, 1 | -1][]) {
    const o = onHull(x, -0.72, side, 0.01);
    mk(hull, rbox(1.0, 0.07, 0.04, 0.02), 0xe9fbff, { name: 'hull_light', pos: o.pos, rot: o.rot, outline: 0, mat: LIGHTS });
  }
  // emblema e plaquinha "LAB"
  const e = onHull(-1.6, -0.25, 1, 0.02);
  emblem(hull, 'base_emblem', 0.3, e.pos, e.rot);
  const l = onHull(-1.6, 0.98, 1, 0.01);
  label(hull, tex, 'LAB', 0.78, 0.29, l.pos, l.rot);
  const l2 = onHull(0.4, 0.98, -1, 0.01);
  label(hull, tex, 'LAB', 0.78, 0.29, l2.pos, l2.rot);
}

// ---------- pernas e barriga ----------

function buildLegs(root: THREE.Object3D, tex: Tex): void {
  const legs = group(root, 'legs');
  let n = 0;
  for (const lx of [-1.75, 1.75]) {
    for (const lz of [-1, 1]) {
      const top: V3 = [lx, Y0 - 0.95, lz * 1.28];
      const foot: V3 = [lx * 1.1, 0.2, lz * 2.15];
      const knee: V3 = [lx * 1.08, 0.62, lz * 1.9];
      mkBeam(legs, top, foot, 0.13, C.tech, { name: `leg_${n}_strut`, outline: 0.03 });
      mkBeam(legs, [lx * 0.85, 1.05, lz * 0.35], knee, 0.08, C.dark, { name: `leg_${n}_brace`, outline: 0.03 });
      // amortecedor laranja no meio da perna
      const mid: V3 = [(top[0] + foot[0]) / 2, (top[1] + foot[1]) / 2, (top[2] + foot[2]) / 2];
      const d = new THREE.Vector3(foot[0] - top[0], foot[1] - top[1], foot[2] - top[2]).normalize().multiplyScalar(0.17);
      mkBeam(legs, [mid[0] - d.x, mid[1] - d.y, mid[2] - d.z], [mid[0] + d.x, mid[1] + d.y, mid[2] + d.z], 0.19, C.accent, { name: `leg_${n}_damper`, outline: 0.03 });
      mk(legs, sphere(0.1, 12, 8), C.dark, { name: `leg_${n}_ankle`, pos: [foot[0], 0.2, foot[2]], outline: 0.04 });
      mk(legs, cyl(0.3, 0.36, 0.1, 20), C.dark, { name: `leg_${n}_pad`, pos: [foot[0], 0.05, foot[2]], outline: 0.03 });
      n++;
    }
  }
  // barriga: baia de equipamentos e dois tanques
  mk(legs, rboxUV(3.2, 0.42, 1.5, 0.12), C.hull2, { name: 'equipment_bay', pos: [0, 1.0, 0], outline: 0.03, mat: { map: tex.box } });
  for (const tz of [-0.5, 0.5]) {
    const t = cyl(0.28, 0.28, 2.6, 18);
    t.rotateZ(Math.PI / 2);
    mk(legs, t, C.hull, { name: 'tank', pos: [0, 0.68, tz], outline: 0.03 });
    for (const sx of [-1.31, 1.31]) mk(legs, sphere(0.28, 16, 10), C.hull, { name: 'tank_end', pos: [sx, 0.68, tz], scale: [0.45, 1, 1], outline: 0.03 });
    for (const sx of [-0.7, 0.7]) {
      const strap = cyl(0.3, 0.3, 0.07, 18);
      strap.rotateZ(Math.PI / 2);
      mk(legs, strap, C.accent, { name: 'tank_strap', pos: [sx, 0.68, tz], outline: 0 });
    }
  }
}

// ---------- tubo de acesso (no lugar da escada) ----------

/**
 * Tubo vertical do chão até o casco. A porta fica no chão, então o astronauta só anda até ela e some;
 * a subida até o casco acontece "dentro do tubo" e não aparece (nada de animação de escada).
 */
function buildAccessTower(root: THREE.Object3D, tex: Tex): void {
  const tw = group(root, 'access_tower', [AX, 0, 0]);
  // tubo: cilindro texturizado (a poeira fica embaixo), tampa em cúpula e rodapé escuro
  const body = scaleUV(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, SHAFT_H, 40, 1, true), 3);
  mk(tw, body, C.hull, { name: 'access_tower_body', pos: [0, SHAFT_H / 2, SHAFT_Z], outline: 0.02, mat: { map: tex.box } });
  mk(tw, clean(new THREE.SphereGeometry(SHAFT_R, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2)), C.hull, { name: 'access_tower_top', pos: [0, SHAFT_H, SHAFT_Z], scale: [1, 0.45, 1], outline: 0.025 });
  mk(tw, cyl(SHAFT_R + 0.04, SHAFT_R + 0.04, 0.22, 40), C.dark, { name: 'access_tower_band', pos: [0, SHAFT_H - 0.05, SHAFT_Z], outline: 0 });
  mk(tw, cyl(SHAFT_R + 0.03, SHAFT_R + 0.03, 0.07, 40), C.accent, { name: 'access_tower_stripe', pos: [0, 2.62, SHAFT_Z], outline: 0 });
  mk(tw, cyl(SHAFT_R + 0.06, SHAFT_R + 0.1, 0.16, 40), C.dark, { name: 'access_tower_skirt', pos: [0, 0.08, SHAFT_Z], outline: 0.02 });
  // pescoço que liga o tubo ao casco
  const neckY = Y0 + 0.25;
  const neck = roundedTube(0.62, 0.7, 1.1, 0.12);
  neck.rotateY(Math.PI / 2);
  mk(tw, neck, C.hull2, { name: 'access_tower_neck', pos: [0, neckY, 1.45], outline: 0.025 });
  const collar = roundedTube(0.68, 0.76, 0.12, 0.04);
  collar.rotateY(Math.PI / 2);
  mk(tw, collar, C.accent, { name: 'access_tower_neck_ring', pos: [0, neckY, 1.62], outline: 0 });
  // janelinha redonda no lado do tubo
  for (const sx of [-1, 1]) {
    const g = group(tw, `access_tower_porthole_${sx > 0 ? 'r' : 'l'}`, [sx * (SHAFT_R - 0.02), 2.95, SHAFT_Z], [0, sx * (Math.PI / 2), 0]);
    mk(g, clean(new THREE.TorusGeometry(0.17, 0.045, 8, 24)), C.dark, { name: 'porthole_rim', outline: 0 });
    mk(g, cyl(0.16, 0.16, 0.04, 20).rotateX(Math.PI / 2), C.window, { name: 'porthole_glass', outline: 0, mat: { name: 'window', glow: 0.25 } });
  }

  // fachada da porta (plana, na frente do tubo) com a porta no nível do chão
  const fz = SHAFT_Z + SHAFT_R + 0.08; // frente da fachada (à frente da curva do tubo)
  const fh = DOOR_H + 0.5;
  mk(tw, rboxUV(DOOR_W + 0.5, fh, 0.58, 0.14), C.hull, { name: 'door_housing', pos: [0, fh / 2, fz - 0.25], outline: 0.025, mat: { map: tex.box } });
  mk(tw, rbox(DOOR_W + 0.56, 0.12, 0.64, 0.05), C.accent, { name: 'door_housing_cap', pos: [0, fh, fz - 0.25], outline: 0 });
  const doorY = 0.04 + DOOR_H / 2;
  mk(tw, squirclePlate(DOOR_W / 2, DOOR_H / 2, 0.04), 0x473c3a, { name: 'hatch_door', pos: [0, doorY, fz + 0.05], outline: 0 });
  mk(tw, squircleRing(DOOR_W / 2 + 0.12, DOOR_H / 2 + 0.12, 0.13, 0.08), C.accent, { name: 'hatch_frame', pos: [0, doorY, fz + 0.06], outline: 0 });
  mk(tw, rbox(0.08, 0.36, 0.06, 0.03), C.dark, { name: 'hatch_handle', pos: [DOOR_W / 2 - 0.16, doorY, fz + 0.1], outline: 0 });
  for (const sx of [-1, 1]) mk(tw, rbox(0.07, 0.6, 0.05, 0.02), 0xe9fbff, { name: 'hatch_side_light', pos: [sx * (DOOR_W / 2 + 0.2), doorY + 0.25, fz + 0.04], outline: 0, mat: LIGHTS });
  label(tw, tex, 'AIRLOCK', 0.74, 0.18, [0, DOOR_H + 0.3, fz + 0.045]);
  // capacho com faixa de perigo na frente da porta
  mk(tw, scaleUV(rboxUV(DOOR_W + 0.4, 0.05, 0.55, 0.02), 4), 0xffffff, { name: 'door_mat', pos: [0, 0.025, fz + 0.32], outline: 0.03, mat: { map: tex.hazard } });
  // luz de alerta no topo do tubo
  mk(tw, cyl(0.13, 0.16, 0.1, 14), C.dark, { name: 'alarm_base', pos: [0, SHAFT_H + 0.4, SHAFT_Z], outline: 0.04 });
  mk(tw, sphere(0.15, 16, 10), C.alarmOff, { name: 'alarm_light', pos: [0, SHAFT_H + 0.52, SHAFT_Z], outline: 0.04, mat: { name: 'alarm' } });
}

// ---------- teto: observatório, estação do tempo, antena ----------

function buildRoof(root: THREE.Object3D): void {
  const roof = group(root, 'roof');
  const top = Y0 + R;
  // observatório: base, anel laranja e cúpula com fenda e telescópio (a cúpula gira)
  const ox = -1.7;
  mk(roof, cyl(0.72, 0.82, 0.55, 28), C.hull2, { name: 'observatory_base', pos: [ox, top + 0.05, 0], outline: 0.03 });
  mk(roof, cyl(0.75, 0.75, 0.07, 28), C.accent, { name: 'observatory_ring', pos: [ox, top + 0.3, 0], outline: 0 });
  const obs = group(roof, 'observatory', [ox, top + 0.33, 0]);
  mk(obs, clean(new THREE.SphereGeometry(0.7, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2)), C.hull, { name: 'observatory_dome', outline: 0.03 });
  mk(obs, clean(new THREE.SphereGeometry(0.712, 4, 10, -0.2, 0.4, 0.05, Math.PI / 2 - 0.05)), C.dark, { name: 'observatory_slit', outline: 0 });
  const scope = cyl(0.1, 0.13, 0.7, 14);
  mk(obs, scope, C.dark, { name: 'telescope', pos: [-0.38, 0.42, 0], rot: [0, 0, 0.85], outline: 0.04 });
  mk(obs, sphere(0.075, 12, 8), C.glow, { name: 'telescope_lens', pos: [-0.66, 0.66, 0], scale: [1, 0.5, 1], rot: [0, 0, 0.85], outline: 0, mat: { glow: 0.55 } });

  // estação meteorológica: mastro, cata-vento e anemômetro (gira)
  const wx = 0.45;
  const wz = -0.7;
  const wy = Y0 + Math.sqrt(R * R - wz * wz) - 0.05;
  mk(roof, cyl(0.12, 0.15, 0.12, 14), C.dark, { name: 'weather_base', pos: [wx, wy + 0.06, wz], outline: 0.04 });
  mk(roof, cyl(0.03, 0.03, 1.2, 8), C.tech, { name: 'weather_pole', pos: [wx, wy + 0.66, wz], outline: 0 });
  mk(roof, rbox(0.42, 0.05, 0.04, 0.02), C.hull, { name: 'wind_vane', pos: [wx + 0.12, wy + 1.0, wz], outline: 0.04 });
  mk(roof, cyl(0.001, 0.07, 0.12, 8).rotateZ(-Math.PI / 2), C.accent, { name: 'wind_vane_tip', pos: [wx + 0.36, wy + 1.0, wz], outline: 0 });
  const an = group(roof, 'anemometer', [wx, wy + 1.3, wz]);
  mk(an, cyl(0.05, 0.05, 0.1, 10), C.dark, { name: 'anemometer_hub', outline: 0.04 });
  const arms: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    arms.push(new THREE.BoxGeometry(0.3, 0.02, 0.02).translate(0.15, 0, 0).rotateY(a));
    const cup = new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    cup.rotateZ(Math.PI / 2).translate(0.3, 0, 0).rotateY(a);
    mk(an, clean(cup), C.accent, { name: 'anemometer_cup', outline: 0 });
  }
  mk(an, merge(arms), C.tech, { name: 'anemometer_arms', outline: 0 });

  // antena parabólica pequena e caixa de equipamento
  const dx = 2.15;
  const dz = 0.35;
  const dy = Y0 + Math.sqrt(R * R - dz * dz) - 0.05;
  mk(roof, cyl(0.04, 0.05, 0.5, 8), C.tech, { name: 'dish_pole', pos: [dx, dy + 0.25, dz], outline: 0 });
  const dish = group(roof, 'dish', [dx, dy + 0.55, dz], [0.5, 0, -0.45]);
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const r = (0.45 * i) / 8;
    prof.push(new THREE.Vector2(Math.max(r, 0.001), (r * r) / 1.4));
  }
  for (let i = 8; i >= 0; i--) {
    const r = (0.45 * i) / 8;
    prof.push(new THREE.Vector2(Math.max(r * 0.96, 0.001), (r * r) / 1.4 - 0.04));
  }
  mk(dish, smooth(new THREE.LatheGeometry(prof.reverse(), 24)), C.hull, { name: 'dish_bowl', outline: 0.04 });
  mk(dish, rodsGeometry([[new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.32, 0)]], 0.012, 4), C.dark, { name: 'dish_feed', outline: 0 });
  mk(dish, sphere(0.04, 8, 6), C.accent, { name: 'dish_tip', pos: [0, 0.33, 0], outline: 0 });
  mk(roof, rbox(0.9, 0.3, 0.7, 0.08), C.hull2, { name: 'roof_box', pos: [0.95, top - 0.02, 0.35], outline: 0.04 });
  mk(roof, rbox(0.3, 0.05, 0.04, 0.015), 0xe9fbff, { name: 'roof_box_light', pos: [0.95, top + 0.02, 0.71], outline: 0, mat: LIGHTS });
  mk(roof, rbox(0.92, 0.05, 0.72, 0.02), C.accent, { name: 'roof_box_band', pos: [0.95, top + 0.08, 0.35], outline: 0 });
}

// ---------- estação de amostras no chão ----------

function buildSampleStation(root: THREE.Object3D, tex: Tex): void {
  const st = group(root, 'sample_station', [-1.5, 0, 3.05]);
  mk(st, rboxUV(1.1, 1.0, 0.6, 0.08), C.hull2, { name: 'sample_cabinet', pos: [0, 0.5, 0], outline: 0.035, mat: { map: tex.box } });
  mk(st, rbox(1.14, 0.06, 0.64, 0.02), C.accent, { name: 'sample_cabinet_band', pos: [0, 0.98, 0], outline: 0 });
  mk(st, rbox(0.02, 0.7, 0.02, 0.01), C.dark, { name: 'sample_cabinet_split', pos: [0, 0.48, 0.305], outline: 0 });
  for (const hx of [-0.08, 0.08]) mk(st, rbox(0.04, 0.16, 0.04, 0.015), C.dark, { name: 'sample_cabinet_handle', pos: [hx, 0.55, 0.32], outline: 0 });
  mk(st, rbox(0.12, 0.04, 0.03, 0.01), 0xe9fbff, { name: 'sample_cabinet_led', pos: [0.4, 0.85, 0.305], outline: 0, mat: LIGHTS });
  // potes de amostra em cima
  [-0.32, -0.08, 0.16].forEach((px, i) => {
    mk(st, cyl(0.08, 0.08, 0.18, 14), C.glass, { name: `sample_jar_${i}`, pos: [px, 1.1, 0.05], outline: 0.05 });
    mk(st, cyl(0.085, 0.085, 0.04, 14), [C.accent, C.tech, C.dark][i], { name: `sample_jar_lid_${i}`, pos: [px, 1.21, 0.05], outline: 0 });
    mk(st, cyl(0.06, 0.06, 0.06, 12), [0x9a9792, 0xc65b36, 0x473c3a][i], { name: `sample_${i}`, pos: [px, 1.05, 0.05], outline: 0 });
  });
  mk(st, rbox(0.3, 0.16, 0.22, 0.04), C.dark, { name: 'sample_scanner', pos: [0.38, 1.08, 0], outline: 0.04 });
  mk(st, rbox(0.2, 0.08, 0.02, 0.01), C.glow, { name: 'sample_scanner_screen', pos: [0.38, 1.1, 0.115], outline: 0, mat: { glow: 0.6 } });
}

// ---------- animações ----------

function spinTrack(node: string, period: number, steps: number, dir = 1): THREE.QuaternionKeyframeTrack {
  const times: number[] = [];
  const values: number[] = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= steps; i++) {
    times.push((period * i) / steps);
    values.push(...q.setFromAxisAngle(up, dir * ((Math.PI * 2 * i) / steps)).toArray());
  }
  return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, values);
}

export function createResearchBase(): ResearchBaseModel {
  const root = new THREE.Group();
  root.name = 'research_base';
  const tex: Tex = { hull: hullTexture('neutral'), box: boxTexture('neutral'), hazard: hazardTexture(), labels: labelTexture() };
  buildHull(root, tex);
  buildLegs(root, tex);
  buildAccessTower(root, tex);
  buildRoof(root);
  buildSampleStation(root, tex);
  return {
    root,
    clips: [
      new THREE.AnimationClip('observatory_scan', 24, [spinTrack('observatory', 24, 8)]),
      new THREE.AnimationClip('weather_spin', 1.2, [spinTrack('anemometer', 1.2, 3, -1)]),
    ],
  };
}
