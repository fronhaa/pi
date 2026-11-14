import { CONFIG } from './config.ts';
import { PROBLEMS } from './problems.ts';
import type { Role } from './crew.ts';
import type { GameState, ProblemKind } from './types.ts';

/**
 * Regras da EVA (saída da base com traje), em um lugar só (docs/game-design.md, "EVA: sair da base").
 *
 * - Problema de fora exige EVA; problema de dentro, não.
 * - A EVA é sempre em dupla, e só uma dupla pode estar fora ao mesmo tempo.
 * - No sol da tempestade (com o aviso da Terra recebido), ninguém sai.
 *
 * Quem usa: o jogo solo e o modo em grupo no cliente (src/core/CrewTasks.ts, que cuida de TEMPO e
 * LUGAR) e o servidor (Mission.evaBanned, pela ponte). A sala do servidor Go guarda qual dupla está
 * fora (server/internal/coop/eva.go), porque isso é estado da sala, não da missão.
 */

/** Quantos astronautas saem juntos numa EVA. */
export const EVA_PAIR_SIZE = CONFIG.eva.maxOutside;

/** Este problema só se resolve lá fora (exige EVA)? */
export function needsEva(kind: ProblemKind): boolean {
  return PROBLEMS[kind].outside;
}

/**
 * EVA proibida hoje: a Terra avisou que a tempestade chega esta noite.
 * Sem o aviso (antena desalinhada), a tripulação não sabe, e a regra não vale.
 * Recebe só as mensagens, para servir também ao estado que vem do servidor no modo em grupo.
 */
export function isEvaBanned(state: Pick<GameState, 'messages'>): boolean {
  return CONFIG.eva.banOnStormDay && state.messages.some((m) => m.kind === 'stormToday');
}

export type EvaDenied = 'storm' | 'full' | 'nobody';

export interface EvaRequest {
  /** A EVA está proibida hoje (isEvaBanned). */
  banned: boolean;
  /** Já tem uma dupla lá fora que não pode ajudar (de outro jogador, ou ocupada trabalhando). */
  pairBusy: boolean;
  /** Quem está dentro e sem tarefa, na ordem dos papéis. */
  free: readonly Role[];
  /** Quem o jogador escolheu. Se não estiver livre, vai o primeiro livre. */
  chosen: Role;
  /** Escolhe o parceiro entre os livres (modo em grupo prefere um astronauta do mesmo jogador). */
  pickBuddy?: (free: Role[], leader: Role) => Role | undefined;
}

/** Decide uma EVA nova: a dupla que sai, ou por que ninguém pode sair. */
export function planEva(req: EvaRequest): { ok: true; pair: [Role, Role] } | { ok: false; reason: EvaDenied } {
  if (req.banned) return { ok: false, reason: 'storm' };
  if (req.pairBusy) return { ok: false, reason: 'full' };
  const leader = req.free.includes(req.chosen) ? req.chosen : req.free[0];
  if (!leader) return { ok: false, reason: 'nobody' };
  const others = req.free.filter((r) => r !== leader);
  const buddy = req.pickBuddy ? req.pickBuddy(others, leader) : others[0];
  if (!buddy) return { ok: false, reason: 'nobody' };
  return { ok: true, pair: [leader, buddy] };
}
