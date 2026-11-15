import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mission } from '../../src/sim/mission.ts';
import { applyAction } from '../../src/sim/actions.ts';
import { CONFIG } from '../../src/sim/config.ts';
import { PROBLEMS, PROBLEM_KINDS, OPTIONAL_KINDS } from '../../src/sim/problems.ts';
import type { EnergyPlan } from '../../src/sim/types.ts';

// Tarefas opcionais dentro da base (GDD, "Atividades dentro da base", A): colher na estufa e analisar amostras.

function safePlan(m: Mission): EnergyPlan {
  const life = Math.min(3, m.state.blocks);
  const shield = Math.min(2, m.state.blocks - life);
  return { life, shield, science: 0 };
}

/** Joga até o primeiro sol em tempo real (com problemas e tarefas). */
function missionAtRealTimeDay(seed = 7): Mission {
  const m = new Mission(seed);
  for (let i = 0; i < CONFIG.sols && m.state.problems.length === 0; i++) {
    if (m.state.pendingCard) applyAction(m, { type: 'answerCard', option: m.state.pendingCard.options[0].id });
    applyAction(m, { type: 'endSol', plan: safePlan(m) });
  }
  if (m.state.pendingCard) applyAction(m, { type: 'answerCard', option: m.state.pendingCard.options[0].id });
  return m;
}

test('as tarefas opcionais não entram no sorteio dos problemas', () => {
  for (const k of OPTIONAL_KINDS) assert.ok(!PROBLEM_KINDS.includes(k), `${k} não pode ser sorteado`);
});

test('nos sóis em tempo real, colher e analisar aparecem desde o começo do dia', () => {
  const m = missionAtRealTimeDay();
  assert.ok(m.state.sol >= CONFIG.problems.firstSol);
  for (const kind of OPTIONAL_KINDS) {
    const p = m.state.problems.find((x) => x.kind === kind);
    assert.ok(p, `esperava a tarefa ${kind}`);
    assert.equal(p.spawnAt, 0);
  }
});

test('colher dá suporte de vida, gasta bateria e não soma dose', () => {
  const m = missionAtRealTimeDay();
  const p = m.state.problems.find((x) => x.kind === 'harvest')!;
  m.state.res.life = 50;
  m.state.res.battery = 50;
  const dose = m.state.res.dose;
  m.openProblem(p.uid);
  applyAction(m, { type: 'resolveProblem', uid: p.uid });
  assert.equal(m.state.res.life, 50 + CONFIG.indoorTasks.harvest.life);
  assert.equal(m.state.res.battery, 50 - CONFIG.indoorTasks.harvest.battery);
  assert.equal(m.state.res.dose, dose);
});

test('analisar dá ciência e gasta bateria', () => {
  const m = missionAtRealTimeDay();
  const p = m.state.problems.find((x) => x.kind === 'analysis')!;
  m.state.res.battery = 50;
  const science = m.state.res.science;
  m.openProblem(p.uid);
  applyAction(m, { type: 'resolveProblem', uid: p.uid });
  assert.equal(m.state.res.science, science + CONFIG.indoorTasks.analysis.science);
  assert.equal(m.state.res.battery, 50 - CONFIG.indoorTasks.analysis.battery);
});

test('não fazer as tarefas não cobra nada à noite nem continua no dia seguinte', () => {
  const m = missionAtRealTimeDay();
  for (const p of m.state.problems) {
    if (!PROBLEMS[p.kind].optional) {
      m.openProblem(p.uid);
      applyAction(m, { type: 'resolveProblem', uid: p.uid });
    }
  }
  const report = m.endSol(safePlan(m));
  assert.ok(!report.lines.some((l) => l.key.includes('harvest') || l.key.includes('analysis')), 'nenhuma linha sobre tarefa não feita');
  const carried = m.state.problems.filter((p) => PROBLEMS[p.kind].optional && p.status !== 'pending' && p.spawnAt !== 0);
  assert.equal(carried.length, 0);
});
