import { STRINGS, type Lang, type StringKey } from './strings';
import { MOON_STRINGS } from './moon';

export type { Lang, StringKey };

const STORAGE_KEY = 'jezero.lang';

/**
 * O jogo abre sempre em inglês (decisão de 15/11/2026: o desafio e os juízes são em inglês, e o seletor de
 * idioma poluía o HUD no celular). Os textos em português continuam no código (`?lang=pt` para testar).
 */
function initialLang(): Lang {
  return new URLSearchParams(location.search).get('lang') === 'pt' ? 'pt' : 'en';
}
/** Mantido para quem ainda chama `setLang` (salvar a escolha não é mais usado). */
void STORAGE_KEY;

let lang: Lang = initialLang();
const listeners = new Set<() => void>();

/** Onde fica a base: na Lua, os textos de src/i18n/moon.ts substituem os de Marte. */
export type Place = 'mars' | 'moon';
let place: Place = 'mars';

export function setPlace(next: Place): void {
  place = next;
}

export function getPlace(): Place {
  return place;
}

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  lang = next;
  document.documentElement.lang = next === 'pt' ? 'pt-BR' : 'en';
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignora */
  }
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void): void {
  listeners.add(fn);
}

/** Texto traduzido. Chaves dinâmicas (ex.: relatórios da simulação) também são aceitas como string. */
export function t(key: StringKey | string, params: Record<string, string | number> = {}): string {
  const table = STRINGS[lang] as Record<string, string>;
  const moon = place === 'moon' ? (MOON_STRINGS[lang] as Record<string, string>)[key] : undefined;
  const raw = moon ?? table[key] ?? (STRINGS.pt as Record<string, string>)[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (k in params ? formatParam(params[k]) : `{${k}}`));
}

function formatParam(v: string | number): string {
  if (typeof v !== 'number') return v;
  return Number.isInteger(v) ? String(v) : v.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en', { maximumFractionDigits: 1 });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
