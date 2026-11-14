import { STRINGS, type Lang, type StringKey } from './strings';

export type { Lang, StringKey };

const STORAGE_KEY = 'jezero.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'pt' || saved === 'en') return saved;
  } catch {
    /* sem localStorage (modo privado etc.) */
  }
  return navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

let lang: Lang = initialLang();
const listeners = new Set<() => void>();

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
  const raw = table[key] ?? (STRINGS.pt as Record<string, string>)[key] ?? key;
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
