import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, DIFFICULTIES, DIFFICULTY, tuning } from '../../src/sim/config.ts';
import { Mission } from '../../src/sim/mission.ts';
import { pickHistorical } from '../../src/sim/historical.ts';
import type { Flare, HistoricalMission } from '../../src/sim/types.ts';

// Níveis da missão (src/sim/config.ts, DIFFICULTY; GDD "Níveis de dificuldade"). Rode com: npm test

const flares: Flare[] = Array.from({ length: 12 }, (_, i) => ({
  cls: (['C', 'M', 'X'] as const)[i % 3],
  label: `M${i}.0`,
  real: true,
  time: `2025-0${(i % 9) + 1}-01T00:00Z`,
}));

/** Joga a missão até o fim: sem cartas, todos os problemas consertados, plano fixo. */
function playOut(m: Mission): void {
  while (m.state.outcome.status === 'playing') {
    if (m.state.pendingCard) m.answerCard(m.state.pendingCard.options[0].id);
    if (m.state.outcome.status !== 'playing') break;
    for (const p of m.state.problems) {
      m.openProblem(p.uid);
      if (!m.evaBanned) m.resolveProblem(p.uid);
    }
    if (m.state.outcome.status !== 'playing') break;
    const b = m.state.blocks;
    const life = Math.min(3, b);
    const shield = Math.min(2, b - life);
    m.endSol({ life, shield, science: Math.max(0, b - life - shield - 2) });
  }
}

test('sem nível, a missão é a do Médio (o jogo de sempre)', () => {
  const a = new Mission(7, flares);
  const b = new Mission(7, flares, null, 'mars', 'medium');
  assert.equal(a.state.difficulty, 'medium');
  playOut(a);
  playOut(b);
  assert.deepEqual(a.state.reports, b.state.reports);
  assert.deepEqual(a.state.outcome, b.state.outcome);
});

test('o Médio usa exatamente os números do CONFIG', () => {
  const m = DIFFICULTY.medium;
  assert.equal(m.extraBlocks, 0);
  assert.equal(m.batteryStart, CONFIG.battery.start);
  assert.equal(m.lifeStart, CONFIG.life.start);
  assert.equal(m.cards, CONFIG.cards.perGame);
  assert.equal(m.daySeconds, CONFIG.problems.daySeconds);
  assert.equal(m.scienceGoal, CONFIG.science.goal);
});

test('dado real da NASA não muda com o nível: mesmas tempestades, mesma força, mesmo atraso', () => {
  for (const seed of [1, 2, 3, 42, 999]) {
    const storms = DIFFICULTIES.map((d) => new Mission(seed, flares, null, 'mars', d).state.storms);
    assert.deepEqual(storms[0], storms[1]);
    assert.deepEqual(storms[1], storms[2]);
    const dust = DIFFICULTIES.map((d) => new Mission(seed, flares, null, 'mars', d).state.dustStormSol);
    assert.equal(new Set(dust).size, 1);
  }
});

test('o nível muda a energia e a folga do começo', () => {
  for (const d of DIFFICULTIES) {
    const m = new Mission(5, flares, null, 'mars', d);
    const tune = tuning(d);
    assert.equal(m.state.blocks, CONFIG.energy.panelBlocks + tune.extraBlocks, d);
    assert.equal(m.state.res.battery, tune.batteryStart, d);
    assert.equal(m.state.res.life, tune.lifeStart, d);
    assert.equal(m.state.cardSols.size, tune.cards, d);
  }
});

test('Lua: o nível soma ao Sol pleno, e a luz do dia continua a mesma', () => {
  const easy = new Mission(9, flares, null, 'moon', 'easy');
  const medium = new Mission(9, flares, null, 'moon', 'medium');
  assert.deepEqual(easy.state.sunlight, medium.state.sunlight);
  const light = easy.sunlightToday();
  const full = CONFIG.moon.sun.fullBlocks;
  assert.equal(easy.state.blocks, Math.max(CONFIG.energy.minBlocks, Math.round(((full + tuning('easy').extraBlocks) * light) / 100)));
  assert.equal(medium.state.blocks, Math.max(CONFIG.energy.minBlocks, Math.round((full * light) / 100)));
});

test('problemas por dia respeitam o nível', () => {
  for (const d of DIFFICULTIES) {
    const { min, max } = tuning(d).problemsPerDay;
    const m = new Mission(11, flares, null, 'mars', d);
    while (m.state.outcome.status === 'playing' && m.state.sol < CONFIG.sols) {
      const n = m.state.problems.filter((p) => !['harvest', 'analysis'].includes(p.kind) && p.spawnAt > 0).length;
      if (m.state.sol >= CONFIG.problems.firstSol) assert.ok(n >= min && n <= max, `${d} sol ${m.state.sol}: ${n}`);
      if (m.state.pendingCard) m.answerCard(m.state.pendingCard.options[0].id);
      for (const p of m.state.problems) {
        m.openProblem(p.uid);
        if (!m.evaBanned) m.resolveProblem(p.uid);
      }
      if (m.state.outcome.status !== 'playing') break;
      m.endSol({ life: 3, shield: 2, science: 0 });
    }
  }
});

test('a 2ª estrela pede a meta de ciência do nível', () => {
  assert.equal(tuning('easy').scienceGoal < tuning('medium').scienceGoal, true);
  assert.equal(tuning('hard').scienceGoal, CONFIG.science.goal);
});

test('nível desconhecido vira o Médio', () => {
  const m = new Mission(3, flares, null, 'mars', 'impossible' as never);
  assert.equal(m.state.difficulty, 'medium');
  assert.equal(tuning(undefined), DIFFICULTY.medium);
});

test('missões históricas: Fácil só as de força média; Médio na 1ª partida também', () => {
  const mk = (id: number, difficulty: 'medium' | 'hard'): HistoricalMission =>
    ({ id, difficulty, startUtc: '', endUtc: '', storms: [], delays: [] }) as HistoricalMission;
  const all = [mk(1, 'medium'), mk(2, 'hard'), mk(3, 'medium'), mk(4, 'hard')];
  for (let seed = 1; seed < 50; seed++) {
    assert.equal(pickHistorical(all, seed, false, 'easy')!.difficulty, 'medium');
    assert.equal(pickHistorical(all, seed, true, 'medium')!.difficulty, 'medium');
  }
  const hardPicks = new Set(Array.from({ length: 50 }, (_, s) => pickHistorical(all, s + 1, false, 'hard')!.difficulty));
  assert.deepEqual([...hardPicks].sort(), ['hard', 'medium']);
});
