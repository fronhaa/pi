import { PALETTE } from '@/render/toon';
import { MARS_G } from '@/core/constants';
import type { Scenario } from './types';

/** Cratera Jezero, Marte (ENV-001): céu rosado de poeira, mesas no horizonte, a Terra é um pontinho. */
export const MARS: Scenario = {
  id: 'mars',
  gravity: MARS_G,
  terrain: { soil: PALETTE.soil, rock: PALETTE.rock, lit: PALETTE.lit, dust: PALETTE.dust },
  sky: { day: 0xe8b98c, dust: 0xc99a6e, alert: 0xd9866a, night: 0x1c1724 },
  sun: { color: 0xfff0dc, position: [-30, 40, 20], intensity: 2.2 },
  hemiIntensity: 1.3,
  mesaHeight: 1,
  airless: false,
  restDarkness: 1,
};
