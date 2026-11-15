import * as THREE from 'three';
import { recentSun } from '@/data/flares';
import { QUALITY, applyQuality } from '@/render/quality';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import '@/ui/style.css';
import { Mission } from '@/sim/mission';
import type { EnergyPlan, GameState, Problem, Resources, SolReport } from '@/sim/types';
import { ROLES, type Role } from '@/sim/crew';
import { needsEva } from '@/sim/eva';
import { CONFIG, type Location } from '@/sim/config';
import { pickHistorical } from '@/sim/historical';
import { loadFlares, type FlareSource } from '@/data/flares';
import { isFirstGame, loadMissions, markPlayed, type MissionSource } from '@/data/missions';
import { scenarioOf } from '@/scenarios';
import { BaseScene } from '@/scene/BaseScene';
import { ENTRANCES, PROBLEM_SPOTS } from '@/scene/base/layout';
import { Crew } from '@/scene/Crew';
import { CrewRoutine } from '@/scene/crewRoutine';
import { ProblemMarkers } from '@/scene/ProblemMarkers';
import type { CrewMotion } from '@/scene/crewMotion';
import { Hud } from '@/ui/Hud';
import { OffscreenArrows } from '@/ui/OffscreenArrows';
import { CrewBubble } from '@/ui/CrewBubble';
import { showCard, showEnd, showMissionStart, showNasaData, showPlaceChoice, showReport, showTutorial } from '@/ui/dialogs';
import { IntroGuide } from '@/ui/IntroGuide';
import { IntroDirector } from './intro';
import { showModeChoice } from '@/ui/coop';
import { formatDate, getLang, setLang, setPlace, t, type StringKey } from '@/i18n';
import { CoopClient, coopServerUrl } from '@/net/CoopClient';
import { Input } from './Input';
import { CrewTasks } from './CrewTasks';
import { ScenePointer } from './ScenePointer';
import { localPort, type MissionPort } from './session';
import { CoopMode, type CoopHost, type DayPhase } from './coop/CoopMode';
import { NIGHT_WALK_SPEED, STORM_RUN_SPEED } from './constants';

/** Tocado: quanto tempo o astronauta fica olhando para quem controla (GDD, "Para onde o astronauta olha"). */
const LOOK_AT_CAMERA_SECONDS = 2;
/** Duração mínima da noite antes do relatório (ms). */
const NIGHT_MS = 2200;
/** Dia do treino (sóis 1 a 3, sem problemas): só para ver o Sol cruzar o céu (s). Visual, não é regra. */
const INTRO_DAY_SECONDS = 12;
/** O balão de fato fica um pouco acima do capacete (o astronauta tem ~1,9 m). */
const BUBBLE_ABOVE_HEAD = new THREE.Vector3(0, 2.2, 0);
const BUBBLE_TMP = new THREE.Vector3();
/** A noite espera a tripulação entrar, mas no máximo isto (ms); quem não chegou entra direto. */
const NIGHT_MAX_MS = 6000;

