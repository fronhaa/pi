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

/*
 * Arranjo da base (concept art ARC-001/ARC-002, "Conceitos de Bases Lunar e Marciana", vista superior):
 * a CÚPULA da estufa é o núcleo, no centro; os módulos saem dela como raios, ligados por túneis:
 *
 *   academia─alojamento ═ CÚPULA ═ laboratório ─ comunicação (antena)   painéis solares
 *                    ║          (porta do airlock)     bateria
 *                 GARAGEM do rover (com rampa, virada para a câmera)
 *                    |
 *                  rampa
 *
 * Os módulos são o mesmo research-base.glb (o design não muda, só a posição). Mudou um centro? Os pontos de
 * dentro (camas, academia, postos) acompanham, porque são medidos a partir daqui.
 */

/**
 * Escala dos módulos do habitat (cascos, pernas, teto): **100%**, o tamanho em que o research-base.glb foi feito
 * (ADR 0009). Assim a base segue as medidas da NASA (docs/ciencia-marte.md, F15 a F19): ~2,7 m de altura livre
 * (a NASA recomenda 2,4 m), 1 m acima de cada cama e ~37 m³ por tripulante (mínimo da NASA: 29 m³ habitáveis).
 */
export const HABITAT_SCALE = 1;
/** Piso dentro do casco (o modelo não tem piso; o jogo põe um). Em 100% o casco vai de y = 1,0 a 4,3. */
export const HABITAT_FLOOR_Y = 1.5625 * HABITAT_SCALE;
/** Raio do casco dos módulos e a altura do eixo dele (medidos no research-base.glb). */
const HULL_RADIUS = 1.65 * HABITAT_SCALE;
const HULL_AXIS_Y = 2.65 * HABITAT_SCALE;
/** Largura do piso dentro do casco. */
export const MODULE_FLOOR_WIDTH = 2.375 * HABITAT_SCALE;

/** Cúpula com a estufa: o núcleo da base. */
export const DOME_CENTER = new THREE.Vector3(0, 0, -1);
/**
 * Raio da cúpula (m). Maior que os módulos: a estufa é o núcleo e o maior espaço da base. Com 6 m, a passarela
 * (no piso dos módulos) tem altura para andar em pé até a boca dos túneis.
 */
export const DOME_RADIUS = 6;
/**
 * Túneis da cúpula até cada módulo: centro do túnel a esta altura do chão e raio. Por dentro sobram ~2,1 m acima
 * do piso: o astronauta (1,87 m) passa em pé (a NASA pede passagem sem restrição, F18).
 */
export const TUBE_Y = HABITAT_FLOOR_Y + 0.94;
export const TUBE_RADIUS = 1.2;
/**
 * Até onde o túnel entra na cúpula: ali a cúpula ainda tem a altura do centro do túnel.
 * O túnel vai daqui até a porta de acoplamento do módulo.
 */
const TUBE_START = Math.sqrt(DOME_RADIUS ** 2 - TUBE_Y ** 2) - 0.05;
const TUBE_LENGTH = 1.8;
/** Porta de acoplamento de cada módulo: ±3,25 m do centro no modelo (em escala). */
const PORT = 3.25;

/**
 * Laboratório, com a torre do airlock (a porta) virada para +Z, para o lado da câmera (research-base.glb,
 * docs/rover-e-base-de-pesquisa.md). O casco corre em X. Origem do modelo no chão.
 */
export const HABITAT_POSITION = new THREE.Vector3(DOME_CENTER.x + TUBE_START + TUBE_LENGTH + PORT * HABITAT_SCALE, 0, DOME_CENTER.z);
/** Porta do airlock no referencial do modelo: o astronauta anda até ela e some (doc do modelo). */
export const HABITAT_DOOR_LOCAL_Z = 4.1;
/** Abrigo de regolito (tempestade solar): à frente e à esquerda da base, longe do caminho do rover. */
export const SHELTER_CENTER = new THREE.Vector3(-13.5, 0, 8.5);

