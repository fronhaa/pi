import RAPIER from '@dimforge/rapier3d-compat';
import type { Object3D } from 'three';
import { DEFAULT_BODY, FIXED_DT, gravityOf, type CelestialBodyId } from './constants';

export { RAPIER };

interface Link {
  body: RAPIER.RigidBody;
  object: Object3D;
}

/**
 * Wrapper do mundo Rapier.
 * Regra: a física é a dona da posição/rotação. Os objetos do Three só copiam (sync).
 */
export class Physics {
  readonly world: RAPIER.World;
  private links: Link[] = [];

  private constructor(readonly body: CelestialBodyId) {
    this.world = new RAPIER.World(gravityOf(body));
    this.world.timestep = FIXED_DT;
  }

  /**
   * O Rapier precisa carregar o WASM antes de qualquer uso.
   * `body` define a gravidade real do mundo (Marte por padrão).
   */
  static async create(body: CelestialBodyId = DEFAULT_BODY): Promise<Physics> {
    await RAPIER.init();
    return new Physics(body);
  }

  /** Liga um corpo físico a um objeto visual; o objeto seguirá o corpo a cada frame. */
  link(body: RAPIER.RigidBody, object: Object3D): void {
    this.links.push({ body, object });
  }

  step(): void {
    this.world.step();
  }

  /** Copia o estado da física para os objetos visuais. */
  sync(): void {
    for (const { body, object } of this.links) {
      const t = body.translation();
      const r = body.rotation();
      object.position.set(t.x, t.y, t.z);
      object.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}
