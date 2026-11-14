import * as THREE from 'three';
import { COLORS as C, cyl, emblem, group, merge, mk, mkBeam, rbox, rboxUV, rodsGeometry, smooth, sphere, type V3 } from './common';
import { boxTexture } from './textures';

/**
 * Rover científico (VEH-001), versão 2: inspirado no rover de exploração lunar que a NASA projeta
 * para a base do programa Artemis (INTERPRETADO), no estilo cartoon do astronauta chibi.
 * Serve nos dois mundos do jogo (Lua e Marte): cores neutras, poeira cinza-bege.
 *
 * O que tem, como na referência: 6 rodas grandes de raios em espiral e pneu ranhurado, suspensão
 * rocker-bogie escura com atuadores de direção nas rodas dos cantos, reforços escuros inclinados nas laterais,
 * mastro com cabeça de câmera, broca vertical na frente, blocos de LED e radiador com canos atrás.
 *
 * Referencial (o mesmo do rover anterior): frente em +X, chão em y = 0.
 * Rodas de raio WHEEL_RADIUS = 0,34 m em x = 0,82 / 0 / -0,82 e z = ±0,82.
 *
 * Peças com nome fixo:
 * - "wheel_0" a "wheel_5": grupos das rodas, sem rotação inicial. O jogo gira cada um no eixo Z
 *   conforme a distância andada: rotation.z -= distância / 0,34;
 * - "mast_head": cabeça da câmera (clipe "scan" olha para os lados);
 * - "warning_light" (material "warning"): luz âmbar de aviso;
 * - material "rover_lights": todos os LEDs (o jogo pode deixar mais fortes à noite);
 * - "drill", "drill_carriage", "drill_bit": broca (clipe "drill" desce, gira e sobe).
 */

export interface RoverModel {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
}

export const WHEEL_RADIUS = 0.34;
const WHEEL_X = [0.82, 0, -0.82];
const WHEEL_Z = 0.82;
const TIRE_W = 0.26;
const LED = { name: 'rover_lights', glow: 0.95 };

// ---------- rodas ----------

function wheelGeometries() {
  const R = WHEEL_RADIUS;
  const r0 = 0.265; // borda de dentro do pneu
  const hw = TIRE_W / 2;
  const cr = 0.045;
  const prof: THREE.Vector2[] = [new THREE.Vector2(r0, -hw + 0.005), new THREE.Vector2(R - cr, -hw)];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 1; i <= 4; i++) {
      const a = a0 + ((a1 - a0) * i) / 4;
      prof.push(new THREE.Vector2(cx + Math.cos(a) * cr, cy + Math.sin(a) * cr));
    }
  };
  arc(R - cr, -hw + cr, -Math.PI / 2, 0);
  prof.push(new THREE.Vector2(R, hw - cr));
  arc(R - cr, hw - cr, 0, Math.PI / 2);
  prof.push(new THREE.Vector2(r0, hw - 0.005));
  prof.push(new THREE.Vector2(r0 - 0.01, 0)); // fecha por dentro
  prof.push(new THREE.Vector2(r0, -hw + 0.005));
  const tire = smooth(new THREE.LatheGeometry(prof, 36));
  tire.rotateX(Math.PI / 2);
  // ranhuras densas na banda de rodagem
  const parts: THREE.BufferGeometry[] = [tire];
  const N = 30;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const g = new THREE.BoxGeometry(0.026, 0.034, TIRE_W - 0.03);
    g.rotateZ(a);
    g.translate(Math.cos(a) * (R + 0.004), Math.sin(a) * (R + 0.004), 0);
    parts.push(g);
  }
  const tireGeo = merge(parts);

  // raios em espiral (do cubo até o aro), na face de fora
  const spokes: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const a0 = (k / 5) * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const r = 0.07 + t * (r0 - 0.075);
      const a = a0 + t * 1.25 + Math.sin(t * Math.PI) * 0.15;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.045 - t * 0.02));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.019, 6, false);
    tube.deleteAttribute('uv');
    spokes.push(tube);
  }
  const spokeGeo = merge(spokes);
  const rim = new THREE.TorusGeometry(r0 - 0.008, 0.016, 6, 40);
  rim.deleteAttribute('uv');
  const backWall = cyl(r0, r0, 0.02, 36);
  backWall.rotateX(Math.PI / 2);
  const hub = cyl(0.075, 0.085, 0.16, 18);
  hub.rotateX(Math.PI / 2);
  const cap = cyl(0.045, 0.055, 0.04, 14);
  cap.rotateX(Math.PI / 2);
  const motor = cyl(0.1, 0.1, 0.12, 18);
  motor.rotateX(Math.PI / 2);
  return { tireGeo, spokeGeo, rimGeo: rim, backWall, hub, cap, motor };
}

