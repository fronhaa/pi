import * as THREE from 'three';
import { TABLET_HIDDEN, type ChibiAstronaut } from '@/ChibiAstronaut';

/**
 * Animações do astronauta chibi, todas no lugar (o jogo move o personagem por código):
 * - walk: caminhada em loop (0,9 s).
 * - jump: pulo completo, do agachamento à aterrissagem (1,35 s); pode tocar em loop ou uma vez.
 * - interact: puxa o tablet do bolso do cinto e segura com as duas mãos na frente do corpo (3,2 s).
 *   Toque uma vez com clampWhenFinished = true para ele continuar segurando o tablet.
 *
 * As animações movem só as articulações (Groups nomeados); não há ossos nem skinning.
 * Cada clipe é "assado" a 30 quadros por segundo a partir das poses abaixo.
 */

export const CHIBI_CLIP_NAMES = ['walk', 'jump', 'interact'] as const;
export type ChibiClipName = (typeof CHIBI_CLIP_NAMES)[number];

const FPS = 30;
const JOINTS = ['body', 'spine', 'head', 'armL', 'armR', 'forearmL', 'forearmR', 'legL', 'legR', 'shinL', 'shinR', 'tablet'] as const;
type Joint = (typeof JOINTS)[number];

/** Comprimentos do braço (ombro → cotovelo, cotovelo → centro da luva), em metros. */
const UPPER_ARM = 0.21;
const FOREARM = 0.24;

type E3 = [number, number, number];

interface Rig {
  nodes: Record<Joint, THREE.Object3D>;
  bind: Record<Joint, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>;
}

function makeRig(a: ChibiAstronaut): Rig {
  const nodes = {} as Record<Joint, THREE.Object3D>;
  for (const j of JOINTS) {
    const n = j === 'body' ? a.root.getObjectByName('body') : a.parts[j];
    if (!n) throw new Error(`chibiAnimations: parte "${j}" não encontrada`);
    nodes[j] = n;
  }
  const bind = {} as Rig['bind'];
  for (const j of JOINTS) bind[j] = { p: nodes[j].position.clone(), q: nodes[j].quaternion.clone(), s: nodes[j].scale.clone() };
  return { nodes, bind };
}

function resetPose(r: Rig): void {
  for (const j of JOINTS) {
    r.nodes[j].position.copy(r.bind[j].p);
    r.nodes[j].quaternion.copy(r.bind[j].q);
    r.nodes[j].scale.copy(r.bind[j].s);
  }
}

const euler = new THREE.Euler();
function setRot(r: Rig, j: Joint, e: E3): void {
  r.nodes[j].quaternion.setFromEuler(euler.set(e[0], e[1], e[2]));
}

/** Poses base dos braços (as mesmas do modelo): ombro aberto 0,2 rad, antebraço levemente dobrado. */
const ARM_Z = 0.2;
const FORE_X = -0.25;
const FORE_Z = 0.12;

