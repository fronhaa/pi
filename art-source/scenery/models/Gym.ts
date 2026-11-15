import * as THREE from 'three';
import { COLORS as C, cyl, group, mk, rbox, sphere, type V3 } from './common';
import { type BlockTex } from './GreenhouseBase';
import { boxTexture, hazardTexture, hullTexture, labelTexture } from './textures';
import { BELT_LEN, BELT_STRIPES, FLOOR_TOP, lineRunTracks, rug, treadmill, v, WARM } from './GlassBlock';
import { buildGlassCylinder, CAP } from './GlassCylinder';

/**
 * Bloco "Academia" (BASE-GYM): cilindro GRANDE de vidro com treliça, como o da estufa, com 6 esteiras,
 * estante de halteres, banco de supino, bicicleta, tapetes de yoga e bolas por dentro. Mesmo eixo, mesmas portas
 * de acoplamento e mesma porta de 1,95 m dos outros blocos (INTERPRETADO a partir dos habitats de superfície da
 * NASA, que preveem exercício diário contra a perda de massa óssea e muscular).
 *
 * Referencial: origem no chão, no centro do bloco. Eixo comprido em X; frente (porta) em +Z.
 * Tamanho: 11,2 m de porta a porta (trecho reto de vidro de 9 m entre duas tampas opacas), 5,2 m de diâmetro.
 * A barriga fica opaca e o piso interno fica a 1,72 m, na altura das escotilhas. O bloco se apoia em 4 selas.
 *
 * Para ligar blocos: "port_a" (ponta -X) e "port_b" (ponta +X), iguais às dos outros blocos.
 *
 * Peças com nome fixo:
 * - "hatch_door": porta de entrada, no chão (1,0 x 1,95 m). O astronauta entra em (0; 0; 5,1) e some;
 * - "dome_glass" (material "dome_glass"): vidro (o mesmo da estufa);
 * - material "window": luminárias (acendem à noite); material "base_lights": faixas de LED;
 * - material "treadmill_screen": telas das esteiras; "alarm_light" (material "alarm"): luz de alerta;
 * - "treadmill_N" (N = 0 a 5): as esteiras, com as listras "treadmill_N_stripe_K" na correia.
 *   O clipe "treadmills_run" (1,2 s, em laço) faz as correias andarem; só visual, o jogo decide quando tocar;
 * - "label_academia": plaquinha;
 * - pontos de interação (nós vazios): "treadmill_N_run", "bike_N_ride", "bench_press_N_lie", "mat_N_use",
 *   "dumbbell_rack_N_use", "cooler_use". Móveis e aparelhos na escala do astronauta.
 */

export interface GymModel {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
}

export const LC = 9; // trecho reto (vidro)
export const TOTAL = LC + 2 * CAP;
const TM_X = [-3.75, -2.5, -1.25, 1.25, 2.5, 3.75];
const TM_Z = -1.15;

function marker(parent: THREE.Object3D, name: string, pos: V3, rotY: number): void {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(...pos);
  o.rotation.y = rotY;
  parent.add(o);
}

function dumbbell(parent: THREE.Object3D, pos: V3, color: number): void {
  const g = group(parent, 'dumbbell', pos);
  mk(g, cyl(0.02, 0.02, 0.2, 8).rotateZ(Math.PI / 2), C.tech, { name: 'dumbbell_bar', outline: 0 });
  for (const sx of [-1, 1]) mk(g, cyl(0.06, 0.06, 0.07, 10).rotateZ(Math.PI / 2), color, { name: 'dumbbell_weight', pos: [sx * 0.1, 0, 0], outline: 0.03 });
}

