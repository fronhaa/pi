import type { Mission } from '@/sim/mission';
import { applyAction, type ActionResult, type MissionAction } from '@/sim/actions';
import type { GameState } from '@/sim/types';

/**
 * Porta da missão: o que quem joga (interface, tripulação) enxerga da partida e como manda ações.
 *
 * - Solo: `localPort` aplica a ação na Mission local, com as regras de src/sim.
 * - Em grupo: src/core/coop/CoopMode.ts monta uma porta que manda a ação ao servidor
 *   (que roda as MESMAS regras) e mostra o estado que ele devolve.
 *
 * Assim o CrewTasks e a interface não sabem se é solo ou em grupo.
 */
export interface MissionPort {
  readonly state: GameState;
  /** EVA proibida hoje (src/sim/eva.ts). */
  readonly evaBanned: boolean;
  dispatch(action: MissionAction): ActionResult;
}

export function localPort(mission: Mission): MissionPort {
  return {
    get state() {
      return mission.state;
    },
    get evaBanned() {
      return mission.evaBanned;
    },
    dispatch: (action) => applyAction(mission, action),
  };
}
