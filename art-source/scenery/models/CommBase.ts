import * as THREE from 'three';
import { PALETTE } from '@/render/toon';
import { COLORS as C, clean, cyl, emblem, group, mk, mkBeam, rbox, rboxUV, rodsGeometry, smooth, sphere, type V3 } from './common';
import { buildAccessTower, buildLegs, buildPort, label, LIGHTS, type BlockTex } from './GreenhouseBase';
import { windowUnit } from './MarsStation';
import { boxTexture, hazardTexture, hullTexture, labelTexture } from './textures';

/**
 * Bloco "Base de Comunicação" (BASE-COM): terceiro bloco da base, o mesmo na Lua e em Marte.
 * É a torre de antena da primeira estação (ARC-003) refeita no formato dos blocos: caixa na mesma altura
 * e com as mesmas portas de acoplamento dos blocos cilíndricos, porta de 1,95 m no chão e, em cima,
 * plataforma com mastro treliçado, parabólica que gira, rádio-cúpula e luz de alerta (INTERPRETADO a partir
 * das estações de comunicação de superfície do programa Artemis).
 *
 * Referencial: origem no chão, no centro da caixa. Eixo comprido em X; frente (porta) em +Z.
 * Tamanho: caixa de 3,4 m (porta a porta) x 3,2 m de largura x 3,2 m de altura (do piso a 1,05 m até 4,25 m);
 * mastro até ~10,3 m.
 *
 * Para ligar blocos: "port_a" (ponta -X) e "port_b" (ponta +X), na mesma altura e do mesmo tamanho dos outros blocos.
 *
 * Peças com nome fixo:
 * - "hatch_door": porta de entrada, no chão (1,0 x 1,95 m). O astronauta entra em (0; 0; 4,1) e some;
 * - material "window": janelas; material "base_lights": faixas de LED;
 * - "alarm_light" (material "alarm"): luz de alerta no topo do mastro (o jogo acende no alarme);
 * - "antenna_tip" (material "antenna_tip"): ponta da antena parabólica (pisca com mensagem da Terra);
 * - "dish": grupo da parabólica (clipe "dish_scan" varre ±20°, 8 s, em laço);
 * - "radome_spin": grupo da antena interna da rádio-cúpula (vidro translúcido, material "radome_glass"; clipe "radome_spin" gira, 6 s, em laço).
 */

export interface CommBaseModel {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
}

const Y0 = 2.65;
const BW = 3.4; // comprimento (X)
const BD = 3.2; // largura (Z)
const BH = 3.2; // altura
const FLOOR = Y0 - 1.6; // 1,05
const TOP = FLOOR + BH; // 4,25
const HALF = BW / 2;
const CORNER = 0.3; // raio dos cantos da caixa
const MAST_Y1 = 8.7;

function v(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

/** Faixa em volta da caixa: retângulo de cantos arredondados (vista de cima) com altura h, centrada em y. */
function band(parent: THREE.Object3D, name: string, w: number, d: number, r: number, h: number, y: number, color: number): void {
  const sh = new THREE.Shape();
  const x = w / 2;
  const z = d / 2;
  sh.moveTo(-x + r, -z);
  sh.lineTo(x - r, -z);
  sh.absarc(x - r, -z + r, r, -Math.PI / 2, 0, false);
  sh.lineTo(x, z - r);
  sh.absarc(x - r, z - r, r, 0, Math.PI / 2, false);
  sh.lineTo(-x + r, z);
  sh.absarc(-x + r, z - r, r, Math.PI / 2, Math.PI, false);
  sh.lineTo(-x, -z + r);
  sh.absarc(-x + r, -z + r, r, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 12 });
  g.rotateX(Math.PI / 2); // extrude +Z -> -Y
  g.translate(0, h / 2, 0);
  mk(parent, clean(g), color, { name, pos: [0, y, 0], outline: 0 });
}

