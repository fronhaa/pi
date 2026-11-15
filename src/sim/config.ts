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

  /**
   * Tubos de amostra do rover (GDD, "Tubos de amostra"). O total é REAL: o Perseverance levou 43 tubos,
   * 38 para amostras (docs/ciencia-marte.md, F14). O resto é regra do jogo (INTERPRETADO): todo sol com
   * energia na ciência, o rover faz uma expedição e enche `perExpedition` tubos; sem tubos, ele só mede
   * com os instrumentos e a ciência do dia vale `noTubeFactor`.
   */
  samples: { tubes: 38, perExpedition: 3, noTubeFactor: 0.5 },

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
    /** Câmara de descompressão: segundos para sair e para voltar (GDD). */
    airlockSeconds: 3,
    /** Dose ao terminar uma tarefa fora da base (escala do jogo, INTERPRETADO). */
    outsideDose: 1,
    effects: { dust: 20, lifeLeak: 10, shieldBag: 8 },
  },

  /**
   * EVA (saída da base com traje). A tripulação fica dentro por padrão; problema de fora exige EVA.
   * Regras de jogo (INTERPRETADO), inspiradas no planejamento da NASA (GDD, "EVA: sair da base").
   */
  eva: {
    /** No máximo uma dupla fora ao mesmo tempo. */
    maxOutside: 2,
    /** No sol em que a tempestade chega (com o aviso da Terra recebido), ninguém sai. */
    banOnStormDay: true,
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
    /**
     * Sem noite a cada 24 h: no alto de uma borda de cratera do polo sul o Sol não se põe todo dia. O fim do turno é o
     * descanso da tripulação (a base segue gastando com ar, água e computadores). Só nos dias de sombra há noite de
     * verdade, muito fria (cerca de −170 °C), e os aquecedores gastam mais.
     */
    restCost: 15,
    shadowNightCost: 30,
    /** Sombra das montanhas do polo sul: dias seguidos com pouca luz (substitui a tempestade de poeira). */
    shadow: { firstSol: 4, lastSol: 11, sols: 3 },
    /**
     * Luz do Sol de cada dia (%). Sem ar, o Sol pleno na Lua é forte (mais que o dobro da luz que chega a Marte),
     * então 100% de luz dá mais blocos que em Marte. Mas no polo sul o Sol anda rente ao horizonte e passa atrás de
     * morros mais altos ou mais baixos: a luz muda dia a dia, e dá para prever (caminho do Sol + relevo).
     * O relevo e a curva são do jogo (INTERPRETADO); o que é real é o porquê.
     */
    sun: {
      fullBlocks: 14,
      /** Dias comuns: luz entre min e 100%. */
      minLight: 40,
      /** Dias de sombra das montanhas: só uma beirada do Sol aparece. */
      shadowLight: { min: 25, max: 35 },
      /** O Sol dá a volta no horizonte em ~29,5 dias; os morros fazem a luz subir e descer em ciclos de alguns dias. */
      cycleDays: { min: 5, max: 8 },
      /** Quantos dias à frente a previsão mostra. */
      forecastDays: 2,
    },
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
