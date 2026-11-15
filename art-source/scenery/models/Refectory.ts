import * as THREE from 'three';
import { COLORS as C, cyl, group, mk, rbox, sphere, type V3 } from './common';
import { type BlockTex } from './GreenhouseBase';
import { boxTexture, hazardTexture, hullTexture, labelTexture } from './textures';
import { FLOOR_TOP, rug, table, TABLE_Y, tray, WARM } from './GlassBlock';
import { buildGlassCylinder, CAP } from './GlassCylinder';

/**
 * Bloco "Refeitório" (BASE-REF): cilindro GRANDE de vidro com treliça, como o da estufa, com cozinha completa,
 * 2 mesas compridas com bancos (12 lugares) e luminárias por dentro. Móveis na escala do astronauta. Mesmo eixo, mesmas portas de acoplamento e mesma porta de 1,95 m
 * dos outros blocos (INTERPRETADO a partir dos habitats de superfície da NASA).
 *
 * Referencial: origem no chão, no centro do bloco. Eixo comprido em X; frente (porta) em +Z.
 * Tamanho: 10,2 m de porta a porta (trecho reto de vidro de 8 m entre duas tampas opacas), 5,2 m de diâmetro.
 * A barriga fica opaca e o piso interno fica a 1,72 m, na altura das escotilhas. O bloco se apoia em 4 selas.
 *
 * Para ligar blocos: "port_a" (ponta -X) e "port_b" (ponta +X), iguais às dos outros blocos.
 *
 * Peças com nome fixo:
 * - "hatch_door": porta de entrada, no chão (1,0 x 1,95 m). O astronauta entra em (0; 0; 5,1) e some;
 * - "dome_glass" (material "dome_glass"): vidro (o mesmo da estufa);
 * - material "window": luminárias penduradas (acendem à noite); material "base_lights": faixas de LED;
 * - "alarm_light" (material "alarm"): luz de alerta no topo do tubo de acesso;
 * - "table_N": as 2 mesas; "kitchen": o balcão da cozinha; "fridge": a geladeira; "label_refeitorio": plaquinha;
 * - pontos de interação (nós vazios): "table_N_seat_K", "kitchen_sink_use", "kitchen_stove_use",
 *   "kitchen_serve_use", "fridge_use", "pantry_use", "cooler_use".
 */

export interface RefectoryModel {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
}

export const LC = 8; // trecho reto (vidro)
export const TOTAL = LC + 2 * CAP;

function marker(parent: THREE.Object3D, name: string, pos: V3, rotY: number): void {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(...pos);
  o.rotation.y = rotY;
  parent.add(o);
}

