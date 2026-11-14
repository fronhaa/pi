import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import '@/ui/style.css';
import { Mission } from '@/sim/mission';
import type { EnergyPlan, Resources } from '@/sim/types';
import { loadFlares, type FlareSource } from '@/data/flares';
import { isFirstGame, loadMissions, markPlayed, type MissionSource } from '@/data/missions';
import { pickHistorical } from '@/sim/historical';
import { MarsBase } from '@/scene/MarsBase';
import { Crew } from '@/scene/Crew';
import { Hud } from '@/ui/Hud';
import { showCard, showEnd, showNasaData, showReport, showTutorial } from '@/ui/dialogs';
import { formatDate, getLang, setLang, t } from '@/i18n';
import { Input } from './Input';
import { CrewTasks } from './CrewTasks';
import { NIGHT_WALK_SPEED, STORM_RUN_SPEED } from './constants';
import type { CrewMotion } from '@/scene/crewMotion';
import { ENTRANCES, PROBLEM_SPOTS, type Role } from '@/scene/MarsBase';
import { ProblemMarkers } from '@/scene/ProblemMarkers';
import { CONFIG } from '@/sim/config';
import type { StringKey } from '@/i18n';

/** Duração mínima da noite antes do relatório (ms). */
const NIGHT_MS = 2200;
/** A noite espera a tripulação entrar, mas no máximo isto (ms); quem não chegou entra direto. */
const NIGHT_MAX_MS = 6000;


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
  private nightRes: Resources | null = null;

  // Movimentação da tripulação: física carregada sob demanda (ADR 0004).
  private readonly input = new Input();
  private motion: CrewMotion | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly targetMarker: THREE.Mesh;
  private pointerDown: { x: number; y: number; t: number } | null = null;

  // Dia em tempo real: problemas pela base e tempo da tripulação (GDD).
  private phase: 'morning' | 'day' | 'night' = 'morning';
  private dayElapsed = 0;
  private paused = false;
  private selected: Role = 'commander';
  private readonly tasks: CrewTasks;
  private readonly markers = new ProblemMarkers();
  private hudTick = 0;
  private problemTipShown = false;

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
    this.scene.add(this.crew.root);

    const uiRoot = document.createElement('div');
    uiRoot.id = 'ui';
    container.appendChild(uiRoot);
    this.hud = new Hud(uiRoot, {
      onEndSol: (plan) => this.startDay(plan),
      onSendProblem: (uid) => this.tasks.assign(this.selected, uid),
      onPause: () => this.togglePause(),
      onEndDay: () => this.endDay(),
      onSelect: (role) => this.select(role),
      onPlanChange: (plan) => {
        this.plan = plan;
        this.updateScene();
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
    this.scene.add(this.markers.root);
    this.tasks = new CrewTasks(() => this.mission, this.crew);
    this.tasks.onChange = () => this.refreshDayHud();
    this.tasks.onResolved = (p) => {
      this.markers.remove(p.uid);
      if (p.kind === 'roverStuck') this.base.setRoverStuck(null);
      this.hud.render();
      this.updateScene();
      if (this.mission.state.outcome.status !== 'playing') this.endDay();
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
    showTutorial(() => this.beginSol());
    void this.loadMotion();
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
      });
      this.input.reset();
      this.motion.enabled = !this.night && !this.paused;
      this.tasks.motion = this.motion;
      // Física chegou no meio da noite: a tripulação já está "dentro" (escondida); de manhã sai pela porta.
      if (this.night) this.motion.forceInside();
      this.motion.select(this.selected); // avisa o HUD via onSelect
    } catch (err) {
      console.warn('Física indisponível; o jogo segue só com a interface.', err);
      this.hud.setCrew('off');
    }
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
          if (o) this.tasks.assign(this.selected, o.userData.problemUid as number);
          return;
        }
      }
      // 2) Clique num astronauta: seleciona.
      const hitCrew = this.raycaster.intersectObject(this.crew.root, true)[0];
      if (hitCrew) {
        let o: THREE.Object3D | null = hitCrew.object;
        while (o && !o.userData.role) o = o.parent;
        if (o) this.select(o.userData.role as Role);
        return;
      }
      // 3) Clique no chão: anda até lá (precisa da física).
      if (!this.motion || !this.motion.enabled) return;
      const ground = this.scene.getObjectByName('ground');
      const hit = ground && this.raycaster.intersectObject(ground, false)[0];
      if (hit) {
        this.motion.moveTo(hit.point);
        this.targetMarker.position.set(hit.point.x, hit.point.y + 0.05, hit.point.z);
        (this.targetMarker.material as THREE.MeshBasicMaterial).opacity = 0.9;
      }
    });
  }

  private select(role: Role): void {
    this.selected = role;
    if (this.motion) this.motion.select(role); // avisa o HUD via onSelect
    else {
      for (const [r, a] of Object.entries(this.crew.members)) a.setSelected(r === role);
      this.refreshDayHud();
    }
  }

  /** E: consertar o problema mais perto · P: pausar o dia · 1–4 sem física: escolher astronauta. */
  private setupKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.phase === 'day' && e.code === 'KeyP') this.togglePause();
      if (this.phase === 'day' && !this.paused && e.code === 'KeyE') {
        if (!this.tasks.interact(this.selected)) this.hud.toast(t('task.nothingNear'));
      }
      if (!this.motion && /^(Digit|Numpad)[1-4]$/.test(e.code)) {
        this.select((['commander', 'engineer', 'medic', 'scientist'] as Role[])[Number(e.code.slice(-1)) - 1]);
      }
    });
  }

  // ---------- dia em tempo real ----------

  /** "Começar o dia": se não há problemas hoje (sóis 1 e 2), vai direto para a noite. */
  private startDay(plan: EnergyPlan): void {
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
    this.paused = !this.paused;
    if (this.motion) this.motion.enabled = !this.paused;
    this.refreshDayHud();
  }

  private updateDay(dt: number): void {
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
    this.phase = 'night';
    this.paused = false;
    this.tasks.clear();
    this.markers.clear();
    this.base.setRoverStuck(null);
    this.hud.setDay(null);
    if (this.mission.state.outcome.status !== 'playing') {
      this.finish();
      return;
    }
    this.endSol(this.plan);
  }

  private refreshDayHud(): void {
    if (this.phase !== 'day') return;
    const s = this.mission.state;
    this.hud.setDay({
      remaining: Math.max(0, Math.ceil(CONFIG.problems.daySeconds - this.dayElapsed)),
      paused: this.paused,
      selected: this.selected,
      problems: s.problems
        .filter((p) => p.status !== 'pending')
        .map((p) => ({ uid: p.uid, kind: p.kind, status: p.status, progress: p.progress, worker: this.tasks.workerOf(p.uid), working: this.tasks.isWorking(p.uid) })),
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
    this.phase = 'night';
    const stormTonight = m.stormToday !== undefined;
    const report = m.endSol(plan);

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
      showReport(report, m.state, () => {
        this.night = false;
        this.stormNight = false;
        this.nightRes = null;
        if (this.motion) {
          this.motion.comeOut(ENTRANCES[entrance]);
          this.motion.enabled = true;
        } else {
          this.crew.setSheltered(false);
        }
        this.hud.setBusy(false);
        if (m.state.outcome.status === 'playing') this.beginSol();
        else this.finish();
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
    const s = this.mission.state;
    this.base.setState({
      res: this.nightRes ?? s.res,
      alert: !this.night && s.messages.some((m) => m.kind === 'stormAlert' || m.kind === 'stormToday'),
      night: this.night,
      stormNight: this.stormNight,
      earthMessage: !this.night && s.messages.some((m) => m.kind !== 'dustNow'),
      scienceBlocks: this.plan.science,
    });
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

  private frame(time: number): void {
    this.timer.update(time);
    const rawDt = this.timer.getDelta();
    const dt = Math.min(rawDt, 0.1); // animações

    const t = this.timer.getElapsed();
    this.controls.update();
    // O rover recebe onde estão os astronautas visíveis (quem está dentro da base não conta).
    const crewPositions = Object.values(this.crew.members).filter((a) => a.root.visible).map((a) => a.root.position);
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
    if (this.motion) this.motion.update(rawDt); // a física tem o próprio limite (MAX_FRAME_DT)
    else this.crew.update(dt);
    const marker = this.targetMarker.material as THREE.MeshBasicMaterial;
    marker.opacity = Math.max(0, marker.opacity - dt * 0.8);
    this.renderer.render(this.scene, this.camera);
  }
}
