import * as THREE from 'three';
import { COLORS as C, cyl, group, merge, mk, mkBeam, rbox } from './common';

/**
 * Campo de painéis solares (ARC-004): 2 fileiras de 5, nas MESMAS posições da cena atual
 * (src/scene/MarsBase.ts, buildPanels). Basta pôr o modelo na origem.
 *
 * As células voltam para +Z (lado do sol e da câmera). Peças com nome fixo:
 * - "solar_panel_N": cada painel (N = 0 a 9, fileira a fileira);
 * - "panel_cells_N" (material "panel_cells"): a superfície azul que o jogo cobre de poeira;
 * - material "panel_grid": as linhas claras entre as células (também podem receber poeira).
 */

const COLS = 5;
const ROWS = 2;
const TILT = 0.35; // mesmo ângulo da cena atual
const PANEL_Y = 1.15;

export interface SolarPanelsModel {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
}

export function createSolarPanels(): SolarPanelsModel {
  const root = new THREE.Group();
  root.name = 'solar_field';

  const footGeo = rbox(0.62, 0.16, 0.52, 0.06);
  const postGeo = cyl(0.07, 0.08, 0.94, 10);
  const collarGeo = cyl(0.1, 0.1, 0.06, 12);
  const boxGeo = rbox(0.24, 0.3, 0.12, 0.04);
  const ledGeo = rbox(0.05, 0.05, 0.03, 0.015);
  const hingeGeo = rbox(0.34, 0.15, 0.18, 0.05);
  const frameGeo = rbox(2.26, 0.07, 1.36, 0.03);
  const cellsGeo = rbox(2.14, 0.03, 1.24, 0.012);
  const railGeo = rbox(2.1, 0.06, 0.08, 0.025);
  // grade das células: 6 colunas x 3 linhas
  const strips: THREE.BufferGeometry[] = [];
  for (let k = 1; k < 6; k++) strips.push(new THREE.BoxGeometry(0.02, 0.012, 1.2).translate(-1.07 + (2.14 * k) / 6, 0, 0));
  for (let k = 1; k < 3; k++) strips.push(new THREE.BoxGeometry(2.1, 0.012, 0.02).translate(0, 0, -0.62 + (1.24 * k) / 3));
  const gridGeo = merge(strips);

  let n = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++, n++) {
      const x = 12 + col * 2.5;
      const z = 2 + row * 2.3;
      const unit = group(root, `solar_panel_${n}`, [x, 0, z]);
      mk(unit, footGeo, C.dark, { name: `solar_panel_${n}_foot`, pos: [0, 0.08, 0], outline: 0.04 });
      mk(unit, postGeo, C.tech, { name: `solar_panel_${n}_post`, pos: [0, 0.62, 0], outline: 0.04 });
      mk(unit, collarGeo, C.accent, { name: `solar_panel_${n}_collar`, pos: [0, 0.36, 0], outline: 0 });
      mk(unit, boxGeo, C.hull2, { name: `solar_panel_${n}_box`, pos: [0, 0.66, 0.12], outline: 0.05 });
      mk(unit, ledGeo, C.glow, { name: `solar_panel_${n}_led`, pos: [0.05, 0.74, 0.19], outline: 0, mat: { glow: 0.9 } });
      mk(unit, hingeGeo, C.dark, { name: `solar_panel_${n}_hinge`, pos: [0, 1.1, 0], outline: 0.04 });
      for (const bx of [-0.55, 0.55]) mkBeam(unit, [0, 0.72, -0.02], [bx, 1.2, -0.42], 0.05, C.tech, { name: `solar_panel_${n}_brace`, outline: 0 });

      const panel = group(unit, `panel_${n}`, [0, PANEL_Y, 0], [TILT, 0, 0]);
      mk(panel, frameGeo, C.hull, { name: `panel_${n}_frame`, outline: 0.02 });
      mk(panel, cellsGeo, C.solar, { name: `panel_cells_${n}`, pos: [0, 0.03, 0], outline: 0, mat: { name: 'panel_cells' } });
      mk(panel, gridGeo, C.solarGrid, { name: `panel_${n}_grid`, pos: [0, 0.048, 0], outline: 0, mat: { name: 'panel_grid' } });
      for (const rz of [-0.4, 0.4]) mk(panel, railGeo, C.tech, { name: `panel_${n}_rail`, pos: [0, -0.06, rz], outline: 0 });
      // cantoneiras laranja nas pontas da moldura
      for (const cx of [-1.1, 1.1]) mk(panel, rbox(0.1, 0.08, 1.38, 0.03), C.accent, { name: `panel_${n}_cap`, pos: [cx, 0, 0], outline: 0 });
    }
  }

  // calha de cabos no meio das fileiras e caixa de junção na ponta (dentro do obstáculo da cena)
  const zMid = 2 + 2.3 / 2;
  mk(root, rbox(10.9, 0.08, 0.24, 0.03), C.dark, { name: 'cable_tray', pos: [17.25, 0.04, zMid], outline: 0 });
  const box = group(root, 'combiner_box', [23.0, 0, zMid]);
  mk(box, rbox(0.7, 0.95, 0.56, 0.1), C.hull2, { name: 'combiner_body', pos: [0, 0.5, 0], outline: 0.04 });
  mk(box, rbox(0.74, 0.1, 0.6, 0.04), C.accent, { name: 'combiner_band', pos: [0, 0.8, 0], outline: 0 });
  mk(box, rbox(0.76, 0.1, 0.62, 0.04), C.dark, { name: 'combiner_base', pos: [0, 0.05, 0], outline: 0 });
  for (let i = 0; i < 3; i++) mk(box, rbox(0.06, 0.06, 0.03, 0.015), C.glow, { name: 'combiner_led', pos: [-0.15 + i * 0.15, 0.62, 0.29], outline: 0, mat: { glow: 0.9 } });
  for (let i = 0; i < 3; i++) mk(box, rbox(0.4, 0.035, 0.03, 0.012), C.dark, { name: 'combiner_vent', pos: [0, 0.32 + i * 0.08, 0.285], outline: 0 });

  return { root, clips: [] };
}
