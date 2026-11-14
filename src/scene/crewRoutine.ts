import type * as THREE from 'three';
import { ROLES, type Role } from '@/sim/crew';
import type { Crew } from './Crew';
import { BUNK_SPOTS, GREENHOUSE_WORK_SPOT, GYM_STATIONS, HABITAT_SPOTS } from './base/layout';

/** Rotina visual dentro da base (GDD, "Atividades dentro da base", B): segundos sem ordem até ir à academia, de exercício e de descanso. */
const ROUTINE_IDLE_SECONDS = 8;
const ROUTINE_GYM_SECONDS = 20;
const ROUTINE_REST_SECONDS = 12;

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

/**
 * Quem está dentro aparece pelo casco translúcido. A física não cuida de quem está dentro, então a
 * posição, a pose e a animação são daqui. Só cena: nenhuma regra muda.
 * - Com tarefa de dentro: na estufa, consertando.
 * - Sem ordem há um tempo: academia (esteira ou bicicleta), depois descansa no beliche e volta ao posto.
 * - Noite normal: dorme na sua cama do beliche. Noite de tempestade (abrigo) e câmara de descompressão: some.
 */
export class CrewRoutine {
  /** Primeira vez que alguém vai à academia (o jogo mostra o fato da NASA sobre exercício). */
  onFirstExercise: () => void = () => {};
  private exerciseShown = false;
  private readonly routine = Object.fromEntries(
    ROLES.map((r) => [r, { at: 'post' as 'post' | 'gym' | 'bed', idle: 0, left: 0, station: 0 }]),
  ) as Record<Role, { at: 'post' | 'gym' | 'bed'; idle: number; left: number; station: number }>;

  constructor(private readonly crew: Crew) {}

  update(dt: number, f: RoutineFrame): void {
    for (const r of ROLES) {
      const a = this.crew.members[r];
      const rt = this.routine[r];
      if (f.isOutside(r)) {
        rt.at = 'post';
        rt.idle = 0;
        a.setLying(false);
        continue;
      }
      const inHabitat = f.inHabitat(r) && (f.awake || f.sleeping);
      a.root.visible = inHabitat;
      if (!inHabitat) continue;

      if (f.sleeping || f.onInsideTask(r) || f.alert) {
        rt.at = 'post';
        rt.idle = 0;
      } else if (rt.at === 'post') {
        rt.idle += dt;
        const used = ROLES.filter((o) => o !== r && this.routine[o].at === 'gym').map((o) => this.routine[o].station);
        const free = GYM_STATIONS.findIndex((_, i) => !used.includes(i));
        if (rt.idle >= ROUTINE_IDLE_SECONDS && free >= 0) {
          rt.at = 'gym';
          rt.station = free;
          rt.left = ROUTINE_GYM_SECONDS;
          // Primeira vez na partida: o fato real da NASA sobre exercício (F9).
          if (!this.exerciseShown) this.onFirstExercise();
          this.exerciseShown = true;
        }
      } else {
        rt.left -= dt;
        if (rt.left <= 0 && rt.at === 'gym') {
          rt.at = 'bed';
          rt.left = ROUTINE_REST_SECONDS;
        } else if (rt.left <= 0) {
          rt.at = 'post';
          rt.idle = 0;
        }
      }

      if (f.sleeping || rt.at === 'bed') {
        a.root.position.copy(BUNK_SPOTS[r]);
        a.setLying(true);
        a.idle(dt);
      } else if (rt.at === 'gym') {
        const st = GYM_STATIONS[rt.station];
        a.setLying(false);
        a.root.position.copy(st.pos);
        a.face(st.heading);
        a.exercise(st.speed, dt);
      } else {
        a.setLying(false);
        a.root.position.copy(f.onInsideTask(r) ? GREENHOUSE_WORK_SPOT : HABITAT_SPOTS[r]);
        a.faceCamera(f.camera);
        a.idle(dt);
      }
    }
  }
}