/**
 * Orquestra a missão: interface → simulação (decisões) → interface e cena (estado).
 * A cena nunca altera regras (docs/game-design.md, "Tecnologia e arquitetura").
 *
 * Quem faz o quê (docs/estrutura-do-projeto.md):
 * - regras: src/sim (aqui só via `port.dispatch` e a Mission);
 * - modo em grupo: ./coop/CoopMode.ts (este arquivo só pergunta `this.coop` nos pontos que mudam);
 * - clique e hover na cena: ./ScenePointer.ts; tempo e EVA da tripulação: ./CrewTasks.ts;
 * - cena: src/scene (BaseScene, Crew, crewRoutine); interface: src/ui.
 */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  private readonly controls: OrbitControls;
  private readonly timer = new THREE.Timer();
  private readonly base: BaseScene;
  private readonly crew = new Crew();
  /** Desempenho (src/render/quality.ts): densidade máxima, média dos quadros e relógio da sombra. */
  private readonly maxPixelRatio: number;
  private perfTime = 0;
  private perfFrames = 0;
  private perfCooldown = 3;
  private shadowTimer = 0;
  private readonly routine: CrewRoutine;
  private readonly hud: Hud;
  /** Treino dos sóis 1 a 3 (só solo). */
  private readonly intro: IntroDirector;

  private mission!: Mission;
  /** Onde fica a base (solo). O modo em grupo é sempre em Marte, por enquanto. */
  private location: Location = 'mars';
  private plan: EnergyPlan = { life: 3, shield: 1, science: 3 };
  private night = false;
  private stormNight = false;
  /** Lua: a noite que está passando é a noite fria da sombra (só ela escurece a cena). */
  private shadowNight = false;
  /** Luz do Sol (0–1) do dia que acabou, para a cena durante a noite (o estado já é o do dia seguinte). */
  private nightSun = 1;
  private nightRes: Resources | null = null;
  /** Modo em grupo (null = solo). */
  private coop: CoopMode | null = null;

  // Movimentação da tripulação: física carregada sob demanda (ADR 0004).
  private readonly input = new Input();
  private motion: CrewMotion | null = null;
  private readonly targetMarker: THREE.Mesh;
  /** Mouse em cima de um astronauta (hover). */
  private hoveredRole: Role | null = null;

  // Dia em tempo real: problemas pela base e tempo da tripulação (GDD).
  private phase: DayPhase = 'morning';
  private dayElapsed = 0;
  /** Duração do dia de hoje (s): com problemas, a do jogo; no treino, um dia curto só para ver o Sol cruzar o céu. */
  private dayLength: number = CONFIG.problems.daySeconds;
  private paused = false;
  private selected: Role = 'commander';
  private readonly tasks: CrewTasks;
  private readonly markers = new ProblemMarkers();
  private readonly offscreen: OffscreenArrows;
  /** Balão de fato da NASA em cima de um astronauta (academia, estufa, pulo, EVA). */
  private readonly bubble = new CrewBubble();
  private hudTick = 0;
  private problemTipShown = false;
  private evaFactShown = false;
  /** Amostras do rover neste sol já mostradas no painel. */
  private samplesShown = 0;

  private constructor(
    container: HTMLElement,
    private readonly flares: FlareSource,
    private readonly missions: MissionSource,
  ) {
    // Perfil de qualidade (src/render/quality.ts): no celular, menos pixels, sem antialiasing e sombra mais leve.
    this.renderer = new THREE.WebGLRenderer({ antialias: QUALITY.antialias, powerPreference: 'high-performance' });
    this.maxPixelRatio = Math.min(window.devicePixelRatio, QUALITY.maxPixelRatio);
    this.renderer.setPixelRatio(this.maxPixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Sombra recalculada só de tempos em tempos (o Sol anda devagar); no computador, todo quadro.
    this.renderer.shadowMap.autoUpdate = QUALITY.shadowInterval === 0;
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

    this.base = new BaseScene(this.scene);
    // Depois de cada carga de modelos, aplica o perfil de qualidade (luzes extras, sombra e contorno das peças pequenas).
    const optimize = () => applyQuality(this.scene, [this.crew.root]);
    void this.base.loadModels().then(optimize, optimize);
    this.scene.add(this.crew.root);
    void this.crew.loadChibi().then(optimize, optimize);
    optimize();
    // A tripulação fica dentro da base por padrão; só aparece lá fora numa EVA (GDD).
    this.crew.setSheltered(true);
    this.routine = new CrewRoutine(this.crew);
    // Fatos da NASA num balão em cima de quem está fazendo aquilo (src/ui/CrewBubble.ts).
    this.routine.onFirstExercise = (role) => this.bubbleOver([role], t('fact.exercise'), t('fact.exercise.source'));
    // Fato da estufa inflável da NASA para a Lua e Marte (F20), na primeira vez que alguém trabalha na estufa.
    this.routine.onFirstGreenhouse = (role) => this.bubbleOver([role], t('fact.greenhouseInflatable'), t('fact.greenhouseInflatable.source'));

    const uiRoot = document.createElement('div');
    uiRoot.id = 'ui';
    container.appendChild(uiRoot);
    this.hud = new Hud(uiRoot, {
      onEndSol: (plan) => this.startDay(plan),
      // Em grupo, a prévia vem do servidor (mesmas regras, estado real da partida).
      preview: (plan) =>
        this.coop ? this.coop.preview
        : this.mission && this.mission.isPlanValid(plan) && !this.mission.state.pendingCard ? this.mission.previewSol(plan) : null,
      onSendProblem: (uid) => this.assignSelected(uid),
      onEvaReturn: () => this.tasks.returnNow(),
      onPause: () => this.togglePause(),
      onEndDay: () => this.endDay(),
      onSelect: (role) => this.select(role),
      onPlanChange: (plan) => {
        this.plan = plan;
        this.updateScene();
        this.coop?.sendPlan(plan);
      },
      onNasaData: () => showNasaData(this.flares, this.missions, this.mission.state.historical),
      onToggleLang: () => {
        setLang(getLang() === 'pt' ? 'en' : 'pt');
        this.hud.render();
      },
      onHowTo: () => showTutorial(() => {}, 1, () => showNasaData(this.flares, this.missions, this.mission.state.historical)),
      onToggleHull: () => this.base.setHullsOpen(!this.base.hullsOpen),
      hullsOpen: () => this.base.hullsOpen,
      nightCost: () => (this.coop || !this.mission ? CONFIG.battery.nightCost : this.mission.nightCost()),
      recentSun: () => recentSun(this.flares),
    });

    // Treino dos sóis 1 a 3 (só solo): o guia na tela e o que a cena mostra junto.
    this.intro = new IntroDirector({
      base: this.base,
      guide: new IntroGuide(),
      location: () => this.location,
      onHullChange: () => this.hud.render(),
    });

    this.targetMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.4, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.targetMarker.rotation.x = -Math.PI / 2;
    this.scene.add(this.targetMarker);
    this.setupPointer();
    this.offscreen = new OffscreenArrows(this.renderer.domElement, (uid) => this.assignSelected(uid));
    this.scene.add(this.markers.root);

    // A tripulação fala com a missão pela porta: a local (solo) ou a do servidor (grupo).
    this.tasks = new CrewTasks(() => this.port, this.crew);
    this.tasks.onChange = () => {
      this.refreshDayHud();
      this.hud.setPlaces(ROLES.length - this.tasks.outsideCount, this.tasks.outsideCount);
    };
    this.tasks.onEvaStart = ([a, b]) => {
      const names = { a: t(`crew.${a}` as StringKey), b: t(`crew.${b}` as StringKey) };
      // Primeira EVA: o fato real da NASA sobre quanto tempo se passa lá fora.
      if (!this.evaFactShown) this.bubbleOver([a, b], t('eva.fact'), t('eva.fact.source'));
      else this.hud.toast(t('eva.start', names));
      this.evaFactShown = true;
      this.coop?.evaStarted([a, b]);
    };
    this.tasks.onEvaReturn = () => this.hud.toast(t('eva.back'));
    // Modo em grupo: a EVA é da sala (no máximo uma dupla); o servidor guarda quem a comanda.
    this.tasks.onEvaEnd = () => this.coop?.evaEnded();
    this.tasks.pickBuddy = (free) => (this.coop ? this.coop.pickBuddy(free) : free[0]);
    // Conserto de dentro começa quando o astronauta chega à estufa andando pelo corredor.
    this.tasks.insideArrived = (role) => this.routine.arrivedAtTask(role);
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

  /** A missão vista agora: a local (solo) ou a do servidor (grupo). */
  private get port(): MissionPort {
    return this.coop ? this.coop.port : localPort(this.mission);
  }

  /** O estado que a interface e a cena mostram agora. */
  private get current(): GameState {
    return this.coop?.view ?? this.mission.state;
  }

  // ---------- modo e lugar ----------

  /** Solo: escolhe Marte ou Lua, cria a missão do lugar e começa o treino dos sóis 1 a 3 (o guia ensina na hora). */
  private startSolo(): void {
    showPlaceChoice((place) => {
      this.setLocation(place);
      this.newMission();
      this.startMission();
    });
  }

  /** Abertura da missão: a missão histórica (datas reais) aparece logo depois da escolha, antes do sol 1 e do treino. */
  private startMission(): void {
    const h = this.mission.state.historical;
    if (!h) {
      this.beginSol();
      return;
    }
    showMissionStart(t('mission.start', { id: h.id, date: formatDate(h.startUtc) }), t('mission.source'), () => this.beginSol());
  }

  /** Troca o lugar da base: textos, cena e gravidade (as regras vêm da Mission criada depois). */
  private setLocation(place: Location): void {
    this.location = place;
    setPlace(place);
    this.base.setLocation(place);
    this.motion?.setGravity(scenarioOf(place).gravity);
    this.hud.render();
  }

  /** Com servidor coop configurado, pergunta: sozinho ou em grupo. Sem servidor, vai direto ao solo. */
  private chooseMode(): void {
    const url = coopServerUrl();
    if (!url) {
      this.startSolo();
      return;
    }
    const saved = new CoopClient(url).savedSession();
    if (saved) {
      this.startCoop(url, saved); // recarregou a página no meio de uma partida em grupo
      return;
    }
    showModeChoice(() => this.startSolo(), () => this.startCoop(url));
  }

  private startCoop(url: string, saved?: { code: string; token: string }): void {
    // Em grupo o servidor conduz o sol: sem o guia do treino (as regras dos sóis 1 a 3 são as mesmas).
    this.intro.reset(false);
    this.coop = new CoopMode(this.coopHost(), url, saved);
  }

  /** O que o modo em grupo pode usar do jogo (ver CoopHost). */
  private coopHost(): CoopHost {
    const game = this;
    return {
      hud: this.hud,
      tasks: this.tasks,
      markers: this.markers,
      base: this.base,
      offscreen: this.offscreen,
      get motion() {
        return game.motion;
      },
      get selected() {
        return game.selected;
      },
      get phase() {
        return game.phase;
      },
      get night() {
        return game.night;
      },
      get location() {
        return game.location;
      },
      get localState() {
        return game.mission.state;
      },
      setPhase: (phase) => (this.phase = phase),
      setPaused: (paused) => (this.paused = paused),
      setPlan: (plan) => (this.plan = plan),
      setLocation: (place) => this.setLocation(place),
      select: (role) => this.select(role),
      announceProblem: (p) => this.announceProblem(p),
      playNight: (report, storm, state, onDone) => this.playNight(report, storm, state, onDone),
      refreshDayHud: () => this.refreshDayHud(),
      updateScene: () => this.updateScene(),
      onLeft: () => {
        this.coop = null;
        this.newMission();
        this.chooseMode();
      },
    };
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
        onFirstJump: (role) => this.bubbleOver([role], t('crew.fact.gravity'), t('crew.fact.source')),
        // Em grupo, cada jogador só controla o astronauta do(s) próprio(s) papel(is).
        canControl: (role) => this.canControl(role),
      });
      this.input.reset();
      this.motion.setGravity(scenarioOf(this.location).gravity);
      this.motion.enabled = !this.night && !this.paused;
      // A tripulação está dentro (escondida); quem estiver numa EVA sai pela porta.
      this.tasks.attachMotion(this.motion);
      this.motion.select(this.selected); // avisa o HUD via onSelect
    } catch (err) {
      console.warn('Física indisponível; o jogo segue só com a interface.', err);
      this.hud.setCrew('off');
    }
  }

  // ---------- tripulação: seleção, ordens, teclado e ponteiro ----------

  /** Clique num problema manda o selecionado; num astronauta, seleciona; no chão, anda até lá. */
  private setupPointer(): void {
    new ScenePointer({
      canvas: this.renderer.domElement,
      camera: this.camera,
      crewRoot: this.crew.root,
      problemPickables: () => this.markers.pickables,
      ground: () => this.scene.getObjectByName('ground'),
      isDay: () => this.phase === 'day',
      isNight: () => this.night,
      isPaused: () => this.paused,
      problemLabel: (uid) => {
        const p = this.current.problems.find((x) => x.uid === uid);
        if (!p) return null;
        const action = needsEva(p.kind) ? t('hover.eva') : t('hover.fixInside');
        return `${t(`problem.${p.kind}` as StringKey)} · ${action}`;
      },
      crewLabel: (role) => `${t(`crew.${role}` as StringKey)} · ${t(role === this.selected ? 'hover.selected' : 'hover.select')}`,
      onProblem: (uid) => this.assignSelected(uid),
      onCrew: (role) => this.select(role),
      onGround: (point) => {
        // Andar precisa da física.
        if (!this.motion || !this.motion.enabled) return;
        if (!this.canControl(this.selected)) {
          this.hud.toast(t('coop.crew.pickYours'));
          return;
        }
        this.motion.moveTo(point);
        this.targetMarker.position.set(point.x, point.y + 0.05, point.z);
        (this.targetMarker.material as THREE.MeshBasicMaterial).opacity = 0.9;
      },
      onHover: (role) => this.setHovered(role),
    });
  }

  /** Fato da NASA num balão em cima de quem está fazendo aquilo (com dois, no meio da dupla). */
  private bubbleOver(roles: Role[], text: string, source?: string): void {
    const at = new THREE.Vector3();
    this.bubble.show(text, source, () => {
      at.set(0, 0, 0);
      for (const r of roles) at.add(this.crew.members[r].root.getWorldPosition(BUBBLE_TMP));
      return at.divideScalar(roles.length).add(BUBBLE_ABOVE_HEAD);
    });
  }

  private setHovered(role: Role | null): void {
    if (this.hoveredRole === role) return;
    if (this.hoveredRole) this.crew.members[this.hoveredRole].setHovered(false);
    this.hoveredRole = role;
    if (role) this.crew.members[role].setHovered(true);
  }

  private select(role: Role): void {
    if (!this.canControl(role)) {
      this.hud.toast(this.coop ? this.coop.ownerText(role) : t('coop.crew.pickYours'));
      return;
    }
    this.selected = role;
    // Tocado e sem ordem: vira devagar para quem controla (só nesta tela; nada vai para a rede).
    if (!this.tasks.hasTask(role)) this.crew.members[role].lookAt(this.camera.position, LOOK_AT_CAMERA_SECONDS);
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
    if (r === 'ok') this.crew.members[this.selected].cancelLook(); // ordem cancela o olhar para a câmera
    if (r === 'storm') this.hud.toast(t('eva.banned'));
    else if (r === 'full') this.hud.toast(t('eva.full'));
    else if (r === 'nobody') this.hud.toast(t('eva.nobody'));
    else if (r === 'noPower') this.hud.toast(t('day.noPowerToast'));
  }

  /** Solo: todos os astronautas. Em grupo: ver CoopMode.canControl. */
  private canControl(role: Role): boolean {
    return this.coop ? this.coop.canControl(role) : true;
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
        this.select(ROLES[Number(e.code.slice(-1)) - 1]);
      }
    });
  }

  // ---------- dia em tempo real ----------

  /** "Começar o dia": se não há problemas hoje (sóis 1 e 2), vai direto para a noite. */
  private startDay(plan: EnergyPlan): void {
    if (this.coop) {
      this.coop.startDay();
      return;
    }
    const m = this.mission;
    if (!m.isPlanValid(plan) || m.state.pendingCard) return;
    this.plan = plan;
    const training = this.intro.active(m.state.sol);
    if (m.state.problems.length === 0 && !training) {
      this.endSol(plan);
      return;
    }
    // Treino (sóis 1 a 3, sem problemas): um dia curto para ver o Sol cruzar o céu e os painéis trabalharem.
    this.dayLength = m.state.problems.length === 0 ? INTRO_DAY_SECONDS : CONFIG.problems.daySeconds;
    this.phase = 'day';
    this.dayElapsed = 0;
    this.paused = false;
    this.hud.setBusy(true);
    this.refreshDayHud();
    this.updateScene();
  }

  private togglePause(): void {
    if (this.phase !== 'day') return;
    if (this.coop) {
      this.coop.togglePause();
      return;
    }
    this.paused = !this.paused;
    if (this.motion) this.motion.enabled = !this.paused;
    this.refreshDayHud();
  }

  /** Um problema apareceu na base: marcador, rover atolado e aviso. Solo e grupo. */
  private announceProblem(p: Problem): void {
    this.markers.add(p.uid, p.kind);
    if (p.kind === 'roverStuck') this.base.setRoverStuck(PROBLEM_SPOTS.roverStuck);
    this.hud.toast(t('problem.new', { problem: t(`problem.${p.kind}` as StringKey) }), this.problemTipShown ? undefined : t('day.hint'));
    this.problemTipShown = true;
  }

  private updateDay(dt: number): void {
    if (this.coop) {
      this.coop.updateDay(dt);
      return;
    }
    const port = this.port;
    this.dayElapsed += dt;
    for (const p of port.state.problems) {
      if (p.status === 'pending' && this.dayElapsed >= p.spawnAt) {
        port.dispatch({ type: 'openProblem', uid: p.uid });
        this.announceProblem(p);
        this.refreshDayHud();
      }
    }
    this.tasks.update(dt);
    for (const p of port.state.problems) {
      if (p.status === 'open') this.markers.setProgress(p.uid, p.progress, this.tasks.isWorking(p.uid));
    }
    const allDone = port.state.problems.length > 0 && port.state.problems.every((p) => p.status === 'done');
    if (this.dayElapsed >= this.dayLength || allDone) this.endDay();
  }

  private endDay(): void {
    if (this.phase !== 'day') return;
    if (this.coop) {
      this.coop.endDay();
      return;
    }
    this.phase = 'night';
    this.paused = false;
    this.tasks.clear();
    this.hud.setPlaces(ROLES.length, 0);
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
    const items = this.current.problems
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
    const port = this.port;
    const coopRemaining = this.coop?.dayRemaining;
    this.hud.setDay({
      remaining: coopRemaining ?? Math.max(0, Math.ceil(this.dayLength - this.dayElapsed)),
      paused: this.paused,
      selected: this.selected,
      evaBanned: port.evaBanned,
      evaActive: this.tasks.evaActive,
      training: !this.coop && port.state.problems.length === 0 && this.intro.active(port.state.sol),
      crew: ROLES.map((role) => ({
        role,
        place: this.tasks.placeOf(role),
        activity: this.tasks.isRoleWorking(role) ? 'working' as const : this.tasks.hasTask(role) ? 'going' as const : 'idle' as const,
      })),
      problems: port.state.problems
        .filter((p) => p.status !== 'pending')
        .map((p) => ({ uid: p.uid, kind: p.kind, status: p.status, progress: p.progress, worker: this.tasks.workerOf(p.uid), phase: this.tasks.phaseOf(p.uid) })),
    });
  }

  // ---------- fluxo da missão (solo) ----------
  // Manhã (carta) → plano → dia (problemas) → noite → relatório → manhã… → fim. Em grupo, o servidor conduz.

  private newMission(): void {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    // Marte: missão histórica real, se houver; senão, erupções reais sorteadas; senão, simuladas.
    // Lua: erupções reais sorteadas (o atraso das missões históricas é Terra-Marte; não serve para a Lua).
    const historical = this.location === 'mars' ? pickHistorical(this.missions.missions, seed, isFirstGame()) : null;
    this.mission = new Mission(seed, this.flares.flares, historical, this.location);
    this.bubble.hide();
    // Solo começa pelo treino (a base fechada); em grupo, sem treino.
    this.intro.reset(!this.coop);
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
    this.intro.morning(s, this.mission.nightCost());
    if (s.pendingCard) {
      showCard(s.pendingCard, (option) => {
        this.port.dispatch({ type: 'answerCard', option });
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
    this.intro.night(m.state.sol);
    this.shadowNight = m.shadowLeft() > 0;
    this.nightSun = m.sunlightToday() / 100;
    const { report } = this.port.dispatch({ type: 'endSol', plan });
    this.playNight(report!, stormTonight, m.state, () => {
      if (m.state.outcome.status === 'playing') this.beginSol();
      else this.finish();
    });
  }

  /** Noite: a cena mostra o resultado do dia enquanto escurece; depois, o relatório. Solo e grupo. */
  private playNight(report: SolReport, stormTonight: boolean, state: GameState, onDone: () => void): void {
    this.phase = 'night';
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
    // Jogar de novo: escolhe o lugar outra vez (dá para experimentar Marte e Lua e comparar).
    showEnd(this.mission.state, () =>
      showPlaceChoice((place) => {
        this.setLocation(place);
        this.newMission();
        this.startMission();
      }),
    );
  }

  /** Bateria prevista para depois da noite (a mesma prévia do plano; solo ou servidor). Só para a cena, de dia. */
  private batteryTarget(): number | undefined {
    if (this.night || this.phase !== 'day') return undefined;
    const pv = this.coop
      ? this.coop.preview
      : this.mission && this.mission.isPlanValid(this.plan) && !this.mission.state.pendingCard ? this.mission.previewSol(this.plan) : null;
    return pv?.after.battery;
  }

  /** Nome curto do papel (plaquinha de quem está trabalhando). */
  private shortName(role: Role): string {
    return t(`crew.short.${role}` as StringKey);
  }

  private updateScene(): void {
    const s = this.current;
    this.base.setState({
      res: this.nightRes ?? s.res,
      alert: !this.night && s.messages.some((m) => m.kind === 'stormAlert' || m.kind === 'stormToday'),
      night: this.night,
      stormNight: this.stormNight,
      earthMessage: !this.night && s.messages.some((m) => m.kind !== 'dustNow' && m.kind !== 'shadowNow'),
      scienceBlocks: this.plan.science,
      dustStorm: s.messages.some((m) => m.kind === 'dustNow') || (s.dustHold ?? 0) > 0,
      sol: s.sol,
      // De noite, o estado já é o do dia seguinte: a sombra que vale é a da noite que está passando.
      shadow: this.night ? this.shadowNight : s.messages.some((m) => m.kind === 'shadowNow'),
      sunlight: this.night ? this.nightSun : this.coop ? 1 : this.mission.sunlightToday() / 100,
      batteryTarget: this.batteryTarget(),
    });
  }

  /**
   * Hora do sol para o Sol andar no céu (só cena): de manhã (plano) ele acabou de nascer; no dia, cruza o céu
   * com o relógio do dia; à noite, se põe.
   */
  private dayTime(): number {
    if (this.night) return 1.15;
    if (this.phase === 'day') {
      const total = this.coop ? CONFIG.problems.daySeconds : this.dayLength;
      const elapsed = this.coop ? total - (this.coop.dayRemaining ?? total) : this.dayElapsed;
      return 0.25 + 0.6 * THREE.MathUtils.clamp(elapsed / total, 0, 1);
    }
    return 0.2;
  }

  // ---------- render ----------

  /**
   * Desempenho a cada quadro: sombra recalculada no intervalo do perfil e **resolução dinâmica** (como nos
   * consoles): se a média do quadro passa de `slowFrameMs`, baixa a densidade de pixels um degrau; se sobra
   * folga, sobe devagar. Espera 2 s depois de cada troca, para não ficar oscilando.
   */
  private updatePerformance(rawDt: number): void {
    if (QUALITY.shadowInterval > 0) {
      this.shadowTimer += rawDt;
      if (this.shadowTimer >= QUALITY.shadowInterval) {
        this.shadowTimer = 0;
        this.renderer.shadowMap.needsUpdate = true;
      }
    }
    this.perfTime += rawDt;
    this.perfFrames++;
    this.perfCooldown -= rawDt;
    if (this.perfTime < 1) return;
    const avgMs = (this.perfTime / this.perfFrames) * 1000;
    this.perfTime = 0;
    this.perfFrames = 0;
    if (this.perfCooldown > 0 || document.hidden) return;
    const pr = this.renderer.getPixelRatio();
    let next = pr;
    if (avgMs > QUALITY.slowFrameMs && pr > QUALITY.minPixelRatio) next = Math.max(QUALITY.minPixelRatio, pr - 0.25);
    else if (avgMs < QUALITY.fastFrameMs && pr < this.maxPixelRatio) next = Math.min(this.maxPixelRatio, pr + 0.125);
    if (next === pr) return;
    this.renderer.setPixelRatio(next);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.perfCooldown = 2;
  }

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
    this.base.setDayTime(this.dayTime());
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
    this.bubble.update(dt, this.camera, this.renderer.domElement);
    this.coop?.crewTick(dt);
    // Tubos enchendo ao vivo: cada parada de estudo do rover é uma amostra (o número final vem da regra, na noite).
    const samples = this.base.roverSamplesToday;
    if (samples !== this.samplesShown) {
      this.samplesShown = samples;
      this.hud.setSamplesToday(samples);
    }
    for (const r of ROLES) {
      const working = this.phase === 'day' && this.tasks.isRoleWorking(r);
      this.crew.members[r].setWorking(working, working ? this.shortName(r) : '');
    }
    if (this.motion) {
      this.motion.update(rawDt); // a física tem o próprio limite (MAX_FRAME_DT)
      const motion = this.motion;
      const state = this.current;
      this.routine.update(dt, {
        awake: this.phase === 'morning' || this.phase === 'day',
        sleeping: this.phase === 'night' && !this.stormNight,
        alert: state.messages.some((m) => m.kind === 'stormAlert' || m.kind === 'stormToday'),
        isOutside: (r) => !motion.isInside(r),
        inHabitat: (r) => this.tasks.placeOf(r) === 'inside',
        onInsideTask: (r) => this.tasks.onInsideTask(r),
        insideTaskKind: (r) => this.tasks.insideTaskKind(r),
      });
      this.base.setTreadmillsRunning(this.routine.anyoneOnTreadmill());
    } else this.crew.update(dt);
    const marker = this.targetMarker.material as THREE.MeshBasicMaterial;
    marker.opacity = Math.max(0, marker.opacity - dt * 0.8);
    this.updatePerformance(rawDt);
    this.renderer.render(this.scene, this.camera);
  }
}