function buildWheels(root: THREE.Object3D): void {
  const g = wheelGeometries();
  let i = 0;
  for (const x of WHEEL_X) {
    for (const side of [1, -1]) {
      const wheel = group(root, `wheel_${i}`, [x, WHEEL_RADIUS, side * WHEEL_Z]);
      // corpo da roda espelhado do lado -Z, sem mexer no eixo de giro do grupo
      const body = group(wheel, `wheel_${i}_body`, [0, 0, 0], [0, side > 0 ? 0 : Math.PI, 0]);
      mk(body, g.tireGeo, C.dark, { name: `wheel_${i}_tire`, outline: 0.035 });
      mk(body, g.backWall, C.dark, { name: `wheel_${i}_back`, pos: [0, 0, -0.07], outline: 0 });
      mk(body, g.rimGeo, C.hull2, { name: `wheel_${i}_rim`, pos: [0, 0, 0.05], outline: 0 });
      mk(body, g.spokeGeo, C.hull, { name: `wheel_${i}_spokes`, outline: 0 });
      mk(body, g.hub, C.dark, { name: `wheel_${i}_hub`, outline: 0.04 });
      mk(body, g.cap, C.accent, { name: `wheel_${i}_cap`, pos: [0, 0, 0.085], outline: 0 });
      i++;
    }
  }
}

// ---------- suspensão ----------

function buildSuspension(root: THREE.Object3D): void {
  const sus = group(root, 'suspension');
  const t = 0.1;
  for (const side of [1, -1]) {
    const z = side * 0.66;
    const P: V3 = [0.12, 0.84, z]; // pivô do balancim no corpo
    const B: V3 = [-0.42, 0.66, z]; // pivô do truque
    const top = 0.66; // altura dos atuadores de direção
    mkBeam(sus, P, [0.82, top, z], t, C.dark, { name: 'rocker_front', outline: 0.035 });
    mkBeam(sus, P, B, t, C.dark, { name: 'rocker_back', outline: 0.035 });
    mkBeam(sus, B, [0, top - 0.04, z], t * 0.9, C.dark, { name: 'bogie_front', outline: 0.035 });
    mkBeam(sus, B, [-0.82, top, z], t * 0.9, C.dark, { name: 'bogie_back', outline: 0.035 });
    for (const x of WHEEL_X) {
      const corner = x !== 0;
      // garfo descendo até o motor da roda (lado de dentro)
      mkBeam(sus, [x, corner ? top : top - 0.04, z], [x, WHEEL_RADIUS, z], 0.08, C.dark, { name: 'wheel_fork', outline: 0.035 });
      const motor = cyl(0.095, 0.095, 0.12, 16);
      motor.rotateX(Math.PI / 2);
      mk(sus, motor, C.tech, { name: 'wheel_motor', pos: [x, WHEEL_RADIUS, side * 0.66], outline: 0.04 });
      mk(sus, cyl(0.05, 0.05, 0.03, 12).rotateX(Math.PI / 2), C.accent, { name: 'wheel_motor_ring', pos: [x, WHEEL_RADIUS, side * 0.6], outline: 0 });
      if (corner) {
        // atuador de direção (cilindro em pé acima da roda), como na referência
        mk(sus, cyl(0.075, 0.075, 0.2, 16), C.hull2, { name: 'steer_actuator', pos: [x, top + 0.04, z], outline: 0.04 });
        mk(sus, cyl(0.08, 0.08, 0.04, 16), C.dark, { name: 'steer_cap', pos: [x, top + 0.15, z], outline: 0 });
      }
    }
    for (const [jx, jy, jz] of [P, B]) {
      mk(sus, sphere(0.085, 14, 10), C.dark, { name: 'suspension_joint', pos: [jx, jy, jz], outline: 0.04 });
      mk(sus, cyl(0.06, 0.06, 0.04, 14).rotateX(Math.PI / 2), C.hull2, { name: 'suspension_cap', pos: [jx, jy, side * 0.72], outline: 0 });
    }
  }
}