function buildBody(root: THREE.Object3D, tex: BlockTex): void {
  const body = group(root, 'body');
  mk(body, rboxUV(BW, BH, BD, CORNER, 4), C.hull, { name: 'body_shell', pos: [0, FLOOR + BH / 2, 0], outline: 0.02, mat: { map: tex.box } });
  band(body, 'body_band_dark', BW + 0.06, BD + 0.06, CORNER + 0.03, 0.26, FLOOR + 0.62, C.dark);
  band(body, 'body_band_orange', BW + 0.06, BD + 0.06, CORNER + 0.03, 0.1, TOP - 0.62, C.accent);

  for (const s of [-1, 1] as const) buildPort(body, root, s, HALF);

  // frente: duas janelas no alto, emblema e plaquinha "COM" embaixo, dos dois lados do tubo de acesso
  for (const sx of [-1, 1]) windowUnit(body, `window_front_${sx > 0 ? 'r' : 'l'}`, 0.5, 0.42, [sx * 1.2, 3.55, BD / 2 + 0.01]);
  emblem(body, 'base_emblem', 0.3, [-1.2, 2.05, BD / 2 + 0.02]);
  label(body, tex, 'COM', 0.8, 0.3, [1.2, 2.05, BD / 2 + 0.012]);
  for (let i = 0; i < 3; i++) mk(body, rbox(0.1, 0.1, 0.04, 0.03), C.glow, { name: 'status_light', pos: [1.2 + (i - 1) * 0.2, 1.6, BD / 2 + 0.01], outline: 0, mat: { glow: 0.9 } });
  // trás: janelas, painel com fendas de ventilação e faixa de LED
  for (const sx of [-1, 1]) windowUnit(body, `window_back_${sx > 0 ? 'r' : 'l'}`, 0.5, 0.42, [sx * 1.0, 3.55, -BD / 2 - 0.01], [0, Math.PI, 0]);
  mk(body, rbox(1.1, 0.7, 0.08, 0.06), C.hull2, { name: 'back_panel', pos: [0, 2.3, -BD / 2 - 0.01], outline: 0 });
  for (let i = 0; i < 4; i++) mk(body, rbox(0.8, 0.05, 0.04, 0.02), C.dark, { name: 'back_panel_slot', pos: [0, 2.1 + i * 0.13, -BD / 2 - 0.05], outline: 0 });
  for (const sx of [-1, 1]) mk(body, rbox(0.8, 0.07, 0.04, 0.02), 0xe9fbff, { name: 'body_light', pos: [sx * 1.0, 1.55, -BD / 2 - 0.01], outline: 0, mat: LIGHTS });
}

function buildMast(root: THREE.Object3D, tex: BlockTex): THREE.Group {
  const top = group(root, 'antenna_deck');
  // plataforma e grade em volta
  mk(top, rbox(BW - 0.15, 0.12, BD - 0.15, 0.05), C.dark, { name: 'deck_platform', pos: [0, TOP + 0.1, 0], outline: 0.02 });
  const rail: [THREE.Vector3, THREE.Vector3][] = [];
  const ex = BW / 2 - 0.2;
  const ez = BD / 2 - 0.2;
  const corners = [v(-ex, 0, -ez), v(ex, 0, -ez), v(ex, 0, ez), v(-ex, 0, ez)];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    rail.push([a.clone().setY(TOP + 0.62), b.clone().setY(TOP + 0.62)]);
    const n = Math.round(a.distanceTo(b) / 0.5);
    for (let k = 0; k <= n; k++) {
      const pt = a.clone().lerp(b, k / n);
      rail.push([pt.clone().setY(TOP + 0.16), pt.clone().setY(TOP + 0.62)]);
    }
  }
  mk(top, rodsGeometry(rail, 0.03, 5), C.tech, { name: 'deck_railing', outline: 0 });

  // mastro treliçado (no centro da plataforma)
  const mx = 0;
  const mz = -0.15;
  const m = 0.38;
  const y0 = TOP + 0.16;
  const lattice: [THREE.Vector3, THREE.Vector3][] = [];
  const mc = [v(mx - m, 0, mz - m), v(mx + m, 0, mz - m), v(mx + m, 0, mz + m), v(mx - m, 0, mz + m)];
  for (const c of mc) lattice.push([c.clone().setY(y0), c.clone().setY(MAST_Y1)]);
  const levels = 5;
  for (let l = 0; l <= levels; l++) {
    const y = y0 + ((MAST_Y1 - y0) * l) / levels;
    for (let i = 0; i < 4; i++) {
      const a = mc[i];
      const b = mc[(i + 1) % 4];
      lattice.push([a.clone().setY(y), b.clone().setY(y)]);
      if (l < levels) {
        const yn = y0 + ((MAST_Y1 - y0) * (l + 1)) / levels;
        lattice.push([(l % 2 ? a : b).clone().setY(y), (l % 2 ? b : a).clone().setY(yn)]);
      }
    }
  }
  mk(top, rodsGeometry(lattice, 0.045, 6), C.dark, { name: 'mast_lattice', outline: 0 });
  mk(top, rbox(1.0, 0.14, 1.0, 0.05), C.dark, { name: 'mast_top', pos: [mx, MAST_Y1 + 0.05, mz], outline: 0.03 });
  mk(top, cyl(0.2, 0.25, 0.16, 16), C.hull2, { name: 'alarm_base', pos: [mx, MAST_Y1 + 0.2, mz], outline: 0.04 });
  mk(top, sphere(0.27, 18, 12), C.alarmOff, { name: 'alarm_light', pos: [mx, MAST_Y1 + 0.42, mz], outline: 0.04, mat: { name: 'alarm' } });
  const whips: [THREE.Vector3, THREE.Vector3][] = [
    [v(mx + 0.38, MAST_Y1 + 0.1, mz + 0.38), v(mx + 0.38, MAST_Y1 + 1.1, mz + 0.38)],
    [v(mx - 0.38, MAST_Y1 + 0.1, mz - 0.38), v(mx - 0.38, MAST_Y1 + 0.8, mz - 0.38)],
  ];
  mk(top, rodsGeometry(whips, 0.02, 5), C.dark, { name: 'mast_whips', outline: 0 });
  mk(top, sphere(0.05, 8, 6), C.accent, { name: 'mast_whip_tip', pos: [mx + 0.38, MAST_Y1 + 1.12, mz + 0.38], outline: 0 });
  mk(top, sphere(0.05, 8, 6), C.accent, { name: 'mast_whip_tip', pos: [mx - 0.38, MAST_Y1 + 0.82, mz - 0.38], outline: 0 });

  // caixa de equipamentos e rádio-cúpula na plataforma
  mk(top, rboxUV(1.0, 0.9, 0.8, 0.1), C.hull2, { name: 'deck_cabinet', pos: [-1.0, TOP + 0.62, 0.75], outline: 0.035, mat: { map: tex.box } });
  mk(top, rbox(1.04, 0.06, 0.84, 0.03), C.accent, { name: 'deck_cabinet_band', pos: [-1.0, TOP + 1.05, 0.75], outline: 0 });
  mk(top, rbox(0.3, 0.05, 0.04, 0.015), 0xe9fbff, { name: 'deck_cabinet_light', pos: [-1.0, TOP + 0.85, 1.16], outline: 0, mat: LIGHTS });
  mk(top, cyl(0.6, 0.66, 0.3, 28), C.hull2, { name: 'radome_base', pos: [1.0, TOP + 0.31, -0.7], outline: 0.03 });
  mk(top, cyl(0.64, 0.64, 0.07, 28), C.accent, { name: 'radome_ring', pos: [1.0, TOP + 0.5, -0.7], outline: 0 });
  const dome = clean(new THREE.SphereGeometry(0.6, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2));
  mk(top, dome, C.glass, { name: 'radome_shell', pos: [1.0, TOP + 0.5, -0.7], outline: 0, mat: { name: 'radome_glass', opacity: 0.35 } });
  mk(top, cyl(0.58, 0.58, 0.02, 24), C.hull2, { name: 'radome_floor', pos: [1.0, TOP + 0.5, -0.7], outline: 0 });
  // antena interna (aparece por uma janela escura) que gira
  const spin = group(top, 'radome_spin', [1.0, TOP + 0.9, -0.7]);
  mk(spin, rbox(0.5, 0.05, 0.1, 0.02), C.dark, { name: 'radome_bar', outline: 0 });
  mk(spin, sphere(0.05, 8, 6), C.accent, { name: 'radome_bar_tip', pos: [0.26, 0, 0], outline: 0 });
  mk(top, rbox(0.04, 0.3, 0.04, 0.015), C.dark, { name: 'radome_mount', pos: [1.0, TOP + 0.72, -0.7], outline: 0 });

  // parabólica: o grupo "dish" gira no eixo Y (clipe "dish_scan")
  const dish = group(top, 'dish', [mx, 6.5, mz]);
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

