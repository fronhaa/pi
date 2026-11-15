import * as THREE from 'three';
import { ROLES, type Role } from '@/sim/crew';
import type { ProblemKind } from '@/sim/types';
import { FACING_OUT_OF_BED, type Crew } from './Crew';
import {
  BED_DEPTH,
  BED_FRONT_Z,
  BED_SPOTS,
  BED_TOP,
  DOME_CENTER,
  BED_ROOMS,
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
  QUARTERS_CENTERS,
  QUARTERS_YAW,
  TUBES,
  bedFeetLocalX,
  headroomAt,
  quartersPoint,
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
/** Túnel sul: da estufa até o primeiro módulo de quartos. */
const QUARTERS_TUBE = TUBES[2];
/** Deitar na cama: sentar na beirada e deitar; levantar: sentar de novo e ficar de pé (s). */
const SIT_DOWN_SECONDS = 0.8;
const LIE_DOWN_SECONDS = 1.4;
const SIT_UP_SECONDS = 1.2;
const STAND_UP_SECONDS = 0.7;
/** Sentado na beirada: o quadril fica um pouco para dentro do colchão (m) e um pouco acima dele. */
const SIT_INTO_BED = 0.15;
const SIT_HIP_ABOVE_MATTRESS = 0.08;
/**
 * Deitando (fração do tempo): até quando o quadril sobe, quando começa a entrar na cama e quando as pernas começam a
 * esticar. Medido com o corpo do chibi (pernas na pose de sentar) nos 4 quartos.
 */
export const BED_LIE = { riseEnd: 0.45, intoStart: 0.2, legsStart: 0.3 };
/** Corredor central: todos os módulos, os túneis e a passarela da cúpula ficam nesta linha (z) e neste piso (y). */
const CORRIDOR_Z = DOME_CENTER.z;
const FLOOR_Y = HABITAT_FLOOR_Y;
/** Quem volta de fora aparece aqui: dentro do laboratório, junto à porta do airlock. */
const DOOR_INSIDE = new THREE.Vector3(HABITAT_POSITION.x, FLOOR_Y, HABITAT_POSITION.z + 0.6);
/**
 * Ao lado da cama, de pé de costas para ela (de frente para o corredor), com o quadril na mesma linha em que ele vai
 * ficar deitado: anda até aqui, vira para o corredor, senta na beirada e deita (Astronaut.bedBlend). No referencial do
 * módulo de quartos (src/scene/base/layout.ts, quartersPoint).
 */
const BESIDE_BED_GAP = 0.5;
const BESIDE_BED_LZ = BED_FRONT_Z + BESIDE_BED_GAP;
/** Quadril do boneco deitado, no referencial do módulo: 0,55 m antes dos pés, para o lado do travesseiro (−x). */
const LYING_HIP_LOCAL = 0.55;
/** Centro da cama (profundidade, no referencial do módulo). */
const BED_Z_LOCAL = BED_FRONT_Z - BED_DEPTH / 2;
/** De costas para a cama, no mundo (os quartos ficam num módulo girado). */
const FACING_OUT = FACING_OUT_OF_BED + QUARTERS_YAW;
/**
 * Raio sul (quartos): o corredor é o eixo dos dois módulos (x do centro deles), do túnel até a ponta do segundo.
 * Camas, armários e divisórias ficam atrás de ROOM_FURNITURE_FRONT_Z, então quem passa anda reto.
 */
const SOUTH_AXIS_X = QUARTERS_CENTERS[0].x;
const SOUTH_END_Z = QUARTERS_CENTERS[QUARTERS_CENTERS.length - 1].z + MODULE_FLOOR_LENGTH / 2;
/** Olha o teto até esta distância à frente (m), para já chegar abaixado na boca do túnel. */
const HEADROOM_LOOKAHEAD = 0.8;
/** Parado no posto, olha às vezes para um colega a até esta distância (m). */
const COLLEAGUE_LOOK_DISTANCE = 3.5;

/** Passos na cama (sentar, deitar, sentar de novo, levantar): têm tempo e não são interrompidos no meio. */
const BED_STEPS: readonly string[] = ['sit', 'lie', 'rise', 'stand'];

/** O que a rotina precisa saber do jogo a cada frame. */
export interface RoutineFrame {
  /** Manhã ou dia: acordados. */
  awake: boolean;
  /** Noite normal: dormem na cama do seu quarto. Na noite de tempestade (abrigo), ninguém aparece no habitat. */
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
  kind: 'walk' | 'face' | 'sit' | 'lie' | 'rise' | 'stand';
  to: THREE.Vector3;
}

interface Walker {
  at: 'post' | 'gym' | 'bed';
  idle: number;
  left: number;
  station: number;
  /**
   * Descansado? Só vai à academia quem estava descansando (no posto ou na cama). Quem volta de uma missão lá
   * fora ou de um conserto vai primeiro descansar na cama do seu quarto.
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
 * - Sem ordem há um tempo: academia (esteira ou bicicleta), depois descansa no seu quarto e volta ao posto.
 * - Noite normal: anda até o seu quarto, senta na beirada da cama e deita. Noite de tempestade (abrigo) e câmara de descompressão: some.
 * Entre um lugar e outro, ele ANDA pelo corredor central (módulos, túneis e a passarela da cúpula), nunca
 * some de um módulo e aparece em outro. Quem volta de fora entra pela porta do laboratório.
 *
 * Para onde olha (GDD, "Para onde o astronauta olha"): ninguém encara a câmera. Andando, para onde anda;
 * consertando ou na academia, para a tarefa; parado no posto, para a estação do módulo e às vezes um colega.
 * Tocado e sem ordem, vira para quem controla por um tempo (Game.select → Astronaut.lookAt).
 */
export class CrewRoutine {
  /** Primeira vez que alguém vai à academia (o jogo mostra o fato da NASA sobre exercício). */
  onFirstExercise: (role: Role) => void = () => {};
  private exerciseShown = false;
  /** Primeira vez que alguém chega para trabalhar na estufa (o jogo mostra o fato da estufa inflável da NASA). */
  onFirstGreenhouse: (role: Role) => void = () => {};
  private greenhouseShown = false;
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
    if (activity === 'bed' || activity === 'sleep') return BED_SPOTS[r];
    return HABITAT_SPOTS[r];
  }

  /** Onde ele fica de pé ao lado da cama: na frente dela, com o quadril na linha em que vai ficar deitado. */
  private besideBed(r: Role): THREE.Vector3 {
    return quartersPoint(BED_ROOMS[r].module, bedFeetLocalX(r) - LYING_HIP_LOCAL, FLOOR_Y, BESIDE_BED_LZ);
  }

  /**
   * Na cama, de 0 a 1 em cada fase (levantar é o mesmo ao contrário): `sit` = de pé de costas para a cama até sentado
   * na beirada; `lie` = de sentado até deitado com a cabeça no travesseiro (vai deitando para trás e pondo as pernas na
   * cama). Devolve o quanto está deitado (k), o quanto está sentado e onde fica o quadril. As contas são no referencial
   * do módulo de quartos (lz = profundidade: o fundo do quarto em −z).
   */
  private bedPose(r: Role, phase: 'sit' | 'lie', u: number): { k: number; sit: number; hip: THREE.Vector3 } {
    const e = THREE.MathUtils.smootherstep(u, 0, 1);
    const m = BED_ROOMS[r].module;
    const lx = bedFeetLocalX(r) - LYING_HIP_LOCAL;
    const standY = FLOOR_Y + LYING_HIP_LOCAL;
    const seatY = FLOOR_Y + BED_TOP + SIT_HIP_ABOVE_MATTRESS;
    const seatZ = BED_FRONT_Z - SIT_INTO_BED;
    const lieY = BED_SPOTS[r].y;
    if (phase === 'sit') return { k: 0, sit: e, hip: quartersPoint(m, lx, THREE.MathUtils.lerp(standY, seatY, e), THREE.MathUtils.lerp(BESIDE_BED_LZ, seatZ, e)) };
    // Deitando: o quadril sobe cedo (as costas não entram no colchão), entra na cama aos poucos e as pernas só esticam
    // no fim, já em cima da cama.
    const L = BED_LIE;
    const y = THREE.MathUtils.lerp(seatY, lieY, THREE.MathUtils.smoothstep(u, 0, L.riseEnd));
    const z = THREE.MathUtils.lerp(seatZ, BED_Z_LOCAL, THREE.MathUtils.smootherstep(u, L.intoStart, 1));
    return { k: e, sit: 1 - THREE.MathUtils.smoothstep(u, L.legsStart, 1), hip: quartersPoint(m, lx, y, z) };
  }

  /** Está no raio sul (o corredor dos quartos ou o túnel até eles)? */
  private inSouth(p: THREE.Vector3): boolean {
    return p.z > QUARTERS_TUBE.from.z - 0.3 && Math.abs(p.x - SOUTH_AXIS_X) < 2.6 && p.z < SOUTH_END_Z + 0.5;
  }

  /** Ponto no eixo do raio sul (o corredor dos quartos). */
  private southAxis(z: number): THREE.Vector3 {
    return new THREE.Vector3(SOUTH_AXIS_X, FLOOR_Y, z);
  }

  /**
   * Caminho pelo corredor central: sai do lugar (levantando da cama: senta e fica de pé), anda pelo corredor e entra
   * no lugar (deitando: de costas para a cama, senta na beirada e deita; ou descendo a escada da estufa). Os quartos
   * ficam no raio sul: de lá até o corredor leste-oeste, pelo eixo dos módulos de quartos, pelo túnel e pelo braço sul
   * da passarela. Sempre pelos pontos certos, nunca atravessando cama, casco ou canteiro.
   */
  private route(r: Role, from: THREE.Vector3, to: THREE.Vector3, fromBed: boolean, toBed: boolean, stairIndex: number | null): Step[] {
    const walk = (p: THREE.Vector3): Step => ({ kind: 'walk', to: p.clone() });
    const side = this.besideBed(r);
    const steps: Step[] = [];
    if (fromBed) steps.push({ kind: 'rise', to: side.clone() }, { kind: 'stand', to: side.clone() });
    const start = fromBed ? side : from;
    const target = toBed ? side : to;
    const fromS = this.inSouth(start);
    const toS = this.inSouth(target);
    // Descendo para a estufa: pela escada daquela tarefa (conserto: norte; colheita: sul).
    const stair = stairIndex === null ? null : GREENHOUSE_STAIRS[stairIndex];
    if (fromS && toS) {
      // Dentro do raio sul: direto pelo eixo.
      steps.push(walk(this.southAxis(start.z)), walk(this.southAxis(target.z)));
    } else {
      if (fromS) steps.push(walk(this.southAxis(start.z)), walk(this.southAxis(QUARTERS_TUBE.to.z)), walk(this.southAxis(QUARTERS_TUBE.from.z)));
      const fromX = fromS ? SOUTH_AXIS_X : start.x;
      const toX = toS ? SOUTH_AXIS_X : stair ? stair.top.x : to.x;
      steps.push(walk(new THREE.Vector3(fromX, FLOOR_Y, CORRIDOR_Z)), walk(new THREE.Vector3(toX, FLOOR_Y, CORRIDOR_Z)));
      if (toS) steps.push(walk(this.southAxis(QUARTERS_TUBE.from.z)), walk(this.southAxis(QUARTERS_TUBE.to.z)), walk(this.southAxis(target.z)));
      if (stair) steps.push(walk(stair.top), walk(stair.bottom));
    }
    if (toBed) steps.push(walk(side), { kind: 'face', to: side.clone() }, { kind: 'sit', to: side.clone() }, { kind: 'lie', to: to.clone() });
    else steps.push(walk(to));
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
          // Voltou de uma missão ou de um conserto: primeiro descansa na cama (nada de ir direto à academia).
          w.at = 'bed';
          w.left = ROUTINE_REST_SECONDS;
        } else if (w.idle >= ROUTINE_IDLE_SECONDS && free >= 0) {
          w.at = 'gym';
          w.station = free;
          w.left = ROUTINE_GYM_SECONDS;
          // Primeira vez na partida: o fato real da NASA sobre exercício (F9).
          if (!this.exerciseShown) this.onFirstExercise(r);
          this.exerciseShown = true;
        }
      } else if (!w.path.length) {
        w.left -= dt;
        if (w.left <= 0 && w.at === 'gym') {
          w.at = 'bed';
          w.left = ROUTINE_REST_SECONDS;
        } else if (w.left <= 0) {
          // Descansou na cama.
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
      // Já começou a sentar (ou está deitado/sentado com passos pela frente): termina a sequência antes de mudar.
      const nextKind = w.path[0]?.kind ?? 'walk';
      const midBedMove = BED_STEPS.includes(nextKind) && !(nextKind === 'sit' && w.stepTime === 0);
      if (activity !== w.going && !midBedMove) {
        // Na cama de verdade (já deitou)? Quem ainda está andando até ela não precisa levantar.
        const inBed = (w.going === 'bed' || w.going === 'sleep') && w.path.length === 0;
        const toBed = activity === 'bed' || activity === 'sleep';
        // Indo para a cama e continua indo (descanso → sono): segue o mesmo caminho.
        const goingToBed = (w.going === 'bed' || w.going === 'sleep') && w.path.length > 0;
        w.going = activity;
        if (!((inBed || goingToBed) && toBed)) {
          const leave = this.leaveGreenhouse(w.pos);
          const start = leave.length ? leave[leave.length - 1].to : w.pos;
          w.path = [...leave, ...this.route(r, start, this.spotOf(r, activity, w.station), inBed, toBed, activity === 'task' ? 0 : activity === 'harvest' ? HARVEST_STAIR : null)];
          w.stepTime = 0;
        }
      }

      // Na cama: sentar, deitar, sentar de novo e levantar, cada um no seu tempo, sem pular nem deslizar deitado.
      const bedStep = w.path[0];
      if (bedStep && BED_STEPS.includes(bedStep.kind)) {
        const dur = { sit: SIT_DOWN_SECONDS, lie: LIE_DOWN_SECONDS, rise: SIT_UP_SECONDS, stand: STAND_UP_SECONDS, walk: 0, face: 0 }[bedStep.kind];
        w.stepTime = Math.min(dur, w.stepTime + dt);
        const t = w.stepTime / dur;
        // `rise` é `lie` ao contrário; `stand` é `sit` ao contrário.
        const phase = bedStep.kind === 'sit' || bedStep.kind === 'stand' ? 'sit' : 'lie';
        const forward = bedStep.kind === 'sit' || bedStep.kind === 'lie';
        const { k, sit, hip } = this.bedPose(r, phase, forward ? t : 1 - t);
        a.bedBlend(k, sit, hip, FLOOR_Y, dt, QUARTERS_YAW); // os pés nunca entram no chão
        if (w.stepTime >= dur) {
          w.path.shift();
          w.stepTime = 0;
          if (bedStep.kind === 'lie') {
            a.setLying(true, QUARTERS_YAW);
            w.pos.copy(BED_SPOTS[r]);
          } else if (bedStep.kind === 'stand') {
            a.bedBlend(0, 0, hip, FLOOR_Y, 0, QUARTERS_YAW);
            a.setLying(false);
            a.model.rotation.set(0, FACING_OUT, 0);
            w.pos.copy(bedStep.to);
          } else w.pos.copy(a.root.position);
        } else w.pos.copy(a.root.position);
        continue;
      }
      // Ao lado da cama: vira de costas para ela (de frente para o corredor) antes de sentar.
      if (bedStep?.kind === 'face') {
        a.setLying(false);
        a.root.position.copy(w.pos);
        a.faceHeading(FACING_OUT, dt);
        a.idle(dt);
        const left = Math.atan2(Math.sin(FACING_OUT - a.model.rotation.y), Math.cos(FACING_OUT - a.model.rotation.y));
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
        a.root.position.copy(BED_SPOTS[r]);
        a.setLying(true, QUARTERS_YAW);
        a.idle(dt);
      } else if (activity === 'gym') {
        const st = GYM_STATIONS[w.station];
        a.setLying(false);
        a.root.position.copy(st.pos);
        a.faceHeading(st.heading, dt);
        a.exercise(st.clip, st.speed, dt);
      } else if (WORK.includes(activity)) {
        if ((activity === 'task' || activity === 'harvest') && !this.greenhouseShown) {
          this.greenhouseShown = true;
          this.onFirstGreenhouse(r);
        }
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