const ease = (x: number): number => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Grava o estado das articulações quadro a quadro num AnimationClip. */
function bake(r: Rig, name: string, duration: number, poseAt: (t: number) => void, opts: { position?: Joint[]; scale?: Joint[] } = {}): THREE.AnimationClip {
  const frames = Math.round(duration * FPS);
  const times: number[] = [];
  const quats: Record<string, number[]> = {};
  const poss: Record<string, number[]> = {};
  const scls: Record<string, number[]> = {};
  const prev: Record<string, THREE.Quaternion> = {};
  for (let f = 0; f <= frames; f++) {
    const t = Math.min(f / FPS, duration);
    resetPose(r);
    poseAt(t);
    times.push(t);
    for (const j of JOINTS) {
      const q = r.nodes[j].quaternion.clone();
      if (prev[j] && prev[j].dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w); // continuidade do slerp
      prev[j] = q;
      (quats[j] ??= []).push(q.x, q.y, q.z, q.w);
    }
    for (const j of opts.position ?? []) (poss[j] ??= []).push(...r.nodes[j].position.toArray());
    for (const j of opts.scale ?? []) (scls[j] ??= []).push(...r.nodes[j].scale.toArray());
  }
  resetPose(r);
  const tracks: THREE.KeyframeTrack[] = [];
  for (const j of JOINTS) {
    if (j === 'body' || j === 'tablet') {
      // corpo: só posição (a rotação de "facing" fica livre); tablet: posição, rotação e escala
      if (j === 'tablet' && (opts.scale ?? []).includes('tablet')) tracks.push(new THREE.QuaternionKeyframeTrack(`${r.nodes[j].name}.quaternion`, times, quats[j]));
      continue;
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${r.nodes[j].name}.quaternion`, times, quats[j]));
  }
  for (const j of Object.keys(poss)) tracks.push(new THREE.VectorKeyframeTrack(`${r.nodes[j as Joint].name}.position`, times, poss[j]));
  for (const j of Object.keys(scls)) tracks.push(new THREE.VectorKeyframeTrack(`${r.nodes[j as Joint].name}.scale`, times, scls[j]));
  return new THREE.AnimationClip(name, duration, tracks);
}

// ---------------------------------------------------------------------------------------------
// Caminhar
// ---------------------------------------------------------------------------------------------

function walkClip(r: Rig): THREE.AnimationClip {
  const T = 0.9;
  const LEG = 0.55; // quadril → chão
  const SWING = 0.42;
  return bake(r, 'walk', T, (t) => {
    const p = (2 * Math.PI * t) / T;
    const s = Math.sin(p);
    const c = Math.cos(p);
    const legL = -SWING * s;
    const legR = SWING * s;
    setRot(r, 'legL', [legL, 0, 0]);
    setRot(r, 'legR', [legR, 0, 0]);
    // o joelho dobra quando a perna passa para a frente
    setRot(r, 'shinL', [0.8 * Math.pow(Math.max(0, c), 1.4), 0, 0]);
    setRot(r, 'shinR', [0.8 * Math.pow(Math.max(0, -c), 1.4), 0, 0]);
    // quadril desce quando as pernas abrem, e sobe um pouco a cada passo
    r.nodes.body.position.y = r.bind.body.p.y - LEG * (1 - Math.cos(SWING * s)) + 0.018 * (1 - Math.abs(s));
    setRot(r, 'spine', [0.06, 0.09 * s, 0.025 * Math.sin(2 * p)]);
    setRot(r, 'head', [-0.02 + 0.02 * Math.cos(2 * p), -0.07 * s, -0.02 * Math.sin(2 * p)]);
    // braço oposto à perna do mesmo lado (lado esquerdo do personagem fica em +X)
    setRot(r, 'armL', [0.55 * s, 0, ARM_Z + 0.04]);
    setRot(r, 'armR', [-0.55 * s, 0, -ARM_Z - 0.04]);
    setRot(r, 'forearmL', [FORE_X - 0.15 - 0.15 * Math.max(0, -s), 0, -FORE_Z]);
    setRot(r, 'forearmR', [FORE_X - 0.15 - 0.15 * Math.max(0, s), 0, FORE_Z]);
  }, { position: ['body'] });
}

// ---------------------------------------------------------------------------------------------
// Pular
// ---------------------------------------------------------------------------------------------

interface JumpKey {
  t: number;
  y: number; // deslocamento do corpo
  spine: number;
  head: number;
  arm: number; // rotação X dos ombros (- = para a frente/cima)
  armOut: number; // abertura extra dos ombros
  fore: number;
  leg: number;
  shin: number;
}

const JUMP: JumpKey[] = [
  { t: 0.0, y: 0, spine: 0, head: 0, arm: 0, armOut: 0, fore: 0, leg: 0, shin: 0 },
  { t: 0.28, y: -0.1, spine: 0.3, head: -0.18, arm: 0.75, armOut: 0.05, fore: -0.3, leg: -0.6, shin: 1.2 }, // agacha
  { t: 0.42, y: 0.2, spine: -0.06, head: -0.05, arm: -2.4, armOut: 0.3, fore: -0.15, leg: -0.05, shin: 0.1 }, // impulso
  { t: 0.62, y: 0.42, spine: 0.04, head: 0.05, arm: -2.7, armOut: 0.45, fore: -0.25, leg: -0.45, shin: 0.9 }, // topo, pernas recolhidas
  { t: 0.82, y: 0.15, spine: 0.02, head: 0.0, arm: -1.3, armOut: 0.55, fore: -0.3, leg: -0.18, shin: 0.3 }, // descendo
  { t: 0.92, y: 0.0, spine: 0.08, head: 0.0, arm: -0.7, armOut: 0.5, fore: -0.35, leg: -0.12, shin: 0.22 }, // toca o chão
  { t: 1.06, y: -0.08, spine: 0.25, head: -0.12, arm: -0.3, armOut: 0.35, fore: -0.55, leg: -0.5, shin: 1.0 }, // amortece
  { t: 1.35, y: 0, spine: 0, head: 0, arm: 0, armOut: 0, fore: 0, leg: 0, shin: 0 },
];

function jumpClip(r: Rig): THREE.AnimationClip {
  const T = JUMP[JUMP.length - 1].t;
  return bake(r, 'jump', T, (t) => {
    let i = 0;
    while (i < JUMP.length - 2 && t > JUMP[i + 1].t) i++;
    const a = JUMP[i];
    const b = JUMP[i + 1];
    const k = ease((t - a.t) / (b.t - a.t));
    const v = (key: keyof Omit<JumpKey, 't'>) => lerp(a[key], b[key], k);
    r.nodes.body.position.y = r.bind.body.p.y + v('y');
    setRot(r, 'spine', [v('spine'), 0, 0]);
    setRot(r, 'head', [v('head'), 0, 0]);
    setRot(r, 'armL', [v('arm'), 0, ARM_Z + v('armOut')]);
    setRot(r, 'armR', [v('arm'), 0, -(ARM_Z + v('armOut'))]);
    setRot(r, 'forearmL', [FORE_X + v('fore'), 0, -FORE_Z]);
    setRot(r, 'forearmR', [FORE_X + v('fore'), 0, FORE_Z]);
    for (const side of ['L', 'R'] as const) {
      const spread = side === 'L' ? 1 : -1;
      setRot(r, `leg${side}`, [v('leg'), 0, spread * 0.06 * Math.max(0, v('y')) * 2]);
      setRot(r, `shin${side}`, [v('shin'), 0, 0]);
    }
  }, { position: ['body'] });
}

// ---------------------------------------------------------------------------------------------
// Interagir: puxa o tablet do bolso do cinto e segura com as duas mãos
// ---------------------------------------------------------------------------------------------

const DOWN = new THREE.Vector3(0, -1, 0);

/** IK de dois ossos: gira ombro e cotovelo para a luva chegar ao alvo (no espaço da coluna). */
function solveArm(r: Rig, side: 'L' | 'R', target: THREE.Vector3, weight: number): void {
  const arm = r.nodes[`arm${side}`];
  const fore = r.nodes[`forearm${side}`];
  const sx = side === 'L' ? 1 : -1; // esquerda do personagem em +X
  const S = arm.position.clone();
  const toT = target.clone().sub(S);
  const dist = Math.min(Math.max(toT.length(), 0.06), UPPER_ARM + FOREARM - 0.002);
  const u = toT.normalize();
  const a = (UPPER_ARM ** 2 - FOREARM ** 2 + dist ** 2) / (2 * dist);
  const h = Math.sqrt(Math.max(UPPER_ARM ** 2 - a * a, 0));
  // cotovelo para fora, para baixo e para trás
  const pole = new THREE.Vector3(sx, -0.5, -0.6);
  const v = pole.sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
  const E = S.clone().add(u.clone().multiplyScalar(a)).add(v.multiplyScalar(h));
  const H = S.clone().add(u.clone().multiplyScalar(dist));
  const qArm = new THREE.Quaternion().setFromUnitVectors(DOWN, E.clone().sub(S).normalize());
  const d2 = H.clone().sub(E).normalize().applyQuaternion(qArm.clone().invert());
  const qFore = new THREE.Quaternion().setFromUnitVectors(DOWN, d2);
  arm.quaternion.slerp(qArm, weight);
  fore.quaternion.slerp(qFore, weight);
}

function interactClip(r: Rig): THREE.AnimationClip {
  const T = 3.2;
  const spine = r.nodes.spine;
  // posição da luva na pose de descanso, no espaço da coluna
  const restHand = (side: 'L' | 'R') => {
    resetPose(r);
    r.nodes.body.parent?.updateMatrixWorld(true);
    const p = r.nodes[`arm${side}`].parent!.worldToLocal(
      (r.nodes[`forearm${side}`].getObjectByName(`glove${side}`) as THREE.Object3D).getWorldPosition(new THREE.Vector3()),
    );
    return p;
  };
  const restL = restHand('L');
  const restR = restHand('R');
  resetPose(r);

  const pouch = new THREE.Vector3(-0.25, 0.04, 0.13); // bolso direito do cinto (direita = -X)
  const pulled = new THREE.Vector3(-0.3, 0.1, 0.17);
  const holdCenter = new THREE.Vector3(0, 0.27, 0.38);
  const qPull = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, Math.PI / 2)); // em pé, tela para fora (para a direita)
  const qHold = new THREE.Quaternion().setFromEuler(new THREE.Euler(-2.4, 0, 0)); // inclinado, tela virada para o rosto
  /** Onde cada mão segura o tablet (no espaço do tablet): bordas laterais, por baixo. */
  const grip = (side: 'L' | 'R') => new THREE.Vector3(side === 'L' ? 0.17 : -0.17, -0.01, -0.045);

  return bake(r, 'interact', T, (t) => {
    const tab = r.nodes.tablet;
    // --- tronco e cabeça ---
    const turn = ease(t / 0.3) * (1 - ease((t - 0.6) / 0.4));
    setRot(r, 'spine', [0.04 + 0.04 * ease((t - 0.8) / 0.4), -0.18 * turn, 0]);
    const look = ease((t - 0.85) / 0.4);
    const breathe = t > 1.2 ? Math.sin((2 * Math.PI * (t - 1.2)) / 1.6) : 0;
    setRot(r, 'head', [0.1 * turn + 0.34 * look + 0.02 * breathe, -0.3 * turn + 0.06 * Math.sin(Math.max(0, t - 1.6) * 2.2) * look, 0]);

    // --- tablet ---
    let tabPos: THREE.Vector3;
    let tabQ: THREE.Quaternion;
    let rightTarget: THREE.Vector3;
    if (t < 0.45) {
      rightTarget = restR.clone().lerp(pouch, ease(t / 0.45));
      tabQ = qPull.clone();
      tabPos = rightTarget.clone().sub(grip('R').applyQuaternion(tabQ));
      tab.scale.setScalar(TABLET_HIDDEN);
    } else if (t < 0.62) {
      const k = ease((t - 0.45) / 0.17);
      rightTarget = pouch.clone().lerp(pulled, k);
      tabQ = qPull.clone();
      tabPos = rightTarget.clone().sub(grip('R').applyQuaternion(tabQ));
      tab.scale.setScalar(Math.max(TABLET_HIDDEN, k));
    } else {
      const k = ease((t - 0.62) / 0.45);
      tabQ = qPull.clone().slerp(qHold, k);
      const start = pulled.clone().sub(grip('R').applyQuaternion(qPull));
      tabPos = start.lerp(holdCenter, k);
      tabPos.y += 0.008 * breathe;
      rightTarget = tabPos.clone().add(grip('R').applyQuaternion(tabQ));
      tab.scale.setScalar(1);
    }
    tab.position.copy(tabPos);
    tab.quaternion.copy(tabQ);

    // --- braços ---
    spine.updateMatrixWorld(true);
    solveArm(r, 'R', rightTarget, ease(t / 0.25));
    const leftGrip = tabPos.clone().add(grip('L').applyQuaternion(tabQ));
    const kl = ease((t - 0.72) / 0.38);
    solveArm(r, 'L', restL.clone().lerp(leftGrip, kl), ease((t - 0.62) / 0.3));
  }, { position: ['tablet'], scale: ['tablet'] });
}

/** Cria os três clipes para um astronauta montado por createChibiAstronaut(). */
export function createChibiClips(a: ChibiAstronaut): Record<ChibiClipName, THREE.AnimationClip> {
  const r = makeRig(a);
  return { walk: walkClip(r), jump: jumpClip(r), interact: interactClip(r) };
}