/** Bicicleta ergométrica: selim a 0,6 m, guidão a 0,85 m (pernas e braços curtos do astronauta). Frente em +Z. */
function bike(parent: THREE.Object3D, name: string, pos: V3): void {
  const b = group(parent, name, pos);
  mk(b, rbox(0.55, 0.08, 1.1, 0.03), C.dark, { name: 'bike_base', pos: [0, 0.04, 0], outline: 0.02 });
  mk(b, cyl(0.26, 0.26, 0.12, 20).rotateZ(Math.PI / 2), C.accent, { name: 'bike_flywheel', pos: [0, 0.34, 0.32], outline: 0.03 });
  mk(b, rbox(0.07, 0.6, 0.07, 0.025), C.tech, { name: 'bike_frame', pos: [0, 0.34, -0.2], outline: 0.02 });
  mk(b, rbox(0.32, 0.08, 0.36, 0.03), C.navy, { name: 'bike_seat', pos: [0, 0.6, -0.22], outline: 0.025 });
  mk(b, rbox(0.07, 0.7, 0.07, 0.02), C.tech, { name: 'bike_stem', pos: [0, 0.5, 0.36], outline: 0.02 });
  mk(b, rbox(0.7, 0.05, 0.05, 0.02), C.tech, { name: 'bike_handle', pos: [0, 0.85, 0.36], outline: 0.02 });
  mk(b, rbox(0.24, 0.13, 0.03, 0.012), C.glow, { name: 'bike_screen', pos: [0, 0.93, 0.4], rot: [-0.4, 0, 0], outline: 0, mat: { name: 'treadmill_screen', glow: 0.7 } });
  marker(b, `${name}_ride`, [0, 0.6, -0.22], 0);
}

/** Banco de supino (0,3 m de altura) com barra a 0,95 m. Cabeceira em -Z. */
function benchPress(parent: THREE.Object3D, name: string, pos: V3): void {
  const bench = group(parent, name, pos);
  mk(bench, rbox(0.5, 0.1, 1.3, 0.04), C.navy, { name: 'bench_seat', pos: [0, 0.3, 0.05], outline: 0.03 });
  for (const sz of [-0.45, 0.5]) mk(bench, rbox(0.45, 0.26, 0.08, 0.03), C.dark, { name: 'bench_leg', pos: [0, 0.13, sz], outline: 0.02 });
  for (const sx of [-1, 1]) mk(bench, rbox(0.06, 0.95, 0.06, 0.02), C.tech, { name: 'bench_stand', pos: [sx * 0.42, 0.475, -0.5], outline: 0.02 });
  mk(bench, cyl(0.02, 0.02, 1.2, 8).rotateZ(Math.PI / 2), C.tech, { name: 'barbell', pos: [0, 0.95, -0.5], outline: 0 });
  for (const sx of [-1, 1]) for (const o of [0, 1]) mk(bench, cyl(0.16 - o * 0.04, 0.16 - o * 0.04, 0.05, 14).rotateZ(Math.PI / 2), o ? C.accent : C.dark, { name: 'barbell_plate', pos: [sx * (0.5 + o * 0.06), 0.95, -0.5], outline: 0.03 });
  marker(bench, `${name}_lie`, [0, 0.35, 0.05], 0);
}

