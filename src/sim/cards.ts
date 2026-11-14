import { CONFIG, type Location } from './config.ts';
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
  moxie: { id: 'moxie', options: [{ id: 'run' }, { id: 'save' }] },
  roverRoute: { id: 'roverRoute', options: [{ id: 'safe' }, { id: 'shortcut' }] },
};

export const CARD_IDS = Object.keys(CARDS) as CardId[];

/** Cartas que só fazem sentido em Marte (o MOXIE tira oxigênio do ar de Marte; a Lua não tem ar). */
export const MARS_ONLY_CARDS: readonly CardId[] = ['moxie'];

/** Efeito imediato ao aparecer a carta (antes da escolha). */
export function onCardDrawn(id: CardId, res: Resources): void {
  if (id === 'dustyPanels') res.dust = Math.min(CONFIG.dust.max, res.dust + 25);
}

/** Aplica a opção escolhida; devolve as linhas de relatório. */
export function applyCardOption(id: CardId, option: string, res: Resources, rng: Rng, location: Location = 'mars'): ReportLine[] {
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
      // Na Lua a resposta da Terra chega em segundos: a espera custa pouco.
      add('science', location === 'moon' ? CONFIG.moon.askEarthScience : -10);
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
    case 'moxie:run':
      add('battery', CONFIG.rover.moxie.battery);
      add('life', CONFIG.rover.moxie.life);
      break;
    case 'roverRoute:safe':
      add('science', CONFIG.rover.route.safeScience);
      break;
    case 'roverRoute:shortcut':
      // A chance de atolar é sorteada na Mission (ela cria o problema "Rover atolado" do dia).
      add('science', CONFIG.rover.route.shortcutScience);
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
