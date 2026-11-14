import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import '@/ui/style.css';
import { Mission } from '@/sim/mission';
import type { CardId, EnergyPlan, GameState, Message, Problem, Resources, SolReport } from '@/sim/types';
import { loadFlares, type FlareSource } from '@/data/flares';
import { isFirstGame, loadMissions, markPlayed, type MissionSource } from '@/data/missions';
import { pickHistorical } from '@/sim/historical';
import { MarsBase } from '@/scene/MarsBase';
import { Crew, ROLES } from '@/scene/Crew';
import { PROBLEMS } from '@/sim/problems';
import { Hud } from '@/ui/Hud';
import { showCard, showEnd, showNasaData, showReport, showTutorial } from '@/ui/dialogs';
import { formatDate, getLang, setLang, t } from '@/i18n';
import { Lobby, showEarthTurn, showModeChoice } from '@/ui/coop';
import { CoopClient, coopServerUrl } from '@/net/CoopClient';
import { BLOCK_ROLE, type CoopState, type CrewPos } from '@/net/protocol';
import { Input } from './Input';
import { CrewTasks } from './CrewTasks';
import { NIGHT_WALK_SPEED, STORM_RUN_SPEED } from './constants';
import type { CrewMotion } from '@/scene/crewMotion';
import { BUNK_SPOTS, ENTRANCES, GREENHOUSE_WORK_SPOT, GYM_STATIONS, HABITAT_SPOTS, PROBLEM_SPOTS, type Role } from '@/scene/MarsBase';
import { ProblemMarkers } from '@/scene/ProblemMarkers';
import { OffscreenArrows } from '@/ui/OffscreenArrows';
import { CONFIG } from '@/sim/config';
import type { StringKey } from '@/i18n';

/** Duração mínima da noite antes do relatório (ms). */
/** Rotina visual dentro da base (GDD, "Atividades dentro da base", B): segundos sem ordem até ir à academia, de exercício e de descanso. */
const ROUTINE_IDLE_SECONDS = 8;
const ROUTINE_GYM_SECONDS = 20;
const ROUTINE_REST_SECONDS = 12;
const NIGHT_MS = 2200;
/** A noite espera a tripulação entrar, mas no máximo isto (ms); quem não chegou entra direto. */
const NIGHT_MAX_MS = 6000;

const PLAN_KEYS = ['life', 'shield', 'science'] as const;

/** Modo em grupo: o servidor manda na partida; aqui só mostramos e repassamos decisões (docs/servidor-coop.md). */
interface CoopSession {
  client: CoopClient;
  lobby: Lobby;
  state: CoopState | null;
  /** Estado montado para a interface a partir do que o servidor mandou. */
  view: GameState | null;
  shownReportSol: number;
  cardSol: number;
  earthSol: number;
  endShown: boolean;
  /** Durante a animação da noite, estados novos esperam aqui. */
  nightBusy: boolean;
  pending: CoopState | null;
  closeEarth: (() => void) | null;
  /** Problemas que já têm marcador na cena. */
  marked: Set<number>;
  /** Último envio de progresso por problema (limita a ~4 por segundo). */
  progressSent: Map<number, number>;
  historyToastShown: boolean;
  /** Posição da tripulação (só visual): o que este jogador mandou por último, por astronauta. */
  crewSent: Map<Role, { x: number; z: number; tx?: number; tz?: number }>;
  crewTimer: number;
  /** Destino já aplicado para cada astronauta de outro jogador (evita recalcular a rota à toa). */
  remoteDest: Map<Role, string>;
  crewSynced: boolean;
}

/** Envio da posição: no máximo ~3 vezes por segundo, e só se andou mais que isto (m). */
const CREW_SEND_EVERY = 0.33;
const CREW_MIN_MOVE = 0.15;
/** Astronauta de outro jogador mais longe que isto do lugar certo: corrige de uma vez. */
const CREW_SNAP = 6;


