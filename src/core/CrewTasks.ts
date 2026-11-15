import * as THREE from 'three';
import type { MissionPort } from './session';
import { CONFIG } from '@/sim/config';
import { taskTime } from '@/sim/problems';
import { needsEva, planEva } from '@/sim/eva';
import type { Problem } from '@/sim/types';
import type { Crew } from '@/scene/Crew';
import { ROLES, type Role } from '@/sim/crew';
import type { CrewMotion } from '@/scene/crewMotion';
import { ENTRANCES, PROBLEM_SPOTS } from '@/scene/base/layout';

/** Distância para começar a trabalhar e para considerar que o astronauta saiu do lugar (m). */
const WORK_RADIUS = 1.6;
const LEAVE_RADIUS = 2.4;
/** Alcance da tecla E: pega o problema aberto mais próximo dentro deste raio. */
const INTERACT_RADIUS = 3;
/** Velocidade de caminhada quando a física não carregou (o jogo segue só com a interface). */
const FALLBACK_SPEED = 2.4;
/** Andar pelos corredores até um problema de dentro (s). Valor de jogo. */
const INSIDE_WALK_SECONDS = 2;
/** Andando de verdade até a estufa (src/scene/crewRoutine.ts): começa ao chegar, mas espera no máximo isto (s). */
const INSIDE_WALK_MAX_SECONDS = 8;
/** Depois de consertar, a dupla volta logo; parada lá fora sem tarefa, volta depois disto (s). */
const RETURN_AFTER_DONE = 0.8;
const RETURN_WHEN_IDLE = 12;
/** O parceiro da EVA fica a esta distância de quem trabalha (m). */
const BUDDY_DISTANCE = 2.2;
const RETURN_SPEED = 3;
/** A porta da EVA: a escotilha do habitat, com a câmara de descompressão. */
const DOOR = ENTRANCES.habitat;

/**
 * Onde está cada astronauta. `airlockOut`/`airlockIn` = na câmara de descompressão (escondido),
 * saindo ou voltando; `returning` = lá fora, andando de volta para a porta.
 */
type Place = 'inside' | 'airlockOut' | 'outside' | 'returning' | 'airlockIn';
/** O que a interface mostra. */
export type CrewPlace = 'inside' | 'airlock' | 'outside';
export type SendResult = 'ok' | 'storm' | 'full' | 'nobody';

interface Assignment {
  uid: number;
  phase: 'walking' | 'working';
  /** Alvo dado à física; se mudar, o jogador mandou o astronauta para outro lugar. */
  target?: THREE.Vector3;
  worked: number;
  /** Problema de dentro: segundos de corredor até o local. */
  insideLeft?: number;
}

/**
 * Tempo da tripulação e EVA (GDD, "EVA: sair da base"). A tripulação fica DENTRO por padrão.
 * Problema de dentro: alguém de dentro conserta sem sair. Problema de fora: sai uma dupla (EVA),
 * passa pela câmara de descompressão, conserta e volta sozinha. No máximo uma dupla fora;
 * com a EVA proibida (tempestade hoje), ninguém sai. Largar o trabalho perde o progresso.
 * As REGRAS (quem pode sair, o que acontece ao resolver) ficam na simulação (src/sim/eva.ts,
 * src/sim/actions.ts); aqui só tempo e lugar. Fala com a missão por uma MissionPort (solo ou grupo).
 */
export class CrewTasks {
  private readonly assignments = new Map<Role, Assignment>();
  private readonly places = {} as Record<Role, Place>;
  /** Segundos que faltam na câmara de descompressão. */
  private readonly airlockLeft = new Map<Role, number>();
  /** Dupla em EVA, até os dois voltarem para dentro. */
  private eva: { pair: [Role, Role]; idle: number; returnAfter: number } | null = null;
  private buddyRepath = 0;
  motion: CrewMotion | null = null;
  onChange: () => void = () => {};
  onResolved: (p: Problem) => void = () => {};
  onEvaStart: (pair: [Role, Role]) => void = () => {};
  onEvaReturn: () => void = () => {};
  /** A dupla inteira voltou para dentro (a EVA acabou). Modo em grupo: avisa o servidor. */
  onEvaEnd: () => void = () => {};

  // ---------- modo em grupo (docs/servidor-coop.md, "EVA no modo em grupo") ----------
  /** Escolhe o parceiro da EVA entre os livres. Sem isso, o primeiro livre. */
  pickBuddy: ((free: Role[], leader: Role) => Role | undefined) | null = null;
  /**
   * A cena diz se o astronauta já chegou à estufa andando por dentro (com a física carregada). Sem isso,
   * vale o tempo fixo de corredor (INSIDE_WALK_SECONDS).
   */
  insideArrived: ((role: Role) => boolean) | null = null;
  /** Há uma dupla lá fora comandada por OUTRO jogador: ninguém daqui sai (máximo uma dupla). */
  remoteEva = false;