// ---------- corpo ----------

/** Bloco de LEDs (grade 3 x 2) com moldura escura, olhando para +X do grupo. */
function ledBlock(parent: THREE.Object3D, name: string, pos: V3, rotY = 0, cols = 3, rows = 2): void {
  const g = group(parent, name, pos, [0, rotY, 0]);
  const s = 0.045;
  const w = cols * s + 0.04;
  const h = rows * s + 0.04;
  mk(g, rbox(0.04, h, w, 0.015), C.dark, { name: `${name}_frame`, outline: 0 });
  const cells: THREE.BufferGeometry[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) cells.push(new THREE.BoxGeometry(0.012, s * 0.72, s * 0.72).translate(0.022, (r - (rows - 1) / 2) * s, (c - (cols - 1) / 2) * s));
  }
  mk(g, merge(cells), 0xe9fbff, { name: `${name}_cells`, outline: 0, mat: LED });
}

function buildBody(root: THREE.Object3D, tex: THREE.Texture): void {
  const body = group(root, 'chassis');
  const BX = 0;
  const BY = 1.0;
  const L = 1.9;
  const W = 1.2;
  const H = 0.5;
  mk(body, rboxUV(L, H, W, 0.1), C.hull, { name: 'body', pos: [BX, BY, 0], outline: 0.03, mat: { map: tex } });
  mk(body, rbox(L - 0.15, 0.14, W - 0.1, 0.05), C.dark, { name: 'belly', pos: [BX, BY - H / 2 - 0.04, 0], outline: 0.03 });
  mk(body, rbox(L + 0.02, 0.045, W + 0.02, 0.02), C.accent, { name: 'body_band', pos: [BX, BY - H / 2 + 0.06, 0], outline: 0 });

  // laterais: reforços escuros e o emblema
  for (const side of [1, -1]) {
    const z = side * (W / 2 + 0.025);
    const plate = (x0: number, y0: number, x1: number, y1: number, name: string) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      mk(body, rbox(len + 0.04, 0.15, 0.05, 0.02), C.dark, { name, pos: [(x0 + x1) / 2, (y0 + y1) / 2, z], rot: [0, 0, Math.atan2(y1 - y0, x1 - x0)], outline: 0.03 });
    };
    // reforços inclinados nas pontas (o corpo fica com cara de trapézio, como na referência)
    plate(0.86, BY + 0.2, 0.42, BY - 0.17, 'side_brace_front');
    plate(-0.86, BY + 0.2, -0.46, BY - 0.17, 'side_brace_back');
    emblem(body, side > 0 ? 'rover_emblem_r' : 'rover_emblem_l', 0.11, [-0.03, BY + 0.1, side * (W / 2 + 0.035)], [0, side > 0 ? 0 : Math.PI, 0]);
    ledBlock(body, `led_side_front_${side > 0 ? 'r' : 'l'}`, [0.24, BY - 0.06, side * (W / 2 + 0.01)], side > 0 ? -Math.PI / 2 : Math.PI / 2);
    ledBlock(body, `led_side_back_${side > 0 ? 'r' : 'l'}`, [-0.3, BY - 0.06, side * (W / 2 + 0.01)], side > 0 ? -Math.PI / 2 : Math.PI / 2, 2, 2);
  }
  // frente: faróis de LED e para-choque escuro
  for (const sz of [-0.38, 0.38]) ledBlock(body, `led_head_${sz > 0 ? 'r' : 'l'}`, [L / 2 + 0.005, BY + 0.02, sz]);
  mk(body, rbox(0.08, 0.12, W - 0.2, 0.04), C.dark, { name: 'front_bumper', pos: [L / 2 + 0.02, BY - 0.17, 0], outline: 0.03 });
  // "ombro" escuro na frente do teto, onde ficam o mastro e a broca
  mk(body, rbox(0.55, 0.07, W + 0.04, 0.03), C.dark, { name: 'front_deck', pos: [0.67, BY + H / 2 + 0.02, 0], outline: 0.03 });

  // instrumentos no teto
  mk(body, rbox(1.2, 0.04, W - 0.16, 0.02), C.hull2, { name: 'deck', pos: [-0.3, BY + H / 2 + 0.01, 0], outline: 0 });
  mk(body, rbox(0.5, 0.28, 0.55, 0.06), C.hull2, { name: 'instrument_box', pos: [-0.3, BY + H / 2 + 0.16, 0.12], outline: 0.04 });
  mk(body, rbox(0.42, 0.04, 0.47, 0.02), C.dark, { name: 'instrument_grid', pos: [-0.3, BY + H / 2 + 0.31, 0.12], outline: 0 });
  for (let i = 0; i < 4; i++) mk(body, rbox(0.44, 0.02, 0.03, 0.01), C.tech, { name: 'instrument_fin', pos: [-0.3, BY + H / 2 + 0.335, -0.06 + i * 0.12], outline: 0 });
  mk(body, cyl(0.1, 0.12, 0.14, 16), C.hull, { name: 'sensor_can', pos: [-0.05, BY + H / 2 + 0.09, -0.32], outline: 0.04 });
  mk(body, cyl(0.105, 0.105, 0.03, 16), C.accent, { name: 'sensor_ring', pos: [-0.05, BY + H / 2 + 0.12, -0.32], outline: 0 });
  mk(body, sphere(0.07, 12, 8), C.glass, { name: 'sensor_dome', pos: [-0.05, BY + H / 2 + 0.17, -0.32], outline: 0.04 });
  // antena de alto ganho (disco) e antena UHF
  mk(body, cyl(0.03, 0.03, 0.2, 8), C.tech, { name: 'hga_post', pos: [0.15, BY + H / 2 + 0.12, 0.38], outline: 0 });
  mk(body, cyl(0.18, 0.18, 0.035, 6), C.hull, { name: 'hga_disc', pos: [0.15, BY + H / 2 + 0.24, 0.38], rot: [0.25, 0, -0.3], outline: 0.04 });
  mk(body, rodsGeometry([[new THREE.Vector3(-0.72, BY + H / 2, -0.4), new THREE.Vector3(-0.72, BY + H / 2 + 0.42, -0.4)]], 0.014, 5), C.dark, { name: 'uhf_whip', outline: 0 });
  mk(body, sphere(0.03, 8, 6), C.accent, { name: 'uhf_tip', pos: [-0.72, BY + H / 2 + 0.43, -0.4], outline: 0 });

  // radiador atrás, inclinado, com canos cor de cobre (laranja da paleta)
  const rad = group(body, 'radiator', [-L / 2 - 0.12, BY + 0.12, 0], [0, 0, 0.32]);
  mk(rad, rbox(0.14, 0.78, W - 0.1, 0.05), C.hull, { name: 'radiator_panel', outline: 0.03 });
  mk(rad, rbox(0.03, 0.66, W - 0.26, 0.02), C.hull2, { name: 'radiator_face', pos: [-0.075, 0, 0], outline: 0 });
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const pipes: [THREE.Vector3, THREE.Vector3][] = [];
  for (let k = 0; k < 6; k++) {
    const pz = -0.4 + k * 0.16;
    pipes.push([v(-0.1, -0.28, pz), v(-0.1, 0.28, pz)]);
  }
  pipes.push([v(-0.1, 0.28, -0.42), v(-0.1, 0.28, 0.42)], [v(-0.1, -0.28, -0.42), v(-0.1, -0.28, 0.42)]);
  mk(rad, rodsGeometry(pipes, 0.022, 8), C.accent, { name: 'radiator_pipes', outline: 0 });
  for (const pz of [-0.42, 0.42]) for (const py of [-0.28, 0.28]) mk(rad, sphere(0.034, 10, 8), C.accent, { name: 'radiator_elbow', pos: [-0.1, py, pz], outline: 0 });
  mkBeam(body, [-L / 2 + 0.05, BY - 0.1, 0.35], [-L / 2 - 0.08, BY - 0.15, 0.35], 0.06, C.dark, { name: 'radiator_strut', outline: 0 });
  mkBeam(body, [-L / 2 + 0.05, BY - 0.1, -0.35], [-L / 2 - 0.08, BY - 0.15, -0.35], 0.06, C.dark, { name: 'radiator_strut', outline: 0 });
  ledBlock(body, 'led_rear', [-L / 2 - 0.03, BY - 0.12, 0], Math.PI, 3, 1);
}

