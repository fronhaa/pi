import * as THREE from 'three';
import type { Role } from '@/sim/crew';
import type { ProblemKind } from '@/sim/types';

/**
 * Mapa da base: ONDE fica cada coisa (prédios, postos da tripulação, problemas, portas).
 * É o mesmo em Marte e na Lua: o que muda de um lugar para o outro está em src/scenarios/.
 * Só números de cena (metros); regras de jogo ficam em src/sim/.
 *
 * Mexeu numa posição? Confira que pontos alcançáveis (postos, problemas, entradas) ficam FORA das
 * caixas de colisão (`obstacles`, montadas pelos prédios em src/scene/base/).
 */

/**
 * Posto de cada papel na base (GDD, "Tempo da tripulação"): engenheiro no abrigo, médico perto da estufa,
 * cientista perto do rover, comandante perto da antena. Precisam ficar FORA das caixas de `obstacles`.
 */
export const POSTS: Record<Role, THREE.Vector3> = {
  commander: new THREE.Vector3(4.6, 0, 2.7),
  engineer: new THREE.Vector3(-9.0, 0, 8.4),
  medic: new THREE.Vector3(3.4, 0, -2.6),
  scientist: new THREE.Vector3(10.5, 0, 9.5),
};

/**
 * Onde fica a base de pesquisa (research-base.glb, docs/rover-e-base-de-pesquisa.md): o casco corre em X,
 * a torre do airlock (a porta) fica virada para +Z, para o lado da câmera. Origem do modelo no chão.
 */
export const HABITAT_POSITION = new THREE.Vector3(-1.5, 0, 1.8);
/** Porta do airlock no referencial do modelo: o astronauta anda até ela e some (doc do modelo). */
export const HABITAT_DOOR_LOCAL_Z = 4.1;
/** Abrigo de regolito (tempestade solar): à frente e à esquerda do habitat, longe da trilha do rover. */
export const SHELTER_CENTER = new THREE.Vector3(-13.5, 0, 8.5);
/** Cúpula com a estufa. */
export const DOME_CENTER = new THREE.Vector3(-1.5, 0, -4.6);
export const DOME_RADIUS = 3.6;
/** Torre da antena (com a luz de alarme). */
export const TOWER_POSITION = new THREE.Vector3(7.4, 0, -0.6);
/** Contêiner da bateria (o medidor fica na frente). */
export const BATTERY_POSITION = new THREE.Vector3(7.6, 0, 3.8);

/**
 * Escala dos módulos do habitat (cascos, pernas, teto). Em 100% o casco tem 3,3 m de diâmetro e o astronauta
 * fica pequeno lá dentro; em 80% a cabine fica mais justa, como uma nave. A torre do airlock continua em 100%,
 * para a porta seguir mais alta que o astronauta.
 */
export const HABITAT_SCALE = 0.8;
/** Comprimento útil do piso em cada módulo (entre as portas de acoplamento, ±3,25 m no modelo). */
export const MODULE_FLOOR_LENGTH = 6.5 * HABITAT_SCALE;
/** Deslocamento do alojamento em relação ao laboratório: a port_b dele encaixa na port_a do laboratório. */
export const QUARTERS_OFFSET_X = -7 * HABITAT_SCALE;
/** A academia encaixa do mesmo jeito na port_a do alojamento. */
export const GYM_OFFSET_X = 2 * QUARTERS_OFFSET_X;
/** Altura das duas camas de cada beliche, acima do piso. */
export const BUNK_LEVELS = [0.3, 1.12] as const;
/** Fundo dos módulos, onde ficam os beliches e os aparelhos (z relativo ao centro do casco). */
export const BACK_Z = -0.55;
/** Piso dentro do casco (em 80% o casco vai de y = 0,8 a 3,4; neste piso sobra ~2,1 m de altura). */
export const HABITAT_FLOOR_Y = 1.25;

/**
 * Onde cada papel fica DENTRO do habitat, visível pelo casco translúcido: comandante e cientista no
 * laboratório (perto do console), engenheiro e médico no alojamento (em frente aos beliches).
 */
export const HABITAT_SPOTS: Record<Role, THREE.Vector3> = {
  commander: new THREE.Vector3(HABITAT_POSITION.x - 1.0, HABITAT_FLOOR_Y, HABITAT_POSITION.z + 0.35),
  scientist: new THREE.Vector3(HABITAT_POSITION.x + 1.0, HABITAT_FLOOR_Y, HABITAT_POSITION.z + 0.35),
  engineer: new THREE.Vector3(HABITAT_POSITION.x + QUARTERS_OFFSET_X - 1.0, HABITAT_FLOOR_Y, HABITAT_POSITION.z + 0.35),
  medic: new THREE.Vector3(HABITAT_POSITION.x + QUARTERS_OFFSET_X + 1.0, HABITAT_FLOOR_Y, HABITAT_POSITION.z + 0.35),
};

/** Centro de cada beliche em relação ao centro do alojamento. */
export const BUNK_DX = 1.25;
/** Comprimento do boneco deitado (deitado ele fica em 80%, para caber entre as duas camas do beliche). */
const LYING_LENGTH = 1.85 * 0.8;

/** Cama de cada papel no alojamento (beliche, cabeça no travesseiro em −X): onde dorme à noite e descansa. */
export const BUNK_SPOTS: Record<Role, THREE.Vector3> = {
  engineer: bunkSpot(-BUNK_DX, 0),
  medic: bunkSpot(-BUNK_DX, 1),
  commander: bunkSpot(BUNK_DX, 0),
  scientist: bunkSpot(BUNK_DX, 1),
};

