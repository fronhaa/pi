import { CONFIG, type FlareClass } from './config.ts';
import { CARDS, CARD_IDS, applyCardOption, clamp, onCardDrawn } from './cards.ts';
import { createRng, type Rng } from './rng.ts';
import type { EnergyPlan, Flare, GameState, Message, ReportLine, Resources, ScheduledStorm, SolReport } from './types.ts';

/**
 * Simulação pura da missão (docs/game-design.md). Sem DOM, sem Three.js:
 * roda igual no navegador e no Node (`npm run balance`).
 */
export class Mission {
  readonly state: GameState;
  private readonly rng: Rng;
  /** Linhas geradas pela carta do sol, entram no relatório do mesmo sol. */
  private cardLines: ReportLine[] = [];

  constructor(seed: number, realFlares: Flare[] = []) {
    this.rng = createRng(seed);
    const storms = this.scheduleStorms(realFlares);
    const stormSols = new Set(storms.map((s) => s.sol));

    let dustStormSol: number;
    do dustStormSol = this.rng.int(CONFIG.dustStorm.firstSol, CONFIG.dustStorm.lastSol);
    while (stormSols.has(dustStormSol));

    const cardSols = new Map<number, (typeof CARD_IDS)[number]>();
    const sols = this.rng
      .shuffle(range(CONFIG.cards.firstSol, CONFIG.cards.lastSol).filter((s) => s !== dustStormSol))
      .slice(0, CONFIG.cards.perGame);
    const ids = this.rng.shuffle(CARD_IDS).slice(0, CONFIG.cards.perGame);
    sols.forEach((s, i) => cardSols.set(s, ids[i]));

    this.state = {
      seed,
      sol: 0,
      res: {
        battery: CONFIG.battery.start,
        life: CONFIG.life.start,
        shield: CONFIG.shield.start,
        dose: CONFIG.dose.start,
        science: 0,
        dust: 0,
      },
      blocks: CONFIG.energy.panelBlocks,
      storms,
      dustStormSol,
      dustHold: 0,
      cardSols,
      pendingCard: null,
      messages: [],
      reports: [],
      outcome: { status: 'playing' },
    };
    this.startSol(1);
  }

  // ---------- agenda ----------

  private scheduleStorms(realFlares: Flare[]): ScheduledStorm[] {
    const { count, firstSol, lastSol, minGap, commDelayMin } = CONFIG.solarStorms;
    let sols: number[] = [];
    // Sorteia até achar sóis com a distância mínima (converge rápido: 3 de 11 sóis).
    for (let tries = 0; tries < 1000; tries++) {
      sols = this.rng.shuffle(range(firstSol, lastSol)).slice(0, count).sort((a, b) => a - b);
      if (sols.every((s, i) => i === 0 || s - sols[i - 1] >= minGap)) break;
    }
    const flares = realFlares.length >= count ? this.rng.shuffle(realFlares).slice(0, count) : sols.map(() => this.simulatedFlare());
    return sols.map((sol, i) => ({
      sol,
      flare: flares[i],
      delayMin: this.rng.int(commDelayMin.min, commDelayMin.max),
    }));
  }

  private simulatedFlare(): Flare {
    const r = this.rng.next();
    const cls: FlareClass = r < 0.3 ? 'C' : r < 0.7 ? 'M' : 'X';
    return { cls, label: cls, real: false };
  }

  // ---------- ciclo do sol ----------

  get stormToday(): ScheduledStorm | undefined {
    return this.state.storms.find((s) => s.sol === this.state.sol);
  }

  private startSol(sol: number): void {
    const s = this.state;
    s.sol = sol;

    if (sol === s.dustStormSol) {
      s.res.dust = Math.min(CONFIG.dust.max, s.res.dust + CONFIG.dust.stormAdd);
      s.dustHold = CONFIG.dust.stormHoldSols;
    }

    s.messages = this.buildMessages(sol);

    const cardId = s.cardSols.get(sol);
    if (cardId) {
      onCardDrawn(cardId, s.res);
      s.pendingCard = CARDS[cardId];
    } else {
      s.pendingCard = null;
    }
    this.cardLines = [];
    this.updateBlocks();
  }