/** Comprimento útil do piso em cada módulo (entre as portas de acoplamento, ±3,25 m no modelo). */
export const MODULE_FLOOR_LENGTH = 6.5 * HABITAT_SCALE;
/**
 * Alojamento, medido a partir do laboratório: do outro lado da cúpula (raio oeste), ligado a ela por um túnel.
 * O interior (beliches, mesa) e os pontos de dentro usam este deslocamento.
 */
export const QUARTERS_OFFSET_X = 2 * (DOME_CENTER.x - HABITAT_POSITION.x);
/** A academia encaixa na ponta do alojamento, como antes (port_b na port_a). */
export const GYM_OFFSET_X = QUARTERS_OFFSET_X - 7 * HABITAT_SCALE;

/**
 * Base de comunicação (comm-base.glb, docs/base-comunicacao-e-bateria.md): bloco com a torre de antena e a luz
 * de alarme, acoplado na port_b do laboratório (portas em ±3,5 m no laboratório e ±1,95 m na base de
 * comunicação), na mesma escala dos módulos. Substitui a torre de antena simples (que fica de reserva).
 */
export const COMM_POSITION = new THREE.Vector3(HABITAT_POSITION.x + (3.5 + 1.95) * HABITAT_SCALE, 0, HABITAT_POSITION.z);
/** Meia caixa de colisão da base de comunicação (corpo e pernas, em HABITAT_SCALE). */
export const COMM_HALF = { x: 2.05 * HABITAT_SCALE, z: 2.5 * HABITAT_SCALE } as const;

/**
 * Campo de painéis solares, à direita da base (como no concept art): 2 fileiras de 5, começando aqui (centro do
 * primeiro painel). O solar-panels-battery.glb foi feito com o primeiro painel em (12; 2): ele é deslocado em
 * SOLAR_MODEL_OFFSET para cair aqui. A distância garante que a tomada do modelo (x = 5,0 dele) fique depois da
 * torre do airlock, e a bateria na frente da base de comunicação.
 */
export const PANELS_ORIGIN = new THREE.Vector3(COMM_POSITION.x + 4.35, 0, 2);
/** Deslocamento do solar-panels-battery.glb (feito com o primeiro painel em x = 12, z = 2). */
export const SOLAR_MODEL_OFFSET = new THREE.Vector3(PANELS_ORIGIN.x - 12, 0, PANELS_ORIGIN.z - 2);
/** Contêiner da bateria (no .glb: x = 8,6; z = 3,15), na frente da base de comunicação. */
export const BATTERY_POSITION = new THREE.Vector3(8.6 + SOLAR_MODEL_OFFSET.x, 0, 3.15 + SOLAR_MODEL_OFFSET.z);
/**
 * Tomada do campo solar, no referencial do .glb: saiu de x = 4,2 para 5,0 (o cabo de saída é encurtado junto).
 * No mundo: OUTLET_LOCAL_X + SOLAR_MODEL_OFFSET.x.
 */
export const OUTLET_LOCAL_X = 5.0;

/**
 * Posto de cada papel na base (GDD, "Tempo da tripulação"): engenheiro no abrigo, médico perto da estufa,
 * cientista perto do rover, comandante perto da antena. Precisam ficar FORA das caixas de `obstacles`.
 */
export const POSTS: Record<Role, THREE.Vector3> = {
  // Ao lado da base de comunicação, fora da caixa dela.
  commander: new THREE.Vector3(COMM_POSITION.x + 2.74, 0, COMM_POSITION.z - 1.4),
  engineer: new THREE.Vector3(-9.0, 0, 8.4),
  medic: new THREE.Vector3(-4.2, 0, -7.4), // atrás da estufa, fora do anel de regolito
  scientist: new THREE.Vector3(10.5, 0, 9.5),
};

/**
 * Garagem do rover: o mesmo módulo, no raio sul (virado para a câmera), com o casco correndo em Z.
 * Em 100% de escala, como os outros módulos: o rover (~2,7 m de altura) cabe dentro.
 * Depois de uma expedição o rover sobe a rampa, entrega as amostras e fica em revisão (src/scene/base/Rover.ts).
 */
