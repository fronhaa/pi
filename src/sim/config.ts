/**
 * Todos os números de jogo num lugar só (docs/game-design.md, "Sistemas e regras").
 * São SIMPLIFICADOS para o jogo (classificação INTERPRETADO). O que é real é a erupção, não a escala.
 * Mudou um número? Rode `npm run balance` e confira que a forma do equilíbrio se mantém.
 */
export const CONFIG = {
  sols: 15,

  energy: { panelBlocks: 10, minBlocks: 2 },

  battery: { start: 50, perLeftoverBlock: 10, nightCost: 20, max: 100, lifePerMissingPoint: 0.6 },

  life: { start: 70, stableBlocks: 3, perBlock: 6, max: 100 },

  shield: { start: 40, decay: 4, perBlock: 8, max: 100 },

  dose: { start: 0, perSol: 1, max: 100, shieldFactor: 0.85 },

  science: { perBlock: 3, stormFactor: 0.5, goal: 100 },

  dust: { windCleanPerSol: 6, max: 80, stormAdd: 40, stormHoldSols: 3 },

  solarStorms: {
    count: 3,
    firstSol: 4,
    lastSol: 14,
    minGap: 2,
    /** Intensidade no jogo por classe da erupção real (C só aparece no modo simulado). */
    intensity: { C: 10, M: 25, X: 45 },
    /**
     * Missões históricas (CMEs do DONKI): a força calculada pelo script a partir do tipo de
     * velocidade da CME (S/C = fraca, O = média, R/ER = forte) usa a mesma escala das erupções.
     */
    strengthClass: { weak: 'C', medium: 'M', strong: 'X' },
    commDelayMin: { min: 3, max: 22 },
  },

  dustStorm: { firstSol: 3, lastSol: 12 },

  cards: { perGame: 4, firstSol: 2, lastSol: 14 },

  /** Problemas pela base (GDD, "Tempo da tripulação"). Dia em tempo real com duração fixa. */
  problems: {
    firstSol: 3,
    minPerDay: 1,
    maxPerDay: 2,
    /** Segundos do dia em que o problema pode aparecer. */
    spawnWindow: { min: 3, max: 35 },
    daySeconds: 75,
    airlockSeconds: 3,
    /** Dose ao terminar uma tarefa fora da base (escala do jogo, INTERPRETADO). */
    outsideDose: 1,
    effects: { dust: 20, lifeLeak: 10, shieldBag: 8 },
  },

  /**
   * Cartas do rover (GDD, "Cartas de decisão"). Números de jogo (INTERPRETADO); os fatos reais
   * por trás delas têm fonte no GDD (MOXIE, AutoNav do Perseverance, Spirit atolado).
   */
  rover: {
    moxie: { battery: -15, life: 10 },
    route: { safeScience: 5, shortcutScience: 15, shortcutStuckChance: 0.5 },
  },

  stars: { doseFor3: 50 },

  /**
   * Base lunar (polo sul da Lua): só o que MUDA em relação a Marte; o resto das regras é igual.
   * Números de jogo (INTERPRETADO); os fatos reais por trás deles têm fonte no GDD ("Base lunar").
   */
  moon: {
    /** Sem atmosfera: a radiação de todo dia é cerca de 2x a de Marte (Chang'e 4 LND × Curiosity RAD). */
    dosePerSol: 2,
    /** Sem ar para frear as partículas, a tempestade solar pesa mais. */
    stormFactor: 1.2,
    /** Sem vento: a poeira não sai sozinha dos painéis. */
    windCleanPerSol: 0,
    /** Um astronauta limpando os painéis (problema resolvido) tira esta poeira. */
    crewCleanDust: 20,
    /** Sombra das montanhas do polo sul: dias seguidos com pouca luz (substitui a tempestade de poeira). */
    shadow: { firstSol: 4, lastSol: 11, sols: 3, blocks: 4 },
    /** A luz leva ~1,3 s da Terra à Lua (384.400 km). Só para mostrar; as mensagens chegam na hora. */
    commDelaySec: 1.3,
    /** A 3ª estrela: dose abaixo disto (a radiação de todo dia já é o dobro da de Marte). */
    doseFor3: 70,
    /** Pedir ajuda à Terra custa pouco: a resposta chega em segundos. */
    askEarthScience: -3,
  },
} as const;

export type FlareClass = keyof typeof CONFIG.solarStorms.intensity;

/** Onde fica a base. Marte é o padrão (modo em grupo só em Marte por enquanto). */
export type Location = 'mars' | 'moon';

/** Dose máxima para a 3ª estrela (na Lua é mais alta: a dose de todo dia é o dobro). */
export function doseFor3(location: Location): number {
  return location === 'moon' ? CONFIG.moon.doseFor3 : CONFIG.stars.doseFor3;
}