  private buildMessages(sol: number): Message[] {
    const s = this.state;
    const delay = () => this.rng.int(CONFIG.solarStorms.commDelayMin.min, CONFIG.solarStorms.commDelayMin.max);
    const msgs: Message[] = [];
    for (const storm of s.storms) {
      if (storm.sol === sol + 1) msgs.push({ kind: 'stormAlert', flare: storm.flare, delayMin: storm.delayMin, impactSol: storm.sol });
      if (storm.sol === sol) msgs.push({ kind: 'stormToday', flare: storm.flare, delayMin: storm.delayMin });
    }
    if (s.dustStormSol === sol + 1) msgs.push({ kind: 'dustAlert', delayMin: delay(), sol: s.dustStormSol });
    if (s.dustStormSol === sol) msgs.push({ kind: 'dustNow' });
    if (msgs.length === 0) msgs.push({ kind: 'allClear', delayMin: delay() });
    return msgs;
  }

  /** Blocos do dia: 10, reduzidos na proporção da poeira, mínimo 2. */
  private updateBlocks(): void {
    const { panelBlocks, minBlocks } = CONFIG.energy;
    this.state.blocks = Math.max(minBlocks, Math.round(panelBlocks * (1 - this.state.res.dust / 100)));
  }

  answerCard(optionId: string): ReportLine[] {
    const card = this.state.pendingCard;
    if (!card) throw new Error('Nenhuma carta pendente');
    if (!card.options.some((o) => o.id === optionId)) throw new Error(`Opção inválida: ${optionId}`);
    const lines = applyCardOption(card.id, optionId, this.state.res, this.rng);
    this.cardLines.push(...lines);
    this.state.pendingCard = null;
    this.updateBlocks(); // limpar painéis muda a energia de hoje
    this.checkLoss();
    return lines;
  }

  isPlanValid(plan: EnergyPlan): boolean {
    const total = plan.life + plan.shield + plan.science;
    return [plan.life, plan.shield, plan.science].every((n) => Number.isInteger(n) && n >= 0) && total <= this.state.blocks;
  }

