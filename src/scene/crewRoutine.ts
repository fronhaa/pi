import * as THREE from 'three';
import { ROLES, type Role } from '@/sim/crew';
import type { Crew } from './Crew';
import { BUNK_SPOTS, DOME_CENTER, GREENHOUSE_WORK_SPOT, GYM_STATIONS, HABITAT_FLOOR_Y, HABITAT_POSITION, HABITAT_SPOTS } from './base/layout';

/** Rotina visual dentro da base (GDD, "Atividades dentro da base", B): segundos sem ordem até ir à academia, de exercício e de descanso. */
const ROUTINE_IDLE_SECONDS = 8;
const ROUTINE_GYM_SECONDS = 20;
const ROUTINE_REST_SECONDS = 12;
/** Andar dentro da base (m/s): devagar de dia, mais rápido à noite (indo dormir). */
const WALK_SPEED = 1.3;
const NIGHT_WALK_SPEED = 2.2;
/** Indo consertar a estufa: apressado (o conserto só começa quando ele chega). */
const TASK_WALK_SPEED = 2.4;
/** Corredor central: todos os módulos, os túneis e a passarela da cúpula ficam nesta linha (z) e neste piso (y). */
const CORRIDOR_Z = DOME_CENTER.z;
const FLOOR_Y = HABITAT_FLOOR_Y;
/** Quem volta de fora aparece aqui: dentro do laboratório, junto à porta do airlock. */
const DOOR_INSIDE = new THREE.Vector3(HABITAT_POSITION.x, FLOOR_Y, HABITAT_POSITION.z + 0.6);
/** Ao lado da cama: anda até aqui e então deita (a cama fica no fundo do módulo). */
const BESIDE_BED_Z = CORRIDOR_Z + 0.25;

/** O que a rotina precisa saber do jogo a cada frame. */
export interface RoutineFrame {
  /** Manhã ou dia: acordados. */
  awake: boolean;
  /** Noite normal: dormem no beliche. Na noite de tempestade (abrigo), ninguém aparece no habitat. */
  sleeping: boolean;
  /** Alerta de tempestade: ficam no posto. */
  alert: boolean;
  camera: THREE.Vector3;
  /** A física cuida dele (está lá fora)? Então a rotina não mexe. */
  isOutside(role: Role): boolean;
  /** Está dentro do habitat (não na câmara de descompressão)? */
  inHabitat(role: Role): boolean;
  /** Está consertando um problema de dentro (a estufa)? */
  onInsideTask(role: Role): boolean;
}

type Activity = 'post' | 'gym' | 'bed' | 'task' | 'sleep';

interface Walker {
  at: 'post' | 'gym' | 'bed';
  idle: number;
  left: number;
  station: number;
  /** Onde está agora, o caminho que falta e para qual atividade ele está indo. */
  pos: THREE.Vector3;
  path: THREE.Vector3[];
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
 */
export class CrewRoutine {
  /** Primeira vez que alguém vai à academia (o jogo mostra o fato da NASA sobre exercício). */
  onFirstExercise: () => void = () => {};
  private exerciseShown = false;
  private readonly walkers = Object.fromEntries(
    ROLES.map((r) => [r, { at: 'post', idle: 0, left: 0, station: 0, pos: HABITAT_SPOTS[r].clone(), path: [], going: null, placed: false, wasInside: false } as Walker]),
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

  /** Para a cama: primeiro fica de pé ao lado dela, depois sobe e deita (sem pular). */
  private besideBed(r: Role): THREE.Vector3 {
    return new THREE.Vector3(BUNK_SPOTS[r].x, FLOOR_Y, BESIDE_BED_Z);
  }

  /** Caminho pelo corredor central: sai para o corredor, anda por ele e entra no lugar. */
  private route(from: THREE.Vector3, to: THREE.Vector3, leaving?: THREE.Vector3, arriving?: THREE.Vector3): THREE.Vector3[] {
    const path = [
      ...(leaving ? [leaving.clone()] : []),
      new THREE.Vector3(from.x, FLOOR_Y, CORRIDOR_Z),
      new THREE.Vector3(to.x, FLOOR_Y, CORRIDOR_Z),
      ...(arriving ? [arriving.clone()] : []),
      to.clone(),
    ];
    // Tira pontos repetidos (já está no corredor, ou o destino fica no corredor).
    return path.filter((p, i) => p.distanceTo(i === 0 ? from : path[i - 1]) > 0.05);
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
      // Acabou de aparecer dentro: no começo do jogo já está no posto; depois, entra pela porta do laboratório.
      if (!w.wasInside) {
        w.wasInside = true;
        w.path = [];
        w.going = null;
        if (w.placed) w.pos.copy(DOOR_INSIDE);
        w.placed = true;
      }

      // Rotina: o que ele quer fazer agora (igual a antes; só que agora ele anda até lá).
      if (f.sleeping || f.onInsideTask(r) || f.alert) {
        w.at = 'post';
        w.idle = 0;
      } else if (w.at === 'post') {
        // O relógio do "sem ordem" só corre quando ele já chegou ao posto.
        if (!w.path.length) w.idle += dt;
        const used = ROLES.filter((o) => o !== r && this.walkers[o].at === 'gym').map((o) => this.walkers[o].station);
        const free = GYM_STATIONS.findIndex((_, i) => !used.includes(i));
        if (w.idle >= ROUTINE_IDLE_SECONDS && free >= 0) {
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
          w.at = 'post';
          w.idle = 0;
        }
      }
      const activity: Activity = f.sleeping ? 'sleep' : f.onInsideTask(r) ? 'task' : w.at;

      // Mudou de atividade: calcula o caminho até o novo lugar.
      if (activity !== w.going) {
        const fromBed = w.going === 'bed' || w.going === 'sleep';
        const toBed = activity === 'bed' || activity === 'sleep';
        w.going = activity;
        w.path = toBed && fromBed ? [] : this.route(w.pos, this.spotOf(r, activity, w.station), fromBed ? this.besideBed(r) : undefined, toBed ? this.besideBed(r) : undefined);
      }

      // Andando: segue o caminho a velocidade constante, virado para onde vai.
      if (w.path.length) {
        const speed = activity === 'task' ? TASK_WALK_SPEED : f.sleeping ? NIGHT_WALK_SPEED : WALK_SPEED;
        let step = speed * dt;
        let heading = a.model.rotation.y;
        while (step > 0 && w.path.length) {
          const next = w.path[0];
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
        continue;
      }

      // Chegou: a pose do lugar.
      if (activity === 'sleep' || activity === 'bed') {
        a.root.position.copy(BUNK_SPOTS[r]);
        a.setLying(true);
        a.idle(dt);
      } else if (activity === 'gym') {
        const st = GYM_STATIONS[w.station];
        a.setLying(false);
        a.root.position.copy(st.pos);
        a.face(st.heading);
        a.exercise(st.speed, dt);
      } else {
        a.setLying(false);
        a.root.position.copy(w.pos);
        a.faceCamera(f.camera);
        a.idle(dt);
      }
    }
  }
}