function buildEquipment(root: THREE.Object3D): void {
  const eq = group(root, 'equipment');
  const fy = FLOOR_TOP;
  // 6 esteiras largas na parede de trás, três de cada lado do corredor central
  TM_X.forEach((x, i) => treadmill(eq, `treadmill_${i}`, [x, fy, TM_Z]));
  // 2 bancos de supino na frente, à esquerda
  benchPress(eq, 'bench_press_0', [-3.5, fy, 1.15]);
  benchPress(eq, 'bench_press_1', [-2.1, fy, 1.15]);
  // 2 bicicletas na frente, à direita
  bike(eq, 'bike_0', [2.35, fy, 1.15]);
  bike(eq, 'bike_1', [3.5, fy, 1.15]);
  // estantes de halteres nos cantos da frente
  [-4.25, 4.25].forEach((x, ri) => {
    const rack = group(eq, `dumbbell_rack_${ri}`, [x, fy, 1.75], [0, ri ? -Math.PI / 2 : Math.PI / 2, 0]);
    mk(rack, rbox(0.9, 0.06, 0.45, 0.02), C.dark, { name: 'rack_base', pos: [0, 0.03, 0], outline: 0.02 });
    for (const sx of [-1, 1]) mk(rack, rbox(0.05, 0.9, 0.05, 0.02), C.tech, { name: 'rack_post', pos: [sx * 0.42, 0.45, 0], outline: 0.02 });
    for (const ry of [0.3, 0.62]) mk(rack, rbox(0.9, 0.04, 0.32, 0.015), C.hull2, { name: 'rack_shelf', pos: [0, ry, 0], outline: 0.02 });
    [C.accent, C.navy, 0x5aa5a0, C.accent, C.navy, 0x5aa5a0].forEach((c, i) => dumbbell(rack, [-0.3 + (i % 3) * 0.3, 0.37 + Math.floor(i / 3) * 0.32, 0], c));
    marker(eq, `dumbbell_rack_${ri}_use`, [x - Math.sign(x) * 0.8, fy, 1.75], ri ? Math.PI / 2 : -Math.PI / 2);
  });
  // área de alongamento no meio: tapetes de yoga e bola
  [[-0.65, 0x5aa5a0], [0, C.accent], [0.65, 0x7b6aa8]].forEach(([x, c], i) => {
    rug(eq, `mat_${i}`, [x as number, fy + 0.012, 0.95], 0.6, 1.7, c as number);
    marker(eq, `mat_${i}_use`, [x as number, fy + 0.025, 0.95], Math.PI);
  });
  mk(eq, sphere(0.32, 16, 12), 0x4a90e2, { name: 'exercise_ball_0', pos: [-1.25, fy + 0.32, 1.88], outline: 0.03 });
  mk(eq, sphere(0.28, 16, 12), 0xe5573d, { name: 'exercise_ball_1', pos: [-1.25, fy + 0.28, 1.25], outline: 0.03 });
  // bebedouro e cesta de toalhas perto do tubo de acesso
  mk(eq, rbox(0.38, 1.0, 0.38, 0.05), C.hull2, { name: 'cooler_body', pos: [1.5, fy + 0.5, 1.95], outline: 0.03 });
  mk(eq, cyl(0.15, 0.15, 0.38, 14), C.glass, { name: 'cooler_bottle', pos: [1.5, fy + 1.2, 1.95], outline: 0.04 });
  marker(eq, 'cooler_use', [1.5, fy, 1.2], Math.PI);
  mk(eq, rbox(0.5, 0.36, 0.4, 0.06), C.accent, { name: 'towel_basket', pos: [1.5, fy + 0.18, 1.3], outline: 0.03 });
  for (const tx of [-0.12, 0.1]) mk(eq, rbox(0.2, 0.14, 0.3, 0.05), 0xffffff, { name: 'towel', pos: [1.5 + tx, fy + 0.42, 1.3], outline: 0.03 });
  // luminárias penduradas sobre as esteiras
  for (const lx of [-2.5, 0, 2.5]) {
    mk(eq, cyl(0.012, 0.012, 1.0, 6), C.dark, { name: 'pendant_cord', pos: [lx, 4.78, -1.0], outline: 0 });
    mk(eq, cyl(0.1, 0.28, 0.16, 14), C.accent, { name: 'pendant_shade', pos: [lx, 4.2, -1.0], outline: 0.03 });
    mk(eq, sphere(0.09, 10, 8), 0xffe2a8, { name: 'pendant_bulb', pos: [lx, 4.12, -1.0], outline: 0, mat: WARM });
  }
}

/** Clipe "treadmills_run": as listras de cada correia correm de +Z para -Z (para quem corre olhando para +Z). */
function treadmillClip(): THREE.AnimationClip {
  const T = 1.2;
  const tracks: THREE.KeyframeTrack[] = [];
  const zStart = -BELT_LEN / 2 + 0.1 + BELT_LEN; // frente da correia, onde a listra aparece
  const zEnd = -BELT_LEN / 2 + 0.1; // fim da correia, onde some
  for (let i = 0; i < TM_X.length; i++) {
    for (let k = 0; k < BELT_STRIPES; k++) {
      tracks.push(...lineRunTracks(`treadmill_${i}_stripe_${k}`, v(0, 0.237, zStart), v(0, 0.237, zEnd), T, k / BELT_STRIPES, 4));
    }
  }
  return new THREE.AnimationClip('treadmills_run', T, tracks);
}

export function createGym(): GymModel {
  const root = new THREE.Group();
  root.name = 'gym';
  const tex: BlockTex = { hull: hullTexture('neutral'), box: boxTexture('neutral'), hazard: hazardTexture(), labels: labelTexture() };
  buildGlassCylinder(root, tex, { lc: LC, signText: 'ACADEMIA', signStripe: '#e5573d', signName: 'label_academia' });
  buildEquipment(root);
  return { root, clips: [treadmillClip()] };
}
