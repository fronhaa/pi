import type { FlareClass } from './config.ts';

/**
 * Evento solar que dispara uma tempestade. `real` = veio do DONKI (com data e link).
 * `source: 'cme'` = ejeção de massa coronal de uma missão histórica; sem `source`, é uma erupção.
 */
export interface Flare {
  cls: FlareClass;
  /** Classe completa, ex. "X1.6" (erupção real), "R" (tipo da CME) ou "M" (simulado). */
  label: string;
  real: boolean;
  time?: string;
  link?: string;
  source?: 'flare' | 'cme';
  speedKmS?: number | null;
}

/**
 * Missão histórica: 15 sóis reais do passado (docs/game-design.md, "Calendário da missão").
 * Gerada de public/data/missions.json (`npm run data:missions`).
 */
export interface HistoricalMission {
  id: number;
  difficulty: 'medium' | 'hard';
  startUtc: string;
  endUtc: string;
  storms: { sol: number; flare: Flare }[];
  /** Atraso real Terra-Marte em minutos, por sol (índice 0 = sol 1). */
  delays: number[];
}

export interface Resources {
  battery: number;
  life: number;
  shield: number;
  dose: number;
  science: number;
  /** Poeira nos painéis, em % (0–80). */
  dust: number;
}

export interface EnergyPlan {
  life: number;
  shield: number;
  science: number;
}

export type CardId = 'dustyPanels' | 'mysteryRock' | 'greenhouseLeak' | 'cargoShip' | 'brokenSensor' | 'subsurfaceIce';

export interface CardOption {
  id: string;
}

export interface Card {
  id: CardId;
  options: CardOption[];
}

export type Message =
  | { kind: 'stormAlert'; flare: Flare; delayMin: number; impactSol: number }
  | { kind: 'stormToday'; flare: Flare; delayMin: number }
  | { kind: 'dustAlert'; delayMin: number; sol: number }
  | { kind: 'dustNow' }
  | { kind: 'allClear'; delayMin: number };

/** Uma linha do relatório: chave de texto + parâmetros (o texto vem do i18n). */
export interface ReportLine {
  key: string;
  params?: Record<string, string | number>;
  tone?: 'good' | 'bad' | 'neutral';
}

export interface SolReport {
  sol: number;
  plan: EnergyPlan;
  before: Resources;
  after: Resources;
  storm: { flare: Flare; dose: number } | null;
  lines: ReportLine[];
}

export type Outcome =
  | { status: 'playing' }
  | { status: 'lost'; reason: 'life' | 'dose'; sol: number }
  | { status: 'won'; stars: 1 | 2 | 3 };

export interface ScheduledStorm {
  sol: number;
  flare: Flare;
  delayMin: number;
}

export interface GameState {
  seed: number;
  /** Missão histórica em jogo, ou null quando as tempestades são sorteadas (erupções ou simuladas). */
  historical: HistoricalMission | null;
  sol: number;
  res: Resources;
  /** Blocos de energia gerados hoje (já considera a poeira). */
  blocks: number;
  storms: ScheduledStorm[];
  dustStormSol: number;
  /** Sóis restantes em que a poeira da tempestade não é limpa pelo vento. */
  dustHold: number;
  cardSols: Map<number, CardId>;
  /** Carta do sol atual, ainda sem resposta. */
  pendingCard: Card | null;
  messages: Message[];
  reports: SolReport[];
  outcome: Outcome;
}
