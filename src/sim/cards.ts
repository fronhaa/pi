import { CONFIG } from './config.ts';
import type { Rng } from './rng.ts';
import type { Card, CardId, ReportLine, Resources } from './types.ts';

/**
 * Cartas de decisão (docs/game-design.md, "Cartas de decisão").
 * Regra: TODA opção tem custo, direto ou de oportunidade.
 */
export const CARDS: Record<CardId, Card> = {
  dustyPanels: { id: 'dustyPanels', options: [{ id: 'clean' }, { id: 'wait' }] },
  mysteryRock: { id: 'mysteryRock', options: [{ id: 'sendRover' }, { id: 'skip' }] },
  greenhouseLeak: { id: 'greenhouseLeak', options: [{ id: 'fixNow' }, { id: 'fixLater' }] },
  cargoShip: { id: 'cargoShip', options: [{ id: 'batteries' }, { id: 'shieldKit' }, { id: 'experiment' }] },
  brokenSensor: { id: 'brokenSensor', options: [{ id: 'askEarth' }, { id: 'fixAlone' }] },
  subsurfaceIce: { id: 'subsurfaceIce', options: [{ id: 'drill' }, { id: 'notNow' }] },
};

export const CARD_IDS = Object.keys(CARDS) as CardId[];

/** Efeito imediato ao aparecer a carta (antes da escolha). */
export function onCardDrawn(id: CardId, res: Resources): void {
  if (id === 'dustyPanels') res.dust = Math.min(CONFIG.dust.max, res.dust + 25);
}

/** Aplica a opção escolhida; devolve as linhas de relatório. */
export function applyCardOption(id: CardId, option: string, res: Resources, rng: Rng): ReportLine[] {
  const b = CONFIG.battery;
  const lines: ReportLine[] = [];
  const add = (key: keyof Resources, delta: number) => {
    const max = key === 'battery' ? b.max : key === 'shield' ? CONFIG.shield.max : key === 'life' ? CONFIG.life.max : key === 'dust' ? CONFIG.dust.max : Infinity;
    res[key] = clamp(res[key] + delta, 0, max);
  };

  switch (`${id}:${option}`) {
    case 'dustyPanels:clean':
      add('dust', -30);
      add('dose', 4);
      break;
    case 'mysteryRock:sendRover':
      add('science', 15);
      add('battery', -20);
      break;
    case 'greenhouseLeak:fixNow':
      add('battery', -15);
      add('science', -5);
      break;
    case 'greenhouseLeak:fixLater':
      add('life', -15);
      break;
    case 'cargoShip:batteries':
      add('battery', 30);
      break;
    case 'cargoShip:shieldKit':
      add('shield', 30);
      break;
    case 'cargoShip:experiment':
      add('science', 15);
      break;
    case 'brokenSensor:askEarth':
      add('science', -10);
      break;
    case 'brokenSensor:fixAlone':
      if (rng.chance(0.5)) {
        add('battery', -20);
        lines.push({ key: 'card.brokenSensor.failed', tone: 'bad' });
      } else {
        lines.push({ key: 'card.brokenSensor.worked', tone: 'good' });
      }
      break;
    case 'subsurfaceIce:drill':
      add('battery', -20);
      add('life', 20);
      break;
    default:
      // Opções "esperar / deixar para lá / agora não": nada muda agora (custo de oportunidade).
      break;
  }
  lines.unshift({ key: `card.${id}.${option}.result` });
  return lines;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
