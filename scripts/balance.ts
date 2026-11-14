/**
 * Teste de equilíbrio: joga N partidas por estratégia com a simulação real (src/sim).
 * Uso: npm run balance   (N padrão 2000; BALANCE_N=500 npm run balance)
 *
 * Forma esperada (docs/game-design.md, "Equilíbrio esperado"):
 *   - Só ciência: perde sempre.            - Só segurança: sobrevive, sempre 1 estrela.
 *   - Ignora a blindagem: perde às vezes.  - Atenta: sobrevive, maioria 3 estrelas.
 */
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/sim/config.ts';
import { Mission } from '../src/sim/mission.ts';
import type { EnergyPlan, Flare, Problem } from '../src/sim/types.ts';

type Strategy = {
  name: string;
  plan(m: Mission): EnergyPlan;
  card(m: Mission): string;
  /** Problemas pela base: a tripulação vai resolver este? */
  fix(m: Mission, p: Problem): boolean;
};

const N = Number(process.env.BALANCE_N || 2000);

function loadRealFlares(): Flare[] {
  try {
    const data = JSON.parse(readFileSync(new URL('../public/data/donki-flares.json', import.meta.url), 'utf8'));
    return data.flares.map((f: { cls: string; time: string; link: string }) => ({
      cls: f.cls[0], label: f.cls, real: true, time: f.time, link: f.link,
    }));
  } catch {
    return [];
  }
}

const fill = (blocks: number, life: number, shield: number, keep: number): EnergyPlan => {
  life = Math.min(life, blocks);
  shield = Math.min(shield, blocks - life);
  const science = Math.max(0, blocks - life - shield - keep);
  return { life, shield, science };
};

const firstOption = (m: Mission) => m.state.pendingCard!.options[0].id;

const strategies: Strategy[] = [
  {
    name: 'Só ciência, sem guardar bateria',
    plan: (m) => ({ life: 0, shield: 0, science: m.state.blocks }),
    card: (m) => (m.state.pendingCard!.id === 'cargoShip' ? 'experiment' : firstOption(m)),
    fix: () => false,
  },
  {
    name: 'Só segurança, sem ciência',
    plan: (m) => {
      const b = m.state.blocks;
      const life = Math.min(b, m.state.res.life < 60 ? 4 : 3);
      const shield = Math.min(b - life, 4);
      return { life, shield, science: 0 };
    },
    card: (m) => {
      const id = m.state.pendingCard!.id;
      return ({ dustyPanels: 'wait', mysteryRock: 'skip', greenhouseLeak: 'fixNow', cargoShip: 'shieldKit', brokenSensor: 'askEarth', subsurfaceIce: 'drill' } as const)[id];
    },
    fix: () => true,
  },
  {
    name: 'Ignora a blindagem',
    plan: (m) => fill(m.state.blocks, 3, 0, 2),
    card: (m) => (m.state.pendingCard!.id === 'cargoShip' ? 'batteries' : firstOption(m)),
    fix: (_m, p) => p.kind !== 'tornBag',
  },
  {
    name: 'Reage aos alertas e guarda reserva',
    plan: (m) => {
      const s = m.state;
      const b = s.blocks;
      // Reforça a blindagem até ~85 no aviso e no dia do impacto; fora disso, só repõe o desgaste.
      const alert = s.messages.some((x) => x.kind === 'stormAlert' || x.kind === 'stormToday');
      const life = s.res.life < 55 ? 4 : 3;
      const keep = s.res.battery < 30 ? 3 : s.res.battery < 60 ? 2 : 1;
      const shieldTarget = alert ? 85 : 30;
      const shieldBlocks = Math.max(0, Math.ceil((shieldTarget - s.res.shield + CONFIG.shield.decay) / CONFIG.shield.perBlock));
      const shield = alert ? Math.min(shieldBlocks, 5) : Math.min(shieldBlocks, 1);
      return fill(b, life, shield, keep);
    },
    card: (m) => {
      const s = m.state;
      const id = s.pendingCard!.id;
      if (id === 'dustyPanels') return s.res.dust >= 25 ? 'clean' : 'wait';
      if (id === 'mysteryRock') return s.res.battery >= 50 ? 'sendRover' : 'skip';
      if (id === 'greenhouseLeak') return s.res.battery >= 30 ? 'fixNow' : 'fixLater';
      if (id === 'cargoShip') return s.res.battery < 40 ? 'batteries' : s.res.science < 60 ? 'experiment' : 'shieldKit';
      if (id === 'brokenSensor') return 'askEarth';
      return s.res.life < 60 && s.res.battery >= 40 ? 'drill' : 'notNow';
    },
    // Resolve todos os problemas (medido: triagem simples perde mais por falta de energia).
    fix: () => true,
  },
];

function run(strategy: Strategy, flares: Flare[]) {
  const tally = { lostLife: 0, lostDose: 0, stars: [0, 0, 0, 0] };
  for (let seed = 1; seed <= N; seed++) {
    const m = new Mission(seed, flares);
    while (m.state.outcome.status === 'playing') {
      if (m.state.pendingCard) {
        m.answerCard(strategy.card(m));
        if (m.state.outcome.status !== 'playing') break;
      }
      for (const p of m.state.problems) {
        m.openProblem(p.uid);
        if (strategy.fix(m, p)) m.resolveProblem(p.uid);
      }
      if (m.state.outcome.status !== 'playing') break;
      m.endSol(strategy.plan(m));
    }
    const o = m.state.outcome;
    if (o.status === 'lost') o.reason === 'life' ? tally.lostLife++ : tally.lostDose++;
    else if (o.status === 'won') tally.stars[o.stars]++;
  }
  return tally;
}

const pct = (n: number) => `${((n / N) * 100).toFixed(0)}%`.padStart(4);

for (const [label, flares] of [['erupções reais do DONKI', loadRealFlares()], ['erupções simuladas', []]] as const) {
  if (label.includes('reais') && flares.length === 0) {
    console.log('(sem public/data/donki-flares.json; pulando dados reais)\n');
    continue;
  }
  console.log(`\n${N} partidas por estratégia, ${label}${flares.length ? ` (${flares.length})` : ''}\n`);
  console.log('Estratégia'.padEnd(38), 'vida 0', 'dose', ' 1★ ', ' 2★ ', ' 3★');
  for (const s of strategies) {
    const t = run(s, flares as Flare[]);
    console.log(s.name.padEnd(38), pct(t.lostLife).padStart(6), pct(t.lostDose), pct(t.stars[1]), pct(t.stars[2]), pct(t.stars[3]));
  }
}
