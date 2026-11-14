import { parseMissions, type MissionsFile } from '@/sim/historical';
import type { HistoricalMission } from '@/sim/types';

/**
 * Missões históricas (docs/game-design.md, "Calendário da missão"). Ordem das tempestades:
 *   1. missões históricas (public/data/missions.json, `npm run data:missions`)
 *   2. erupções reais sorteadas (src/data/flares.ts)
 *   3. simuladas
 */
export type MissionSource =
  | { kind: 'snapshot'; generatedAt: string; missions: HistoricalMission[] }
  | { kind: 'none'; missions: [] };

export async function loadMissions(): Promise<MissionSource> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/missions.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as MissionsFile;
    const missions = parseMissions(data);
    if (missions.length === 0) throw new Error('nenhuma missão válida');
    return { kind: 'snapshot', generatedAt: data.generatedAt, missions };
  } catch (err) {
    console.warn('Missões históricas indisponíveis; usando erupções sorteadas.', err);
    return { kind: 'none', missions: [] };
  }
}

const PLAYED_KEY = 'jezero.played';

/** Primeira partida neste navegador? (só conveniência: sem localStorage, conta como primeira). */
export function isFirstGame(): boolean {
  try {
    return localStorage.getItem(PLAYED_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markPlayed(): void {
  try {
    localStorage.setItem(PLAYED_KEY, '1');
  } catch {
    /* ignora */
  }
}
