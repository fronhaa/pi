import * as THREE from 'three';
import type { CardId, EnergyPlan, GameState, Message, Problem, SolReport } from '@/sim/types';
import { ROLES, type Role } from '@/sim/crew';
import { isEvaBanned } from '@/sim/eva';
import type { Location } from '@/sim/config';
import type { BaseScene } from '@/scene/BaseScene';
import { ENTRANCES } from '@/scene/base/layout';
import type { CrewMotion } from '@/scene/crewMotion';
import type { ProblemMarkers } from '@/scene/ProblemMarkers';
import type { Hud } from '@/ui/Hud';
import type { OffscreenArrows } from '@/ui/OffscreenArrows';
import { showCard, showEnd, showLevelChoice } from '@/ui/dialogs';
import { Lobby, showEarthTurn } from '@/ui/coop';
import { formatDate, t } from '@/i18n';
import { CoopClient } from '@/net/CoopClient';
import { BLOCK_ROLE, type CoopState, type CrewPos } from '@/net/protocol';
import type { CrewTasks } from '../CrewTasks';
import type { MissionPort } from '../session';

/** Envio da posição: no máximo ~3 vezes por segundo, e só se andou mais que isto (m). */
const CREW_SEND_EVERY = 0.33;
const CREW_MIN_MOVE = 0.15;
/** Astronauta de outro jogador mais longe que isto do lugar certo: corrige de uma vez. */
const CREW_SNAP = 6;
/** Velocidade de quem volta da EVA até a porta, na tela dos outros jogadores (m/s). */
const EVA_RETURN_SPEED = 3;

const PLAN_KEYS = ['life', 'shield', 'science'] as const;

export type DayPhase = 'morning' | 'day' | 'night';

/** O que o modo em grupo usa do Game (cena, interface, tripulação). Implementado em src/core/Game.ts. */
export interface CoopHost {
  readonly hud: Hud;
  readonly tasks: CrewTasks;
  readonly markers: ProblemMarkers;
  readonly base: BaseScene;
  readonly offscreen: OffscreenArrows;
  readonly motion: CrewMotion | null;
  readonly selected: Role;
  readonly phase: DayPhase;
  readonly night: boolean;
  readonly location: Location;
  /** Estado da missão local, só para mostrar algo antes de o servidor mandar o primeiro estado. */
  readonly localState: GameState;
  setPhase(phase: DayPhase): void;
  setPaused(paused: boolean): void;
  setPlan(plan: EnergyPlan): void;
  setLocation(place: Location): void;
  select(role: Role): void;
  /** Um problema apareceu: marcador, rover atolado e aviso (igual ao solo). */
  announceProblem(p: Problem): void;
  playNight(report: SolReport, stormTonight: boolean, state: GameState, onDone: () => void): void;
  refreshDayHud(): void;
  updateScene(): void;
  /** O jogador saiu da sala: volta para a escolha de modo. */
  onLeft(): void;
}

/**
 * Modo em grupo (docs/servidor-coop.md). O servidor manda na partida: roda as mesmas regras de
 * src/sim e devolve o estado; aqui só mostramos e repassamos decisões.
 *
 * O Game chama esta classe nos pontos em que solo e grupo diferem (começar o dia, pausa, plano…)
 * e usa `port` como a missão: o CrewTasks manda as ações por ela sem saber que é em grupo.
 */
export class CoopMode {
  readonly client: CoopClient;
  private readonly lobby: Lobby;
  state: CoopState | null = null;
  /** Estado montado para a interface a partir do que o servidor mandou. */
  view: GameState | null = null;
  private active = true;
  private shownReportSol = 0;
  private cardSol = 0;
  private earthSol = 0;
  private endShown = false;
  /** Durante a animação da noite, estados novos esperam aqui. */
  private nightBusy = false;
  private pending: CoopState | null = null;
  private closeEarth: (() => void) | null = null;
  /** Problemas que já têm marcador na cena. */
  private readonly marked = new Set<number>();
  /** Último envio de progresso por problema (limita a ~4 por segundo). */
  private readonly progressSent = new Map<number, number>();
  private historyToastShown = false;
  /** Posição da tripulação (só visual): o que este jogador mandou por último, por astronauta. */
  private readonly crewSent = new Map<Role, { x: number; z: number; tx?: number; tz?: number; place?: string }>();
  private crewTimer = 0;
  /** Destino já aplicado para cada astronauta de outro jogador (evita recalcular a rota à toa). */
  private readonly remoteDest = new Map<Role, string>();
  private crewSynced = false;

