import { CONFIG, type FlareClass, type Location } from './config.ts';
import { clamp } from './cards.ts';
import type { EnergyPlan, ProblemKind, Resources } from './types.ts';

/**
 * Cálculo puro de um dia e uma noite (docs/game-design.md, "Sistemas e regras").
 * Usado pelo fim do sol (Mission.endSol) E pela prévia do plano de energia (Mission.previewSol),
 * para a prévia nunca mostrar um número diferente do que vai acontecer.
 */
export interface DayInput {
  /** Marte ou Lua (padrão: Marte). Na Lua mudam a dose diária, a força da tempestade e o vento. */
  location?: Location;
  res: Resources;
  plan: EnergyPlan;
  blocks: number;
  /** Classe da tempestade solar desta noite, se houver. */
  stormClass: FlareClass | null;
  /** Tempestade de poeira segurando a poeira (o vento não limpa hoje). */
  dustHold: boolean;
  /** Problemas que ficaram sem conserto e cobram a conta hoje. */
  failed: ProblemKind[];
  /** Bateria gasta até amanhã (padrão: a noite de Marte). Na Lua: descanso ou noite fria da sombra (Mission). */
  nightCost?: number;
}

export interface DayResult {
  after: Resources;
  leftover: number;
  lifeDelta: number;
  shieldDelta: number;
  sciGain: number;
  roverStuck: boolean;
  /** Energia que faltou à noite (0 = a bateria aguentou) e quanto de vida isso custou. */
  missing: number;
  lifeLost: number;
  /** Dose da tempestade desta noite (0 se não houver). */
  stormDose: number;
  /** Bateria que a base gastou até amanhã. */
  nightCost: number;
}

export function simulateDay(input: DayInput): DayResult {
  const { plan, blocks, stormClass, dustHold, failed } = input;
  const location = input.location ?? 'mars';
  const moon = location === 'moon';
  const r: Resources = { ...input.res };
  const leftover = blocks - plan.life - plan.shield - plan.science;

  // Suporte de vida: 3 blocos = estável; cada bloco a mais ou a menos muda 6.
  const lifeDelta = (plan.life - CONFIG.life.stableBlocks) * CONFIG.life.perBlock;
  r.life = clamp(r.life + lifeDelta, 0, CONFIG.life.max);

  // Blindagem: desgaste diário, reforço por bloco.
  const shieldDelta = plan.shield * CONFIG.shield.perBlock - CONFIG.shield.decay;
  r.shield = clamp(r.shield + shieldDelta, 0, CONFIG.shield.max);

  // Ciência: metade no sol de tempestade; zero com o rover atolado.
  const roverStuck = failed.includes('roverStuck');
  const sciGain = roverStuck ? 0 : plan.science * CONFIG.science.perBlock * (stormClass ? CONFIG.science.stormFactor : 1);
  r.science += sciGain;

  // Bateria: guarda o que sobrou, a noite cobra; se faltar, o suporte de vida sofre.
  r.battery = Math.min(CONFIG.battery.max, r.battery + leftover * CONFIG.battery.perLeftoverBlock);
  const nightCost = input.nightCost ?? CONFIG.battery.nightCost;
  r.battery -= nightCost;
  let missing = 0;
  let lifeLost = 0;
  if (r.battery < 0) {
    missing = -r.battery;
    lifeLost = round1(missing * CONFIG.battery.lifePerMissingPoint);
    r.life = clamp(r.life - lifeLost, 0, CONFIG.life.max);
    r.battery = 0;
  }

  // Tempestade solar: dose depende da blindagem.
  // Na Lua, sem atmosfera, a dose de todo dia é maior.
  const sd = stormClass ? stormDose(stormClass, r.shield, location) : 0;
  r.dose += sd;
  r.dose += moon ? CONFIG.moon.dosePerSol : CONFIG.dose.perSol;

  // Poeira: vento limpa, exceto durante a tempestade de poeira. Na Lua não há vento.
  const windClean = moon ? CONFIG.moon.windCleanPerSol : CONFIG.dust.windCleanPerSol;
  if (!dustHold && r.dust > 0) r.dust = Math.max(0, r.dust - windClean);

  // Problemas sem atendimento (GDD, "Problemas pela base").
  const fx = CONFIG.problems.effects;
  for (const kind of failed) {
    if (kind === 'dustyPanels') r.dust = Math.min(CONFIG.dust.max, r.dust + fx.dust);
    if (kind === 'greenhouseLeak') r.life = clamp(r.life - fx.lifeLeak, 0, CONFIG.life.max);
    if (kind === 'tornBag') r.shield = clamp(r.shield - fx.shieldBag, 0, CONFIG.shield.max);
  }

  r.life = round1(r.life);
  r.dose = round1(r.dose);
  return { after: r, leftover, lifeDelta, shieldDelta, sciGain, roverStuck, missing, lifeLost, stormDose: sd, nightCost };
}

/**
 * dose = max(1, round(intensidade × (1 − blindagem/100 × 0,85))). Escala do jogo (INTERPRETADO).
 * Na Lua, sem atmosfera, a intensidade é multiplicada por CONFIG.moon.stormFactor.
 */
export function stormDose(cls: FlareClass, shield: number, location: Location = 'mars'): number {
  const intensity = CONFIG.solarStorms.intensity[cls] * (location === 'moon' ? CONFIG.moon.stormFactor : 1);
  return Math.max(1, Math.round(intensity * (1 - (shield / 100) * CONFIG.dose.shieldFactor)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