export const GARAGE_SCALE = 1;
export const GARAGE_POSITION = new THREE.Vector3(DOME_CENTER.x, 0, DOME_CENTER.z + TUBE_START + TUBE_LENGTH + PORT * GARAGE_SCALE);
/** Giro do módulo (o modelo corre em X; aqui corre em Z). */
export const GARAGE_ROTATION_Y = Math.PI / 2;
/** Piso da garagem: onde o rover fica (a rampa sobe até aqui). */
export const GARAGE_FLOOR_Y = 1.25;
/** Rampa na ponta da garagem: do topo (na porta de acoplamento) ao pé, no chão. */
export const GARAGE_RAMP = {
  top: new THREE.Vector3(GARAGE_POSITION.x, GARAGE_FLOOR_Y, GARAGE_POSITION.z + PORT * GARAGE_SCALE + 0.15),
  foot: new THREE.Vector3(GARAGE_POSITION.x, 0, GARAGE_POSITION.z + PORT * GARAGE_SCALE + 4.6),
  width: 2.3,
} as const;
/**
 * Caminho do rover para entrar: chega ao ponto de aproximação (fora da base, em frente à rampa), vai reto
 * até o pé da rampa, sobe e para no meio da garagem. Para sair, faz o caminho ao contrário, de ré.
 * `heading` = para onde o nariz aponta ao entrar (−Z).
 */
export const ROVER_DOCK = {
  approach: new THREE.Vector3(GARAGE_POSITION.x, 0, GARAGE_RAMP.foot.z + 4),
  foot: GARAGE_RAMP.foot,
  top: GARAGE_RAMP.top,
  inside: new THREE.Vector3(GARAGE_POSITION.x, GARAGE_FLOOR_Y, GARAGE_POSITION.z),
  heading: Math.PI / 2,
} as const;

export const TUBES: readonly { from: THREE.Vector3; to: THREE.Vector3 }[] = [
  // Leste: laboratório.
  { from: new THREE.Vector3(DOME_CENTER.x + TUBE_START, TUBE_Y, DOME_CENTER.z), to: new THREE.Vector3(DOME_CENTER.x + TUBE_START + TUBE_LENGTH, TUBE_Y, DOME_CENTER.z) },
  // Oeste: alojamento.
  { from: new THREE.Vector3(DOME_CENTER.x - TUBE_START, TUBE_Y, DOME_CENTER.z), to: new THREE.Vector3(DOME_CENTER.x - TUBE_START - TUBE_LENGTH, TUBE_Y, DOME_CENTER.z) },
  // Sul: garagem.
  { from: new THREE.Vector3(DOME_CENTER.x, TUBE_Y, DOME_CENTER.z + TUBE_START), to: new THREE.Vector3(DOME_CENTER.x, TUBE_Y, DOME_CENTER.z + TUBE_START + TUBE_LENGTH) },
];
/**
 * Altura (centro) das duas camas de cada beliche, acima do piso: **1 m livre acima de cada colchão**, como a NASA
 * recomenda para quem dorme conseguir sentar (F18). Acima da cama de cima, o casco deixa ~1,1 m.
 */
export const BUNK_LEVELS = [0.31, 1.49] as const;
/** O boneco deitado fica em tamanho normal (antes, em 80%, era encolhido para caber entre as camas). */
export const LYING_SCALE = 1;
/**
 * Medidas da cama: colchão de 0,7 m de fundo e 0,18 m de altura. A origem do boneco deitado (no meio da espessura
 * dele) fica BUNK_BODY_Y acima do centro da cama; o capacete deitado tem ~0,84 m.
 */
