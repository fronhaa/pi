import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Mission } from '../../src/sim/mission.ts';
import { CONFIG, type FlareClass } from '../../src/sim/config.ts';
import type { Flare } from '../../src/sim/types.ts';

// Clima espacial atual: a primeira tempestade da missão é uma das erupções reais mais recentes do DONKI.

function realFlares(): Flare[] {
  const data = JSON.parse(readFileSync(new URL('../../public/data/donki-flares.json', import.meta.url), 'utf8'));
  return data.flares.map((f: { cls: string; time: string; link: string }) => ({
    cls: f.cls[0] as FlareClass, label: f.cls, real: true, time: f.time, link: f.link,
  }));
}

/** As tempestades agendadas da missão. */
function storms(m: Mission): { sol: number; flare: Flare }[] {
  return m.state.storms;
}

test('a primeira tempestade usa uma das erupções reais mais recentes', () => {
  const flares = realFlares();
  const recent = [...flares].sort((a, b) => (a.time! < b.time! ? 1 : -1)).slice(0, CONFIG.solarStorms.recentPool);
  for (let seed = 1; seed <= 50; seed++) {
    const s = storms(new Mission(seed, flares));
    assert.ok(s.length > 0);
    const first = [...s].sort((a, b) => a.sol - b.sol)[0];
    assert.ok(recent.some((f) => f.time === first.flare.time), `semente ${seed}: ${first.flare.label} ${first.flare.time} não está entre as mais recentes`);
  }
});

test('as tempestades usam erupções diferentes e a escolha depende só da semente', () => {
  const flares = realFlares();
  const a = storms(new Mission(7, flares)).map((s) => s.flare.time);
  const b = storms(new Mission(7, flares)).map((s) => s.flare.time);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});