  constructor(
    private readonly mission: () => MissionPort,
    private readonly crew: Crew,
  ) {
    this.clear();
  }

  /** A física carregou: todos que estão dentro somem; quem está numa EVA sai pela porta. */
  attachMotion(motion: CrewMotion): void {
    this.motion = motion;
    motion.forceInside();
    for (const role of ROLES) {
      const p = this.places[role];
      if (p === 'outside' || p === 'returning') motion.exit(role, DOOR);
      if (p === 'returning') motion.enter(role, DOOR, RETURN_SPEED, () => this.arrivedInside(role));
      const a = this.assignments.get(role);
      if (a) a.target = undefined;
    }
  }

  placeOf(role: Role): CrewPlace {
    const p = this.places[role];
    return p === 'inside' ? 'inside' : p === 'airlockOut' || p === 'airlockIn' ? 'airlock' : 'outside';
  }

  get outsideCount(): number {
    return ROLES.filter((r) => this.places[r] !== 'inside').length;
  }

  get evaActive(): boolean {
    return this.eva !== null;
  }

  /** Quem está trabalhando ou indo para cada problema. */
  workerOf(uid: number): Role | undefined {
    for (const [role, a] of this.assignments) if (a.uid === uid) return role;
    return undefined;
  }

  /** Este astronauta está parado consertando algo (não andando nem na câmara)? */
  isRoleWorking(role: Role): boolean {
    return this.assignments.get(role)?.phase === 'working' && this.places[role] !== 'airlockOut';
  }

  /** Tem uma ordem (problema ou tarefa) agora? */
  hasTask(role: Role): boolean {
    return this.assignments.has(role);
  }

  /** Está cuidando de um problema de dentro (a estufa)? A cena usa para mostrar onde ele está. */
  onInsideTask(role: Role): boolean {
    const a = this.assignments.get(role);
    const p = a && this.mission().state.problems.find((x) => x.uid === a.uid);
    return !!p && !needsEva(p.kind);
  }

  isWorking(uid: number): boolean {
    const r = this.workerOf(uid);
    return r !== undefined && this.assignments.get(r)!.phase === 'working';
  }

  /** Fase de quem cuida do problema, para a lista do dia. */
  phaseOf(uid: number): 'airlock' | 'walking' | 'working' | undefined {
    const r = this.workerOf(uid);
    if (!r) return undefined;
    if (this.places[r] === 'airlockOut') return 'airlock';
    return this.assignments.get(r)!.phase;
  }

  /**
   * Manda resolver um problema. De dentro: vai quem foi escolhido, se está dentro; senão, alguém livre.
   * De fora: começa uma EVA em dupla (o escolhido e um parceiro), ou usa a dupla que já está fora.
   */
  assign(role: Role, uid: number): SendResult {
    const p = this.mission().state.problems.find((x) => x.uid === uid);
    if (!p || p.status !== 'open') return 'ok';
    return needsEva(p.kind) ? this.assignOutside(role, p) : this.assignInside(role, p);
  }

  private assignInside(role: Role, p: Problem): SendResult {
    const who = this.places[role] === 'inside' ? role : this.freeInside()[0];
    if (!who) return 'nobody';
    this.start(who, p);
    return 'ok';
  }

  private assignOutside(role: Role, p: Problem): SendResult {
    const banned = this.mission().evaBanned;
    if (this.eva && !banned && !this.remoteEva) {
      const pair = this.eva.pair;
      // Outro astronauta não pode sair: já tem uma dupla lá fora (máximo 2). Se ela estiver livre, é ela que vai.
      if (!pair.includes(role) && pair.some((r) => this.assignments.get(r)?.phase === 'working')) return 'full';
      const who = pair.includes(role) ? role : (pair.find((r) => this.assignments.has(r)) ?? pair[0]);
      // Um trabalho por dupla: a dupla anda junta.
      for (const r of pair) if (r !== who) this.cancel(r);
      for (const r of pair) this.goOut(r);
      this.start(who, p);
      this.eva.idle = 0;
      this.eva.returnAfter = RETURN_WHEN_IDLE;
      return 'ok';
    }
    // EVA nova: a regra de quem pode sair é da simulação (src/sim/eva.ts).
    const plan = planEva({ banned, pairBusy: this.remoteEva, free: this.freeInside(), chosen: role, pickBuddy: this.pickBuddy ?? undefined });
    if (!plan.ok) return plan.reason;
    const [leader, buddy] = plan.pair;
    this.eva = { pair: [leader, buddy], idle: 0, returnAfter: RETURN_WHEN_IDLE };
    this.goOut(leader);
    this.goOut(buddy);
    this.start(leader, p);
    this.onEvaStart([leader, buddy]);
    return 'ok';
  }

