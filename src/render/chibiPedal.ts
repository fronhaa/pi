import * as THREE from 'three';

/**
 * Clipe `pedal` do astronauta chibi: sentado na bicicleta da academia, pés girando no pedal e mãos no guidão.
 * O .glb só traz walk, jump e interact; este clipe é montado por código ao carregar o modelo, com as mesmas
 * articulações (docs/astronauta-chibi.md). As pernas usam IK de duas juntas para o pé seguir o círculo do pedal.
 *
 * As medidas abaixo são em relação ao QUADRIL do boneco, de lado (z = frente, y = cima). A bicicleta em
 * src/scene/base/Habitat.ts é montada com elas, então pé, pedal e guidão sempre batem.
 */
export const BIKE_FIT = {
  /** Altura do quadril do chibi em pé (articulações legL/legR do .glb). */
  hipHeight: 0.55,
  /** Altura do quadril sentado, acima do piso. */
  seatedHipHeight: 0.62,
  /** Centro do eixo do pedal. */
  crank: { z: 0.2, y: -0.33 },
  crankRadius: 0.1,
  /** Onde as luvas ficam com a pose dos braços abaixo (medido no .glb): é ali que passa o guidão. */
  bars: { z: 0.45, y: 0.1 },
  /** Uma volta do pedal por segundo. */
  seconds: 1,
} as const;

const THIGH = 0.22; // legL → shinL
const SHIN = 0.28; // shinL → sola da bota
const FPS = 30;

/** Ângulos (em X) da coxa e da canela para o pé chegar em (z, y), com o joelho para a frente. */
function legIK(z: number, y: number): [number, number] {
  const d = Math.min(Math.hypot(z, y), THIGH + SHIN - 1e-3);
  // a = ângulo que faz a perna (para baixo) apontar para o alvo: rotação negativa em X leva o pé para +Z
  const toTarget = Math.atan2(-z, -y);
  const atHip = Math.acos((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d));
  const atKnee = Math.acos((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN));
  return [toTarget - atHip, Math.PI - atKnee];
}

/** Monta o clipe `pedal` para o modelo carregado (usa os nomes das articulações do .glb). */
export function buildPedalClip(root: THREE.Object3D): THREE.AnimationClip {
  const names = ['legL', 'legR', 'shinL', 'shinR', 'spine', 'head', 'armL', 'armR', 'forearmL', 'forearmR'] as const;
  for (const n of names) if (!root.getObjectByName(n)) throw new Error(`chibiPedal: articulação "${n}" não encontrada`);

  const T = BIKE_FIT.seconds;
  const frames = Math.round(T * FPS);
  const times: number[] = [];
  const quats: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
  const pos: number[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const push = (n: string, x: number, y: number, z: number) => {
    q.setFromEuler(e.set(x, y, z));
    quats[n].push(q.x, q.y, q.z, q.w);
  };
  const { crank, crankRadius: r } = BIKE_FIT;
  const drop = BIKE_FIT.hipHeight - BIKE_FIT.seatedHipHeight; // corpo sobe/desce para o quadril ficar no banco

  for (let f = 0; f <= frames; f++) {
    const t = (f / frames) * T;
    const p = (2 * Math.PI * t) / T;
    times.push(t);
    // Pedais opostos; o pé desce na frente (sentido de quem pedala para a frente).
    for (const [side, phase] of [['L', p], ['R', p + Math.PI]] as const) {
      const [thigh, knee] = legIK(crank.z + r * Math.sin(phase), crank.y + r * Math.cos(phase));
      push(`leg${side}`, thigh, 0, 0);
      push(`shin${side}`, knee, 0, 0);
    }
    // Tronco inclinado para o guidão, com um leve balanço a cada pedalada.
    push('spine', 0.28, 0.05 * Math.sin(p), 0.03 * Math.sin(p));
    push('head', -0.22, -0.04 * Math.sin(p), 0);
    // Braços para a frente, mãos no guidão (lado esquerdo do boneco fica em +X).
    push('armL', -0.95, 0, 0.12);
    push('armR', -0.95, 0, -0.12);
    push('forearmL', -0.35, 0, -0.12);
    push('forearmR', -0.35, 0, 0.12);
    pos.push(0, -drop + 0.008 * Math.abs(Math.sin(p)), 0);
  }

  const tracks: THREE.KeyframeTrack[] = names.map((n) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, quats[n]));
  tracks.push(new THREE.VectorKeyframeTrack('body.position', times, pos));
  return new THREE.AnimationClip('pedal', T, tracks);
}