export const BED_DEPTH = 0.7;
export const BED_THICKNESS = 0.18;
const BUNK_BODY_Y = BED_THICKNESS / 2 + 0.43 * LYING_SCALE;
/** Fundo dos módulos, onde ficam a bancada e os aparelhos (z relativo ao centro do casco). */
export const BACK_Z = -0.55;
/** Beliches um pouco mais para o meio do casco que a bancada: o casco é redondo e a cama de cima fica perto dele. */
export const BUNK_Z = -0.42;
/**
 * Faixa por onde se anda dentro do alojamento: mais à frente que o eixo do casco, para as pernas não passarem
 * pela borda das camas de baixo (relativa ao centro do casco).
 */
export const QUARTERS_LANE_Z = 0.45;

/** Chão da estufa, dentro da cúpula (em cima da base da cúpula), onde ficam os canteiros. */
export const GREENHOUSE_FLOOR_Y = 0.4;
/** Largura da passarela da cúpula (m). */
export const WALKWAY_WIDTH = 1.2;
/**
 * Passarela da cúpula, na altura do piso dos módulos: cruza de leste a oeste (laboratório ↔ alojamento) e tem um
 * braço para o sul, até o túnel da garagem do rover. Os canteiros ficam embaixo.
 */
export const WALKWAY = {
  east: new THREE.Vector3(TUBES[0].from.x, HABITAT_FLOOR_Y, DOME_CENTER.z),
  west: new THREE.Vector3(TUBES[1].from.x, HABITAT_FLOOR_Y, DOME_CENTER.z),
  south: new THREE.Vector3(DOME_CENTER.x, HABITAT_FLOOR_Y, TUBES[2].from.z),
} as const;
/** Escada da passarela até o chão da estufa: degraus de ~17 cm, como numa casa. */
export const STAIR_STEPS = Math.round((HABITAT_FLOOR_Y - GREENHOUSE_FLOOR_Y) / 0.17);
export const STAIR_RUN = 0.3;
export const STAIR_WIDTH = 0.8;
/**
 * Escadas da passarela para os canteiros, uma de cada lado (norte e sul), para colher e cuidar das plantas.
 * `top` fica na borda da passarela, `bottom` no chão da estufa; `harvest` é onde o astronauta para, no canteiro.
 * A do sul fica do lado oeste, para não bater no braço da garagem.
 */
export const GREENHOUSE_STAIRS = [-1, 1].map((side) => {
  // side = −1: lado norte (−Z), a leste; side = +1: lado sul (+Z), a oeste.
  const x = DOME_CENTER.x - side * 2.2;
  const edge = DOME_CENTER.z + side * (WALKWAY_WIDTH / 2);
  const run = STAIR_STEPS * STAIR_RUN;
  return {
    side,
    top: new THREE.Vector3(x, HABITAT_FLOOR_Y, edge),
    bottom: new THREE.Vector3(x, GREENHOUSE_FLOOR_Y, edge + side * run),
    harvest: new THREE.Vector3(x, GREENHOUSE_FLOOR_Y, edge + side * (run + 0.7)),
  };
});
/** Pontos de colheita e manutenção das plantas (um de cada lado), para a tarefa "Colher na estufa" (GDD, A). */
export const GREENHOUSE_HARVEST_SPOTS = GREENHOUSE_STAIRS.map((s) => s.harvest);

/**
 * Quanto sobra de altura acima do piso dos módulos neste ponto (m). Nos túneis (e na boca deles, onde a cúpula
 * é baixa) sobram ~2,1 m: o astronauta passa em pé. Se um dia o teto ficar baixo, ele se abaixa sozinho.
 */
export function headroomAt(x: number, z: number): number {
  let ceiling = Infinity;
  const d = Math.hypot(x - DOME_CENTER.x, z - DOME_CENTER.z);
  const inDome = d < DOME_RADIUS;
  if (inDome) ceiling = Math.sqrt(DOME_RADIUS ** 2 - d * d);
  for (const t of TUBES) {
    const ax = t.to.x - t.from.x;
    const az = t.to.z - t.from.z;
    const len = Math.hypot(ax, az);
    const along = ((x - t.from.x) * ax + (z - t.from.z) * az) / len;
    const side = Math.abs((x - t.from.x) * az - (z - t.from.z) * ax) / len;
    // A boca do túnel começa um pouco dentro da cúpula, onde ela fica mais baixa que o túnel.
    if (along < -0.8 || along > len + 0.1 || side > TUBE_RADIUS) continue;
    const top = TUBE_Y + TUBE_RADIUS;
    ceiling = inDome ? Math.max(ceiling, top) : Math.min(ceiling, top);
  }
  return ceiling - HABITAT_FLOOR_Y;
}