  /** Executa o dia e a noite com o plano de energia; avança para o próximo sol. */
  endSol(plan: EnergyPlan): SolReport {
    const s = this.state;
    if (s.outcome.status !== 'playing') throw new Error('Missão já terminou');
    if (s.pendingCard) throw new Error('Responda a carta antes de terminar o sol');
    if (!this.isPlanValid(plan)) throw new Error('Plano de energia inválido');

    const r = s.res;
    const before: Resources = { ...r };
    const lines: ReportLine[] = [...this.cardLines];
    const storm = this.stormToday;
    const leftover = s.blocks - plan.life - plan.shield - plan.science;

    // Suporte de vida: 3 blocos = estável; cada bloco a mais ou a menos muda 6.
    const lifeDelta = (plan.life - CONFIG.life.stableBlocks) * CONFIG.life.perBlock;
    r.life = clamp(r.life + lifeDelta, 0, CONFIG.life.max);
    lines.push({
      key: lifeDelta === 0 ? 'report.life.stable' : lifeDelta > 0 ? 'report.life.up' : 'report.life.down',
      params: { blocks: plan.life, delta: Math.abs(lifeDelta) },
      tone: lifeDelta < 0 ? 'bad' : lifeDelta > 0 ? 'good' : 'neutral',
    });

    // Blindagem: desgaste diário, reforço por bloco.
    const shieldDelta = plan.shield * CONFIG.shield.perBlock - CONFIG.shield.decay;
    r.shield = clamp(r.shield + shieldDelta, 0, CONFIG.shield.max);
    lines.push({
      key: 'report.shield',
      params: { blocks: plan.shield, value: Math.round(r.shield) },
      tone: shieldDelta < 0 ? 'bad' : 'good',
    });

    // Ciência: metade no sol de tempestade.
    const sciGain = plan.science * CONFIG.science.perBlock * (storm ? CONFIG.science.stormFactor : 1);
    r.science += sciGain;
    if (plan.science > 0) {
      lines.push({ key: storm ? 'report.science.storm' : 'report.science', params: { blocks: plan.science, gain: sciGain }, tone: 'good' });
    }

    // Bateria: guarda o que sobrou, a noite cobra.
    r.battery = Math.min(CONFIG.battery.max, r.battery + leftover * CONFIG.battery.perLeftoverBlock);
    if (leftover > 0) lines.push({ key: 'report.battery.saved', params: { blocks: leftover, gain: leftover * CONFIG.battery.perLeftoverBlock } });
    r.battery -= CONFIG.battery.nightCost;
    if (r.battery < 0) {
      const missing = -r.battery;
      const lifeLost = round1(missing * CONFIG.battery.lifePerMissingPoint);
      r.life = clamp(r.life - lifeLost, 0, CONFIG.life.max);
      r.battery = 0;
      lines.push({ key: 'report.night.short', params: { missing, lifeLost }, tone: 'bad' });
    } else {
      lines.push({ key: 'report.night.ok', params: { cost: CONFIG.battery.nightCost } });
    }

    // Tempestade solar: dose depende da blindagem.
    let stormResult: SolReport['storm'] = null;
    if (storm) {
      const dose = stormDose(storm.flare.cls, r.shield);
      r.dose += dose;
      stormResult = { flare: storm.flare, dose };
      lines.push({ key: 'report.storm', params: { label: storm.flare.label, dose, shield: Math.round(r.shield) }, tone: 'bad' });
    }
    r.dose += CONFIG.dose.perSol;

    // Poeira: vento limpa, exceto durante a tempestade de poeira.
    if (s.dustHold > 0) {
      s.dustHold--;
      if (r.dust > 0) lines.push({ key: 'report.dust.hold', params: { dust: Math.round(r.dust) }, tone: 'bad' });
    } else if (r.dust > 0) {
      r.dust = Math.max(0, r.dust - CONFIG.dust.windCleanPerSol);
      lines.push({ key: 'report.dust.wind', params: { dust: Math.round(r.dust) } });
    }

    r.life = round1(r.life);
    r.dose = round1(r.dose);

    const report: SolReport = { sol: s.sol, plan: { ...plan }, before, after: { ...r }, storm: stormResult, lines };
    s.reports.push(report);

    this.checkLoss();
    if (s.outcome.status === 'playing') {
      if (s.sol >= CONFIG.sols) s.outcome = { status: 'won', stars: this.stars() };
      else this.startSol(s.sol + 1);
    }
    return report;
  }

  private checkLoss(): void {
    const s = this.state;
    if (s.outcome.status !== 'playing') return;
    if (s.res.life <= 0) s.outcome = { status: 'lost', reason: 'life', sol: s.sol };
    else if (s.res.dose >= CONFIG.dose.max) s.outcome = { status: 'lost', reason: 'dose', sol: s.sol };
  }

  private stars(): 1 | 2 | 3 {
    const r = this.state.res;
    if (r.science < CONFIG.science.goal) return 1;
    if (r.dose >= CONFIG.stars.doseFor3) return 2;
    return 3;
  }
}

/** dose = max(1, round(intensidade × (1 − blindagem/100 × 0,85))). Escala do jogo (INTERPRETADO). */
export function stormDose(cls: FlareClass, shield: number): number {
  const intensity = CONFIG.solarStorms.intensity[cls];
  return Math.max(1, Math.round(intensity * (1 - (shield / 100) * CONFIG.dose.shieldFactor)));
}

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
