import * as THREE from 'three';
import { COLORS as C, cyl, group, mk, rbox, sphere, type V3 } from './common';
import { type BlockTex } from './GreenhouseBase';
import { boxTexture, hazardTexture, hullTexture, labelTexture } from './textures';
import { bed, FLOOR_TOP, locker, rug, SEAT_Y, TABLE_Y, WARM } from './GlassBlock';
import { buildGlassCylinder, CAP, DZ } from './GlassCylinder';

/**
 * Bloco "Dormitório" (BASE-DOR): cilindro GRANDE de vidro com treliça, como o da estufa, com 4 camas
 * (uma por tripulante), armários, mesas de estudo e uma área de leitura por dentro. Móveis na escala do astronauta. Mesmo eixo, mesmas portas de acoplamento
 * e mesma porta de 1,95 m dos outros blocos (INTERPRETADO a partir dos habitats de superfície da NASA).
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
 * - material "window": lâmpadas dos beliches e luminárias (acendem à noite); material "base_lights": faixas de LED;
 * - "alarm_light" (material "alarm"): luz de alerta no topo do tubo de acesso;
 * - "bed_N": as 4 camas; "locker_N": os 6 armários; "desk_N": as 2 mesas; "label_dormitorio": plaquinha;
 * - pontos de interação (nós vazios): "bed_N_sit", "bed_N_lie", "desk_N_sit", "locker_N_use", "beanbag_N_sit".
 */

export interface DormitoryModel {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
}

export const LC = 9; // trecho reto (vidro)
export const TOTAL = LC + 2 * CAP;
export const ASTRONAUT_VANISH = 4.1 + DZ;

/** Mesa de estudo (tampo a 0,58 m) com cadeira (assento a 0,33 m). Frente da mesa em +Z local. Ponto `<nome>_sit`. */
function desk(parent: THREE.Object3D, name: string, pos: V3, rotY: number): void {
  const d = group(parent, name, pos, [0, rotY, 0]);
  mk(d, rbox(1.3, 0.06, 0.62, 0.025), C.hull2, { name: 'desk_top', pos: [0, TABLE_Y - 0.03, 0], outline: 0.025 });
  for (const sx of [-1, 1]) mk(d, rbox(0.06, TABLE_Y - 0.06, 0.56, 0.02), C.dark, { name: 'desk_leg', pos: [sx * 0.6, (TABLE_Y - 0.06) / 2, 0], outline: 0.02 });
  mk(d, rbox(0.06, 0.3, 0.06, 0.02), C.tech, { name: 'desk_stand', pos: [0, TABLE_Y + 0.15, -0.2], outline: 0 });
  mk(d, rbox(0.6, 0.38, 0.03, 0.012), C.dark, { name: 'desk_screen_frame', pos: [0, TABLE_Y + 0.48, -0.18], outline: 0.02 });
  mk(d, rbox(0.54, 0.32, 0.012, 0.005), C.glow, { name: 'desk_screen', pos: [0, TABLE_Y + 0.48, -0.16], outline: 0, mat: { name: 'treadmill_screen', glow: 0.7 } });
  // cadeira afastada da mesa: o capacete passa por cima do tampo
  const cz = 0.82;
  mk(d, rbox(0.52, 0.07, 0.48, 0.03), C.navy, { name: 'chair_seat', pos: [0, SEAT_Y - 0.035, cz], outline: 0.025 });
  mk(d, cyl(0.03, 0.03, SEAT_Y - 0.07, 8), C.dark, { name: 'chair_post', pos: [0, (SEAT_Y - 0.07) / 2, cz], outline: 0 });
  mk(d, cyl(0.24, 0.26, 0.04, 14), C.dark, { name: 'chair_base', pos: [0, 0.02, cz], outline: 0.02 });
  mk(d, rbox(0.5, 0.45, 0.06, 0.02), C.navy, { name: 'chair_back', pos: [0, SEAT_Y + 0.3, cz + 0.48], outline: 0.025 });
  const sit = new THREE.Object3D();
  sit.name = `${name}_sit`;
  sit.position.set(0, SEAT_Y, cz);
  sit.rotation.y = Math.PI;
  d.add(sit);
}

