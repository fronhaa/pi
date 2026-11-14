import type { FlareClass } from './config.ts';

/** Erupção solar que dispara uma tempestade. `real` = veio do DONKI (com data e link). */
export interface Flare {
  cls: FlareClass;
  /** Classe completa, ex. "X1.6" (real) ou "M" (simulado). */
  label: string;
  real: boolean;
  time?: string;
  link?: string;
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