/** Ponto dentro do casco do módulo (redondo, centro em y = HULL_AXIS_Y)? Para conferir camas e postos. */
export function insideHull(zFromAxis: number, y: number): boolean {
  return Math.hypot(zFromAxis, y - HULL_AXIS_Y) <= HULL_RADIUS;
}

/**
 * Onde cada papel fica DENTRO do habitat, visível pelo casco translúcido: comandante e cientista no
 * laboratório (perto do console), engenheiro e médico no alojamento (em frente aos beliches).
 */
export const HABITAT_SPOTS: Record<Role, THREE.Vector3> = {
  commander: new THREE.Vector3(HABITAT_POSITION.x - 1.0, HABITAT_FLOOR_Y, HABITAT_POSITION.z + 0.35),
  scientist: new THREE.Vector3(HABITAT_POSITION.x + 1.0, HABITAT_FLOOR_Y, HABITAT_POSITION.z + 0.35),
  // No alojamento, na faixa da frente (QUARTERS_LANE_Z): virando para olhar em volta, não encosta no beliche.
  engineer: new THREE.Vector3(HABITAT_POSITION.x + QUARTERS_OFFSET_X - 1.0, HABITAT_FLOOR_Y, HABITAT_POSITION.z + QUARTERS_LANE_Z + 0.05),
  medic: new THREE.Vector3(HABITAT_POSITION.x + QUARTERS_OFFSET_X + 1.0, HABITAT_FLOOR_Y, HABITAT_POSITION.z + QUARTERS_LANE_Z + 0.05),
};

/** Centro de cada beliche em relação ao centro do alojamento. */
export const BUNK_DX = 1.25;
/** Comprimento do boneco deitado. */
const LYING_LENGTH = 1.85 * LYING_SCALE;

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
    HABITAT_FLOOR_Y + BUNK_LEVELS[level] + BUNK_BODY_Y,
    HABITAT_POSITION.z + BUNK_Z,
  );
}

/**
 * Aparelhos da academia que um astronauta usa (F9: esteira e bicicleta, como na Estação Espacial).
 * `heading` segue a convenção do andar: 0 olha para −Z; aqui todos olham para a frente (+Z), para a câmera.
 */
/**
 * Posição (x, relativa ao centro da academia) de cada aparelho. A academia é o módulo da ponta: à esquerda
 * fica a parede (anel da porta de acoplamento), então a esteira fica perto do meio, com folga para os braços
 * de quem corre; a bicicleta vem logo depois e o aparelho de força (só decoração) vai para a outra ponta.
 */
export const TREADMILL_DX = -1.15;
export const BIKE_DX = 0.45;
export const GYM_DX = 1.9;
/** Onde fica o quadril de quem pedala, em Z, em relação ao centro do módulo (a bicicleta é montada em volta). */
export const BIKE_Z = -0.3;
export const GYM_STATIONS = [
  // Esteira: clipe `walk`; `speed` em m/s.
  // Esteira mais baixa, para a cabeça de quem corre não chegar no teto.
  { pos: new THREE.Vector3(HABITAT_POSITION.x + GYM_OFFSET_X + TREADMILL_DX, HABITAT_FLOOR_Y + 0.08, HABITAT_POSITION.z), heading: Math.PI, clip: 'walk', speed: 1.8 },
  // Bicicleta: sentado, clipe `pedal` (src/render/chibiPedal.ts); `speed` é a velocidade do clipe (1 = uma volta por segundo).
  { pos: new THREE.Vector3(HABITAT_POSITION.x + GYM_OFFSET_X + BIKE_DX, HABITAT_FLOOR_Y, HABITAT_POSITION.z + BIKE_Z), heading: Math.PI, clip: 'pedal', speed: 0.9 },
] as const;

