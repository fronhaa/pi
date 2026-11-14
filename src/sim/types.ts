import type { FlareClass, Location } from './config.ts';

export type { Location };

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

export type CardId = 'dustyPanels' | 'mysteryRock' | 'greenhouseLeak' | 'cargoShip' | 'brokenSensor' | 'subsurfaceIce' | 'moxie' | 'roverRoute';

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
  /** Só na Lua: sombra das montanhas amanhã / hoje (`left` = dias de sombra que faltam, contando hoje). */
  | { kind: 'shadowAlert'; delayMin: number; sol: number }
  | { kind: 'shadowNow'; left: number }
  | { kind: 'allClear'; delayMin: number }
  | { kind: 'noSignal' };

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

export type ProblemKind = 'dustyPanels' | 'greenhouseLeak' | 'antenna' | 'roverStuck' | 'tornBag';

export interface Problem {
  uid: number;
  kind: ProblemKind;
  /** Segundo do dia em que aparece. */
  spawnAt: number;
  status: 'pending' | 'open' | 'done';
  /** 0–1: trabalho feito (pode continuar no dia seguinte depois de noite de tempestade). */
  progress: number;
}

export interface ScheduledStorm {
  sol: number;
  flare: Flare;
  delayMin: number;
}

export interface GameState {
  seed: number;
  /** Onde fica a base (docs/game-design.md, "Base lunar"). */
  location: Location;
  /** Missão histórica em jogo, ou null quando as tempestades são sorteadas (erupções ou simuladas). */
  historical: HistoricalMission | null;
  sol: number;
  res: Resources;
  /** Blocos de energia gerados hoje (já considera a poeira). */
  blocks: number;
  storms: ScheduledStorm[];
  /** Sol da tempestade de poeira (só Marte; 0 na Lua). */
  dustStormSol: number;
  /** Primeiro dia da sombra das montanhas (só Lua; 0 em Marte). Dura CONFIG.moon.shadow.sols dias. */
  shadowSol: number;
  /** Sóis restantes em que a poeira da tempestade não é limpa pelo vento. */
  dustHold: number;
  cardSols: Map<number, CardId>;
  /** Carta do sol atual, ainda sem resposta. */
  pendingCard: Card | null;
  messages: Message[];
  /** Problemas do dia (tempo da tripulação). */
  problems: Problem[];
  /** A antena ficou desalinhada: as mensagens da Terra não chegam neste sol. */
  commsDown: boolean;
  reports: SolReport[];
  outcome: Outcome;
}