  constructor(
    private readonly host: CoopHost,
    url: string,
    saved?: { code: string; token: string },
  ) {
    if (host.location !== 'mars') host.setLocation('mars'); // o servidor coop roda só Marte, por enquanto
    const client = new CoopClient(url);
    this.client = client;
    this.lobby = new Lobby({
      create: () => client.create(),
      join: (code) => client.join(code),
      claim: (role) => client.send({ t: 'claim', role }),
      release: (role) => client.send({ t: 'release', role }),
      start: () => client.send({ t: 'start' }),
      level: (level) => client.send({ t: 'level', level }),
      leave: () => this.leave(),
    });
    client.onState = (s) => this.onState(s);
    client.onCrew = (list) => this.applyRemoteCrew(list);
    client.onError = (code) => {
      if (this.lobby.isOpen()) {
        this.lobby.showError(code);
        if (this.state?.phase === 'lobby') this.lobby.renderRoom(this.state);
        else this.lobby.renderEntry();
      } else {
        host.hud.toast(t(`coop.err.${code}`));
        // Outra tela abriu uma EVA antes, ou a EVA está proibida: a dupla daqui volta.
        if (code === 'eva_busy' || code === 'eva_banned') host.tasks.returnNow();
      }
    };
    client.onStatus = (status) => {
      if (status === 'reconnecting') host.hud.toast(t('coop.offline'));
      if (status === 'closed' && this.active && !this.state) {
        this.lobby.showError('offline');
        this.lobby.renderEntry();
      }
    };
    if (saved) client.rejoin(saved);
    else this.lobby.renderEntry();
  }

  // ---------- o que o Game pergunta ----------

  /** A missão vista por este jogador: estado do servidor; progresso e conserto vão para o servidor. */
  get port(): MissionPort {
    const state = this.view ?? this.host.localState;
    const find = (uid: number): Problem | undefined => state.problems.find((x) => x.uid === uid);
    return {
      state,
      evaBanned: this.evaBanned,
      dispatch: (action) => {
        if (action.type === 'problemProgress') {
          const { uid, progress } = action;
          const p = find(uid);
          if (p && p.status !== 'done') p.progress = progress;
          const now = performance.now();
          if (progress === 0 || now - (this.progressSent.get(uid) ?? 0) > 250) {
            this.progressSent.set(uid, now);
            this.client.send({ t: 'problem_progress', uid, progress });
          }
        } else if (action.type === 'resolveProblem') {
          const p = find(action.uid);
          if (p) {
            p.status = 'done';
            p.progress = 1;
          }
          this.client.send({ t: 'problem_resolve', uid: action.uid });
        }
        // As outras ações (carta, fim do sol) têm mensagens próprias no protocolo e partem do Game.
        return {};
      },
    };
  }

  /** EVA proibida hoje? Pelo estado do servidor, com a MESMA regra da simulação (src/sim/eva.ts). */
  get evaBanned(): boolean {
    return this.view ? isEvaBanned(this.view) : false;
  }

  get preview() {
    return this.state?.mars?.preview ?? null;
  }

  /** Relógio do dia (do servidor). */
  get dayRemaining(): number | undefined {
    return this.state?.mars?.day?.remaining;
  }

  /**
   * Os astronautas dos papéis deste jogador; durante uma EVA, a dupla é de quem a comanda
   * (o parceiro pode ser de outro jogador, que só vê ele acompanhar).
   */
  canControl(role: Role): boolean {
    const s = this.state;
    if (!s) return false;
    if (s.eva && s.eva.pair.includes(role)) return s.eva.by === s.you.id;
    return s.you.roles.includes(role);
  }

  ownerText(role: Role): string {
    const s = this.state;
    if (s?.eva && s.eva.pair.includes(role) && s.eva.by !== s.you.id) {
      const by = s.players.find((p) => p.id === s.eva!.by);
      if (by) return t('coop.crew.inEva', { n: by.number });
    }
    const owner = s?.players.find((p) => p.roles.includes(role));
    return owner ? t('coop.crew.ofPlayer', { n: owner.number }) : t('coop.crew.pickYours');
  }

