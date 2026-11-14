import { CONFIG } from './config.ts';
import { Mission } from './mission.ts';
import { parseMissions, pickHistorical, type MissionsFile } from './historical.ts';
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

export function newMission(seed: number, flaresJson: string, historicalJson: string): void {
  const flares = JSON.parse(flaresJson) as Flare[];
  const historical = JSON.parse(historicalJson) as HistoricalMission | null;
  mission = new Mission(seed >>> 0, flares, historical);
}

export function answerCard(option: string): void {
  current().answerCard(option);
}

export function isPlanValid(planJson: string): boolean {
  return current().isPlanValid(JSON.parse(planJson) as EnergyPlan);
}

export function endSol(planJson: string): string {
  return JSON.stringify(current().endSol(JSON.parse(planJson) as EnergyPlan));
}

export function openProblem(uid: number): void {
  current().openProblem(uid);
}

export function setProblemProgress(uid: number, progress: number): void {
  current().setProblemProgress(uid, progress);
}

export function resolveProblem(uid: number): void {
  current().resolveProblem(uid);
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