function bunkSpot(dx: number, level: 0 | 1): THREE.Vector3 {
  // O boneco deitado tem os pés na origem: a origem fica na ponta da cama, longe do travesseiro.
  return new THREE.Vector3(
    HABITAT_POSITION.x + QUARTERS_OFFSET_X + dx + LYING_LENGTH / 2,
    HABITAT_FLOOR_Y + BUNK_LEVELS[level] + 0.36,
    HABITAT_POSITION.z + BACK_Z,
  );
}

/**
 * Aparelhos da academia que um astronauta usa (F9: esteira e bicicleta, como na Estação Espacial).
 * `heading` segue a convenção do andar: 0 olha para −Z; aqui todos olham para a frente (+Z), para a câmera.
 */
export const GYM_DX = 1.8;
export const GYM_STATIONS = [
  { pos: new THREE.Vector3(HABITAT_POSITION.x + GYM_OFFSET_X - GYM_DX, HABITAT_FLOOR_Y + 0.14, HABITAT_POSITION.z), heading: Math.PI, speed: 1.8 },
  // Na bicicleta, pedalando em pé atrás do guidão (o boneco não tem pose sentada).
  { pos: new THREE.Vector3(HABITAT_POSITION.x + GYM_OFFSET_X, HABITAT_FLOOR_Y + 0.05, HABITAT_POSITION.z - 0.35), heading: Math.PI, speed: 0.9 },
] as const;

/** Dentro da cúpula, perto do vazamento: onde fica quem conserta a estufa (problema de dentro). */
export const GREENHOUSE_WORK_SPOT = new THREE.Vector3(1.0, 0.4, -4.6);

/**
 * Onde a tripulação entra à noite (ponto no chão, em frente à porta): no habitat para dormir,
 * no abrigo de regolito na noite de tempestade solar. Precisam ficar FORA das caixas de `obstacles`.
 */
export const ENTRANCES = {
  habitat: new THREE.Vector3(HABITAT_POSITION.x, 0, HABITAT_POSITION.z + HABITAT_DOOR_LOCAL_Z + 0.3),
  shelter: new THREE.Vector3(SHELTER_CENTER.x + 0.6, 0, SHELTER_CENTER.z + 3.4),
} as const;

/**
 * Onde cada problema acontece (GDD, "Problemas pela base"). Pontos alcançáveis: FORA das caixas de `obstacles`.
 * O rover atolado fica longe da base, para a caminhada longa custar tempo.
 * Problema novo em src/sim/problems.ts? Precisa de um lugar aqui (o TypeScript cobra).
 */
export const PROBLEM_SPOTS: Record<ProblemKind, THREE.Vector3> = {
  dustyPanels: new THREE.Vector3(17, 0, 6.6),
  greenhouseLeak: new THREE.Vector3(2.3, 0, -4.6),
  antenna: new THREE.Vector3(9.7, 0, -0.6),
  roverStuck: new THREE.Vector3(22, 0, 13),
  tornBag: new THREE.Vector3(SHELTER_CENTER.x, 0, SHELTER_CENTER.z + 3.9),
};

/**
 * Faixa sem pedras em volta da base (elipse): o caminho de saída e de volta do rover fica livre, e as pedras
 * de estudo ficam espalhadas fora dela. O rover em si explora livre (src/scene/base/Rover.ts).
 */
export const ROVER_TRACK = { cx: 2, cz: 2, rx: 26, rz: 15 } as const;

/**
 * Áreas que só o rover evita (círculos no chão), além das caixas de colisão dos prédios: os sacos de
 * regolito em volta do abrigo e a borda da cúpula passam das caixas (que são feitas para os astronautas,
 * que precisam chegar perto da porta do abrigo e da estufa).
 */
export const ROVER_KEEP_OUT: readonly { x: number; z: number; r: number }[] = [
  { x: SHELTER_CENTER.x, z: SHELTER_CENTER.z, r: 4.2 },
  { x: DOME_CENTER.x, z: DOME_CENTER.z, r: DOME_RADIUS + 0.3 },
];

/** Distância (m) de um ponto até a faixa sem pedras. */
export function distanceToRoverTrack(x: number, z: number): number {
  const { cx, cz, rx, rz } = ROVER_TRACK;
  let best = Infinity;
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    best = Math.min(best, Math.hypot(x - (cx + Math.cos(a) * rx), z - (cz + Math.sin(a) * rz)));
  }
  return best;
}

/** Relevo: plano perto da base, dunas suaves longe dela (INTERPRETADO até o Mars Trek entrar). */
export function terrainHeight(x: number, z: number): number {
  const fade = THREE.MathUtils.smoothstep(Math.hypot(x, z), 30, 60);
  const h = Math.sin(x * 0.07) * Math.cos(z * 0.05) * 1.6 + Math.sin(x * 0.021 + z * 0.03) * 3;
  return h * fade;
}

/** Caixa de colisão no chão (para a física da tripulação e para o rover desviar). */
export interface Obstacle {
  center: THREE.Vector3;
  half: THREE.Vector3;
}

export function addObstacle(list: Obstacle[], x: number, z: number, hx: number, hz: number, hy = 2): void {
  list.push({ center: new THREE.Vector3(x, hy, z), half: new THREE.Vector3(hx, hy, hz) });
}

/** Sorteio com semente: a base sai igual em toda partida (pedras, mesas, plantas). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
