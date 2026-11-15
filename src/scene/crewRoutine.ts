import * as THREE from 'three';
import { ROLES, type Role } from '@/sim/crew';
import type { ProblemKind } from '@/sim/types';
import { Astronaut, FACING_BED_FEET, type Crew } from './Crew';
import {
  BUNK_LEVELS,
  BUNK_SPOTS,
  DOME_CENTER,
  GREENHOUSE_STAIRS,
  GREENHOUSE_WORK_SPOT,
  GYM_STATIONS,
  HABITAT_FLOOR_Y,
  HABITAT_LOOK,
  HABITAT_POSITION,
  HABITAT_SPOTS,
  HARVEST_STAIR,
  HARVEST_WORK_SPOT,
  LAB_BENCH_LOOK,
  LAB_WORK_SPOT,
  MODULE_FLOOR_LENGTH,
  PROBLEM_SPOTS,
  QUARTERS_LANE_Z,
  QUARTERS_OFFSET_X,
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
/** Deitar no beliche e levantar dele (s). */
const LIE_DOWN_SECONDS = 1.5;
const GET_UP_SECONDS = 1.3;
/**
 * Como deita em cada cama (fração do tempo): até quando inclina para trás, quando começa a entrar e o arco do quadril.
 * Medido com o corpo do chibi em tamanho normal nas 4 camas (módulos em 100%, 1 m livre acima de cada colchão),
 * deitando e levantando: nada entra no chão nem num colchão, e no casco no máximo ~0,5 cm. Entrar mais cedo faz o
 * calcanhar tocar o colchão (até 9 cm).
 */
export const BED_MOVE = {
  lower: { leanEnd: 0.7, intoStart: 0.45, arc: 0.15 },
  upper: { leanEnd: 0.75, intoStart: 0.45, arc: 0.3 },
};
/** Corredor central: todos os módulos, os túneis e a passarela da cúpula ficam nesta linha (z) e neste piso (y). */
const CORRIDOR_Z = DOME_CENTER.z;
const FLOOR_Y = HABITAT_FLOOR_Y;
/** Quem volta de fora aparece aqui: dentro do laboratório, junto à porta do airlock. */
const DOOR_INSIDE = new THREE.Vector3(HABITAT_POSITION.x, FLOOR_Y, HABITAT_POSITION.z + 0.6);
/**
 * Ao lado da cama, de pé na frente do beliche (sem encostar nele), com o quadril na altura do meio da cama: anda até
 * aqui, vira para os pés da cama e deita para trás (Astronaut.lieBlend). O corpo só entra na cama quando já está
 * quase deitado, para não bater na cama de cima nem sair do casco.
 */
const BESIDE_BED_Z = CORRIDOR_Z + QUARTERS_LANE_Z;
/**
 * Alojamento: anda pela faixa da frente (QUARTERS_LANE_Z), não pelo eixo do casco, para as pernas não passarem pela
 * borda das camas de baixo. Entra e sai da faixa nas portas de acoplamento do módulo.
 */
const QUARTERS_X = HABITAT_POSITION.x + QUARTERS_OFFSET_X;
const QUARTERS_PORT = MODULE_FLOOR_LENGTH / 2;
const QUARTERS_OUTER = QUARTERS_PORT + 0.2;
const QUARTERS_INNER = QUARTERS_PORT - 0.2;
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
  /** Qual tarefa de dentro: vazamento, colheita ou análise (cada uma tem o seu lugar). */
  insideTaskKind(role: Role): ProblemKind | undefined;
}

/** `task` = conserto da estufa; `harvest` e `analysis` = tarefas opcionais (colher, analisar). */
type Activity = 'post' | 'gym' | 'bed' | 'task' | 'harvest' | 'analysis' | 'sleep';
const WORK: Activity[] = ['task', 'harvest', 'analysis'];

/**
 * Um passo do caminho: andar até um ponto, virar para os pés da cama (`face`), deitar na cama (`lie`, de pé ao lado
 * dela até deitado nela) ou levantar (`rise`, o contrário).
 */