  /** Parceiro automático da EVA: primeiro um astronauta deste jogador; senão, de outro (ele só acompanha). */
  pickBuddy(free: Role[]): Role | undefined {
    const mine = this.state?.you.roles ?? [];
    return free.find((r) => mine.includes(r)) ?? free[0];
  }

  // ---------- decisões que vão para o servidor ----------

  startDay(): void {
    this.client.send({ t: 'start_day' }); // o servidor confere se é o comandante
  }

  togglePause(): void {
    this.client.send({ t: 'pause' });
  }

  endDay(): void {
    this.client.send({ t: 'end_day' });
  }

  evaStarted(pair: [Role, Role]): void {
    this.client.send({ t: 'eva', pair });
  }

  evaEnded(): void {
    this.client.send({ t: 'eva_end' });
  }

  /** O jogador mexeu nos blocos: manda só as partes do papel dele que mudaram. */
  sendPlan(plan: EnergyPlan): void {
    const s = this.state;
    const server = s?.mars?.plan;
    if (!s || !server || s.phase !== 'mars') return;
    for (const k of PLAN_KEYS) {
      if (plan[k] !== server[k] && s.you.roles.includes(BLOCK_ROLE[k])) this.client.send({ t: 'blocks', key: k, value: plan[k] });
    }
  }

  /** Dia em grupo: o relógio e a abertura dos problemas são do servidor; aqui só o trabalho dos astronautas. */
  updateDay(dt: number): void {
    const h = this.host;
    h.tasks.update(dt);
    for (const p of this.view?.problems ?? []) {
      if (p.status === 'open') h.markers.setProgress(p.uid, p.progress, h.tasks.isWorking(p.uid));
    }
  }

  leave(): void {
    if (!this.active) return;
    this.active = false;
    this.leaveDay();
    this.client.leave();
    this.lobby.close();
    this.closeEarth?.();
    this.host.hud.setCoop(null);
    this.host.onLeft();
  }

  // ---------- estado que chega do servidor ----------

  private onState(s: CoopState): void {
    if (!this.active) return;
    if (this.nightBusy) {
      this.pending = s;
      return;
    }
    this.state = s;
    if (s.phase === 'lobby') {
      this.lobby.renderRoom(s);
      return;
    }
    this.lobby.close();

    const report = s.mars?.lastReport ?? s.earth?.lastReport ?? null;
    const sol = s.mars?.sol ?? s.earth?.sol ?? 1;
    // Partida nova (recomeçou): zera o que já foi mostrado.
    if (!report || report.sol < this.shownReportSol) this.shownReportSol = report?.sol ?? 0;
    if (sol < this.cardSol) this.cardSol = 0;
    if (sol < this.earthSol) this.earthSol = 0;
    if (sol === 1 && !report) this.historyToastShown = this.historyToastShown && this.shownReportSol === 0;

    if (report && report.sol > this.shownReportSol) {
      this.shownReportSol = report.sol;
      this.closeEarth?.();
      this.closeEarth = null;
      this.leaveDay();
      this.nightBusy = true;
      const view = this.buildView(s);
      this.view = view;
      this.host.playNight(report, report.storm !== null, view, () => {
        this.nightBusy = false;
        const next = this.pending ?? s;
        this.pending = null;
        this.apply(next);
      });
      return;
    }
    this.apply(s);
  }

