import type { Location } from '@/sim/config';
import { MARS } from './mars';
import { MOON } from './moon';
import type { Scenario } from './types';

export type { Scenario };

/** Todos os lugares onde a base pode ficar. `Location` novo em src/sim/config.ts obriga um cenário aqui. */
export const SCENARIOS: Record<Location, Scenario> = { mars: MARS, moon: MOON };

export function scenarioOf(place: Location): Scenario {
  return SCENARIOS[place];
}
