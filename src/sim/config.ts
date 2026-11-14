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
    commDelayMin: { min: 3, max: 22 },
  },

  dustStorm: { firstSol: 3, lastSol: 12 },

  cards: { perGame: 4, firstSol: 2, lastSol: 14 },

  stars: { doseFor3: 50 },
} as const;

export type FlareClass = keyof typeof CONFIG.solarStorms.intensity;
