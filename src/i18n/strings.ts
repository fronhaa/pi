import * as ui from './strings/ui';
import * as crew from './strings/crew';
import * as cards from './strings/cards';
import * as report from './strings/report';
import * as nasa from './strings/nasa';
import * as coop from './strings/coop';
import * as intro from './strings/intro';

/**
 * Textos do jogo em português e inglês, divididos por assunto em src/i18n/strings/:
 * ui (interface), crew (tripulação), cards (cartas), report (relatório e fim), nasa (dados e fatos), coop (grupo),
 * intro (treino dos sóis 1 a 3).
 * Texto novo: entra no arquivo do assunto, nos DOIS idiomas (o TypeScript confere).
 * O que muda na Lua: src/i18n/moon.ts (só as chaves que mudam).
 */
const pt = { ...ui.pt, ...crew.pt, ...cards.pt, ...report.pt, ...nasa.pt, ...coop.pt, ...intro.pt };

export type StringKey = keyof typeof pt;

const en: Record<StringKey, string> = { ...ui.en, ...crew.en, ...cards.en, ...report.en, ...nasa.en, ...coop.en, ...intro.en };

export const STRINGS = { pt, en } as const;
export type Lang = keyof typeof STRINGS;