function buildInterior(root: THREE.Object3D): void {
  const inn = group(root, 'interior');
  const fy = FLOOR_TOP;
  // 4 camas de solteiro na parede de trás (uma por tripulante), cabeceiras alternadas
  [-3.4, -1.15, 1.15, 3.4].forEach((x, i) => bed(inn, `bed_${i}`, [x, fy, -1.62], i % 2 ? Math.PI : 0, i));
  // 6 armários na parede da frente, três de cada lado do corredor de acesso
  [-4.05, -3.45, -2.85, 2.85, 3.45, 4.05].forEach((x, i) => locker(inn, `locker_${i}`, [x, fy, 1.85], Math.PI));
  // 2 mesas de estudo entre os armários e o tubo de acesso
  desk(inn, 'desk_0', [-1.75, fy, 1.82], Math.PI);
  desk(inn, 'desk_1', [1.75, fy, 1.82], Math.PI);
  // área de leitura no meio (corredor de 1 m livre na frente das camas)
  rug(inn, 'rug_main', [0, fy + 0.012, 0.42], 2.5, 1.0, 0x33577f);
  rug(inn, 'rug_inner', [0, fy + 0.02, 0.42], 2.1, 0.7, 0x4f7bb0);
  mk(inn, cyl(0.4, 0.4, 0.05, 24), C.hull2, { name: 'coffee_table_top', pos: [0, fy + 0.3, 0.42], outline: 0.03 });
  mk(inn, cyl(0.07, 0.12, 0.28, 12), C.tech, { name: 'coffee_table_leg', pos: [0, fy + 0.14, 0.42], outline: 0.025 });
  mk(inn, sphere(0.07, 10, 8), C.accent, { name: 'mug', pos: [0.12, fy + 0.37, 0.4], scale: [1, 0.9, 1], outline: 0.03 });
  [[-0.95, C.accent], [0.95, 0x5aa5a0]].forEach(([x, col], i) => {
    mk(inn, sphere(0.42, 16, 12), col as number, { name: `beanbag_${i}`, pos: [x as number, fy + 0.2, 0.42], scale: [1, 0.55, 1], outline: 0.03 });
    const sit = new THREE.Object3D();
    sit.name = `beanbag_${i}_sit`;
    sit.position.set(x as number, fy + 0.32, 0.42);
    sit.rotation.y = (x as number) < 0 ? Math.PI / 2 : -Math.PI / 2;
    inn.add(sit);
  });
  // luminárias de chão e penduradas
  [-4.3, 4.3].forEach((x) => {
    mk(inn, cyl(0.025, 0.025, 1.4, 8), C.tech, { name: 'floor_lamp_pole', pos: [x, fy + 0.7, 0.75], outline: 0 });
    mk(inn, sphere(0.16, 12, 8), 0xffe2a8, { name: 'floor_lamp', pos: [x, fy + 1.5, 0.75], outline: 0, mat: WARM });
    mk(inn, cyl(0.2, 0.22, 0.04, 14), C.dark, { name: 'floor_lamp_base', pos: [x, fy + 0.02, 0.75], outline: 0.02 });
  });
  for (const lx of [-1.4, 1.4]) {
    const top = 4.2;
    mk(inn, cyl(0.012, 0.012, 1.0, 6), C.dark, { name: 'pendant_cord', pos: [lx, top + 0.58, 0.2], outline: 0 });
    mk(inn, cyl(0.1, 0.26, 0.16, 14), C.accent, { name: 'pendant_shade', pos: [lx, top, 0.2], outline: 0.03 });
    mk(inn, sphere(0.09, 10, 8), 0xffe2a8, { name: 'pendant_bulb', pos: [lx, top - 0.08, 0.2], outline: 0, mat: WARM });
  }
}

export function createDormitory(): DormitoryModel {
  const root = new THREE.Group();
  root.name = 'dormitory';
  const tex: BlockTex = { hull: hullTexture('neutral'), box: boxTexture('neutral'), hazard: hazardTexture(), labels: labelTexture() };
  buildGlassCylinder(root, tex, { lc: LC, signText: 'DORMITÓRIO', signStripe: '#4aa3e8', signName: 'label_dormitorio' });
  buildInterior(root);
  return { root, clips: [] };
}