interface Step {
  kind: 'walk' | 'face' | 'lie' | 'rise';
  to: THREE.Vector3;
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
  /** Tempo já passado no passo de deitar ou levantar (s). */
  stepTime: number;
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
    ROLES.map((r) => [r, { at: 'post', idle: 0, left: 0, station: 0, rested: true, pos: HABITAT_SPOTS[r].clone(), path: [], going: null, placed: false, wasInside: false, stepTime: 0 } as Walker]),
  ) as Record<Role, Walker>;

  constructor(private readonly crew: Crew) {}

  /** Já chegou à estufa para consertar (andando por dentro)? O CrewTasks espera isso para começar o trabalho. */
  arrivedAtTask(r: Role): boolean {
    const w = this.walkers[r];
    return w.wasInside && w.going !== null && WORK.includes(w.going) && w.path.length === 0;
  }

  /** Onde fica cada atividade (para onde ele anda). */
  private spotOf(r: Role, activity: Activity, station: number): THREE.Vector3 {
    if (activity === 'task') return GREENHOUSE_WORK_SPOT;
    if (activity === 'harvest') return HARVEST_WORK_SPOT;
    if (activity === 'analysis') return LAB_WORK_SPOT;
    if (activity === 'gym') return GYM_STATIONS[station].pos;
    if (activity === 'bed' || activity === 'sleep') return BUNK_SPOTS[r];
    return HABITAT_SPOTS[r];
  }

  /** Onde ele fica de pé ao lado da cama: na frente dela, com o quadril em cima do quadril de quem está deitado. */
  private besideBed(r: Role): THREE.Vector3 {
    const hip = Astronaut.lyingHip(BUNK_SPOTS[r]);
    return new THREE.Vector3(hip.x, FLOOR_Y, BESIDE_BED_Z);
  }

  /**
   * Deitando (u de 0 a 1; levantando é o mesmo ao contrário): primeiro deita para trás na frente da cama, com o
   * quadril subindo ou descendo até a altura dela; só no fim entra na cama (z). Devolve o quanto está deitado
   * (0 a 1) e onde fica o quadril.
   */
  private bedPose(r: Role, u: number): { k: number; hip: THREE.Vector3 } {
    const start = Astronaut.standingHip(this.besideBed(r));
    const end = Astronaut.lyingHip(BUNK_SPOTS[r]);
    const upper = BUNK_SPOTS[r].y > FLOOR_Y + BUNK_LEVELS[1];
    const p = upper ? BED_MOVE.upper : BED_MOVE.lower;
    // Deita para trás na frente da cama e vai entrando nela enquanto termina de deitar.
    const lean = THREE.MathUtils.smoothstep(u, 0, p.leanEnd);
    const into = THREE.MathUtils.smoothstep(u, p.intoStart, 1);
    const hip = new THREE.Vector3(
      THREE.MathUtils.lerp(start.x, end.x, u),
      // Na cama de cima, um arco ao entrar: as pernas passam por cima do colchão, não por dentro.
      THREE.MathUtils.lerp(start.y, end.y, lean) + p.arc * Math.sin(Math.PI * into),
      THREE.MathUtils.lerp(start.z, end.z, into),
    );
    return { k: lean, hip };
  }

  /** Onde se anda no corredor central neste x (no alojamento, a faixa da frente). */
  private corridorZ(x: number): number {
    return Math.abs(x - QUARTERS_X) < QUARTERS_INNER ? CORRIDOR_Z + QUARTERS_LANE_Z : CORRIDOR_Z;
  }

  /** Pontos do corredor de um x a outro, entrando e saindo da faixa do alojamento nas portas dele. */
  private corridor(fromX: number, toX: number): THREE.Vector3[] {
    const gates = [
      new THREE.Vector3(QUARTERS_X + QUARTERS_OUTER, FLOOR_Y, CORRIDOR_Z),
      new THREE.Vector3(QUARTERS_X + QUARTERS_INNER, FLOOR_Y, CORRIDOR_Z + QUARTERS_LANE_Z),
      new THREE.Vector3(QUARTERS_X - QUARTERS_INNER, FLOOR_Y, CORRIDOR_Z + QUARTERS_LANE_Z),
      new THREE.Vector3(QUARTERS_X - QUARTERS_OUTER, FLOOR_Y, CORRIDOR_Z),
    ];
    const lo = Math.min(fromX, toX);
    const hi = Math.max(fromX, toX);
    const between = gates.filter((g) => g.x > lo + 0.01 && g.x < hi - 0.01).sort((a, b) => (toX > fromX ? a.x - b.x : b.x - a.x));
    return [
      new THREE.Vector3(fromX, FLOOR_Y, this.corridorZ(fromX)),
      ...between,
      new THREE.Vector3(toX, FLOOR_Y, this.corridorZ(toX)),
    ];
  }

  /**
   * Caminho pelo corredor central: sai do lugar (descendo do beliche, deitado), anda pelo corredor e entra no
   * lugar (subindo no beliche, deitado; ou descendo a escada da estufa). Sempre pelos pontos certos, nunca
   * atravessando cama, casco ou canteiro.
   */
  private route(r: Role, from: THREE.Vector3, to: THREE.Vector3, fromBed: boolean, toBed: boolean, stairIndex: number | null): Step[] {
    const stand = (p: THREE.Vector3): Step => ({ kind: 'walk', to: p.clone() });
    const side = this.besideBed(r);
    const steps: Step[] = [];
    if (fromBed) steps.push({ kind: 'rise', to: side.clone() });
    // Descendo para a estufa: pela escada daquela tarefa (conserto: norte; colheita: sul).
    const stair = stairIndex === null ? null : GREENHOUSE_STAIRS[stairIndex];
    const corridorX = stair ? stair.top.x : to.x;
    steps.push(...this.corridor(from.x, corridorX).map(stand));
    if (stair) steps.push(stand(stair.top), stand(stair.bottom));
    if (toBed) steps.push(stand(side), { kind: 'face', to: side.clone() }, { kind: 'lie', to: to.clone() });
    else steps.push(stand(to));
    // Tira pontos repetidos (já está no corredor, ou o destino fica no corredor). Virar, deitar e levantar ficam.
    return steps.filter((st, i) => st.kind !== 'walk' || st.to.distanceTo(i === 0 ? from : steps[i - 1].to) > 0.05);
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

  /** Saindo da estufa (sobe pela escada mais perto) antes de ir ao corredor. */
  private leaveGreenhouse(from: THREE.Vector3): Step[] {
    if (from.y > FLOOR_Y - 0.3) return [];
    const stair = GREENHOUSE_STAIRS.reduce((a, b) => (a.bottom.distanceTo(from) <= b.bottom.distanceTo(from) ? a : b));
    return [
      { kind: 'walk', to: stair.bottom.clone() },
      { kind: 'walk', to: stair.top.clone() },
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
      const kind = f.insideTaskKind(r);
      const activity: Activity = f.sleeping ? 'sleep'
        : kind === 'harvest' ? 'harvest'
        : kind === 'analysis' ? 'analysis'
        : kind ? 'task'
        : w.at;

      // Mudou de atividade: calcula o caminho até o novo lugar.
      // No meio de deitar ou levantar, termina o movimento antes de mudar de ideia (não pula de pose).
      const midBedMove = (w.path[0]?.kind === 'lie' || w.path[0]?.kind === 'rise') && w.stepTime > 0;
      if (activity !== w.going && !midBedMove) {
        // Na cama de verdade (já deitou)? Quem ainda está andando até ela não precisa levantar.
        const inBed = (w.going === 'bed' || w.going === 'sleep') && w.path.length === 0;
        const toBed = activity === 'bed' || activity === 'sleep';
        // Indo para a cama e continua indo (descanso → sono): segue o mesmo caminho.
        const goingToBed = (w.going === 'bed' || w.going === 'sleep') && w.path.length > 0;
        w.going = activity;
        if (!((inBed || goingToBed) && toBed)) {
          w.path = [...this.leaveGreenhouse(w.pos), ...this.route(r, w.pos, this.spotOf(r, activity, w.station), inBed, toBed, activity === 'task' ? 0 : activity === 'harvest' ? HARVEST_STAIR : null)];
          w.stepTime = 0;
        }
      }

      // Deitando ou levantando: o tempo do passo leva de em pé a deitado (ou o contrário), sem deslizar no ar.
      const bedStep = w.path[0];
      if (bedStep && (bedStep.kind === 'lie' || bedStep.kind === 'rise')) {
        const dur = bedStep.kind === 'lie' ? LIE_DOWN_SECONDS : GET_UP_SECONDS;
        w.stepTime = Math.min(dur, w.stepTime + dt);
        const t = w.stepTime / dur;
        const { k, hip } = this.bedPose(r, bedStep.kind === 'lie' ? t : 1 - t);
        a.lieBlend(k, hip, FLOOR_Y); // os pés nunca entram no chão
        a.idle(dt);
        if (w.stepTime >= dur) {
          w.pos.copy(bedStep.to);
          w.path.shift();
          w.stepTime = 0;
          if (bedStep.kind === 'lie') a.setLying(true);
        } else w.pos.copy(a.root.position);
        continue;
      }
      // Ao lado da cama: vira para os pés dela antes de deitar.
      if (bedStep?.kind === 'face') {
        a.setLying(false);
        a.root.position.copy(w.pos);
        a.faceHeading(FACING_BED_FEET, dt);
        a.idle(dt);
        const left = Math.atan2(Math.sin(FACING_BED_FEET - a.model.rotation.y), Math.cos(FACING_BED_FEET - a.model.rotation.y));
        if (Math.abs(left) < 0.02) w.path.shift();
        continue;
      }

      // Andando: segue o caminho a velocidade constante, virado para onde vai. Onde o teto é baixo (túneis),
      // anda abaixado.
      if (w.path.length) {
        const speed = activity === 'task' ? TASK_WALK_SPEED : f.sleeping ? NIGHT_WALK_SPEED : WALK_SPEED;
        let step = speed * dt;
        let heading = a.model.rotation.y;
        while (step > 0 && w.path.length && w.path[0].kind === 'walk') {
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
        a.setLying(false);
        a.root.position.copy(w.pos);
        a.setMotion(speed, heading, dt);
        a.fitHeadroom(this.headroomAhead(w), dt);
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
      } else if (WORK.includes(activity)) {
        // Trabalhando: de frente para o trabalho (vazamento, plantas ou bancada), nunca para a câmera.
        a.setLying(false);
        a.root.position.copy(w.pos);
        a.faceToward(activity === 'harvest' ? PROBLEM_SPOTS.harvest : activity === 'analysis' ? LAB_BENCH_LOOK : PROBLEM_SPOTS.greenhouseLeak, dt);
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
