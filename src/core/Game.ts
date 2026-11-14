import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import '@/ui/style.css';
import { Mission } from '@/sim/mission';
import type { CardId, EnergyPlan, GameState, Message, Resources, SolReport } from '@/sim/types';
import { loadFlares, type FlareSource } from '@/data/flares';
import { MarsBase } from '@/scene/MarsBase';
import { Crew } from '@/scene/Crew';
import { Hud } from '@/ui/Hud';
import { showCard, showEnd, showNasaData, showReport, showTutorial } from '@/ui/dialogs';
import { Lobby, showEarthTurn, showModeChoice } from '@/ui/coop';
import { CoopClient, coopServerUrl } from '@/net/CoopClient';
import { BLOCK_ROLE, type CoopState } from '@/net/protocol';
import { getLang, setLang, t } from '@/i18n';
import { Input } from './Input';
import type { CrewMotion } from '@/scene/crewMotion';
import type { Role } from '@/scene/MarsBase';

/** Duração da animação da noite antes do relatório (ms). */
const NIGHT_MS = 2200;

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
}

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
  private coop: CoopSession | null = null;

  // Movimentação da tripulação: física carregada sob demanda (ADR 0004).
  private readonly input = new Input();
  private motion: CrewMotion | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly targetMarker: THREE.Mesh;
  private pointerDown: { x: number; y: number; t: number } | null = null;

  private constructor(
    container: HTMLElement,
    private readonly flares: FlareSource,
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
      onEndSol: (plan) => this.endSol(plan),
      onPlanChange: (plan) => {
        this.plan = plan;
        this.updateScene();
        this.sendCoopPlan(plan);
      },
      onNasaData: () => showNasaData(this.flares),
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

    this.newMission();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.timer.connect(document);
  }

  static async create(container: HTMLElement): Promise<Game> {
    const flares = await loadFlares();
    const game = new Game(container, flares);
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
        input: this.input,
        camera: this.camera,
        onSelect: (role) => this.hud.setCrew('ready', role),
        onFirstJump: () => this.hud.toast(t('crew.fact.gravity'), t('crew.fact.source')),
      });
      this.input.reset();
      this.motion.enabled = !this.night;
      this.hud.setCrew('ready', this.motion.selected);
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
      if (!d || !this.motion || !this.motion.enabled) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 500) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hitCrew = this.raycaster.intersectObject(this.crew.root, true)[0];
      if (hitCrew) {
        let o: THREE.Object3D | null = hitCrew.object;
        while (o && !o.userData.role) o = o.parent;
        if (o) this.motion.select(o.userData.role as Role);
        return;
      }
      const ground = this.scene.getObjectByName('ground');
      const hit = ground && this.raycaster.intersectObject(ground, false)[0];
      if (hit) {
        this.motion.moveTo(hit.point);
        this.targetMarker.position.set(hit.point.x, hit.point.y + 0.05, hit.point.z);
        (this.targetMarker.material as THREE.MeshBasicMaterial).opacity = 0.9;
      }
    });
  }

  // ---------- fluxo da missão ----------

  private newMission(): void {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    this.mission = new Mission(seed, this.flares.flares);
    this.hud.setState(this.mission.state);
    this.updateScene();
  }

  /** Começo de um sol: mostra o estado e, se houver, a carta do dia. */
  private beginSol(): void {
    const s = this.mission.state;
    this.hud.setState(s);
    this.hud.newSol();
    this.updateScene();
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
    if (this.coop) {
      this.coop.client.send({ t: 'end_sol' }); // o servidor confere se é o comandante
      return;
    }
    const m = this.mission;
    if (!m.isPlanValid(plan) || m.state.pendingCard) return;
    const stormTonight = m.stormToday !== undefined;
    const report = m.endSol(plan);
    this.playNight(report, stormTonight, m.state, () => {
      if (m.state.outcome.status === 'playing') this.beginSol();
      else this.finish();
    });
  }

  /** Noite: a cena mostra o resultado do dia enquanto escurece; depois, o relatório. */
  private playNight(report: SolReport, stormTonight: boolean, state: GameState, onDone: () => void): void {
    this.hud.setBusy(true);
    this.night = true;
    this.stormNight = stormTonight;
    this.nightRes = report.after;
    this.crew.setSheltered(stormTonight);
    if (this.motion) this.motion.enabled = false;
    this.hud.showNight(report.after, report.sol);
    this.updateScene();

    window.setTimeout(() => {
      showReport(report, state, () => {
        this.night = false;
        this.stormNight = false;
        this.nightRes = null;
        this.crew.setSheltered(false);
        if (this.motion) this.motion.enabled = true;
        this.hud.setBusy(false);
        onDone();
      });
    }, NIGHT_MS);
  }

  private finish(): void {
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
    };
    this.coop = c;
    client.onState = (s) => this.onCoopState(s);
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

    if (report && report.sol > c.shownReportSol) {
      c.shownReportSol = report.sol;
      c.closeEarth?.();
      c.closeEarth = null;
      c.nightBusy = true;
      const view = this.coopView(s);
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
    this.hud.setCoop({
      editable: s.phase === 'mars' ? PLAN_KEYS.filter((k) => roles.includes(BLOCK_ROLE[k])) : [],
      canEnd: isCommander && s.phase === 'mars',
      note,
    });
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
          c.client.send({ t: 'start' });
        } else {
          this.hud.toast(t('coop.again.wait'));
        }
      });
    }
    if (s.phase !== 'ended') c.endShown = false;
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
      reports: last ? [last] : [],
      outcome: m?.outcome ?? e?.outcome ?? { status: 'playing' },
    };
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

  private frame(time: number): void {
    this.timer.update(time);
    const rawDt = this.timer.getDelta();
    const dt = Math.min(rawDt, 0.1); // animações

    const t = this.timer.getElapsed();
    this.controls.update();
    this.base.update(dt, t);
    if (this.motion) this.motion.update(rawDt); // a física tem o próprio limite (MAX_FRAME_DT)
    else this.crew.update(dt);
    const marker = this.targetMarker.material as THREE.MeshBasicMaterial;
    marker.opacity = Math.max(0, marker.opacity - dt * 0.8);
    this.renderer.render(this.scene, this.camera);
  }
}
