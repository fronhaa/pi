import * as THREE from 'three';

/**
 * Clipe `sit` do astronauta chibi: sentado na beirada da cama, coxas para a frente, canelas para baixo e mãos nos
 * joelhos. O .glb só traz walk, jump e interact; este clipe é montado por código ao carregar o modelo, como o `pedal`
 * (src/render/chibiPedal.ts), com as mesmas articulações (docs/astronauta-chibi.md).
 *
 * É uma pose parada: quem deita na cama (src/scene/crewRoutine.ts) controla o quanto está sentado pelo peso da ação.
 */
export const SIT_POSE = {
  /** Coxa quase na horizontal (rotação negativa em X leva o pé para +Z, a frente do .glb). */
  thigh: -1.35,
  /** Canela para baixo e um pouco para a frente: os pés ficam na frente da beirada (não embaixo da cama). */
  shin: 1.05,
  /** Tronco levemente para a frente e cabeça olhando adiante. */
  spine: 0.12,
  head: -0.08,
  /** Braços para a frente, mãos perto dos joelhos. */
  arm: -0.55,
  forearm: -0.5,
} as const;

/** Monta o clipe `sit` para o modelo carregado (usa os nomes das articulações do .glb). */
export function buildSitClip(root: THREE.Object3D): THREE.AnimationClip {
  const names = ['legL', 'legR', 'shinL', 'shinR', 'spine', 'head', 'armL', 'armR', 'forearmL', 'forearmR'] as const;
  for (const n of names) if (!root.getObjectByName(n)) throw new Error(`chibiSit: articulação "${n}" não encontrada`);
  const p = SIT_POSE;
  const pose: Record<(typeof names)[number], [number, number, number]> = {
    legL: [p.thigh, 0, 0.04],
    legR: [p.thigh, 0, -0.04],
    shinL: [p.shin, 0, 0],
    shinR: [p.shin, 0, 0],
    spine: [p.spine, 0, 0],
    head: [p.head, 0, 0],
    armL: [p.arm, 0, 0.15],
    armR: [p.arm, 0, -0.15],
    forearmL: [p.forearm, 0, -0.1],
    forearmR: [p.forearm, 0, 0.1],
  };
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const tracks = names.map((n) => {
    q.setFromEuler(e.set(...pose[n]));
    const v = [q.x, q.y, q.z, q.w];
    return new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, [0, 1], [...v, ...v]);
  });
  return new THREE.AnimationClip('sit', 1, tracks);
}