function spinClip(name: string, node: string, period: number, steps: number, dir = 1): THREE.AnimationClip {
  const times: number[] = [];
  const values: number[] = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= steps; i++) {
    times.push((period * i) / steps);
    values.push(...q.setFromAxisAngle(up, dir * ((Math.PI * 2 * i) / steps)).toArray());
  }
  return new THREE.AnimationClip(name, period, [new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, values)]);
}

/** Clipe "dish_scan": a parabólica varre ±20° devagar (8 s, em laço). */
function dishScanClip(): THREE.AnimationClip {
  const times = [0, 2, 4, 6, 8];
  const angles = [0, 0.35, 0, -0.35, 0];
  const q = new THREE.Quaternion();
  const values: number[] = [];
  for (const a of angles) values.push(...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a).toArray());
  return new THREE.AnimationClip('dish_scan', 8, [new THREE.QuaternionKeyframeTrack('dish.quaternion', times, values)]);
}

export function createCommBase(): CommBaseModel {
  const root = new THREE.Group();
  root.name = 'comm_base';
  const tex: BlockTex = { hull: hullTexture('neutral'), box: boxTexture('neutral'), hazard: hazardTexture(), labels: labelTexture() };
  buildBody(root, tex);
  buildLegs(root, tex);
  buildAccessTower(root, tex);
  // o alarme deste bloco fica no mastro: tira a luz de alerta do tubo de acesso
  root.getObjectByName('alarm_light')?.removeFromParent();
  root.getObjectByName('alarm_base')?.removeFromParent();
  buildMast(root, tex);
  return { root, clips: [dishScanClip(), spinClip('radome_spin', 'radome_spin', 6, 12)] };
}