/**
 * Para onde cada papel olha quando está parado no seu posto (GDD, "Para onde o astronauta olha"):
 * no laboratório, a sua tela da bancada; no alojamento, o armário (engenheiro) e a mesinha (médico).
 */
export const HABITAT_LOOK: Record<Role, THREE.Vector3> = {
  commander: new THREE.Vector3(HABITAT_POSITION.x - 0.9, HABITAT_FLOOR_Y + 1.3, HABITAT_POSITION.z + BACK_Z - 0.2),
  scientist: new THREE.Vector3(HABITAT_POSITION.x + 0.9, HABITAT_FLOOR_Y + 1.3, HABITAT_POSITION.z + BACK_Z - 0.2),
  engineer: new THREE.Vector3(HABITAT_POSITION.x + QUARTERS_OFFSET_X - 2.38, HABITAT_FLOOR_Y + 1, HABITAT_POSITION.z + BACK_Z),
  medic: new THREE.Vector3(HABITAT_POSITION.x + QUARTERS_OFFSET_X, HABITAT_FLOOR_Y + 0.7, HABITAT_POSITION.z + 0.3),
};

/**
 * Dentro da cúpula, perto do vazamento: onde fica quem conserta a estufa (problema de dentro). Ele desce pela
 * escada do lado norte (GREENHOUSE_STAIRS[0]).
 */
export const GREENHOUSE_WORK_SPOT = new THREE.Vector3(DOME_CENTER.x + DOME_RADIUS * 0.45, GREENHOUSE_FLOOR_Y, DOME_CENTER.z - DOME_RADIUS * 0.45);
/**
 * Nos canteiros do lado sul: onde fica quem colhe (tarefa opcional). Ele desce pela escada do sul
 * (GREENHOUSE_STAIRS[1]); o conserto usa a do norte, então a estufa tem acesso pelos dois lados.
 */
export const HARVEST_STAIR = 1;
export const HARVEST_WORK_SPOT = GREENHOUSE_STAIRS[HARVEST_STAIR].harvest.clone();
/** Na bancada do laboratório: onde fica quem analisa amostras (tarefa opcional). */
export const LAB_WORK_SPOT = new THREE.Vector3(HABITAT_POSITION.x, HABITAT_FLOOR_Y, HABITAT_POSITION.z + 0.15);
/** Para onde olha quem analisa: a bancada do fundo do laboratório. */
export const LAB_BENCH_LOOK = new THREE.Vector3(HABITAT_POSITION.x, HABITAT_FLOOR_Y + 1, HABITAT_POSITION.z + BACK_Z);

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
  dustyPanels: new THREE.Vector3(PANELS_ORIGIN.x + 5, 0, 6.6),
  greenhouseLeak: new THREE.Vector3(DOME_CENTER.x + DOME_RADIUS * 0.85, 0, DOME_CENTER.z - DOME_RADIUS * 0.85),
  // Ao lado da base de comunicação, atrás do posto do comandante.
  antenna: new THREE.Vector3(COMM_POSITION.x + 2.54, 0, COMM_POSITION.z - 2.4),
  roverStuck: new THREE.Vector3(22, 0, 13),
  tornBag: new THREE.Vector3(SHELTER_CENTER.x, 0, SHELTER_CENTER.z + 3.9),
  // Tarefas opcionais de dentro (marcador 🌱 / 🔬): no meio das plantas da cúpula e na bancada do laboratório.
  // Nas plantas, logo à frente de quem colhe (ao pé da escada do sul).
  harvest: new THREE.Vector3(HARVEST_WORK_SPOT.x, 0, HARVEST_WORK_SPOT.z + 0.9),
  analysis: new THREE.Vector3(HABITAT_POSITION.x, 0, HABITAT_POSITION.z),
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
  { x: DOME_CENTER.x, z: DOME_CENTER.z, r: DOME_RADIUS + 0.9 }, // cúpula e o anel de regolito
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