/**
 * Orquestra a missão: interface → simulação (decisões) → interface e cena (estado).
 * A cena nunca altera regras (docs/game-design.md, "Tecnologia e arquitetura").
 */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  private readonly controls: OrbitControls;
  private readonly timer = new THREE.Timer();
  private readonly base: MarsBase;
  private readonly crew = new Crew();
  private readonly hud: Hud;

  private mission!: Mission;
  private plan: EnergyPlan = { life: 3, shield: 1, science: 3 };
  private night = false;
  private stormNight = false;
  /** Rotina visual de quem está dentro sem ordem: posto → academia → beliche → posto. */
  private readonly routine = Object.fromEntries(
    ROLES.map((r) => [r, { at: 'post' as 'post' | 'gym' | 'bed', idle: 0, left: 0, station: 0 }]),
  ) as Record<Role, { at: 'post' | 'gym' | 'bed'; idle: number; left: number; station: number }>;
  private exerciseFactShown = false;
  private nightRes: Resources | null = null;
  private coop: CoopSession | null = null;

  // Movimentação da tripulação: física carregada sob demanda (ADR 0004).
  private readonly input = new Input();
  private motion: CrewMotion | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly targetMarker: THREE.Mesh;
  private pointerDown: { x: number; y: number; t: number } | null = null;
  /** Mouse em cima de um astronauta (hover). */
  private hoveredRole: Role | null = null;
  private readonly hoverLabel = document.createElement('div');

  // Dia em tempo real: problemas pela base e tempo da tripulação (GDD).
  private phase: 'morning' | 'day' | 'night' = 'morning';
  private dayElapsed = 0;
  private paused = false;
  private selected: Role = 'commander';
  private readonly tasks: CrewTasks;
  private readonly markers = new ProblemMarkers();
  private offscreen!: OffscreenArrows;
  private hudTick = 0;
  private problemTipShown = false;
  private evaFactShown = false;

  private constructor(
    container: HTMLElement,
    private readonly flares: FlareSource,
    private readonly missions: MissionSource,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);

    // Câmera cinematográfica em 3/4 sobre a base (GDD, alinhamento #3). Gira e aproxima, mas o jogo funciona sem isso.
    this.camera.position.set(21, 13, 25);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(2, 1, 1.5);
    this.controls.enableDamping = true;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 75;
    this.controls.maxPolarAngle = 1.38;

    this.base = new MarsBase(this.scene);
    void this.base.loadModels();
    this.scene.add(this.crew.root);
    void this.crew.loadChibi();
    // A tripulação fica dentro da base por padrão; só aparece lá fora numa EVA (GDD).
    this.crew.setSheltered(true);

    const uiRoot = document.createElement('div');
    uiRoot.id = 'ui';
    container.appendChild(uiRoot);
    this.hud = new Hud(uiRoot, {
      onEndSol: (plan) => this.startDay(plan),
      // Em grupo, a prévia vem do servidor (mesmas regras, estado real da partida).
      preview: (plan) =>
        this.coop ? (this.coop.state?.mars?.preview ?? null)
        : this.mission && this.mission.isPlanValid(plan) && !this.mission.state.pendingCard ? this.mission.previewSol(plan) : null,
      onSendProblem: (uid) => this.assignSelected(uid),
      onEvaReturn: () => this.tasks.returnNow(),
      onPause: () => this.togglePause(),
      onEndDay: () => this.endDay(),
      onSelect: (role) => this.select(role),
      onPlanChange: (plan) => {
        this.plan = plan;
        this.updateScene();
        this.sendCoopPlan(plan);
      },
      onNasaData: () => showNasaData(this.flares, this.missions, this.mission.state.historical),
      onToggleLang: () => {
        setLang(getLang() === 'pt' ? 'en' : 'pt');
        this.hud.render();
      },
      onHowTo: () => showTutorial(() => {}),
    });

    this.targetMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.4, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.targetMarker.rotation.x = -Math.PI / 2;
    this.scene.add(this.targetMarker);
    this.setupPointer();
    this.setupHover();
    this.offscreen = new OffscreenArrows(this.renderer.domElement, (uid) => this.assignSelected(uid));
    this.scene.add(this.markers.root);
    // No modo em grupo, o CrewTasks conversa com o servidor por um adaptador (coopTaskMission).
    this.tasks = new CrewTasks(() => (this.coop ? this.coopTaskMission() : this.mission), this.crew);
    this.tasks.onChange = () => {
      this.refreshDayHud();
      this.hud.setPlaces(4 - this.tasks.outsideCount, this.tasks.outsideCount);
    };
    this.tasks.onEvaStart = ([a, b]) => {
      const names = { a: t(`crew.${a}` as StringKey), b: t(`crew.${b}` as StringKey) };
      // Primeira EVA: o fato real da NASA sobre quanto tempo se passa lá fora.
      if (!this.evaFactShown) this.hud.toast(t('eva.fact'), t('eva.fact.source'));
      else this.hud.toast(t('eva.start', names));
      this.evaFactShown = true;
    };
    this.tasks.onEvaReturn = () => this.hud.toast(t('eva.back'));
    this.tasks.onResolved = (p) => {
      this.markers.remove(p.uid);
      if (p.kind === 'roverStuck') this.base.setRoverStuck(null);
      this.hud.render();
      this.updateScene();
      if (!this.coop && this.mission.state.outcome.status !== 'playing') this.endDay();
    };
    this.setupKeys();

    this.newMission();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.timer.connect(document);
  }

  static async create(container: HTMLElement): Promise<Game> {
    const [flares, missions] = await Promise.all([loadFlares(), loadMissions()]);
    const game = new Game(container, flares, missions);
    // Só em desenvolvimento: leitura do estado para testes automáticos no navegador.
    if (import.meta.env.DEV) Object.assign(window, { __jezero: game });
    return game;
  }

  start(): void {
    this.renderer.setAnimationLoop((t) => this.frame(t));
    this.chooseMode();
    void this.loadMotion();
  }

  /** Com servidor coop configurado, pergunta: sozinho ou em grupo. Sem servidor, vai direto ao solo. */
  private chooseMode(): void {
    const url = coopServerUrl();
    if (!url) {
      showTutorial(() => this.beginSol());
      return;
    }
    const saved = new CoopClient(url).savedSession();
    if (saved) {
      this.startCoop(url, saved); // recarregou a página no meio de uma partida em grupo
      return;
    }
    showModeChoice(() => showTutorial(() => this.beginSol()), () => this.startCoop(url));
  }

  /** Carrega o Rapier em segundo plano. Se falhar, o jogo continua só com a interface (GDD). */
  private async loadMotion(): Promise<void> {
    this.hud.setCrew('loading');
    try {
      const { createCrewMotion } = await import('@/scene/crewMotion');
      this.motion = await createCrewMotion({
        crew: this.crew,
        obstacles: this.base.obstacles,
        rover: this.base.roverObject,
        input: this.input,
        camera: this.camera,
        onSelect: (role) => {
          this.selected = role;
          this.hud.setCrew('ready', role);
          this.refreshDayHud();
        },
        onFirstJump: () => this.hud.toast(t('crew.fact.gravity'), t('crew.fact.source')),
        // Em grupo, cada jogador só controla o astronauta do(s) próprio(s) papel(is).
        canControl: (role) => this.canControl(role),
      });
      this.input.reset();
      this.motion.enabled = !this.night && !this.paused;
      // A tripulação está dentro (escondida); quem estiver numa EVA sai pela porta.
      this.tasks.attachMotion(this.motion);
      this.motion.select(this.selected); // avisa o HUD via onSelect
    } catch (err) {
      console.warn('Física indisponível; o jogo segue só com a interface.', err);
      this.hud.setCrew('off');
    }
  }

  /** Primeiro objeto atingido que está visível (astronauta dentro da base fica escondido e não conta). */
  private firstVisibleHit(objects: THREE.Object3D[]): THREE.Intersection | undefined {
    return this.raycaster.intersectObjects(objects, true).find((h) => {
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (!o.visible) return false;
      return true;
    });
  }

  private roleOf(obj: THREE.Object3D): Role | null {
    for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (o.userData.role) return o.userData.role as Role;
    return null;
  }

  /**
   * Hover: com o mouse em cima de um astronauta, ele ganha destaque e aparece o nome;
   * em cima de um "!" (de dia), aparece o problema e quem será enviado. Só mouse (toque não tem hover).
   */
  private setupHover(): void {
    const el = this.renderer.domElement;
    this.hoverLabel.className = 'hover-label';
    this.hoverLabel.hidden = true;
    document.body.append(this.hoverLabel);
    const clear = () => {
      this.setHovered(null);
      this.hoverLabel.hidden = true;
      el.style.cursor = '';
    };
    el.addEventListener('pointerleave', clear);
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons !== 0 || this.night) {
        clear();
        return;
      }
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      let text: string | null = null;
      let role: Role | null = null;
      const problemHit = this.phase === 'day' ? this.firstVisibleHit(this.markers.pickables) : undefined;
      if (problemHit) {
        let o: THREE.Object3D | null = problemHit.object;
        while (o && o.userData.problemUid === undefined) o = o.parent;
        const p = o && this.mission.state.problems.find((x) => x.uid === o!.userData.problemUid);
        if (p) {
          const action = PROBLEMS[p.kind].outside ? t('hover.eva') : t('hover.fixInside');
          text = `${t(`problem.${p.kind}` as StringKey)} · ${action}`;
        }
      } else {
        const crewHit = this.firstVisibleHit([this.crew.root]);
        role = crewHit ? this.roleOf(crewHit.object) : null;
        if (role) text = role === this.selected ? `${t(`crew.${role}` as StringKey)} · ${t('hover.selected')}` : `${t(`crew.${role}` as StringKey)} · ${t('hover.select')}`;
      }
      this.setHovered(role);
      el.style.cursor = text ? 'pointer' : '';
      this.hoverLabel.hidden = !text;
      if (text) {
        this.hoverLabel.textContent = text;
        this.hoverLabel.style.left = `${e.clientX + 14}px`;
        this.hoverLabel.style.top = `${e.clientY + 14}px`;
      }
    });
  }

  private setHovered(role: Role | null): void {
    if (this.hoveredRole === role) return;
    if (this.hoveredRole) this.crew.members[this.hoveredRole].setHovered(false);
    this.hoveredRole = role;
    if (role) this.crew.members[role].setHovered(true);
  }

  /** Clique/toque: num astronauta seleciona; no chão, manda o selecionado andar até lá. Arrastar gira a câmera. */
  private setupPointer(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() }));
    el.addEventListener('pointerup', (e) => {
      const d = this.pointerDown;
      this.pointerDown = null;
      if (!d || this.night || this.paused) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 500) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      // 1) Clique num problema: manda o astronauta selecionado (GDD: "toca no astronauta e depois no problema").
      if (this.phase === 'day') {
        const hitProblem = this.raycaster.intersectObjects(this.markers.pickables, true)[0];
        if (hitProblem) {
          let o: THREE.Object3D | null = hitProblem.object;
          while (o && o.userData.problemUid === undefined) o = o.parent;
          if (o) this.assignSelected(o.userData.problemUid as number);
          return;
        }
      }
      // 2) Clique num astronauta: seleciona.
      const hitCrew = this.firstVisibleHit([this.crew.root]);
      const clickedRole = hitCrew ? this.roleOf(hitCrew.object) : null;
      if (clickedRole) {
        this.select(clickedRole);
        return;
      }
      // 3) Clique no chão: anda até lá (precisa da física).
      if (!this.motion || !this.motion.enabled) return;
      const ground = this.scene.getObjectByName('ground');
      const hit = ground && this.raycaster.intersectObject(ground, false)[0];
      if (hit) {
        if (!this.canControl(this.selected)) {
          this.hud.toast(t('coop.crew.pickYours'));
          return;
        }
        this.motion.moveTo(hit.point);
        this.targetMarker.position.set(hit.point.x, hit.point.y + 0.05, hit.point.z);
        (this.targetMarker.material as THREE.MeshBasicMaterial).opacity = 0.9;
      }
    });
  }

  private select(role: Role): void {
    if (!this.canControl(role)) {
      this.hud.toast(this.ownerText(role));
      return;
    }
    this.selected = role;
    if (this.motion) this.motion.select(role); // avisa o HUD via onSelect
    else {
      for (const [r, a] of Object.entries(this.crew.members)) a.setSelected(r === role);
      this.refreshDayHud();
    }
  }

  /** Manda o astronauta selecionado para um problema (em grupo, só se ele for deste jogador). */
  private assignSelected(uid: number): void {
    if (!this.canControl(this.selected)) {
      this.hud.toast(t('coop.crew.pickYours'));
      return;
    }
    const r = this.tasks.assign(this.selected, uid);
    if (r === 'storm') this.hud.toast(t('eva.banned'));
    else if (r === 'full') this.hud.toast(t('eva.full'));
    else if (r === 'nobody') this.hud.toast(t('eva.nobody'));
  }

  /** Solo: todos os astronautas. Em grupo: só os dos papéis deste jogador. */
  private canControl(role: Role): boolean {
    return !this.coop || (this.coop.state?.you.roles ?? []).includes(role);
  }

  private ownerText(role: Role): string {
    const owner = this.coop?.state?.players.find((p) => p.roles.includes(role));
    return owner ? t('coop.crew.ofPlayer', { n: owner.number }) : t('coop.crew.pickYours');
  }

  /** E: consertar o problema mais perto · P: pausar o dia · 1–4 sem física: escolher astronauta. */
  private setupKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.phase === 'day' && e.code === 'KeyP') this.togglePause();
      if (this.phase === 'day' && !this.paused && e.code === 'KeyE') {
        if (!this.canControl(this.selected)) this.hud.toast(t('coop.crew.pickYours'));
        else if (!this.tasks.interact(this.selected)) this.hud.toast(t('task.nothingNear'));
      }
      if (!this.motion && /^(Digit|Numpad)[1-4]$/.test(e.code)) {
        this.select((['commander', 'engineer', 'medic', 'scientist'] as Role[])[Number(e.code.slice(-1)) - 1]);
      }
    });
  }

  // ---------- dia em tempo real ----------

  /** "Começar o dia": se não há problemas hoje (sóis 1 e 2), vai direto para a noite. */
  private startDay(plan: EnergyPlan): void {
    if (this.coop) {
      this.coop.client.send({ t: 'start_day' }); // o servidor confere se é o comandante
      return;
    }
    const m = this.mission;
    if (!m.isPlanValid(plan) || m.state.pendingCard) return;
    this.plan = plan;
    if (m.state.problems.length === 0) {
      this.endSol(plan);
      return;
    }
    this.phase = 'day';
    this.dayElapsed = 0;
    this.paused = false;
    this.hud.setBusy(true);
    this.refreshDayHud();
  }

  private togglePause(): void {
    if (this.phase !== 'day') return;
    if (this.coop) {
      this.coop.client.send({ t: 'pause' });
      return;
    }
    this.paused = !this.paused;
    if (this.motion) this.motion.enabled = !this.paused;
    this.refreshDayHud();
  }

  private updateDay(dt: number): void {
    if (this.coop) {
      // Em grupo, o relógio e a abertura dos problemas são do servidor; aqui só o trabalho dos astronautas.
      this.tasks.update(dt);
      for (const p of this.coop.view?.problems ?? []) {
        if (p.status === 'open') this.markers.setProgress(p.uid, p.progress, this.tasks.isWorking(p.uid));
      }
      return;
    }
    const m = this.mission;
    this.dayElapsed += dt;
    for (const p of m.state.problems) {
      if (p.status === 'pending' && this.dayElapsed >= p.spawnAt) {
        m.openProblem(p.uid);
        this.markers.add(p.uid, p.kind);
        if (p.kind === 'roverStuck') this.base.setRoverStuck(PROBLEM_SPOTS.roverStuck);
        this.hud.toast(t('problem.new', { problem: t(`problem.${p.kind}` as StringKey) }), this.problemTipShown ? undefined : t('day.hint'));
        this.problemTipShown = true;
        this.refreshDayHud();
      }
    }
    this.tasks.update(dt);
    for (const p of m.state.problems) {
      if (p.status === 'open') this.markers.setProgress(p.uid, p.progress, this.tasks.isWorking(p.uid));
    }
    const allDone = m.state.problems.every((p) => p.status === 'done');
    if (this.dayElapsed >= CONFIG.problems.daySeconds || allDone) this.endDay();
  }

  private endDay(): void {
    if (this.phase !== 'day') return;
    if (this.coop) {
      this.coop.client.send({ t: 'end_day' });
      return;
    }
    this.phase = 'night';
    this.paused = false;
    this.tasks.clear();
    this.hud.setPlaces(4, 0);
    this.markers.clear();
    this.offscreen.clear();
    this.base.setRoverStuck(null);
    this.hud.setDay(null);
    if (this.mission.state.outcome.status !== 'playing') {
      this.finish();
      return;
    }
    this.endSol(this.plan);
  }

  /** Setas na borda para os problemas abertos que estão fora da tela (só de dia, sem pausa de janela). */
  private updateOffscreen(): void {
    if (this.phase !== 'day') {
      this.offscreen.clear();
      return;
    }
    const name = t(`crew.${this.selected}` as StringKey);
    // Em grupo, os problemas vêm do servidor.
    const items = (this.coop?.view ?? this.mission.state).problems
      .filter((p) => p.status === 'open')
      .map((p) => {
        const problem = t(`problem.${p.kind}` as StringKey);
        return {
          uid: p.uid,
          world: PROBLEM_SPOTS[p.kind].clone().setY(2.6),
          label: problem,
          ariaLabel: t('offscreen.aria', { problem, name }),
        };
      });
    this.offscreen.update(items, this.camera);
  }

  private refreshDayHud(): void {
    if (this.phase !== 'day') return;
    const s = this.coop?.view ?? this.mission.state;
    const coopDay = this.coop?.state?.mars?.day;
    this.hud.setDay({
      remaining: coopDay ? coopDay.remaining : Math.max(0, Math.ceil(CONFIG.problems.daySeconds - this.dayElapsed)),
      paused: this.paused,
      selected: this.selected,
      evaBanned: this.mission.evaBanned,
      evaActive: this.tasks.evaActive,
      crew: ROLES.map((role) => ({ role, place: this.tasks.placeOf(role) })),
      problems: s.problems
        .filter((p) => p.status !== 'pending')
        .map((p) => ({ uid: p.uid, kind: p.kind, status: p.status, progress: p.progress, worker: this.tasks.workerOf(p.uid), phase: this.tasks.phaseOf(p.uid) })),
    });
  }

  // ---------- fluxo da missão ----------

  private newMission(): void {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    // Missão histórica real, se houver; senão, erupções reais sorteadas; senão, simuladas.
    const historical = pickHistorical(this.missions.missions, seed, isFirstGame());
    this.mission = new Mission(seed, this.flares.flares, historical);
    this.hud.setState(this.mission.state);
    this.updateScene();
  }

  /** Começo de um sol: mostra o estado e, se houver, a carta do dia. */
  private beginSol(): void {
    this.phase = 'morning';
    const s = this.mission.state;
    this.hud.setState(s);
    this.hud.newSol();
    this.updateScene();
    if (s.sol === 1 && s.historical) {
      this.hud.toast(t('mission.start', { id: s.historical.id, date: formatDate(s.historical.startUtc) }), t('mission.source'));
    }
    if (s.pendingCard) {
      showCard(s.pendingCard, (option) => {
        this.mission.answerCard(option);
        this.hud.render();
        this.updateScene();
        if (s.outcome.status !== 'playing') this.finish();
      });
    }
  }

  private endSol(plan: EnergyPlan): void {
    const m = this.mission;
    if (!m.isPlanValid(plan) || m.state.pendingCard) return;
    const stormTonight = m.stormToday !== undefined;
    const report = m.endSol(plan);
    this.playNight(report, stormTonight, m.state, () => {
      if (m.state.outcome.status === 'playing') this.beginSol();
      else this.finish();
    });
  }

  /** Noite: a cena mostra o resultado do dia enquanto escurece; depois, o relatório. Solo e grupo. */
  private playNight(report: SolReport, stormTonight: boolean, state: GameState, onDone: () => void): void {
    this.phase = 'night';
    // Noite: a cena mostra o resultado do dia enquanto escurece.
    this.hud.setBusy(true);
    this.night = true;
    this.stormNight = stormTonight;
    this.nightRes = report.after;
    this.hud.showNight(report.after, report.sol);
    this.updateScene();

    // A tripulação volta para dentro: anda até o habitat para dormir ou corre para o abrigo na tempestade.
    // O relatório espera todos entrarem (mínimo NIGHT_MS, máximo NIGHT_MAX_MS).
    const entrance: keyof typeof ENTRANCES = stormTonight ? 'shelter' : 'habitat';
    const started = performance.now();
    let reported = false;
    const report_ = () => {
      if (reported) return;
      reported = true;
      window.clearTimeout(cap);
      this.motion?.forceInside();
      showReport(report, state, () => {
        this.night = false;
        this.stormNight = false;
        this.nightRes = null;
        // De manhã a tripulação continua dentro; só sai numa EVA (GDD).
        if (this.motion) this.motion.enabled = true;
        this.hud.setBusy(false);
        onDone();
      });
    };
    const cap = window.setTimeout(report_, NIGHT_MAX_MS);
    if (this.motion) {
      this.motion.enabled = false;
      this.motion.goInside(ENTRANCES[entrance], stormTonight ? STORM_RUN_SPEED : NIGHT_WALK_SPEED, () => {
        window.setTimeout(report_, Math.max(0, NIGHT_MS - (performance.now() - started)));
      });
    } else {
      // Sem física: a tripulação some (está dentro) e a noite dura o tempo mínimo.
      this.crew.setSheltered(true);
      window.setTimeout(report_, NIGHT_MS);
    }
  }

  private finish(): void {
    markPlayed();
    this.hud.setState(this.mission.state);
    showEnd(this.mission.state, () => {
      this.newMission();
      this.beginSol();
    });
  }

  private updateScene(): void {
    const s = this.coop?.view ?? this.mission.state;
    this.base.setState({
      res: this.nightRes ?? s.res,
      alert: !this.night && s.messages.some((m) => m.kind === 'stormAlert' || m.kind === 'stormToday'),
      night: this.night,
      stormNight: this.stormNight,
      earthMessage: !this.night && s.messages.some((m) => m.kind !== 'dustNow'),
      scienceBlocks: this.plan.science,
    });
  }

  // ---------- modo em grupo ----------

  private startCoop(url: string, saved?: { code: string; token: string }): void {
    const client = new CoopClient(url);
    const lobby = new Lobby({
      create: () => client.create(),
      join: (code) => client.join(code),
      claim: (role) => client.send({ t: 'claim', role }),
      release: (role) => client.send({ t: 'release', role }),
      start: () => client.send({ t: 'start' }),
      leave: () => this.leaveCoop(),
    });
    const c: CoopSession = {
      client, lobby, state: null, view: null, shownReportSol: 0, cardSol: 0, earthSol: 0,
      endShown: false, nightBusy: false, pending: null, closeEarth: null,
      marked: new Set(), progressSent: new Map(), historyToastShown: false,
      crewSent: new Map(), crewTimer: 0, remoteDest: new Map(), crewSynced: false,
    };
    this.coop = c;
    client.onState = (s) => this.onCoopState(s);
    client.onCrew = (list) => this.applyRemoteCrew(list);
    client.onError = (code) => {
      if (lobby.isOpen()) {
        lobby.showError(code);
        if (c.state?.phase === 'lobby') lobby.renderRoom(c.state);
        else lobby.renderEntry();
      } else {
        this.hud.toast(t(`coop.err.${code}`));
      }
    };
    client.onStatus = (status) => {
      if (status === 'reconnecting') this.hud.toast(t('coop.offline'));
      if (status === 'closed' && this.coop === c && !c.state) {
        lobby.showError('offline');
        lobby.renderEntry();
      }
    };
    if (saved) client.rejoin(saved);
    else lobby.renderEntry();
  }

  private leaveCoop(): void {
    const c = this.coop;
    if (!c) return;
    this.leaveCoopDay();
    this.coop = null;
    c.client.leave();
    c.lobby.close();
    c.closeEarth?.();
    this.hud.setCoop(null);
    this.newMission();
    this.chooseMode();
  }

  private onCoopState(s: CoopState): void {
    const c = this.coop;
    if (!c) return;
    if (c.nightBusy) {
      c.pending = s;
      return;
    }
    c.state = s;
    if (s.phase === 'lobby') {
      c.lobby.renderRoom(s);
      return;
    }
    c.lobby.close();

    const report = s.mars?.lastReport ?? s.earth?.lastReport ?? null;
    const sol = s.mars?.sol ?? s.earth?.sol ?? 1;
    // Partida nova (recomeçou): zera o que já foi mostrado.
    if (!report || report.sol < c.shownReportSol) c.shownReportSol = report?.sol ?? 0;
    if (sol < c.cardSol) c.cardSol = 0;
    if (sol < c.earthSol) c.earthSol = 0;
    if (sol === 1 && !report) c.historyToastShown = c.historyToastShown && c.shownReportSol === 0;

    if (report && report.sol > c.shownReportSol) {
      c.shownReportSol = report.sol;
      c.closeEarth?.();
      c.closeEarth = null;
      this.leaveCoopDay();
      c.nightBusy = true;
      const view = this.coopView(s);
      c.view = view;
      this.playNight(report, report.storm !== null, view, () => {
        c.nightBusy = false;
        const next = c.pending ?? s;
        c.pending = null;
        this.applyCoopState(next);
      });
      return;
    }
    this.applyCoopState(s);
  }

  private applyCoopState(s: CoopState): void {
    const c = this.coop;
    if (!c) return;
    c.state = s;
    const view = this.coopView(s);
    c.view = view;
    this.hud.setState(view);
    if (s.mars) {
      this.plan = { ...s.mars.plan };
      this.hud.setPlan(s.mars.plan);
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
    this.hud.setCoop({
      editable: s.phase === 'mars' ? PLAN_KEYS.filter((k) => roles.includes(BLOCK_ROLE[k])) : [],
      canEnd: isCommander && (s.phase === 'mars' || s.phase === 'day'),
      note,
    });

    // Tripulação: começa com o astronauta deste jogador selecionado e com os outros onde estão.
    if (this.motion && !this.canControl(this.selected)) {
      const mine = (['commander', 'engineer', 'medic', 'scientist'] as Role[]).find((r) => this.canControl(r));
      if (mine) this.select(mine);
    }
    if (!c.crewSynced && s.crew?.length) {
      c.crewSynced = true;
      this.applyRemoteCrew(s.crew);
    }

    if (s.mars?.historical && view.sol === 1 && !c.historyToastShown) {
      c.historyToastShown = true;
      this.hud.toast(t('mission.start', { id: s.mars.historical.id, date: formatDate(s.mars.historical.startUtc) }), t('mission.source'));
    }

    // Dia em tempo real: o relógio é do servidor; cada jogador de Marte conserta com os astronautas.
    if (s.phase === 'day' && s.mars && !onlyEarth) this.enterCoopDay(s);
    else if (this.phase === 'day') this.leaveCoopDay();
    this.updateScene();

    if (s.phase === 'mars' && isCommander && view.pendingCard && c.cardSol !== view.sol) {
      c.cardSol = view.sol;
      showCard(view.pendingCard, (option) => c.client.send({ t: 'card', option }));
    }
    if (s.phase === 'earth' && isEarth && s.earth && !s.earth.sent && c.earthSol !== s.earth.sol) {
      c.earthSol = s.earth.sol;
      c.closeEarth = showEarthTurn(s, (option) => {
        c.closeEarth = null;
        c.client.send({ t: 'earth', option });
      });
    }
    if (s.phase === 'ended' && !c.endShown) {
      c.endShown = true;
      showEnd(view, () => {
        if (s.you.host) {
          c.endShown = false;
          c.historyToastShown = false;
          c.client.send({ t: 'start' });
        } else {
          this.hud.toast(t('coop.again.wait'));
        }
      });
    }
    if (s.phase !== 'ended') c.endShown = false;
  }

  private enterCoopDay(s: CoopState): void {
    const c = this.coop!;
    const m = s.mars!;
    if (this.phase !== 'day') {
      this.phase = 'day';
      this.hud.setBusy(true);
    }
    this.paused = m.day?.paused ?? false;
    if (this.motion) this.motion.enabled = !this.paused;
    for (const p of m.problems) {
      if (p.status === 'open' && !c.marked.has(p.uid)) {
        c.marked.add(p.uid);
        this.markers.add(p.uid, p.kind);
        if (p.kind === 'roverStuck') this.base.setRoverStuck(PROBLEM_SPOTS.roverStuck);
        this.hud.toast(t('problem.new', { problem: t(`problem.${p.kind}` as StringKey) }), this.problemTipShown ? undefined : t('day.hint'));
        this.problemTipShown = true;
      }
      if (p.status === 'done' && c.marked.has(p.uid)) {
        c.marked.delete(p.uid);
        this.markers.remove(p.uid);
        if (p.kind === 'roverStuck') this.base.setRoverStuck(null);
      }
    }
    this.refreshDayHud();
  }

  private leaveCoopDay(): void {
    if (this.phase === 'day') this.phase = 'morning';
    this.paused = false;
    this.tasks.clear();
    this.markers.clear();
    this.offscreen.clear();
    this.coop?.marked.clear();
    this.base.setRoverStuck(null);
    this.hud.setDay(null);
  }

  /** O CrewTasks pensa que fala com a simulação; em grupo, o progresso e o conserto vão para o servidor. */
  private coopTaskMission(): Mission {
    const c = this.coop!;
    const state = c.view ?? this.mission.state;
    const find = (uid: number): Problem | undefined => state.problems.find((x) => x.uid === uid);
    return {
      state,
      setProblemProgress: (uid: number, progress: number) => {
        const p = find(uid);
        if (p && p.status !== 'done') p.progress = progress;
        const now = performance.now();
        if (progress === 0 || now - (c.progressSent.get(uid) ?? 0) > 250) {
          c.progressSent.set(uid, now);
          c.client.send({ t: 'problem_progress', uid, progress });
        }
      },
      resolveProblem: (uid: number) => {
        const p = find(uid);
        if (p) {
          p.status = 'done';
          p.progress = 1;
        }
        c.client.send({ t: 'problem_resolve', uid });
      },
    } as unknown as Mission;
  }

  /** Monta, a partir do que o servidor mandou, o estado que a interface e a cena já sabem mostrar. */
  private coopView(s: CoopState): GameState {
    const m = s.mars;
    const e = s.earth;
    const last = m?.lastReport ?? e?.lastReport ?? null;
    const cardSols = new Map<number, CardId>();
    if (m?.lastReport && m.reportCard) cardSols.set(m.lastReport.sol, m.reportCard as CardId);
    return {
      seed: 0,
      historical: null,
      sol: m?.sol ?? e?.sol ?? 1,
      res: m?.res ?? e?.res ?? this.mission.state.res,
      blocks: m?.blocks ?? 0,
      storms: m?.storms ?? [],
      dustStormSol: 0,
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

  /**
   * Posição da tripulação (só visual): manda onde estão e para onde vão os astronautas deste
   * jogador, ~3 vezes por segundo enquanto andam, e na hora quando muda o destino.
   */
  private coopCrewTick(dt: number): void {
    const c = this.coop;
    const s = c?.state;
    if (!c || !s || !this.motion || s.phase === 'lobby' || s.phase === 'ended' || this.night) return;
    c.crewTimer += dt;
    const round = (v: number) => Math.round(v * 100) / 100;
    const list: CrewPos[] = [];
    let newDest = false;
    for (const role of ['commander', 'engineer', 'medic', 'scientist'] as Role[]) {
      if (!this.canControl(role) || this.motion.isInside(role)) continue;
      const p = this.motion.positionOf(role);
      const d = this.motion.targetOf(role);
      const entry: CrewPos = { role, x: round(p.x), z: round(p.z), ...(d ? { tx: round(d.x), tz: round(d.z) } : {}) };
      const last = c.crewSent.get(role);
      const destChanged = !last || last.tx !== entry.tx || last.tz !== entry.tz;
      const moved = !last || Math.hypot(entry.x - last.x, entry.z - last.z) > CREW_MIN_MOVE;
      if (destChanged && last) newDest = true;
      if (moved || destChanged) list.push(entry);
    }
    if (list.length === 0 || (!newDest && c.crewTimer < CREW_SEND_EVERY)) return;
    c.crewTimer = 0;
    for (const e of list) c.crewSent.set(e.role as Role, { x: e.x, z: e.z, tx: e.tx, tz: e.tz });
    c.client.send({ t: 'crew_pos', list });
  }

  /** Astronautas de outros jogadores: andam até o destino que o dono mandou; longe demais, corrige de uma vez. */
  private applyRemoteCrew(list: CrewPos[]): void {
    const c = this.coop;
    if (!c || !this.motion || this.night) return;
    for (const e of list) {
      const role = e.role as Role;
      if (this.canControl(role) || this.motion.isInside(role)) continue;
      const cur = this.motion.positionOf(role);
      const far = Math.hypot(cur.x - e.x, cur.z - e.z);
      if (far > CREW_SNAP) this.motion.teleport(role, e.x, e.z);
      if (e.tx !== undefined && e.tz !== undefined) {
        const key = `${e.tx},${e.tz}`;
        if (c.remoteDest.get(role) !== key) {
          c.remoteDest.set(role, key);
          this.motion.moveRole(role, new THREE.Vector3(e.tx, 0, e.tz));
        }
      } else {
        c.remoteDest.delete(role);
        if (far > 0.6) this.motion.moveRole(role, new THREE.Vector3(e.x, 0, e.z));
      }
    }
  }

  /** O jogador mexeu nos blocos: manda só as partes do papel dele que mudaram. */
  private sendCoopPlan(plan: EnergyPlan): void {
    const c = this.coop;
    const server = c?.state?.mars?.plan;
    if (!c || !server || c.state?.phase !== 'mars') return;
    for (const k of PLAN_KEYS) {
      if (plan[k] !== server[k] && c.state.you.roles.includes(BLOCK_ROLE[k])) c.client.send({ t: 'blocks', key: k, value: plan[k] });
    }
  }

  // ---------- render ----------

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Celular em pé: afasta a câmera para a base caber.
    const portrait = w / h < 0.8;
    this.camera.fov = portrait ? 68 : 50;
    // Desloca a imagem para cima: a base fica visível acima do plano de energia.
    this.camera.setViewOffset(w, h, 0, h * (portrait ? 0.06 : 0.16), w, h);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Quem está dentro aparece pelo casco translúcido. A física não cuida de quem está dentro, então a
   * posição, a pose e a animação são daqui. Só cena: nenhuma regra muda (GDD, "Atividades dentro da base", B).
   * - Com tarefa de dentro: na estufa, consertando.
   * - Sem ordem há um tempo: academia (esteira ou bicicleta), depois descansa no beliche e volta ao posto.
   * - Noite normal: dorme na sua cama do beliche. Noite de tempestade (abrigo) e câmara de descompressão: some.
   */
  private showCrewInside(dt: number): void {
    const awake = this.phase === 'morning' || this.phase === 'day';
    const sleeping = this.phase === 'night' && !this.stormNight;
    const state = this.coop?.view ?? this.mission.state;
    const alert = state.messages.some((m) => m.kind === 'stormAlert' || m.kind === 'stormToday');
    for (const r of ROLES) {
      const a = this.crew.members[r];
      const rt = this.routine[r];
      if (!this.motion!.isInside(r)) {
        rt.at = 'post';
        rt.idle = 0;
        a.setLying(false);
        continue;
      }
      const inHabitat = this.tasks.placeOf(r) === 'inside' && (awake || sleeping);
      a.root.visible = inHabitat;
      if (!inHabitat) continue;

      if (sleeping || this.tasks.onInsideTask(r) || alert) {
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
          if (!this.exerciseFactShown) this.hud.toast(t('fact.exercise'), t('fact.exercise.source'));
          this.exerciseFactShown = true;
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

      if (sleeping || rt.at === 'bed') {
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
        a.root.position.copy(this.tasks.onInsideTask(r) ? GREENHOUSE_WORK_SPOT : HABITAT_SPOTS[r]);
        a.faceCamera(this.camera.position);
        a.idle(dt);
      }
    }
  }

  private frame(time: number): void {
    this.timer.update(time);
    const rawDt = this.timer.getDelta();
    const dt = Math.min(rawDt, 0.1); // animações

    const t = this.timer.getElapsed();
    this.controls.update();
    // O rover recebe onde estão os astronautas visíveis (quem está dentro da base não conta).
    const crewPositions = ROLES.filter((r) => this.crew.members[r].root.visible && !this.motion?.isInside(r)).map(
      (r) => this.crew.members[r].root.position,
    );
    this.base.update(dt, t, crewPositions);
    if (this.phase === 'day' && !this.paused) {
      this.updateDay(dt);
      this.hudTick += dt;
      if (this.hudTick > 0.25) {
        this.hudTick = 0;
        this.refreshDayHud();
      }
    }
    this.markers.update(t, this.camera);
    this.updateOffscreen();
    this.coopCrewTick(dt);
    for (const r of ROLES) this.crew.members[r].setWorking(this.phase === 'day' && this.tasks.isRoleWorking(r));
    if (this.motion) {
      this.motion.update(rawDt); // a física tem o próprio limite (MAX_FRAME_DT)
      this.showCrewInside(dt);
    } else this.crew.update(dt);
    const marker = this.targetMarker.material as THREE.MeshBasicMaterial;
    marker.opacity = Math.max(0, marker.opacity - dt * 0.8);
    this.renderer.render(this.scene, this.camera);
  }
}
