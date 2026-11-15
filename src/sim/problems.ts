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
  /**
   * Tarefa opcional de dentro (colher, analisar): não fazer não cobra nada à noite, só perde o bônus.
   * Fica fora do sorteio dos problemas e é acrescentada todo dia em tempo real (GDD, "Atividades dentro da base").
   */
  optional: boolean;
}

export const PROBLEMS: Record<ProblemKind, ProblemDef> = {
  dustyPanels: { kind: 'dustyPanels', taskSeconds: 15, outside: true, optional: false },
  greenhouseLeak: { kind: 'greenhouseLeak', taskSeconds: 10, outside: false, optional: false },
  antenna: { kind: 'antenna', taskSeconds: 15, outside: true, optional: false },
  roverStuck: { kind: 'roverStuck', taskSeconds: 20, outside: true, optional: false },
  tornBag: { kind: 'tornBag', taskSeconds: 10, outside: true, optional: false },
  harvest: { kind: 'harvest', taskSeconds: CONFIG.indoorTasks.harvest.seconds, outside: false, optional: true },
  analysis: { kind: 'analysis', taskSeconds: CONFIG.indoorTasks.analysis.seconds, outside: false, optional: true },
};

/** Só os problemas de verdade (os opcionais não entram no sorteio, senão todas as partidas mudariam). */
export const PROBLEM_KINDS = (Object.keys(PROBLEMS) as ProblemKind[]).filter((k) => !PROBLEMS[k].optional);
/** Tarefas opcionais de dentro, na ordem em que aparecem na lista do dia. */
export const OPTIONAL_KINDS = (Object.keys(PROBLEMS) as ProblemKind[]).filter((k) => PROBLEMS[k].optional);

/** Segundos de trabalho no local. A câmara de descompressão é contada à parte, na saída da EVA. */
/** Bateria que uma tarefa opcional gasta ao terminar (0 para os problemas). */
export function taskBattery(kind: ProblemKind): number {
  return kind === 'harvest' || kind === 'analysis' ? CONFIG.indoorTasks[kind].battery : 0;
}

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
  const problems = rng
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
  // Tarefas opcionais: disponíveis desde o começo do dia, sem usar o gerador (não muda o sorteio do resto).
  const tasks = OPTIONAL_KINDS.map((kind) => ({ uid: nextUid(), kind, spawnAt: 0, status: 'pending' as const, progress: 0 }));
  return [...problems, ...tasks];
}
