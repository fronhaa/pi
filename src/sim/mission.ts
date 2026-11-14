import { CONFIG, type FlareClass } from './config.ts';
import { CARDS, CARD_IDS, applyCardOption, clamp, onCardDrawn } from './cards.ts';
import { createRng, type Rng } from './rng.ts';
import { PROBLEMS, scheduleProblems } from './problems.ts';
import { simulateDay, stormDose, type DayResult } from './day.ts';
import type { EnergyPlan, Flare, GameState, HistoricalMission, Message, Problem, ReportLine, Resources, ScheduledStorm, SolReport } from './types.ts';

/** Cartas substituídas pelos problemas da tripulação (GDD: "Eles substituem as cartas..."). */
const CARD_POOL = CARD_IDS.filter((id) => id !== 'dustyPanels' && id !== 'greenhouseLeak');

/**
 * Simulação pura da missão (docs/game-design.md). Sem DOM, sem Three.js:
 * roda igual no navegador e no Node (`npm run balance`).
 */
export class Mission {
  readonly state: GameState;
  private readonly rng: Rng;
  /** Linhas geradas durante o sol (carta, problemas resolvidos), entram no relatório do mesmo sol. */
  private cardLines: ReportLine[] = [];
  /** Fatos reais já mostrados nesta missão (cada um aparece uma vez só). */
  private readonly factsShown = new Set<string>();
  private uid = 0;
  /** Antena desalinhada na noite anterior: sem mensagens no próximo sol. */
  private nextCommsDown = false;
  /** Problemas que continuam no próximo sol (trabalho pela metade em noite de tempestade). */
  private carryOver: Problem[] = [];

