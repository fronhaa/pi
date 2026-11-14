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
import type { EnergyPlan, Flare } from '../src/sim/types.ts';

const SEEDS = 60;

type Action = { card: string } | { plan: [number, number, number] };

/** Mesma filtragem do cliente (src/data/flares.ts): só M e X. */
function loadFlares(): Flare[] {
  const data = JSON.parse(readFileSync(new URL('../public/data/donki-flares.json', import.meta.url), 'utf8'));
  return data.flares
    .filter((f: { cls: string }) => /^[MX]/.test(f.cls))
    .map((f: { cls: string; time: string; link: string }) => ({ cls: f.cls[0] as FlareClass, label: f.cls, real: true, time: f.time, link: f.link }));
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
const games: unknown[] = [];

for (const real of [true, false]) {
  for (const strategy of ['attentive', 'random'] as const) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const m = new Mission(seed, real ? flares : []);
      const s = strategy === 'attentive' ? attentive(m) : random(m, seed);
      const actions: Action[] = [];
      const hashes = [hash(m)];
      while (m.state.outcome.status === 'playing') {
        if (m.state.pendingCard) {
          const card = s.card();
          m.answerCard(card);
          actions.push({ card });
          hashes.push(hash(m));
          if (m.state.outcome.status !== 'playing') break;
        }
        const p = s.plan();
        m.endSol(p);
        actions.push({ plan: [p.life, p.shield, p.science] });
        hashes.push(hash(m));
      }
      games.push({ seed, real, strategy, actions, hashes });
    }
  }
}

const out = new URL('../server/internal/sim/testdata/golden.json', import.meta.url);
writeFileSync(out, JSON.stringify({ note: 'Gerado por npm run sim:golden. Não edite à mão.', flares, games }) + '\n');
console.log(`${games.length} partidas gravadas em server/internal/sim/testdata/golden.json`);
