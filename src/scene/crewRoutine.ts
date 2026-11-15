import * as THREE from 'three';
import { ROLES, type Role } from '@/sim/crew';
import type { Crew } from './Crew';
import {
  BUNK_SPOTS,
  BUNK_Z,
  DOME_CENTER,
  GREENHOUSE_STAIRS,
  GREENHOUSE_WORK_SPOT,
  GYM_STATIONS,
  HABITAT_FLOOR_Y,
  HABITAT_LOOK,
  HABITAT_POSITION,
  HABITAT_SPOTS,
  PROBLEM_SPOTS,
  headroomAt,
} from './base/layout';

/** Rotina visual dentro da base (GDD, "Atividades dentro da base", B): segundos sem ordem até ir à academia, de exercício e de descanso. */
const ROUTINE_IDLE_SECONDS = 8;
const ROUTINE_GYM_SECONDS = 20;
const ROUTINE_REST_SECONDS = 12;
/** Andar dentro da base (m/s): devagar de dia, mais rápido à noite (indo dormir). */
const WALK_SPEED = 1.3;
const NIGHT_WALK_SPEED = 2.2;
/** Indo consertar a estufa: apressado (o conserto só começa quando ele chega). */
const TASK_WALK_SPEED = 2.4;
/** Subindo ou descendo do beliche (já deitado): devagar. */
const CLIMB_SPEED = 0.9;
/** Corredor central: todos os módulos, os túneis e a passarela da cúpula ficam nesta linha (z) e neste piso (y). */
const CORRIDOR_Z = DOME_CENTER.z;
const FLOOR_Y = HABITAT_FLOOR_Y;
/** Quem volta de fora aparece aqui: dentro do laboratório, junto à porta do airlock. */
const DOOR_INSIDE = new THREE.Vector3(HABITAT_POSITION.x, FLOOR_Y, HABITAT_POSITION.z + 0.6);
/**
 * Ao lado da cama, de pé (na frente do beliche, sem encostar nele): anda até aqui e então deita. Deitado, sobe
 * até a altura da cama um pouco mais perto dela (BED_APPROACH_Z) e desliza para dentro: o corpo nunca sai do casco.
 */
const BESIDE_BED_Z = CORRIDOR_Z + 0.45;
const BED_APPROACH_Z = HABITAT_POSITION.z + BUNK_Z + 0.65;
/** Deitado, o corpo vai até ~0,35 m abaixo da origem do boneco: deitado no chão, a origem sobe isso. */
const LYING_HALF = 0.36;
/** Deitado logo acima do chão, um pouco mais para o meio do casco (o casco é redondo). */
const LIE_DOWN_Z = CORRIDOR_Z + 0.3;
/** Olha o teto até esta distância à frente (m), para já chegar abaixado na boca do túnel. */
const HEADROOM_LOOKAHEAD = 0.8;
/** Parado no posto, olha às vezes para um colega a até esta distância (m). */
const COLLEAGUE_LOOK_DISTANCE = 3.5;

/** O que a rotina precisa saber do jogo a cada frame. */
export interface RoutineFrame {
  /** Manhã ou dia: acordados. */
  awake: boolean;
  /** Noite normal: dormem no beliche. Na noite de tempestade (abrigo), ninguém aparece no habitat. */
  sleeping: boolean;
  /** Alerta de tempestade: ficam no posto. */
  alert: boolean;
  /** A física cuida dele (está lá fora)? Então a rotina não mexe. */
  isOutside(role: Role): boolean;
  /** Está dentro do habitat (não na câmara de descompressão)? */
  inHabitat(role: Role): boolean;
  /** Está consertando um problema de dentro (a estufa)? */
  onInsideTask(role: Role): boolean;
}

type Activity = 'post' | 'gym' | 'bed' | 'task' | 'sleep';

/** Um ponto do caminho e como ele vai até lá: andando em pé ou deitado (subindo ou descendo do beliche). */
interface Step {
  to: THREE.Vector3;
  lying: boolean;
}

interface Walker {
  at: 'post' | 'gym' | 'bed';
  idle: number;
  left: number;
  station: number;
  /**
   * Descansado? Só vai à academia quem estava descansando (no posto ou no beliche). Quem volta de uma missão lá
   * fora ou de um conserto vai primeiro descansar no beliche.
   */
  rested: boolean;
  /** Onde está agora, o caminho que falta e para qual atividade ele está indo. */
  pos: THREE.Vector3;
  path: Step[];
  going: Activity | null;
  /** Já apareceu dentro alguma vez (no começo do jogo ele já está no lugar; depois, entra pela porta). */
  placed: boolean;
  wasInside: boolean;
}

