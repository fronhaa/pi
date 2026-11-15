import type { Mission } from './mission.ts';
import type { EnergyPlan, ReportLine, SolReport } from './types.ts';

/**
 * Interações do jogador com a missão, como DADOS (padrão Command).
 *
 * Toda decisão que muda a missão passa por aqui: a interface e a cena montam uma `MissionAction`
 * e chamam `applyAction`. O jogo solo aplica direto (src/core/session.ts, LocalPort); o modo em
 * grupo manda a ação ao servidor, que aplica a MESMA função pela ponte (src/sim/bridge.ts).
 *
 * Interação nova: 1) um caso aqui, 2) a regra na Mission (ou num módulo de src/sim), 3) quem
 * dispara (ui/ ou core/). Se o modo em grupo também usa, veja docs/servidor-coop.md.
 * Guia: docs/estrutura-do-projeto.md, "Interação nova".
 */
export type MissionAction =
  /** Resposta da carta do sol. */
  | { type: 'answerCard'; option: string }
  /** O relógio do dia chegou ao `spawnAt`: o problema aparece. */
  | { type: 'openProblem'; uid: number }
  /** Progresso do conserto (0–1), enquanto um astronauta trabalha. */
  | { type: 'problemProgress'; uid: number; progress: number }
  /** Um astronauta terminou o conserto. */
  | { type: 'resolveProblem'; uid: number }
  /** Noite: aplica o plano de energia e passa para o próximo sol. */
  | { type: 'endSol'; plan: EnergyPlan };

export type MissionActionType = MissionAction['type'];

export interface ActionResult {
  /** Linhas para o relatório (resposta da carta). */
  lines?: ReportLine[];
  /** Relatório da noite (endSol). */
  report?: SolReport;
}

/** Aplica uma ação à missão. Ação inválida (opção que não existe, plano acima dos blocos) lança erro. */
export function applyAction(mission: Mission, action: MissionAction): ActionResult {
  switch (action.type) {
    case 'answerCard':
      return { lines: mission.answerCard(action.option) };
    case 'openProblem':
      mission.openProblem(action.uid);
      return {};
    case 'problemProgress':
      mission.setProblemProgress(action.uid, action.progress);
      return {};
    case 'resolveProblem':
      mission.resolveProblem(action.uid);
      return {};
    case 'endSol':
      return { report: mission.endSol(action.plan) };
  }
}