function buildKitchen(root: THREE.Object3D): void {
  const k = group(root, 'kitchen', [0, FLOOR_TOP, -1.95]);
  const L = 6.2; // comprimento do balcão
  const H = 0.7; // altura do balcão: abaixo do ombro do astronauta (0,95 m), o capacete passa por cima
  mk(k, rbox(L, H - 0.03, 0.62, 0.05), C.hull2, { name: 'counter_body', pos: [0, (H - 0.03) / 2, 0], outline: 0.03 });
  mk(k, rbox(L + 0.06, 0.06, 0.68, 0.03), C.dark, { name: 'counter_top', pos: [0, H, 0], outline: 0.025 });
  const n = Math.round(L / 0.55);
  for (let i = 0; i <= n; i++) mk(k, rbox(0.02, H - 0.24, 0.02, 0.008), C.dark, { name: 'counter_split', pos: [-L / 2 + i * (L / n), (H - 0.24) / 2 + 0.06, 0.315], outline: 0 });
  for (let i = 0; i < n; i++) mk(k, rbox(0.14, 0.03, 0.03, 0.01), C.accent, { name: 'counter_handle', pos: [-L / 2 + (i + 0.5) * (L / n), H - 0.15, 0.33], outline: 0 });
  // pia dupla e torneira
  for (const sx of [-1.9, -1.35]) mk(k, rbox(0.5, 0.04, 0.4, 0.02), 0x2a2830, { name: 'sink', pos: [sx, H + 0.04, 0], outline: 0 });
  mk(k, cyl(0.02, 0.02, 0.3, 8), C.tech, { name: 'faucet_pole', pos: [-1.62, H + 0.18, -0.22], outline: 0 });
  mk(k, rbox(0.04, 0.04, 0.2, 0.015), C.tech, { name: 'faucet_spout', pos: [-1.62, H + 0.33, -0.12], outline: 0 });
  // fogão com quatro bocas e panelas
  mk(k, rbox(1.3, 0.03, 0.52, 0.012), C.dark, { name: 'cooktop', pos: [0.2, H + 0.045, 0], outline: 0 });
  [-0.4, -0.05, 0.3, 0.65].forEach((bx, i) => {
    const bz = i % 2 ? -0.08 : 0.08;
    mk(k, cyl(0.12, 0.12, 0.012, 16), C.accent, { name: 'burner', pos: [0.2 + bx, H + 0.065, bz], outline: 0 });
    if (i !== 2) {
      mk(k, cyl(0.12, 0.13, 0.16, 16), C.tech, { name: 'pot', pos: [0.2 + bx, H + 0.15, bz], outline: 0.035 });
      mk(k, sphere(0.04, 8, 6), C.dark, { name: 'pot_knob', pos: [0.2 + bx, H + 0.25, bz], outline: 0 });
    }
  });
  // coifa em cima do fogão (acima do capacete)
  mk(k, rbox(1.3, 0.14, 0.42, 0.04), C.hull2, { name: 'hood', pos: [0.2, 2.0, -0.08], outline: 0.025 });
  mk(k, rbox(1.0, 0.04, 0.36, 0.015), C.accent, { name: 'hood_stripe', pos: [0.2, 1.91, -0.08], outline: 0 });
  // área de servir: bandejas e vitrine de frutas na ponta direita
  for (let i = 0; i < 3; i++) tray(k, [1.9 + i * 0.4, H + 0.03, 0.0], i);
  mk(k, rbox(1.0, 0.25, 0.4, 0.04), C.glass, { name: 'display_case', pos: [2.7, H + 0.155, 0], outline: 0.025, mat: { name: 'dome_glass', opacity: 0.26 } });
  for (let i = 0; i < 4; i++) mk(k, sphere(0.07, 10, 8), [0xe5573d, 0xf3d36b, 0xe8792b, 0x7bb661][i], { name: 'fruit_display', pos: [2.4 + i * 0.2, H + 0.1, 0], outline: 0.03 });
  // prateleiras na parede com potes (atrás, longe do capacete)
  for (const sy of [1.5, 1.9]) {
    mk(k, rbox(2.7, 0.05, 0.28, 0.02), C.hull2, { name: 'shelf', pos: [-1.8, sy, -0.15], outline: 0.02 });
    for (let i = 0; i < 7; i++) mk(k, cyl(0.07, 0.07, 0.2, 12), [C.glass, 0xe8792b, 0xf3d36b][i % 3], { name: 'jar', pos: [-2.95 + i * 0.37, sy + 0.125, -0.15], outline: 0.035 });
  }
  // pontos de interação na frente do balcão (olhando para ele)
  marker(k, 'kitchen_sink_use', [-1.62, 0, 0.8], Math.PI);
  marker(k, 'kitchen_stove_use', [0.2, 0, 0.8], Math.PI);
  marker(k, 'kitchen_serve_use', [2.3, 0, 0.8], Math.PI);
  // geladeira e armário de mantimentos nas pontas
  const f = group(root, 'fridge', [-3.45, FLOOR_TOP, -1.95]);
  mk(f, rbox(0.8, 1.9, 0.7, 0.07), C.hull, { name: 'fridge_body', pos: [0, 0.95, 0], outline: 0.03 });
  mk(f, rbox(0.82, 0.02, 0.02, 0.008), C.dark, { name: 'fridge_split', pos: [0, 1.15, 0.355], outline: 0 });
  mk(f, rbox(0.04, 0.4, 0.04, 0.015), C.accent, { name: 'fridge_handle', pos: [0.28, 1.4, 0.37], outline: 0 });
  mk(f, rbox(0.04, 0.3, 0.04, 0.015), C.accent, { name: 'fridge_handle', pos: [0.28, 0.75, 0.37], outline: 0 });
  mk(f, rbox(0.1, 0.04, 0.03, 0.01), C.glow, { name: 'fridge_led', pos: [-0.2, 1.8, 0.36], outline: 0, mat: { glow: 0.9 } });
  marker(f, 'fridge_use', [0, 0, 0.85], Math.PI);
  const p = group(root, 'pantry', [3.5, FLOOR_TOP, -1.95]);
  mk(p, rbox(0.8, 1.9, 0.62, 0.06), C.hull2, { name: 'pantry_body', pos: [0, 0.95, 0], outline: 0.03 });
  for (const py of [0.5, 0.95, 1.4, 1.8]) mk(p, rbox(0.7, 0.03, 0.04, 0.01), C.dark, { name: 'pantry_slat', pos: [0, py, 0.33], outline: 0 });
  mk(p, rbox(0.04, 0.5, 0.04, 0.015), C.accent, { name: 'pantry_handle', pos: [0.28, 1.0, 0.33], outline: 0 });
  marker(p, 'pantry_use', [0, 0, 0.8], Math.PI);
}