/**
 * Quem está dentro aparece pelo casco translúcido. A física não cuida de quem está dentro, então a
 * posição, a pose e a animação são daqui. Só cena: nenhuma regra muda.
 * - Com tarefa de dentro: anda até a estufa e conserta.
 * - Sem ordem há um tempo: academia (esteira ou bicicleta), depois descansa no beliche e volta ao posto.
 * - Noite normal: anda até a sua cama do beliche e dorme. Noite de tempestade (abrigo) e câmara de descompressão: some.
 * Entre um lugar e outro, ele ANDA pelo corredor central (módulos, túneis e a passarela da cúpula), nunca
 * some de um módulo e aparece em outro. Quem volta de fora entra pela porta do laboratório.
 *
 * Para onde olha (GDD, "Para onde o astronauta olha"): ninguém encara a câmera. Andando, para onde anda;
 * consertando ou na academia, para a tarefa; parado no posto, para a estação do módulo e às vezes um colega.
 * Tocado e sem ordem, vira para quem controla por um tempo (Game.select → Astronaut.lookAt).
 */
export class CrewRoutine {
  /** Primeira vez que alguém vai à academia (o jogo mostra o fato da NASA sobre exercício). */
  onFirstExercise: () => void = () => {};
  private exerciseShown = false;
  private readonly walkers = Object.fromEntries(
    ROLES.map((r) => [r, { at: 'post', idle: 0, left: 0, station: 0, rested: true, pos: HABITAT_SPOTS[r].clone(), path: [], going: null, placed: false, wasInside: false } as Walker]),
  ) as Record<Role, Walker>;

  constructor(private readonly crew: Crew) {}

  /** Já chegou à estufa para consertar (andando por dentro)? O CrewTasks espera isso para começar o trabalho. */
  arrivedAtTask(r: Role): boolean {
    const w = this.walkers[r];
    return w.wasInside && w.going === 'task' && w.path.length === 0;
  }

  /** Onde fica cada atividade (para onde ele anda). */
  private spotOf(r: Role, activity: Activity, station: number): THREE.Vector3 {
    if (activity === 'task') return GREENHOUSE_WORK_SPOT;
    if (activity === 'gym') return GYM_STATIONS[station].pos;
    if (activity === 'bed' || activity === 'sleep') return BUNK_SPOTS[r];
    return HABITAT_SPOTS[r];
  }

  /** Ao lado da cama: de pé no chão, deitado logo acima do chão e deitado na altura da cama, quase entrando nela. */
  private besideBed(r: Role): { floor: THREE.Vector3; low: THREE.Vector3; high: THREE.Vector3 } {
    const bed = BUNK_SPOTS[r];
    return {
      floor: new THREE.Vector3(bed.x, FLOOR_Y, BESIDE_BED_Z),
      low: new THREE.Vector3(bed.x, FLOOR_Y + LYING_HALF, LIE_DOWN_Z),
      high: new THREE.Vector3(bed.x, bed.y, BED_APPROACH_Z),
    };
  }

  /**
   * Caminho pelo corredor central: sai do lugar (descendo do beliche, deitado), anda pelo corredor e entra no
   * lugar (subindo no beliche, deitado; ou descendo a escada da estufa). Sempre pelos pontos certos, nunca
   * atravessando cama, casco ou canteiro.
   */
  private route(r: Role, from: THREE.Vector3, to: THREE.Vector3, fromBed: boolean, toBed: boolean, toGreenhouse: boolean): Step[] {
    const stand = (p: THREE.Vector3): Step => ({ to: p.clone(), lying: false });
    const lie = (p: THREE.Vector3): Step => ({ to: p.clone(), lying: true });
    const side = this.besideBed(r);
    const steps: Step[] = [];
    if (fromBed) steps.push(lie(side.high), lie(side.low), stand(side.floor));
    // Escada da estufa do lado do vazamento (norte): o conserto fica lá embaixo.
    const stair = GREENHOUSE_STAIRS[0];
    const corridorX = toGreenhouse ? stair.top.x : to.x;
    steps.push(stand(new THREE.Vector3(from.x, FLOOR_Y, CORRIDOR_Z)), stand(new THREE.Vector3(corridorX, FLOOR_Y, CORRIDOR_Z)));
    if (toGreenhouse) steps.push(stand(stair.top), stand(stair.bottom));
    if (toBed) steps.push(stand(side.floor), lie(side.low), lie(side.high));
    steps.push(toBed ? lie(to) : stand(to));
    // Tira pontos repetidos (já está no corredor, ou o destino fica no corredor).
    return steps.filter((st, i) => st.to.distanceTo(i === 0 ? from : steps[i - 1].to) > 0.05);
  }

