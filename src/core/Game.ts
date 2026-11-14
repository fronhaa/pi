import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import '@/ui/style.css';
import { Mission } from '@/sim/mission';
import type { EnergyPlan, Resources } from '@/sim/types';
import { loadFlares, type FlareSource } from '@/data/flares';
import { MarsBase } from '@/scene/MarsBase';
import { Crew } from '@/scene/Crew';
import { Hud } from '@/ui/Hud';
import { showCard, showEnd, showNasaData, showReport, showTutorial } from '@/ui/dialogs';
import { getLang, setLang } from '@/i18n';

/** Duração da animação da noite antes do relatório (ms). */
const NIGHT_MS = 2200;

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
      },
      onNasaData: () => showNasaData(this.flares),
      onToggleLang: () => {
        setLang(getLang() === 'pt' ? 'en' : 'pt');
        this.hud.render();
      },
      onHowTo: () => showTutorial(() => {}),
    });

    this.newMission();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.timer.connect(document);
  }

  static async create(container: HTMLElement): Promise<Game> {
    const flares = await loadFlares();
    return new Game(container, flares);
  }

  start(): void {
    this.renderer.setAnimationLoop((t) => this.frame(t));
    showTutorial(() => this.beginSol());
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
    const m = this.mission;
    if (!m.isPlanValid(plan) || m.state.pendingCard) return;
    const stormTonight = m.stormToday !== undefined;
    const report = m.endSol(plan);

    // Noite: a cena mostra o resultado do dia enquanto escurece.
    this.hud.setBusy(true);
    this.night = true;
    this.stormNight = stormTonight;
    this.nightRes = report.after;
    this.crew.setSheltered(stormTonight);
    this.hud.showNight(report.after, report.sol);
    this.updateScene();

    window.setTimeout(() => {
      showReport(report, m.state, () => {
        this.night = false;
        this.stormNight = false;
        this.nightRes = null;
        this.crew.setSheltered(false);
        this.hud.setBusy(false);
        if (m.state.outcome.status === 'playing') this.beginSol();
        else this.finish();
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
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const t = this.timer.getElapsed();
    this.controls.update();
    this.base.update(dt, t);
    this.crew.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