  private apply(s: CoopState): void {
    const h = this.host;
    this.state = s;
    const view = this.buildView(s);
    this.view = view;
    h.hud.setState(view);
    if (s.mars) {
      h.setPlan({ ...s.mars.plan });
      h.hud.setPlan(s.mars.plan);
    }

    const roles = s.you.roles;
    const isCommander = roles.includes('commander');
    const isEarth = roles.includes('earth');
    const onlyEarth = isEarth && roles.every((r) => r === 'earth');
    let note: string | undefined;
    if (s.phase === 'earth' && !isEarth) note = t('coop.wait.earth');
    else if (s.phase === 'earth' && s.earth?.sent) note = t('coop.earth.sent');
    else if (s.phase === 'mars' && view.pendingCard && !isCommander) note = t('coop.wait.card');
    else if (s.phase === 'mars' && onlyEarth) note = t('coop.wait.mars');
    else if (s.phase === 'day' && onlyEarth) note = t('coop.wait.day');
    h.hud.setCoop({
      editable: s.phase === 'mars' ? PLAN_KEYS.filter((k) => roles.includes(BLOCK_ROLE[k])) : [],
      canEnd: isCommander && (s.phase === 'mars' || s.phase === 'day'),
      note,
    });

    // EVA de outra tela: ninguém daqui sai (máximo uma dupla na sala).
    h.tasks.remoteEva = !!s.eva && s.eva.by !== s.you.id;

    // Tripulação: começa com o astronauta deste jogador selecionado e com os outros onde estão.
    if (h.motion && !this.canControl(h.selected)) {
      const mine = ROLES.find((r) => this.canControl(r));
      if (mine) h.select(mine);
    }
    if (!this.crewSynced && s.crew?.length) {
      this.crewSynced = true;
      this.applyRemoteCrew(s.crew);
    }

    if (s.mars?.historical && view.sol === 1 && !this.historyToastShown) {
      this.historyToastShown = true;
      h.hud.toast(t('mission.start', { id: s.mars.historical.id, date: formatDate(s.mars.historical.startUtc) }), t('mission.source'));
    }

    // Dia em tempo real: o relógio é do servidor; cada jogador de Marte conserta com os astronautas.
    if (s.phase === 'day' && s.mars && !onlyEarth) this.enterDay(s);
    else if (h.phase === 'day') this.leaveDay();
    h.updateScene();

    if (s.phase === 'mars' && isCommander && view.pendingCard && this.cardSol !== view.sol) {
      this.cardSol = view.sol;
      showCard(view.pendingCard, (option) => this.client.send({ t: 'card', option }));
    }
    if (s.phase === 'earth' && isEarth && s.earth && !s.earth.sent && this.earthSol !== s.earth.sol) {
      this.earthSol = s.earth.sol;
      this.closeEarth = showEarthTurn(s, (option) => {
        this.closeEarth = null;
        this.client.send({ t: 'earth', option });
      });
    }
    if (s.phase === 'ended' && !this.endShown) {
      this.endShown = true;
      showEnd(view, () => {
        if (s.you.host) {
          // Jogar de novo: o dono da sala pode trocar o nível antes da próxima partida.
          showLevelChoice(s.level ?? 'medium', (level) => {
            this.endShown = false;
            this.historyToastShown = false;
            this.client.send({ t: 'level', level });
            this.client.send({ t: 'start' });
          });
        } else {
          h.hud.toast(t('coop.again.wait'));
        }
      });
    }
    if (s.phase !== 'ended') this.endShown = false;
  }

  private enterDay(s: CoopState): void {
    const h = this.host;
    const m = s.mars!;
    if (h.phase !== 'day') {
      h.setPhase('day');
      h.hud.setBusy(true);
    }
    const paused = m.day?.paused ?? false;
    h.setPaused(paused);
    if (h.motion) h.motion.enabled = !paused;
    for (const p of m.problems) {
      if (p.status === 'open' && !this.marked.has(p.uid)) {
        this.marked.add(p.uid);
        h.announceProblem(p);
      }
      if (p.status === 'done' && this.marked.has(p.uid)) {
        this.marked.delete(p.uid);
        h.markers.remove(p.uid);
        if (p.kind === 'roverStuck') h.base.setRoverStuck(null);
      }
    }
    h.refreshDayHud();
  }

  private leaveDay(): void {
    const h = this.host;
    if (h.phase === 'day') h.setPhase('morning');
    h.setPaused(false);
    h.tasks.clear();
    h.markers.clear();
    h.offscreen.clear();
    this.marked.clear();
    h.base.setRoverStuck(null);
    h.hud.setDay(null);
  }

  /** Monta, a partir do que o servidor mandou, o estado que a interface e a cena já sabem mostrar. */
  private buildView(s: CoopState): GameState {
    const m = s.mars;
    const e = s.earth;
    const last = m?.lastReport ?? e?.lastReport ?? null;
    const cardSols = new Map<number, CardId>();
    if (m?.lastReport && m.reportCard) cardSols.set(m.lastReport.sol, m.reportCard as CardId);
    return {
      seed: 0,
      location: 'mars',
      // Nível da partida (o dono da sala escolheu); servidor antigo não manda = Médio.
      difficulty: m?.difficulty ?? s.level ?? 'medium',
      historical: null,
      sol: m?.sol ?? e?.sol ?? 1,
      res: m?.res ?? e?.res ?? this.host.localState.res,
      blocks: m?.blocks ?? 0,
      storms: m?.storms ?? [],
      dustStormSol: 0,
      shadowSol: 0,
      sunlight: [],
      dustHold: 0,
      cardSols,
      pendingCard: m?.pendingCard ?? null,
      // A interface também mostra a mensagem "earth" do modo em grupo (Hud.messageEl).
      messages: (m?.messages ?? []) as unknown as Message[],
      problems: (m?.problems ?? []).map((p) => ({ ...p })),
      commsDown: m?.commsDown ?? false,
      reports: last ? [last] : [],
      outcome: m?.outcome ?? e?.outcome ?? { status: 'playing' },
    };
  }