  /** Menor altura livre daqui até HEADROOM_LOOKAHEAD metros à frente, seguindo o caminho. */
  private headroomAhead(w: Walker): number {
    let best = headroomAt(w.pos.x, w.pos.z);
    let from = w.pos;
    let left = HEADROOM_LOOKAHEAD;
    for (const st of w.path) {
      const d = Math.hypot(st.to.x - from.x, st.to.z - from.z);
      for (let k = 0.1; k <= Math.min(d, left) + 1e-6; k += 0.1) {
        const f = k / d;
        best = Math.min(best, headroomAt(from.x + (st.to.x - from.x) * f, from.z + (st.to.z - from.z) * f));
      }
      left -= d;
      if (left <= 0) break;
      from = st.to;
    }
    return best;
  }

  /** Saindo da estufa (escada acima) antes de ir ao corredor. */
  private leaveGreenhouse(from: THREE.Vector3): Step[] {
    if (from.y > FLOOR_Y - 0.3) return [];
    const stair = GREENHOUSE_STAIRS[0];
    return [
      { to: stair.bottom.clone(), lying: false },
      { to: stair.top.clone(), lying: false },
    ];
  }

  update(dt: number, f: RoutineFrame): void {
    for (const r of ROLES) {
      const a = this.crew.members[r];
      const w = this.walkers[r];
      if (f.isOutside(r)) {
        w.at = 'post';
        w.idle = 0;
        w.wasInside = false;
        a.setLying(false);
        continue;
      }
      const inHabitat = f.inHabitat(r) && (f.awake || f.sleeping);
      a.root.visible = inHabitat;
      if (!inHabitat) {
        w.wasInside = false;
        continue;
      }
      // Acabou de aparecer dentro: no começo do jogo já está no posto; depois, entra pela porta do laboratório,
      // voltando de uma missão lá fora: vai descansar antes de qualquer atividade.
      if (!w.wasInside) {
        w.wasInside = true;
        w.path = [];
        w.going = null;
        if (w.placed) {
          w.pos.copy(DOOR_INSIDE);
          w.rested = false;
        }
        w.placed = true;
      }

      // Rotina: o que ele quer fazer agora (igual a antes; só que agora ele anda até lá).
      if (f.sleeping) {
        // Dormiu: acorda descansado.
        w.at = 'post';
        w.idle = 0;
        w.rested = true;
      } else if (f.onInsideTask(r)) {
        // Consertando: depois vai descansar antes de qualquer atividade.
        w.at = 'post';
        w.idle = 0;
        w.rested = false;
      } else if (f.alert) {
        w.at = 'post';
        w.idle = 0;
      } else if (w.at === 'post') {
        // O relógio do "sem ordem" só corre quando ele já chegou ao posto.
        if (!w.path.length) w.idle += dt;
        const used = ROLES.filter((o) => o !== r && this.walkers[o].at === 'gym').map((o) => this.walkers[o].station);
        const free = GYM_STATIONS.findIndex((_, i) => !used.includes(i));
        if (w.idle >= ROUTINE_IDLE_SECONDS && !w.rested) {
          // Voltou de uma missão ou de um conserto: primeiro descansa no beliche (nada de ir direto à academia).
          w.at = 'bed';
          w.left = ROUTINE_REST_SECONDS;
        } else if (w.idle >= ROUTINE_IDLE_SECONDS && free >= 0) {
          w.at = 'gym';
          w.station = free;
          w.left = ROUTINE_GYM_SECONDS;
          // Primeira vez na partida: o fato real da NASA sobre exercício (F9).
          if (!this.exerciseShown) this.onFirstExercise();
          this.exerciseShown = true;
        }
      } else if (!w.path.length) {
        w.left -= dt;
        if (w.left <= 0 && w.at === 'gym') {
          w.at = 'bed';
          w.left = ROUTINE_REST_SECONDS;
        } else if (w.left <= 0) {
          // Descansou no beliche.
          w.at = 'post';
          w.idle = 0;
          w.rested = true;
        }
      }
      const activity: Activity = f.sleeping ? 'sleep' : f.onInsideTask(r) ? 'task' : w.at;

      // Mudou de atividade: calcula o caminho até o novo lugar.
      if (activity !== w.going) {
        // Estava no meio do caminho do beliche (subindo ou descendo, deitado)? Conta como saindo da cama.
        const fromBed = w.going === 'bed' || w.going === 'sleep' || (w.path[0]?.lying ?? false);
        const toBed = activity === 'bed' || activity === 'sleep';
        const stillInBed = toBed && (w.going === 'bed' || w.going === 'sleep');
        w.going = activity;
        w.path = stillInBed
          ? w.path
          : [...this.leaveGreenhouse(w.pos), ...this.route(r, w.pos, this.spotOf(r, activity, w.station), fromBed, toBed, activity === 'task')];
      }

      // Andando: segue o caminho a velocidade constante, virado para onde vai. Subindo ou descendo do beliche,
      // vai deitado e devagar. Onde o teto é baixo (túneis), anda abaixado.
      if (w.path.length) {
        const lying = w.path[0].lying;
        // Deitando ao lado da cama: o corpo começa logo acima do chão, nunca enfiado nele.
        if (lying) w.pos.y = Math.max(w.pos.y, FLOOR_Y + LYING_HALF);
        // Levantando ao lado da cama: fica de pé direto no chão (em pé lá em cima, a cabeça passaria do casco).
        else if (w.pos.y > FLOOR_Y + 0.01 && w.pos.y <= FLOOR_Y + LYING_HALF + 0.01) w.pos.y = FLOOR_Y;
        const speed = lying ? CLIMB_SPEED : activity === 'task' ? TASK_WALK_SPEED : f.sleeping ? NIGHT_WALK_SPEED : WALK_SPEED;
        let step = speed * dt;
        let heading = a.model.rotation.y;
        while (step > 0 && w.path.length && w.path[0].lying === lying) {
          const next = w.path[0].to;
          const d = w.pos.distanceTo(next);
          const flat = Math.hypot(next.x - w.pos.x, next.z - w.pos.z);
          if (flat > 0.01) heading = Math.atan2(-(next.x - w.pos.x), -(next.z - w.pos.z));
          if (d <= step) {
            w.pos.copy(next);
            w.path.shift();
            step -= d;
          } else {
            w.pos.lerp(next, step / d);
            step = 0;
          }
        }
        a.root.position.copy(w.pos);
        if (lying) {
          a.setLying(true);
          a.idle(dt);
        } else {
          a.setLying(false);
          a.setMotion(speed, heading, dt);
          a.fitHeadroom(this.headroomAhead(w), dt);
        }
        continue;
      }
      a.fitHeadroom(Infinity, dt);

      // Chegou: a pose do lugar.
      if (activity === 'sleep' || activity === 'bed') {
        a.root.position.copy(BUNK_SPOTS[r]);
        a.setLying(true);
        a.idle(dt);
      } else if (activity === 'gym') {
        const st = GYM_STATIONS[w.station];
        a.setLying(false);
        a.root.position.copy(st.pos);
        a.faceHeading(st.heading, dt);
        a.exercise(st.clip, st.speed, dt);
      } else if (activity === 'task') {
        // Consertando a estufa: de frente para o vazamento, nunca para a câmera.
        a.setLying(false);
        a.root.position.copy(w.pos);
        a.faceToward(PROBLEM_SPOTS.greenhouseLeak, dt);
        a.idle(dt);
      } else {
        // Posto: olha a estação do módulo e, às vezes, um colega perto (ninguém encara a câmera).
        a.setLying(false);
        a.root.position.copy(w.pos);
        const others = ROLES.filter((o) => o !== r && this.crew.members[o].root.visible)
          .map((o) => this.crew.members[o].root.position)
          .filter((p) => p.distanceTo(a.root.position) < COLLEAGUE_LOOK_DISTANCE);
        a.lookFree(dt, HABITAT_LOOK[r], others);
        a.idle(dt);
      }
    }
  }
}
