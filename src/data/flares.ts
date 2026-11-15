import type { Flare } from '@/sim/types';
import type { FlareClass } from '@/sim/config';

/**
 * Erupções solares reais do DONKI. Ordem (docs/game-design.md, "Dados reais da NASA"):
 *   1. ao vivo  (ainda não implementado no navegador; ver docs/dados.md)
 *   2. snapshot real em public/data/donki-flares.json (gerado por `npm run fetch-data`)
 *   3. simulado (a simulação gera sozinha quando a lista vem vazia)
 */
export type FlareSource =
  | { kind: 'snapshot'; fetchedAt: string; flares: Flare[] }
  | { kind: 'simulated'; flares: [] };

interface SnapshotFile {
  fetchedAt: string;
  flares: { id: string; time: string; cls: string; link: string }[];
}

export async function loadFlares(): Promise<FlareSource> {
  try {
    // Caminho relativo: funciona em subpastas (GitHub Pages).
    const res = await fetch(`${import.meta.env.BASE_URL}data/donki-flares.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as SnapshotFile;
    const flares: Flare[] = data.flares
      .filter((f) => /^[MX]/.test(f.cls))
      .map((f) => ({ cls: f.cls[0] as FlareClass, label: f.cls, real: true, time: f.time, link: f.link }));
    if (flares.length < 3) throw new Error('poucas erupções');
    return { kind: 'snapshot', fetchedAt: data.fetchedAt, flares };
  } catch (err) {
    console.warn('Erupções reais indisponíveis; usando simuladas.', err);
    return { kind: 'simulated', flares: [] };
  }
}

/** "O Sol ultimamente": resumo das erupções reais recentes, contado a partir do dia do download (não é ao vivo). */
export interface RecentSun {
  fetchedAt: string;
  /** Erupções fortes (M e X) nos últimos `days` dias antes do download. */
  count: number;
  days: number;
  latest: Flare | null;
}

export function recentSun(source: FlareSource, days = 30): RecentSun | null {
  if (source.kind !== 'snapshot') return null;
  const end = Date.parse(source.fetchedAt);
  const since = end - days * 24 * 3600 * 1000;
  const dated = source.flares.filter((f) => f.time).sort((a, b) => Date.parse(b.time!) - Date.parse(a.time!));
  const count = dated.filter((f) => Date.parse(f.time!) >= since && Date.parse(f.time!) <= end).length;
  return { fetchedAt: source.fetchedAt, count, days, latest: dated[0] ?? null };
}
