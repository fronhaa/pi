import { CONFIG } from './config.ts';
import type { Rng } from './rng.ts';
import type { Problem, ProblemKind } from './types.ts';

/**
 * Problemas pela base (docs/game-design.md, "Tempo da tripulação e movimentação").
 * Tempos e efeitos são valores iniciais de jogo, ainda a balancear (GDD).
 * A ONDE cada problema fica no mapa é da cena (src/scene/base/layout.ts, PROBLEM_SPOTS); aqui só regras.
 */
export interface ProblemDef {
  kind: ProblemKind;
  /** Segundos de trabalho no local. */
  taskSeconds: number;
  /** Fora da base: exige EVA (dupla, câmara de descompressão) e soma dose ao terminar. */
  outside: boolean;
}

export const PROBLEMS: Record<ProblemKind, ProblemDef> = {
  dustyPanels: { kind: 'dustyPanels', taskSeconds: 15, outside: true },
  greenhouseLeak: { kind: 'greenhouseLeak', taskSeconds: 10, outside: false },
  antenna: { kind: 'antenna', taskSeconds: 15, outside: true },
  roverStuck: { kind: 'roverStuck', taskSeconds: 20, outside: true },
  tornBag: { kind: 'tornBag', taskSeconds: 10, outside: true },
};

export const PROBLEM_KINDS = Object.keys(PROBLEMS) as ProblemKind[];

/** Segundos de trabalho no local. A câmara de descompressão é contada à parte, na saída da EVA. */
export function taskTime(kind: ProblemKind): number {
  return PROBLEMS[kind].taskSeconds;
}

/**
 * Sorteia os problemas do dia: só a partir do sol 3, 1 ou 2 por dia, tipos diferentes.
 * `exclude`: tipos que já continuam de ontem (não aparecem duas vezes no mesmo lugar).
 */
export function scheduleProblems(sol: number, rng: Rng, nextUid: () => number, exclude: ProblemKind[] = []): Problem[] {
  const c = CONFIG.problems;
  if (sol < c.firstSol) return [];
  const count = rng.int(c.minPerDay, c.maxPerDay);
  return rng
    .shuffle(PROBLEM_KINDS.filter((k) => !exclude.includes(k)))
    .slice(0, count)
    .map((kind) => ({
      uid: nextUid(),
      kind,
      spawnAt: rng.int(c.spawnWindow.min, c.spawnWindow.max),
      status: 'pending' as const,
      progress: 0,
    }))
    .sort((a, b) => a.spawnAt - b.spawnAt);
}
