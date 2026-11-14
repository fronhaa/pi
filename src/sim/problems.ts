import { CONFIG } from './config.ts';
import type { Rng } from './rng.ts';
import type { Problem, ProblemKind } from './types.ts';

/**
 * Problemas pela base (docs/game-design.md, "Tempo da tripulação e movimentação").
 * Tempos e efeitos são valores iniciais de jogo, ainda a balancear (GDD).
 * A ONDE cada problema fica no mapa é da cena (src/scene/MarsBase.ts, PROBLEM_SPOTS); aqui só regras.
 */
export interface ProblemDef {
  kind: ProblemKind;
  /** Segundos de trabalho no local. */
  taskSeconds: number;
  /** Fora da base: passa pela câmara de descompressão e soma dose ao terminar. */
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

/** Tempo total no local: tarefa + câmara de descompressão para sair (GDD: 3 s para sair). */
export function taskTime(kind: ProblemKind): number {
  const d = PROBLEMS[kind];
  return d.taskSeconds + (d.outside ? CONFIG.problems.airlockSeconds : 0);
}

/** Sorteia os problemas do dia: só a partir do sol 3, 1 ou 2 por dia, tipos diferentes. */
export function scheduleProblems(sol: number, rng: Rng, nextUid: () => number): Problem[] {
  const c = CONFIG.problems;
  if (sol < c.firstSol) return [];
  const count = rng.int(c.minPerDay, c.maxPerDay);
  return rng
    .shuffle(PROBLEM_KINDS)
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
