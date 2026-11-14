import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mission } from '../../src/sim/mission.ts';
import { applyAction } from '../../src/sim/actions.ts';
import { CONFIG } from '../../src/sim/config.ts';
import { ROLES, ROLE_DEFS } from '../../src/sim/crew.ts';
import type { EnergyPlan } from '../../src/sim/types.ts';

// Interações como dados (src/sim/actions.ts): o solo e o servidor aplicam a MESMA função.

/** Joga sóis com um plano seguro até chegar a um sol com problemas pela base. */
function missionWithProblems(seed = 7): Mission {
  const m = new Mission(seed);
  for (let i = 0; i < CONFIG.sols && m.state.problems.length === 0; i++) {
    if (m.state.pendingCard) applyAction(m, { type: 'answerCard', option: m.state.pendingCard.options[0].id });
    applyAction(m, { type: 'endSol', plan: safePlan(m) });
  }
  assert.ok(m.state.problems.length > 0, 'esperava um sol com problemas');
  return m;
}

function safePlan(m: Mission): EnergyPlan {
  const life = Math.min(3, m.state.blocks);
  const shield = Math.min(2, m.state.blocks - life);
  return { life, shield, science: 0 };
}

test('mesma semente e mesmas ações dão o mesmo resultado (o servidor depende disso)', () => {
  const play = () => {
    const m = new Mission(42);
    for (let i = 0; i < 5; i++) {
      if (m.state.pendingCard) applyAction(m, { type: 'answerCard', option: m.state.pendingCard.options[0].id });
      applyAction(m, { type: 'endSol', plan: safePlan(m) });
    }
    return JSON.stringify(m.state.res);
  };
  assert.equal(play(), play());
});

test('endSol devolve o relatório e passa para o próximo sol', () => {
  const m = new Mission(1);
  if (m.state.pendingCard) applyAction(m, { type: 'answerCard', option: m.state.pendingCard.options[0].id });
  const { report } = applyAction(m, { type: 'endSol', plan: safePlan(m) });
  assert.equal(report?.sol, 1);
  assert.equal(m.state.sol, 2);
});

test('plano acima dos blocos é recusado', () => {
  const m = new Mission(1);
  if (m.state.pendingCard) applyAction(m, { type: 'answerCard', option: m.state.pendingCard.options[0].id });
  assert.throws(() => applyAction(m, { type: 'endSol', plan: { life: m.state.blocks + 1, shield: 0, science: 0 } }));
});

test('problema: abre, recebe progresso e termina; conserto lá fora soma dose', () => {
  const m = missionWithProblems();
  const p = m.state.problems[0];
  applyAction(m, { type: 'openProblem', uid: p.uid });
  assert.equal(p.status, 'open');
  applyAction(m, { type: 'problemProgress', uid: p.uid, progress: 0.5 });
  assert.equal(p.progress, 0.5);
  const dose = m.state.res.dose;
  applyAction(m, { type: 'resolveProblem', uid: p.uid });
  assert.equal(p.status, 'done');
  const outside = p.kind !== 'greenhouseLeak';
  assert.equal(m.state.res.dose, outside ? Math.round((dose + CONFIG.problems.outsideDose) * 10) / 10 : dose);
});

test('cada parte do plano de energia tem um papel dono (modo em grupo)', () => {
  const blocks = ROLES.map((r) => ROLE_DEFS[r].block).filter(Boolean).sort();
  assert.deepEqual(blocks, ['life', 'science', 'shield']);
  assert.equal(ROLES.filter((r) => ROLE_DEFS[r].leads).length, 1);
});
