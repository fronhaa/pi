/** Passo fixo da física (segundos). Ver docs/decisoes/0001-stack.md */
export const FIXED_DT = 1 / 60;

/** Limite de tempo acumulado por frame, evita "espiral da morte" após travadas/aba em background. */
export const MAX_FRAME_DT = 0.25;

/**
 * Corpos celestes com dados REAIS da NASA (classificação REAL, ver docs/art-bible.md seção 11).
 * Fontes e regras para trocar estes números: docs/fisica.md, seção "Gravidade real". ADR 0005.
 */
export const CELESTIAL_BODIES = {
  /** 3,7 m/s² (0,37 g). NASA Glenn, Beginner's Guide to Aeronautics: Mars. */
  mars: { name: 'Marte', gravity: 3.7 },
  /** 1,624 m/s² no equador. NASA Science, Compare Earth and the Moon. */
  moon: { name: 'Lua', gravity: 1.624 },
} as const;

export type CelestialBodyId = keyof typeof CELESTIAL_BODIES;

/** Missão atual. A Lua só entra se Marte estiver concluído (docs/game-design.md, backlog). */
export const DEFAULT_BODY: CelestialBodyId = 'mars';

/** Vetor de gravidade do Rapier (eixo Y para cima, m/s²). */
export function gravityOf(body: CelestialBodyId): { x: number; y: number; z: number } {
  return { x: 0, y: -CELESTIAL_BODIES[body].gravity, z: 0 };
}