// ---------- mastro ----------

function buildMast(root: THREE.Object3D): void {
  const mast = group(root, 'mast', [0.66, 0, -0.38]);
  const y0 = 1.29;
  mk(mast, cyl(0.075, 0.14, 0.2, 18), C.hull, { name: 'mast_base', pos: [0, y0 + 0.1, 0], outline: 0.04 });
  mk(mast, cyl(0.058, 0.058, 0.62, 14), C.dark, { name: 'mast_pole', pos: [0, y0 + 0.5, 0], outline: 0.02 });
  mk(mast, cyl(0.075, 0.075, 0.05, 14), C.accent, { name: 'mast_collar', pos: [0, y0 + 0.24, 0], outline: 0 });

  // cabeça: larga, como na referência, com dois "olhos" de câmera ciano (o rosto do estilo chibi)
  const head = group(mast, 'mast_head', [0, y0 + 0.94, 0]);
  mk(head, rbox(0.3, 0.22, 0.66, 0.07), C.hull, { name: 'head_shell', outline: 0.035 });
  mk(head, rbox(0.31, 0.045, 0.67, 0.02), C.accent, { name: 'head_stripe', pos: [0, 0.08, 0], outline: 0 });
  mk(head, rbox(0.05, 0.16, 0.5, 0.04), C.dark, { name: 'head_face', pos: [0.14, -0.01, 0], outline: 0 });
  for (const ez of [-0.13, 0.13]) {
    const rim = cyl(0.07, 0.07, 0.06, 20);
    rim.rotateZ(-Math.PI / 2);
    mk(head, rim, C.dark, { name: 'eye_rim', pos: [0.18, -0.01, ez], outline: 0.04 });
    mk(head, sphere(0.054, 16, 12), C.glow, { name: 'eye_lens', pos: [0.195, -0.01, ez], scale: [0.55, 1, 1], outline: 0, mat: { glow: 0.55 } });
    mk(head, sphere(0.015, 8, 6), 0xffffff, { name: 'eye_shine', pos: [0.225, 0.014, ez - 0.02], outline: 0, mat: { glow: 0.8 } });
  }
  // câmeras pequenas nas pontas da cabeça
  for (const ez of [-0.36, 0.36]) {
    const cam = cyl(0.045, 0.045, 0.1, 14);
    cam.rotateZ(-Math.PI / 2);
    mk(head, cam, C.dark, { name: 'side_camera', pos: [0.08, 0, ez], outline: 0.04 });
    mk(head, sphere(0.03, 10, 8), C.glow, { name: 'side_camera_lens', pos: [0.13, 0, ez], scale: [0.5, 1, 1], outline: 0, mat: { glow: 0.55 } });
  }
  mk(head, cyl(0.03, 0.03, 0.04, 10), C.dark, { name: 'warning_base', pos: [-0.06, 0.13, 0], outline: 0 });
  mk(head, sphere(0.055, 14, 10), C.warningOff, { name: 'warning_light', pos: [-0.06, 0.18, 0], outline: 0.05, mat: { name: 'warning' } });
}

