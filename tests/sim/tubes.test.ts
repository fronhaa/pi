import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateDay } from '../../src/sim/day.ts';
import { CONFIG } from '../../src/sim/config.ts';
import { Mission } from '../../src/sim/mission.ts';
import { applyAction } from '../../src/sim/actions.ts';
import type { Resources } from '../../src/sim/types.ts';

// Tubos de amostra (CONFIG.samples, GDD "Tubos de amostra"). Rode com: npm test

const res = (tubes: number): Resources => ({ battery: 50, life: 70, shield: 40, dose: 0, science: 0, dust: 0, tubes });
const day = (tubes: number, science: number, failed: ('roverStuck' | 'tornBag')[] = []) =>
  simulateDay({ res: res(tubes), plan: { life: 3, shield: 1, science }, blocks: 10, stormClass: null, dustHold: false, failed });

test('a missão começa com os 38 tubos do Perseverance', () => {
  assert.equal(new Mission(1).state.res.tubes, 38);
});

test('com energia na ciência, a expedição enche 3 tubos e a ciência é a normal', () => {
  const d = day(38, 4);
  assert.equal(d.tubesUsed, 3);
  assert.equal(d.after.tubes, 35);
  assert.equal(d.sciGain, 4 * CONFIG.science.perBlock);
});

test('os 3 tubos não dependem de quantos blocos: 1 bloco gasta 3 tubos também', () => {
  assert.equal(day(38, 1).tubesUsed, 3);
});

test('restando 2 tubos, enche só 2 e a ciência ainda é a normal', () => {
  const d = day(2, 3);
  assert.equal(d.tubesUsed, 2);
  assert.equal(d.after.tubes, 0);
  assert.equal(d.sciGain, 3 * CONFIG.science.perBlock);
});

test('sem tubos, a ciência vale a metade', () => {
  const d = day(0, 4);
  assert.equal(d.noTubes, true);
  assert.equal(d.sciGain, 4 * CONFIG.science.perBlock * CONFIG.samples.noTubeFactor);
});

test('sem energia na ciência ou com o rover atolado, nenhum tubo é gasto', () => {
  assert.equal(day(38, 0).tubesUsed, 0);
  assert.equal(day(38, 4, ['roverStuck']).tubesUsed, 0);
});

test('o relatório conta os tubos', () => {
  const m = new Mission(3);
  if (m.state.pendingCard) applyAction(m, { type: 'answerCard', option: m.state.pendingCard.options[0].id });
  const { report } = applyAction(m, { type: 'endSol', plan: { life: 3, shield: 1, science: 2 } });
  assert.ok(report!.lines.some((l) => l.key === 'report.tubes' && l.params?.left === 35));
});
