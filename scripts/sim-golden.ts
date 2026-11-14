/**
 * Gera os traços de paridade da simulação para o servidor Go (server/internal/sim/testdata/golden.json).
 * Uso: npm run sim:golden
 *
 * Joga partidas com a simulação TypeScript (a referência) e grava, para cada passo,
 * um hash do estado em JSON canônico (chaves ordenadas). O teste Go repete as mesmas
 * ações e exige o MESMO hash em todos os passos. Mudou uma regra em src/sim? Mude também
 * em server/internal/sim, rode este script e `go test ./...` em server/.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { CONFIG, type FlareClass } from '../src/sim/config.ts';
import { Mission } from '../src/sim/mission.ts';
import { createRng } from '../src/sim/rng.ts';
import { parseMissions } from '../src/sim/historical.ts';
import type { EnergyPlan, Flare, HistoricalMission } from '../src/sim/types.ts';

const SEEDS = 60;

type Action =
  | { card: string }
  | { plan: [number, number, number] }
  | { open: number }
  | { progress: [number, number] }
  | { resolve: number };

/** Mesma filtragem do cliente (src/data/flares.ts): só M e X. */
function loadFlares(): Flare[] {
  const data = JSON.parse(readFileSync(new URL('../public/data/donki-flares.json', import.meta.url), 'utf8'));
  return data.flares
    .filter((f: { cls: string }) => /^[MX]/.test(f.cls))
    .map((f: { cls: string; time: string; link: string }) => ({ cls: f.cls[0] as FlareClass, label: f.cls, real: true, time: f.time, link: f.link }));
}

function loadHistorical(): HistoricalMission[] {
  try {
    return parseMissions(JSON.parse(readFileSync(new URL('../public/data/missions.json', import.meta.url), 'utf8')));
  } catch {
    return [];
  }
}

/** JSON com chaves ordenadas; `undefined` some (igual ao JSON.stringify e ao omitempty do Go). */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
}

function snapshot(m: Mission) {
  const s = m.state;
  return {
    sol: s.sol,
    res: s.res,
    blocks: s.blocks,
    storms: s.storms,
    dustStormSol: s.dustStormSol,
    dustHold: s.dustHold,
    cardSols: Object.fromEntries([...s.cardSols].map(([k, v]) => [String(k), v])),
    pendingCard: s.pendingCard,
    messages: s.messages,
    problems: s.problems,
    commsDown: s.commsDown,
    historical: s.historical ? s.historical.id : null,
    reports: s.reports,
    outcome: s.outcome,
  };
}

const hash = (m: Mission) => createHash('sha256').update(canonical(snapshot(m))).digest('hex').slice(0, 16);

// Estratégia "atenta" (a mesma do npm run balance) e uma aleatória, para cobrir caminhos raros.
function attentive(m: Mission): { plan: () => EnergyPlan; card: () => string } {
  return {
    plan: () => {
      const s = m.state;
      const alert = s.messages.some((x) => x.kind === 'stormAlert' || x.kind === 'stormToday');
      const life = Math.min(s.blocks, s.res.life < 55 ? 4 : 3);
      const need = Math.max(0, Math.ceil(((alert ? 85 : 30) - s.res.shield + CONFIG.shield.decay) / CONFIG.shield.perBlock));
      const shield = Math.min(s.blocks - life, alert ? Math.min(need, 5) : Math.min(need, 1));
      const keep = s.res.battery < 30 ? 3 : s.res.battery < 60 ? 2 : 1;
      return { life, shield, science: Math.max(0, s.blocks - life - shield - keep) };
    },
    card: () => m.state.pendingCard!.options[0].id,
  };
}

function random(m: Mission, seed: number): { plan: () => EnergyPlan; card: () => string } {
  const r = createRng(seed ^ 0x9e3779b9);
  return {
    plan: () => {
      const b = m.state.blocks;
      const life = r.int(0, b);
      const shield = r.int(0, b - life);
      return { life, shield, science: r.int(0, b - life - shield) };
    },
    card: () => r.pick(m.state.pendingCard!.options).id,
  };
}

const flares = loadFlares();
const historical = loadHistorical();
const games: unknown[] = [];

/** Joga uma partida e grava ações + hash de cada passo. `h` = índice da missão histórica ou null. */
function play(seed: number, real: boolean, h: number | null, strategy: 'attentive' | 'random') {
  const m = new Mission(seed, real ? flares : [], h === null ? null : historical[h]);
  const s = strategy === 'attentive' ? attentive(m) : random(m, seed);
  // Problemas: abre todos; conserta alguns, deixa outros pela metade (testa "continua amanhã") ou sem atender.
  const fixer = createRng(seed ^ 0x5bd1e995);
  const actions: Action[] = [];
  const hashes = [hash(m)];
  const step = (a: Action) => {
    actions.push(a);
    hashes.push(hash(m));
  };
  while (m.state.outcome.status === 'playing') {
    if (m.state.pendingCard) {
      const card = s.card();
      m.answerCard(card);
      step({ card });
      if (m.state.outcome.status !== 'playing') break;
    }
    for (const p of [...m.state.problems]) {
      if (m.state.outcome.status !== 'playing') break;
      if (p.status === 'pending') {
        m.openProblem(p.uid);
        step({ open: p.uid });
      }
      const r = fixer.next();
      if (r < 0.55) {
        m.resolveProblem(p.uid);
        step({ resolve: p.uid });
      } else if (r < 0.85) {
        const progress = Math.round(fixer.next() * 100) / 100;
        m.setProblemProgress(p.uid, progress);
        step({ progress: [p.uid, progress] });
      }
    }
    if (m.state.outcome.status !== 'playing') break;
    const p = s.plan();
    m.endSol(p);
    step({ plan: [p.life, p.shield, p.science] });
  }
  games.push({ seed, real, historical: h, strategy, actions, hashes });
}

for (const strategy of ['attentive', 'random'] as const) {
  for (let seed = 1; seed <= SEEDS; seed++) {
    play(seed, true, null, strategy);
    play(seed, false, null, strategy);
  }
  for (let h = 0; h < historical.length; h++) {
    for (let seed = 1; seed <= 10; seed++) play(seed * 7 + h, false, h, strategy);
  }
}

const out = new URL('../server/internal/sim/testdata/golden.json', import.meta.url);
writeFileSync(out, JSON.stringify({ note: 'Gerado por npm run sim:golden. Não edite à mão.', flares, historical, games }) + '\n');
console.log(`${games.length} partidas gravadas em server/internal/sim/testdata/golden.json`);