  /** Botão "Voltar para dentro": a dupla larga o que fazia e volta. */
  returnNow(): void {
    if (!this.eva) return;
    for (const r of this.eva.pair) this.cancel(r);
    this.returnInside();
  }

  /** Tecla E: dentro, pega um problema de dentro; lá fora, o problema aberto mais perto. */
  interact(role: Role): boolean {
    const open = this.mission().state.problems.filter((p) => p.status === 'open');
    if (this.places[role] === 'inside') {
      const p = open.find((x) => !needsEva(x.kind));
      if (!p) return false;
      this.assign(role, p.uid);
      return true;
    }
    let best: { uid: number; d: number } | null = null;
    for (const p of open) {
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
    if (p && p.status !== 'done') this.mission().dispatch({ type: 'problemProgress', uid: a.uid, progress: 0 });
    this.onChange();
  }

  /**
   * Modo em grupo: lugar de um astronauta comandado por OUTRO jogador (vem do servidor).
   * Larga qualquer tarefa local dele; a cena (Game) faz ele sair ou entrar pela porta.
   */
  setRemotePlace(role: Role, place: CrewPlace): void {
    const next: Place = place === 'inside' ? 'inside' : place === 'airlock' ? 'airlockIn' : 'outside';
    if (this.places[role] === next) return;
    this.assignments.delete(role);
    this.airlockLeft.delete(role);
    this.places[role] = next;
    this.onChange();
  }

  /** Fim do dia: todos contam como dentro (a cena leva quem estava fora até a porta). */
  clear(): void {
    this.assignments.clear();
    this.airlockLeft.clear();
    this.eva = null;
    for (const r of ROLES) this.places[r] = 'inside';
  }

  update(dt: number): void {
    this.updateAirlock(dt);
    this.updateAssignments(dt);
    this.updateEva(dt);
  }

  // ---------- partes ----------

  private freeInside(): Role[] {
    return ROLES.filter((r) => this.places[r] === 'inside' && !this.assignments.has(r));
  }

  private start(who: Role, p: Problem): void {
    const previous = this.workerOf(p.uid);
    if (previous && previous !== who) this.cancel(previous);
    this.cancel(who);
    // Trabalho que continuou de uma noite de tempestade começa de onde parou.
    const a: Assignment = { uid: p.uid, phase: 'walking', worked: p.progress * taskTime(p.kind) };
    if (!needsEva(p.kind)) a.insideLeft = INSIDE_WALK_SECONDS;
    this.assignments.set(who, a);
    if (needsEva(p.kind) && this.places[who] === 'outside') this.beginWalk(who, a);
    this.onChange();
  }

  /** Vai para fora: de dentro, entra na câmara; voltando, dá meia-volta. */
  private goOut(role: Role): void {
    const p = this.places[role];
    if (p === 'inside' || p === 'airlockIn') {
      this.places[role] = 'airlockOut';
      this.airlockLeft.set(role, CONFIG.problems.airlockSeconds);
    } else if (p === 'returning') {
      this.places[role] = 'outside';
      this.motion?.stop(role);
    }
  }

  private beginWalk(role: Role, a: Assignment): void {
    const p = this.mission().state.problems.find((x) => x.uid === a.uid);
    if (!p) return;
    const spot = PROBLEM_SPOTS[p.kind];
    if (this.distance(role, spot) <= WORK_RADIUS) {
      a.phase = 'working';
      this.motion?.stop(role);
    } else if (this.motion) {
      a.target = this.motion.moveRole(role, spot);
    }
  }

  private updateAirlock(dt: number): void {
    for (const [role, left] of [...this.airlockLeft]) {
      if (left - dt > 0) {
        this.airlockLeft.set(role, left - dt);
        continue;
      }
      this.airlockLeft.delete(role);
      if (this.places[role] === 'airlockOut') {
        this.places[role] = 'outside';
        this.showAtDoor(role);
        const a = this.assignments.get(role);
        if (a) this.beginWalk(role, a);
      } else {
        this.places[role] = 'inside';
        if (this.eva && this.eva.pair.every((r) => this.places[r] === 'inside')) {
          this.eva = null;
          this.onEvaEnd();
        }
      }
      this.onChange();
    }
  }

  private updateAssignments(dt: number): void {
    const m = this.mission();
    for (const [role, a] of [...this.assignments]) {
      const p = m.state.problems.find((x) => x.uid === a.uid);
      if (!p || p.status === 'done') {
        this.assignments.delete(role);
        continue;
      }
      if (!needsEva(p.kind)) {
        if (a.phase === 'walking') {
          a.insideLeft = (a.insideLeft ?? 0) - dt;
          const arrived = this.motion && this.insideArrived
            ? this.insideArrived(role) || a.insideLeft <= INSIDE_WALK_SECONDS - INSIDE_WALK_MAX_SECONDS
            : a.insideLeft <= 0;
          if (arrived) {
            a.phase = 'working';
            this.onChange();
          }
          continue;
        }
        this.work(role, a, p, dt);
        continue;
      }
      if (this.places[role] !== 'outside') continue; // ainda na câmara de descompressão
      const spot = PROBLEM_SPOTS[p.kind];

      if (a.phase === 'walking') {
        if (this.motion) {
          // O jogador deu outra ordem (setas, outro clique) ou a física desistiu: a tarefa é largada.
          if (!a.target) this.beginWalk(role, a);
          else if (this.motion.targetOf(role) !== a.target && this.distance(role, spot) > WORK_RADIUS) {
            this.cancel(role);
            continue;
          }
        } else {
          this.walkWithoutPhysics(role, spot, dt);
        }
        if (a.phase === 'walking' && this.distance(role, spot) <= WORK_RADIUS) {
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
      this.work(role, a, p, dt);
    }
  }

  private work(role: Role, a: Assignment, p: Problem, dt: number): void {
    const m = this.mission();
    a.worked += dt;
    const progress = Math.min(1, a.worked / taskTime(p.kind));
    m.dispatch({ type: 'problemProgress', uid: p.uid, progress });
    if (progress < 1) return;
    this.assignments.delete(role);
    m.dispatch({ type: 'resolveProblem', uid: p.uid });
    // EVA é curta: terminou o conserto, a dupla volta logo.
    if (this.eva && this.eva.pair.includes(role)) {
      this.eva.idle = 0;
      this.eva.returnAfter = RETURN_AFTER_DONE;
    }
    this.onResolved(p);
    this.onChange();
  }

  /** A dupla anda junta; sem tarefa, volta para dentro sozinha. */
  private updateEva(dt: number): void {
    const e = this.eva;
    if (!e) return;
    for (const r of e.pair) {
      if (this.places[r] === 'returning' && !this.motion) {
        this.walkWithoutPhysics(r, DOOR, dt);
        if (this.distance(r, DOOR) < 0.4) this.arrivedInside(r);
      }
    }
    const worker = e.pair.find((r) => this.assignments.has(r));
    const anchor = worker ?? e.pair[0];
    const buddy = e.pair.find((r) => r !== anchor)!;
    this.buddyRepath -= dt;
    this.follow(buddy, anchor, dt);
    if (worker) return;
    if (!e.pair.some((r) => this.places[r] === 'outside')) return;
    e.idle += dt;
    if (e.idle >= e.returnAfter) this.returnInside();
  }

  private follow(buddy: Role, anchor: Role, dt: number): void {
    if (this.places[buddy] !== 'outside' || this.places[anchor] !== 'outside' || this.assignments.has(buddy)) return;
    const b = this.crew.members[buddy].root.position;
    const a = this.crew.members[anchor].root.position;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= BUDDY_DISTANCE + 0.8) return;
    const point = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).setLength(BUDDY_DISTANCE).add(new THREE.Vector3(a.x, 0, a.z));
    if (!this.motion) {
      this.walkWithoutPhysics(buddy, point, dt);
      return;
    }
    if (this.buddyRepath > 0) return;
    this.buddyRepath = 0.6;
    this.motion.moveRole(buddy, point);
  }

  private returnInside(): void {
    const e = this.eva;
    if (!e) return;
    let any = false;
    for (const r of e.pair) {
      if (this.places[r] !== 'outside') continue;
      any = true;
      this.places[r] = 'returning';
      this.motion?.enter(r, DOOR, RETURN_SPEED, () => this.arrivedInside(r));
    }
    // Quem ainda estava na câmara saindo volta direto.
    for (const r of e.pair) {
      if (this.places[r] === 'airlockOut') {
        this.places[r] = 'airlockIn';
        this.airlockLeft.set(r, CONFIG.problems.airlockSeconds);
      }
    }
    if (any) this.onEvaReturn();
    this.onChange();
  }

  /** Chegou à porta: entra na câmara de descompressão (some) e, depois dela, está dentro. */
  private arrivedInside(role: Role): void {
    if (this.places[role] !== 'returning') return;
    this.places[role] = 'airlockIn';
    this.airlockLeft.set(role, CONFIG.problems.airlockSeconds);
    this.crew.members[role].root.visible = false;
    this.onChange();
  }

  private showAtDoor(role: Role): void {
    if (this.motion) {
      this.motion.exit(role, DOOR);
      return;
    }
    const a = this.crew.members[role];
    a.root.position.set(DOOR.x + (ROLES.indexOf(role) - 1.5) * 0.8, 0, DOOR.z + 0.3);
    a.root.visible = true;
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
