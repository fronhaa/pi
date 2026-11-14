import * as THREE from 'three';
import type { Mission } from '@/sim/mission';
import { taskTime } from '@/sim/problems';
import type { Problem } from '@/sim/types';
import type { Crew } from '@/scene/Crew';
import type { CrewMotion } from '@/scene/crewMotion';
import { PROBLEM_SPOTS, type Role } from '@/scene/MarsBase';

/** Distância para começar a trabalhar e para considerar que o astronauta saiu do lugar (m). */
const WORK_RADIUS = 1.6;
const LEAVE_RADIUS = 2.4;
/** Alcance da tecla E: pega o problema aberto mais próximo dentro deste raio. */
const INTERACT_RADIUS = 3;
/** Velocidade de caminhada quando a física não carregou (o jogo segue só com a interface). */
const FALLBACK_SPEED = 2.4;

interface Assignment {
  uid: number;
  phase: 'walking' | 'working';
  /** Alvo dado à física; se mudar, o jogador mandou o astronauta para outro lugar. */
  target?: THREE.Vector3;
  worked: number;
}

/**
 * Tempo da tripulação (GDD): cada astronauta só está num lugar por vez, anda até o problema
 * e trabalha um tempo. Sair do lugar ou receber outra ordem faz perder o progresso.
 * As REGRAS (o que acontece ao resolver ou não) ficam na simulação; aqui só tempo e lugar.
 */
export class CrewTasks {
  private readonly assignments = new Map<Role, Assignment>();
  motion: CrewMotion | null = null;
  onChange: () => void = () => {};
  onResolved: (p: Problem) => void = () => {};

  constructor(
    private readonly mission: () => Mission,
    private readonly crew: Crew,
  ) {}

  /** Quem está trabalhando ou indo para cada problema. */
  workerOf(uid: number): Role | undefined {
    for (const [role, a] of this.assignments) if (a.uid === uid) return role;
    return undefined;
  }

  isWorking(uid: number): boolean {
    const r = this.workerOf(uid);
    return r !== undefined && this.assignments.get(r)!.phase === 'working';
  }

  /** Manda um astronauta para um problema. Um problema tem no máximo um astronauta. */
  assign(role: Role, uid: number): void {
    const p = this.mission().state.problems.find((x) => x.uid === uid);
    if (!p || p.status !== 'open') return;
    const previous = this.workerOf(uid);
    if (previous && previous !== role) this.cancel(previous);
    this.cancel(role);
    const spot = PROBLEM_SPOTS[p.kind];
    // Trabalho que continuou de uma noite de tempestade começa de onde parou.
    const a: Assignment = { uid, phase: 'walking', worked: p.progress * taskTime(p.kind) };
    if (this.distance(role, spot) <= WORK_RADIUS) a.phase = 'working';
    else if (this.motion) a.target = this.motion.moveRole(role, spot);
    this.assignments.set(role, a);
    if (a.phase === 'working') this.motion?.stop(role);
    this.onChange();
  }

  /** Tecla E: o astronauta pega o problema aberto mais perto dele. Retorna se achou algum. */
  interact(role: Role): boolean {
    let best: { uid: number; d: number } | null = null;
    for (const p of this.mission().state.problems) {
      if (p.status !== 'open') continue;
      const d = this.distance(role, PROBLEM_SPOTS[p.kind]);
      if (d <= INTERACT_RADIUS && (!best || d < best.d)) best = { uid: p.uid, d };
    }
    if (!best) return false;
    this.assign(role, best.uid);
    return true;
  }

  cancel(role: Role): void {
    const a = this.assignments.get(role);
    if (!a) return;
    this.assignments.delete(role);
    // Largar o trabalho faz perder o progresso (GDD).
    const p = this.mission().state.problems.find((x) => x.uid === a.uid);
    if (p && p.status !== 'done') this.mission().setProblemProgress(a.uid, 0);
    this.onChange();
  }

  clear(): void {
    this.assignments.clear();
  }

  update(dt: number): void {
    const m = this.mission();
    for (const [role, a] of [...this.assignments]) {
      const p = m.state.problems.find((x) => x.uid === a.uid);
      if (!p || p.status === 'done') {
        this.assignments.delete(role);
        continue;
      }
      const spot = PROBLEM_SPOTS[p.kind];

      if (a.phase === 'walking') {
        if (this.motion) {
          // O jogador deu outra ordem (setas, outro clique) ou a física desistiu: a tarefa é largada.
          if (this.motion.targetOf(role) !== a.target && this.distance(role, spot) > WORK_RADIUS) {
            this.cancel(role);
            continue;
          }
        } else {
          this.walkWithoutPhysics(role, spot, dt);
        }
        if (this.distance(role, spot) <= WORK_RADIUS) {
          a.phase = 'working';
          this.motion?.stop(role);
          this.onChange();
        }
        continue;
      }

      // Trabalhando: se saiu do lugar, perde o progresso.
      if (this.distance(role, spot) > LEAVE_RADIUS) {
        this.cancel(role);
        continue;
      }
      a.worked += dt;
      const progress = Math.min(1, a.worked / taskTime(p.kind));
      m.setProblemProgress(p.uid, progress);
      if (progress >= 1) {
        this.assignments.delete(role);
        m.resolveProblem(p.uid);
        this.onResolved(p);
        this.onChange();
      }
    }
  }

  private distance(role: Role, spot: THREE.Vector3): number {
    const pos = this.crew.members[role].root.position;
    return Math.hypot(pos.x - spot.x, pos.z - spot.z);
  }

  private walkWithoutPhysics(role: Role, spot: THREE.Vector3, dt: number): void {
    const a = this.crew.members[role];
    const pos = a.root.position;
    const dx = spot.x - pos.x;
    const dz = spot.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const step = Math.min(d, FALLBACK_SPEED * dt);
    pos.x += (dx / d) * step;
    pos.z += (dz / d) * step;
    a.setMotion(FALLBACK_SPEED, Math.atan2(-dx, -dz), dt);
  }
}
