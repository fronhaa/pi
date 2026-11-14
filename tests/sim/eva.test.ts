import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEvaBanned, needsEva, planEva } from '../../src/sim/eva.ts';
import type { Message } from '../../src/sim/types.ts';

// Regras da EVA (docs/game-design.md, "EVA: sair da base"). Rode com: npm test

const stormToday: Message = { kind: 'stormToday', flare: { cls: 'M', label: 'M1.0', real: false }, delayMin: 5 };

test('EVA proibida só no dia da tempestade avisada', () => {
  assert.equal(isEvaBanned({ messages: [stormToday] }), true);
  assert.equal(isEvaBanned({ messages: [{ kind: 'allClear', delayMin: 5 }] }), false);
  // Antena desalinhada: sem o aviso, a tripulação não sabe, e a regra não vale.
  assert.equal(isEvaBanned({ messages: [{ kind: 'noSignal' }] }), false);
});

test('problemas de fora exigem EVA; a estufa não', () => {
  assert.equal(needsEva('dustyPanels'), true);
  assert.equal(needsEva('roverStuck'), true);
  assert.equal(needsEva('greenhouseLeak'), false);
});

test('EVA sai em dupla: o escolhido e o primeiro livre', () => {
  const r = planEva({ banned: false, pairBusy: false, free: ['commander', 'engineer', 'medic'], chosen: 'medic' });
  assert.deepEqual(r, { ok: true, pair: ['medic', 'commander'] });
});

test('escolhido ocupado: vai o primeiro livre', () => {
  const r = planEva({ banned: false, pairBusy: false, free: ['engineer', 'scientist'], chosen: 'commander' });
  assert.deepEqual(r, { ok: true, pair: ['engineer', 'scientist'] });
});

test('ninguém sai sozinho', () => {
  const r = planEva({ banned: false, pairBusy: false, free: ['engineer'], chosen: 'engineer' });
  assert.deepEqual(r, { ok: false, reason: 'nobody' });
});

test('tempestade vem antes de tudo; depois, só uma dupla fora', () => {
  assert.deepEqual(planEva({ banned: true, pairBusy: true, free: ['medic', 'engineer'], chosen: 'medic' }), { ok: false, reason: 'storm' });
  assert.deepEqual(planEva({ banned: false, pairBusy: true, free: ['medic', 'engineer'], chosen: 'medic' }), { ok: false, reason: 'full' });
});

test('modo em grupo escolhe o parceiro', () => {
  const r = planEva({ banned: false, pairBusy: false, free: ['commander', 'engineer', 'medic'], chosen: 'commander', pickBuddy: (free) => free.at(-1) });
  assert.deepEqual(r, { ok: true, pair: ['commander', 'medic'] });
});
