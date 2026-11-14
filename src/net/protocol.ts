import type { Card, EnergyPlan, Flare, Message, Outcome, Problem, Resources, ScheduledStorm, SolReport } from '@/sim/types';

/**
 * Protocolo do servidor coop (server/internal/coop). Guia: docs/servidor-coop.md.
 * Os nomes dos campos são os mesmos do Go (tags JSON).
 */

export type CoopRole = 'earth' | 'commander' | 'engineer' | 'medic' | 'scientist';
export const COOP_ROLES: CoopRole[] = ['earth', 'commander', 'engineer', 'medic', 'scientist'];
export const MARS_ROLES: CoopRole[] = ['commander', 'engineer', 'medic', 'scientist'];

/** Qual papel mexe em qual parte do plano de energia. */
export const BLOCK_ROLE: Record<keyof EnergyPlan, CoopRole> = { life: 'medic', shield: 'engineer', science: 'scientist' };

export type EarthOption = 'storm' | 'dust' | 'science' | 'life' | 'none';
export const EARTH_OPTIONS: EarthOption[] = ['storm', 'dust', 'science', 'life', 'none'];

export type CoopPhase = 'lobby' | 'earth' | 'mars' | 'day' | 'ended';

/** Mensagem que a Terra (um jogador) mandou ontem. */
export interface EarthCoopMessage {
  kind: 'earth';
  option: EarthOption;
  delayMin: number;
  flare?: Flare;
}

export type MarsMessage = Message | EarthCoopMessage;

export interface PlayerView {
  id: string;
  number: number;
  roles: CoopRole[];
  connected: boolean;
  host: boolean;
}

export interface MarsView {
  sol: number;
  res: Resources;
  blocks: number;
  plan: EnergyPlan;
  pendingCard: Card | null;
  messages: MarsMessage[];
  outcome: Outcome;
  lastReport: SolReport | null;
  reportCard?: string;
  storms?: ScheduledStorm[];
  /** Problemas do dia ("pending" = ainda não apareceram). */
  problems: Problem[];
  /** Só na fase "day": o relógio vem do servidor. */
  day?: { remaining: number; paused: boolean };
  commsDown: boolean;
  historical?: { id: number; difficulty: string; startUtc: string };
}

export interface ForecastItem {
  sol: number;
  kind: 'storm' | 'dust';
  flare?: Flare;
}

export interface EarthView {
  sol: number;
  res: Resources;
  forecast: ForecastItem[];
  sent: { option: EarthOption; delayMin: number; sentSol: number } | null;
  lastReport: SolReport | null;
  outcome: Outcome;
}

export interface CoopState {
  t: 'state';
  code: string;
  phase: CoopPhase;
  you: PlayerView;
  players: PlayerView[];
  autoEarth: boolean;
  mars?: MarsView;
  earth?: EarthView;
}

export type ServerMsg =
  | { t: 'welcome'; code: string; playerId?: string; token: string }
  | CoopState
  | { t: 'error'; code: string };

export type ClientAction =
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'claim' | 'release'; role: CoopRole }
  | { t: 'start' }
  | { t: 'earth'; option: EarthOption }
  | { t: 'card'; option: string }
  | { t: 'blocks'; key: keyof EnergyPlan; value: number }
  | { t: 'end_sol' | 'start_day' | 'pause' | 'end_day' }
  | { t: 'problem_progress'; uid: number; progress: number }
  | { t: 'problem_resolve'; uid: number };