  // ---------- posição da tripulação (só visual) ----------

  /**
   * Manda onde estão e para onde vão os astronautas deste jogador, ~3 vezes por segundo enquanto
   * andam, e na hora quando muda o destino.
   */
  crewTick(dt: number): void {
    const h = this.host;
    const s = this.state;
    const motion = h.motion;
    if (!s || !motion || s.phase === 'lobby' || s.phase === 'ended' || h.night) return;
    this.crewTimer += dt;
    const round = (v: number) => Math.round(v * 100) / 100;
    const list: CrewPos[] = [];
    let newDest = false;
    for (const role of ROLES) {
      if (!this.canControl(role)) continue;
      // Onde está (dentro, câmara, fora): os outros fazem ele sair e entrar pela porta.
      const place = h.tasks.placeOf(role);
      const last = this.crewSent.get(role);
      const placeChanged = !last || last.place !== place;
      if (place !== 'outside') {
        if (placeChanged) {
          list.push({ role, x: last?.x ?? 0, z: last?.z ?? 0, place });
          newDest = true;
        }
        continue;
      }
      const p = motion.positionOf(role);
      const d = motion.targetOf(role);
      const entry: CrewPos = { role, x: round(p.x), z: round(p.z), place, ...(d ? { tx: round(d.x), tz: round(d.z) } : {}) };
      const destChanged = !last || last.tx !== entry.tx || last.tz !== entry.tz;
      const moved = !last || Math.hypot(entry.x - last.x, entry.z - last.z) > CREW_MIN_MOVE;
      if ((destChanged || placeChanged) && last) newDest = true;
      if (moved || destChanged || placeChanged) list.push(entry);
    }
    if (list.length === 0 || (!newDest && this.crewTimer < CREW_SEND_EVERY)) return;
    this.crewTimer = 0;
    for (const e of list) this.crewSent.set(e.role as Role, { x: e.x, z: e.z, tx: e.tx, tz: e.tz, place: e.place });
    this.client.send({ t: 'crew_pos', list });
  }

  /** Astronautas de outros jogadores: andam até o destino que o dono mandou; longe demais, corrige de uma vez. */
  private applyRemoteCrew(list: CrewPos[]): void {
    const h = this.host;
    const motion = h.motion;
    if (!this.active || !motion || h.night) return;
    for (const e of list) {
      const role = e.role as Role;
      if (this.canControl(role)) continue;
      // Dentro ou na câmara: anda até a porta e some (a cena mostra quem está dentro pelo casco).
      const place = e.place ?? 'outside';
      h.tasks.setRemotePlace(role, place);
      if (place !== 'outside') {
        this.remoteDest.delete(role);
        if (!motion.isInside(role)) motion.enter(role, ENTRANCES.habitat, EVA_RETURN_SPEED);
        continue;
      }
      // Saiu: aparece na porta (câmara de descompressão) e segue para onde o dono mandou.
      if (motion.isInside(role)) motion.exit(role, ENTRANCES.habitat);
      const cur = motion.positionOf(role);
      const far = Math.hypot(cur.x - e.x, cur.z - e.z);
      if (far > CREW_SNAP) motion.teleport(role, e.x, e.z);
      if (e.tx !== undefined && e.tz !== undefined) {
        const key = `${e.tx},${e.tz}`;
        if (this.remoteDest.get(role) !== key) {
          this.remoteDest.set(role, key);
          motion.moveRole(role, new THREE.Vector3(e.tx, 0, e.tz));
        }
      } else {
        this.remoteDest.delete(role);
        if (far > 0.6) motion.moveRole(role, new THREE.Vector3(e.x, 0, e.z));
      }
    }
  }
}