const TABLES: [number, number][] = [[-2.15, 0.45], [2.15, 0.45]];
const TABLE_LEN = 3.3; // 3 lugares de cada lado (um a cada 1,1 m)

function buildDining(root: THREE.Object3D): void {
  const d = group(root, 'dining');
  const fy = FLOOR_TOP;
  // 2 mesas compridas (12 lugares), corredor de 1 m no meio e de 0,9 m na frente do balcão
  TABLES.forEach(([x, z], i) => {
    table(d, `table_${i}`, [x, fy, z], TABLE_LEN);
    for (let k = 0; k < 3; k++) {
      tray(d, [x - 1.1 + k * 1.1, fy + TABLE_Y, z - 0.22], k + i);
      tray(d, [x - 1.1 + k * 1.1, fy + TABLE_Y, z + 0.22], k + i + 1);
    }
  });
  // tapete no corredor do meio e luminárias penduradas sobre as mesas
  rug(d, 'rug', [0, fy + 0.012, 0.45], 0.9, 2.4, 0xe8792b);
  const ly = 4.2;
  TABLES.forEach(([x, z]) => {
    for (const dx of [-0.85, 0.85]) {
      mk(d, cyl(0.012, 0.012, 1.0, 6), C.dark, { name: 'pendant_cord', pos: [x + dx, ly + 0.58, z], outline: 0 });
      mk(d, cyl(0.1, 0.28, 0.16, 14), C.accent, { name: 'pendant_shade', pos: [x + dx, ly, z], outline: 0.03 });
      mk(d, sphere(0.09, 10, 8), 0xffe2a8, { name: 'pendant_bulb', pos: [x + dx, ly - 0.08, z], outline: 0, mat: WARM });
    }
  });
  // lixeira e bebedouro nos cantos da frente (o meio fica livre para o tubo de acesso)
  mk(d, cyl(0.2, 0.17, 0.55, 14), C.tech, { name: 'bin', pos: [3.85, fy + 0.275, 1.9], outline: 0.03 });
  mk(d, cyl(0.21, 0.21, 0.04, 14), C.accent, { name: 'bin_lid', pos: [3.85, fy + 0.57, 1.9], outline: 0 });
  mk(d, rbox(0.38, 1.0, 0.38, 0.05), C.hull2, { name: 'cooler_body', pos: [-3.85, fy + 0.5, 1.9], outline: 0.03 });
  mk(d, cyl(0.15, 0.15, 0.38, 14), C.glass, { name: 'cooler_bottle', pos: [-3.85, fy + 1.2, 1.9], outline: 0.04 });
  marker(d, 'cooler_use', [-3.85, fy, 1.15], Math.PI);
}

export function createRefectory(): RefectoryModel {
  const root = new THREE.Group();
  root.name = 'refectory';
  const tex: BlockTex = { hull: hullTexture('neutral'), box: boxTexture('neutral'), hazard: hazardTexture(), labels: labelTexture() };
  buildGlassCylinder(root, tex, { lc: LC, signText: 'REFEITÓRIO', signStripe: '#e8792b', signName: 'label_refeitorio' });
  buildKitchen(root);
  buildDining(root);
  return { root, clips: [] };
}