  /**
   * @param realFlares erupções reais para sortear (usadas quando não há missão histórica)
   * @param historical missão histórica: tempestades e atraso das mensagens vêm dela, com datas reais
   */
  constructor(seed: number, realFlares: Flare[] = [], historical: HistoricalMission | null = null) {
    this.rng = createRng(seed);
    const storms = historical ? this.historicalStorms(historical) : this.scheduleStorms(realFlares);
    const stormSols = new Set(storms.map((s) => s.sol));

    let dustStormSol: number;
    do dustStormSol = this.rng.int(CONFIG.dustStorm.firstSol, CONFIG.dustStorm.lastSol);
    while (stormSols.has(dustStormSol));

    const cardSols = new Map<number, (typeof CARD_IDS)[number]>();
    const sols = this.rng
      .shuffle(range(CONFIG.cards.firstSol, CONFIG.cards.lastSol).filter((s) => s !== dustStormSol))
      .slice(0, CONFIG.cards.perGame);
    const ids = this.rng.shuffle(CARD_POOL).slice(0, CONFIG.cards.perGame);
    sols.forEach((s, i) => cardSols.set(s, ids[i]));

    this.state = {
      seed,
      historical,
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
      problems: [],
      commsDown: false,
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

  /** Tempestades fixas da missão; o aviso chega um sol antes, com o atraso real daquele sol. */
  private historicalStorms(h: HistoricalMission): ScheduledStorm[] {
    return h.storms.map((s) => ({ sol: s.sol, flare: s.flare, delayMin: h.delays[s.sol - 2] }));
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

    s.commsDown = this.nextCommsDown;
    this.nextCommsDown = false;
    // Antena desalinhada: os avisos da Terra deste sol se perdem (a tempestade vem do mesmo jeito).
    s.messages = s.commsDown ? [{ kind: 'noSignal' }] : this.buildMessages(sol);
    s.problems = [...this.carryOver, ...scheduleProblems(sol, this.rng, () => ++this.uid)];
    this.carryOver = [];

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
    const h = s.historical;
    // Missão histórica: atraso real Terra-Marte do sol (JPL Horizons). Sem ela, sorteado.
    const delay = () => (h ? h.delays[sol - 1] : this.rng.int(CONFIG.solarStorms.commDelayMin.min, CONFIG.solarStorms.commDelayMin.max));
    const msgs: Message[] = [];
    for (const storm of s.storms) {
      if (storm.sol === sol + 1) msgs.push({ kind: 'stormAlert', flare: storm.flare, delayMin: storm.delayMin, impactSol: storm.sol });
      if (storm.sol === sol) msgs.push({ kind: 'stormToday', flare: storm.flare, delayMin: h ? h.delays[sol - 1] : storm.delayMin });
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
    if (card.id === 'roverRoute' && optionId === 'shortcut') lines.push(this.shortcutOutcome());
    this.cardLines.push(...lines);
    this.state.pendingCard = null;
    this.updateBlocks(); // limpar painéis muda a energia de hoje
    this.checkLoss();
    return lines;
  }

  /**
   * Atalho do rover: com chance, ele atola hoje (vira o problema "Rover atolado", que precisa de resgate).
   * Se o rover já ia atolar hoje, não cria outro.
   */
  private shortcutOutcome(): ReportLine {
    if (!this.rng.chance(CONFIG.rover.route.shortcutStuckChance)) return { key: 'card.roverRoute.ok', tone: 'good' };
    const s = this.state;
    if (!s.problems.some((p) => p.kind === 'roverStuck' && p.status !== 'done')) {
      const w = CONFIG.problems.spawnWindow;
      s.problems.push({ uid: ++this.uid, kind: 'roverStuck', spawnAt: w.min, status: 'pending', progress: 0 });
      s.problems.sort((a, b) => a.spawnAt - b.spawnAt);
    }
    return { key: 'card.roverRoute.stuck', tone: 'bad' };
  }

  /** Fato real ligado ao que aconteceu, mostrado uma vez por missão (GDD, "Fatos reais dos rovers"). */
  private factOnce(key: string): ReportLine[] {
    if (this.factsShown.has(key)) return [];
    this.factsShown.add(key);
    return [{ key, tone: 'neutral' }];
  }

  // ---------- problemas pela base (tempo da tripulação) ----------

  private problem(uid: number): Problem {
    const p = this.state.problems.find((x) => x.uid === uid);
    if (!p) throw new Error(`Problema inexistente: ${uid}`);
    return p;
  }

  /** O relógio do dia chegou ao `spawnAt`: o problema aparece na base. */
  openProblem(uid: number): void {
    const p = this.problem(uid);
    if (p.status === 'pending') p.status = 'open';
  }

  /** Progresso do trabalho (0–1), informado pela cena enquanto um astronauta trabalha. */
  setProblemProgress(uid: number, progress: number): void {
    const p = this.problem(uid);
    if (p.status !== 'done') p.progress = clamp(progress, 0, 1);
  }

  /** Um astronauta terminou o trabalho. Fora da base, soma dose (GDD). */
  resolveProblem(uid: number): void {
    const p = this.problem(uid);
    if (p.status === 'done') return;
    p.status = 'done';
    p.progress = 1;
    const outside = PROBLEMS[p.kind].outside;
    if (outside) this.state.res.dose = round1(this.state.res.dose + CONFIG.problems.outsideDose);
    this.cardLines.push({
      key: outside ? 'report.problem.fixedOutside' : 'report.problem.fixed',
      params: { problem: `problem.${p.kind}`, dose: CONFIG.problems.outsideDose },
      tone: 'good',
    });
    this.checkLoss();
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

    const before: Resources = { ...s.res };
    const lines: ReportLine[] = [...this.cardLines];
    const storm = this.stormToday;

    // Problemas: em noite de tempestade, trabalho pela metade continua amanhã (GDD); o resto cobra a conta hoje.
    const unresolved = s.problems.filter((p) => p.status !== 'done');
    const carried = storm ? unresolved.filter((p) => p.progress > 0) : [];
    const failed = unresolved.filter((p) => !carried.includes(p));

    // O cálculo é o mesmo da prévia (src/sim/day.ts); aqui só montamos o relatório.
    const day = simulateDay({
      res: s.res,
      plan,
      blocks: s.blocks,
      stormClass: storm ? storm.flare.cls : null,
      dustHold: s.dustHold > 0,
      failed: failed.map((p) => p.kind),
    });
    const r = day.after;
    s.res = r;

    lines.push({
      key: day.lifeDelta === 0 ? 'report.life.stable' : day.lifeDelta > 0 ? 'report.life.up' : 'report.life.down',
      params: { blocks: plan.life, delta: Math.abs(day.lifeDelta) },
      tone: day.lifeDelta < 0 ? 'bad' : day.lifeDelta > 0 ? 'good' : 'neutral',
    });
    lines.push({
      key: 'report.shield',
      params: { blocks: plan.shield, value: Math.round(clamp(before.shield + day.shieldDelta, 0, CONFIG.shield.max)) },
      tone: day.shieldDelta < 0 ? 'bad' : 'good',
    });
    if (day.roverStuck && plan.science > 0) {
      lines.push({ key: 'report.problem.roverStuck', params: { blocks: plan.science }, tone: 'bad' });
    } else if (plan.science > 0) {
      lines.push({ key: storm ? 'report.science.storm' : 'report.science', params: { blocks: plan.science, gain: day.sciGain }, tone: 'good' });
    }
    if (day.leftover > 0) lines.push({ key: 'report.battery.saved', params: { blocks: day.leftover, gain: day.leftover * CONFIG.battery.perLeftoverBlock } });
    if (day.missing > 0) lines.push({ key: 'report.night.short', params: { missing: day.missing, lifeLost: day.lifeLost }, tone: 'bad' });
    else lines.push({ key: 'report.night.ok', params: { cost: CONFIG.battery.nightCost } });

    let stormResult: SolReport['storm'] = null;
    if (storm) {
      stormResult = { flare: storm.flare, dose: day.stormDose };
      const key = storm.flare.source === 'cme' ? 'report.storm.cme' : 'report.storm';
      const shieldAtStorm = clamp(before.shield + day.shieldDelta, 0, CONFIG.shield.max);
      lines.push({ key, params: { label: storm.flare.label, dose: day.stormDose, shield: Math.round(shieldAtStorm) }, tone: 'bad' });
    }

    if (s.dustHold > 0) {
      s.dustHold--;
      if (before.dust > 0) lines.push({ key: 'report.dust.hold', params: { dust: Math.round(before.dust) }, tone: 'bad' });
    } else if (before.dust > 0) {
      lines.push({ key: 'report.dust.wind', params: { dust: Math.round(Math.max(0, before.dust - CONFIG.dust.windCleanPerSol)) } });
    }

    const fx = CONFIG.problems.effects;
    for (const p of failed) {
      if (p.kind === 'antenna') this.nextCommsDown = true;
      if (p.kind !== 'roverStuck') lines.push({ key: `report.problem.failed.${p.kind}`, params: fx, tone: 'bad' });
    }
    for (const p of carried) lines.push({ key: 'report.problem.carried', params: { problem: `problem.${p.kind}` } });
    this.carryOver = carried.map((p) => ({ ...p, status: 'open' as const, spawnAt: 0 }));

    // Fatos reais dos rovers, ligados ao que a criança acabou de viver (uma vez por missão).
    if (s.sol === 1) lines.push(...this.factOnce('fact.battery'));
    if (s.sol === s.dustStormSol) lines.push(...this.factOnce('fact.opportunity'));
    if (s.problems.some((p) => p.kind === 'roverStuck' && p.status !== 'pending')) lines.push(...this.factOnce('fact.spirit'));

    const report: SolReport = { sol: s.sol, plan: { ...plan }, before, after: { ...r }, storm: stormResult, lines };
    s.reports.push(report);

    this.checkLoss();
    if (s.outcome.status === 'playing') {
      if (s.sol >= CONFIG.sols) s.outcome = { status: 'won', stars: this.stars() };
      else this.startSol(s.sol + 1);
    }
    return report;
  }

  /**
   * Prévia do plano de energia: o que acontece se o sol terminar com este plano, SEM contar os
   * problemas do dia (ainda não apareceram). Usa o mesmo cálculo do fim do sol; não muda nada.
   */
  previewSol(plan: EnergyPlan): DayResult & { stormTonight: Flare | null; stormTomorrow: Flare | null; doseTomorrowIfNow: number } {
    const s = this.state;
    const storm = this.stormToday;
    const day = simulateDay({
      res: s.res,
      plan,
      blocks: s.blocks,
      stormClass: storm ? storm.flare.cls : null,
      dustHold: s.dustHold > 0,
      failed: [],
    });
    // Aviso que a criança já recebeu: tempestade amanhã. Quanto ela daria com a blindagem desta noite?
    const tomorrow = s.messages.some((m) => m.kind === 'stormAlert') ? s.storms.find((x) => x.sol === s.sol + 1) : undefined;
    return {
      ...day,
      stormTonight: storm ? storm.flare : null,
      stormTomorrow: tomorrow ? tomorrow.flare : null,
      doseTomorrowIfNow: tomorrow ? stormDose(tomorrow.flare.cls, day.after.shield) : 0,
    };
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

export { stormDose } from './day.ts';

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