// ---------- broca ----------

function buildDrill(root: THREE.Object3D): void {
  const drill = group(root, 'drill', [1.13, 0, 0]);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // suporte preso na frente do corpo
  for (const z of [-0.2, 0.2]) mkBeam(drill, [-0.2, 1.08, z], [0, 1.08, z * 0.45], 0.07, C.dark, { name: 'drill_mount', outline: 0.03 });
  mkBeam(drill, [-0.2, 0.86, 0], [0, 0.86, 0], 0.07, C.dark, { name: 'drill_mount', outline: 0.03 });
  // coluna: dois trilhos escuros e cremalheira laranja entre eles
  const yA = 0.42;
  const yB = 1.86;
  for (const z of [-0.07, 0.07]) mk(drill, rbox(0.06, yB - yA, 0.045, 0.015), C.dark, { name: 'drill_rail', pos: [0, (yA + yB) / 2, z], outline: 0.02 });
  const teeth: THREE.BufferGeometry[] = [];
  for (let y = yA + 0.05; y < yB - 0.04; y += 0.055) teeth.push(new THREE.BoxGeometry(0.02, 0.026, 0.09).translate(0.025, y, 0));
  mk(drill, merge(teeth), C.accent, { name: 'drill_rack', outline: 0 });
  mk(drill, rbox(0.16, 0.08, 0.24, 0.03), C.dark, { name: 'drill_top', pos: [0, yB + 0.03, 0], outline: 0.04 });
  mk(drill, rbox(0.03, 0.03, 0.06, 0.01), 0xe9fbff, { name: 'drill_top_led', pos: [0.08, yB + 0.03, 0], outline: 0, mat: LED });
  mk(drill, rbox(0.14, 0.06, 0.22, 0.02), C.dark, { name: 'drill_foot', pos: [0, yA - 0.02, 0], outline: 0.04 });

  // carro que sobe e desce, com a broca girando embaixo
  const carriage = group(drill, 'drill_carriage', [0, 1.2, 0]);
  mk(carriage, rbox(0.2, 0.24, 0.27, 0.05), C.hull2, { name: 'drill_carriage_body', outline: 0.04 });
  mk(carriage, cyl(0.07, 0.07, 0.12, 14), C.dark, { name: 'drill_motor', pos: [0.02, 0.17, 0], outline: 0.04 });
  mk(carriage, rbox(0.03, 0.06, 0.12, 0.01), 0xe9fbff, { name: 'drill_carriage_led', pos: [0.105, 0.03, 0], outline: 0, mat: LED });
  const bit = group(carriage, 'drill_bit', [0.04, -0.12, 0]);
  const LEN = 0.7;
  mk(bit, cyl(0.026, 0.026, LEN, 10), C.hull2, { name: 'drill_bit_core', pos: [0, -LEN / 2, 0], outline: 0 });
  const helix: THREE.Vector3[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const a = t * Math.PI * 2 * 7;
    helix.push(v(Math.cos(a) * 0.036, -0.05 - t * (LEN - 0.12), Math.sin(a) * 0.036));
  }
  const flute = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 220, 0.011, 5, false);
  flute.deleteAttribute('uv');
  mk(bit, flute, C.hull, { name: 'drill_bit_flute', outline: 0 });
  mk(bit, cyl(0.002, 0.04, 0.09, 10), C.accent, { name: 'drill_bit_tip', pos: [0, -LEN - 0.04, 0], outline: 0 });
}

