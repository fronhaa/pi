import { PALETTE } from '@/render/toon';
import { MARS_G } from '@/core/constants';
import type { Scenario } from './types';

/** Cratera Jezero, Marte (ENV-001): céu rosado de poeira, mesas no horizonte, a Terra é um pontinho. */
export const MARS: Scenario = {
  id: 'mars',
  gravity: MARS_G,
  terrain: { soil: PALETTE.soil, rock: PALETTE.rock, lit: PALETTE.lit, dust: PALETTE.dust },
  sky: { day: 0xe8b98c, dust: 0xc99a6e, alert: 0xd9866a, night: 0x1c1724 },
  // Nasce atrás da câmera, passa alto pelo lado dela ao meio-dia (frente iluminada) e se põe atrás da base, à vista.
  sun: { color: 0xfff0dc, intensity: 2.2, path: { azimuth: [0.25 * Math.PI, 1.22 * Math.PI], elevation: [0, 0.95] }, sets: true },
  hemiIntensity: 1.3,
  mesaHeight: 1,
  airless: false,
  restDarkness: 1,
};
