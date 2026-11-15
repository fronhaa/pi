import { CONFIG, type Difficulty } from './config.ts';
import { Mission } from './mission.ts';
import { parseMissions, pickHistorical, type MissionsFile } from './historical.ts';
import { applyAction, type MissionAction } from './actions.ts';
import { needsEva } from './eva.ts';
import type { EnergyPlan, Flare, HistoricalMission } from './types.ts';

/**
 * Ponte da simulação para o servidor coop em Go (ADR 0006, docs/servidor-coop.md).
 *
 * `npm run sim:bundle` empacota este arquivo (e tudo de src/sim) em
 * server/internal/sim/simjs/sim.js; o Go roda esse JS com goja. Assim as REGRAS existem
 * num lugar só: mudou src/sim, o servidor acompanha no próximo build.
 *
 * Tudo entra e sai como JSON (texto): evita converter objetos entre JS e Go.
 * Cada runtime do Go tem UMA missão (uma sala).
 */

let mission: Mission | null = null;

function current(): Mission {
  if (!mission) throw new Error('missão não criada');
  return mission;
}

/** Estado completo, no mesmo formato do GameState (cardSols vira objeto). */
export function state(): string {
  const s = current().state;
  return JSON.stringify({ ...s, cardSols: Object.fromEntries(s.cardSols) });
}

/**
 * `location` e `difficulty` são opcionais: o servidor Go de hoje não manda, e a sala fica em Marte no nível Médio
 * (Lua e níveis só no solo, por enquanto).
 */
export function newMission(seed: number, flaresJson: string, historicalJson: string, location?: string, difficulty?: string): void {
  const flares = JSON.parse(flaresJson) as Flare[];
  const historical = JSON.parse(historicalJson) as HistoricalMission | null;
  mission = new Mission(seed >>> 0, flares, historical, location === 'moon' ? 'moon' : 'mars', (difficulty ?? 'medium') as Difficulty);
}

/**
 * Aplica qualquer interação (src/sim/actions.ts) e devolve o resultado em JSON.
 * As funções abaixo (answerCard, endSol…) são atalhos dela que o servidor Go já chama.
 */
export function apply(actionJson: string): string {
  return JSON.stringify(applyAction(current(), JSON.parse(actionJson) as MissionAction));
}

export function answerCard(option: string): void {
  applyAction(current(), { type: 'answerCard', option });
}

export function isPlanValid(planJson: string): boolean {
  return current().isPlanValid(JSON.parse(planJson) as EnergyPlan);
}

export function endSol(planJson: string): string {
  return JSON.stringify(applyAction(current(), { type: 'endSol', plan: JSON.parse(planJson) as EnergyPlan }).report);
}

/** Prévia do plano (a mesma conta do fim do sol). "null" se a carta ainda não foi respondida ou o plano é inválido. */
export function previewSol(planJson: string): string {
  const m = current();
  const plan = JSON.parse(planJson) as EnergyPlan;
  if (m.state.pendingCard || !m.isPlanValid(plan)) return 'null';
  return JSON.stringify(m.previewSol(plan));
}

/** EVA proibida hoje (tempestade avisada)? Regra em src/sim/eva.ts. */
export function evaBanned(): boolean {
  return current().evaBanned;
}

/** O problema pode ser consertado agora? Com a EVA proibida, os de fora não (ninguém pode sair). */
export function canResolve(uid: number): boolean {
  const m = current();
  const p = m.state.problems.find((x) => x.uid === uid);
  return !!p && !(m.evaBanned && needsEva(p.kind));
}

export function openProblem(uid: number): void {
  applyAction(current(), { type: 'openProblem', uid });
}

export function setProblemProgress(uid: number, progress: number): void {
  applyAction(current(), { type: 'problemProgress', uid, progress });
}

export function resolveProblem(uid: number): void {
  applyAction(current(), { type: 'resolveProblem', uid });
}

/** Missões históricas: a mesma leitura e o mesmo sorteio do jogo solo. */
export function parseMissionsJson(raw: string): string {
  return JSON.stringify(parseMissions(JSON.parse(raw) as MissionsFile));
}

export function pickHistoricalJson(missionsJson: string, seed: number, firstGame: boolean): string {
  return JSON.stringify(pickHistorical(JSON.parse(missionsJson) as HistoricalMission[], seed >>> 0, firstGame));
}

/** Números de jogo que o servidor também usa (relógio do dia, atraso das mensagens da Terra). */
export function config(): string {
  return JSON.stringify(CONFIG);
}
