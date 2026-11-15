import { CONFIG, tuning, type Difficulty } from './config.ts';
import { createRng } from './rng.ts';
import type { HistoricalMission } from './types.ts';

/**
 * Missões históricas (docs/game-design.md, "Calendário da missão: janelas históricas reais").
 * Puro: sem DOM, usado pelo jogo (src/data/missions.ts) e pelo `npm run balance`.
 */

/** Formato de public/data/missions.json (gerado por scripts/fetch-missions.mjs). */
export interface MissionsFile {
  schemaVersion: number;
  generatedAt: string;
  missions: {
    id: number;
    difficulty: string;
    startUtc: string;
    endUtc: string;
    storms: { sol: number; startTime: string; cmeType: string; speedKmS: number | null; strength: string; link: string | null }[];
    sols: { sol: number; earthDelayMinutes: number }[];
  }[];
}

/** Converte o arquivo; descarta missão incompleta em vez de quebrar o jogo. */
export function parseMissions(data: MissionsFile): HistoricalMission[] {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.missions)) return [];
  const out: HistoricalMission[] = [];
  for (const m of data.missions) {
    const delays = (m.sols ?? []).slice().sort((a, b) => a.sol - b.sol).map((s) => s.earthDelayMinutes);
    const storms = (m.storms ?? []).flatMap((s) => {
      const cls = CONFIG.solarStorms.strengthClass[s.strength as keyof typeof CONFIG.solarStorms.strengthClass];
      if (!cls || !Number.isInteger(s.sol)) return [];
      return [{
        sol: s.sol,
        flare: { cls, label: s.cmeType, real: true, time: s.startTime, link: s.link ?? undefined, source: 'cme' as const, speedKmS: s.speedKmS },
      }];
    });
    const ok =
      (m.difficulty === 'medium' || m.difficulty === 'hard') &&
      delays.length === CONFIG.sols &&
      delays.every((d) => Number.isFinite(d) && d > 0) &&
      storms.length === CONFIG.solarStorms.count;
    if (ok) out.push({ id: m.id, difficulty: m.difficulty as 'medium' | 'hard', startUtc: m.startUtc, endUtc: m.endUtc, storms, delays });
  }
  return out;
}

/**
 * Sorteia a missão histórica (GDD, "Regras"). Nível Médio: na primeira partida só as de força média; depois, qualquer
 * uma. Fácil: só as de força média. Difícil: só as fortes. As tempestades e as datas são as reais em todos os níveis.
 */
export function pickHistorical(
  missions: HistoricalMission[],
  seed: number,
  firstGame: boolean,
  difficulty: Difficulty = 'medium',
): HistoricalMission | null {
  const want = tuning(difficulty).historical;
  const only = want === 'any' ? (firstGame ? 'medium' : null) : want;
  const pool = only ? missions.filter((m) => m.difficulty === only) : missions;
  const list = pool.length > 0 ? pool : missions;
  return list.length > 0 ? createRng(seed ^ 0x9e3779b9).pick(list) : null;
}