// ---------- animações ----------

/** "scan": a cabeça do mastro olha para um lado e para o outro (6 s, em loop). */
function scanClip(): THREE.AnimationClip {
  const times = [0, 1, 2, 3, 4, 5, 6];
  const yaw = [0, 0.55, 0.55, 0, -0.5, -0.5, 0];
  const tilt = [0, -0.12, -0.12, 0, 0.06, 0.06, 0];
  const values: number[] = [];
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (let i = 0; i < times.length; i++) values.push(...q.setFromEuler(e.set(0, yaw[i], tilt[i], 'YXZ')).toArray());
  return new THREE.AnimationClip('scan', 6, [new THREE.QuaternionKeyframeTrack('mast_head.quaternion', times, values)]);
}

/** "drill": a broca desce até entrar no chão, gira, e volta (5 s). Toque uma vez ou em loop. */
function drillClip(): THREE.AnimationClip {
  const D = 5;
  const posTimes = [0, 1.2, 3.8, 5];
  const yUp = 1.2;
  const yDown = 0.78; // a ponta entra ~0,13 m no chão
  const pos = [0, yUp, 0, 0, yDown, 0, 0, yDown, 0, 0, yUp, 0];
  const spinTimes: number[] = [];
  const spin: number[] = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let t = 0, k = 0; t <= D + 1e-6; t += 0.125, k++) {
    spinTimes.push(t);
    spin.push(...q.setFromAxisAngle(up, -k * ((Math.PI * 2) / 3)).toArray());
  }
  return new THREE.AnimationClip('drill', D, [
    new THREE.VectorKeyframeTrack('drill_carriage.position', posTimes, pos.map((n, i) => (i % 3 === 0 ? 0 : n))),
    new THREE.QuaternionKeyframeTrack('drill_bit.quaternion', spinTimes, spin),
  ]);
}

export function createRover(): RoverModel {
  const root = new THREE.Group();
  root.name = 'rover';
  const tex = boxTexture('neutral');
  buildWheels(root);
  buildSuspension(root);
  buildBody(root, tex);
  buildMast(root);
  buildDrill(root);
  return { root, clips: [scanClip(), drillClip()] };
}
