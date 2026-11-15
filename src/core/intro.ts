import type { BaseScene } from '@/scene/BaseScene';
import type { IntroGuide } from '@/ui/IntroGuide';
import { getLang, t, type StringKey } from '@/i18n';
import { CONFIG, type Location } from '@/sim/config';
import type { GameState } from '@/sim/types';

/**
 * Treino dos sóis 1 a 3 (docs/game-design.md, "Introdução: sóis 1 a 3"): o que o guia mostra em cada sol e o que a
 * cena faz junto. Tudo aqui é só visual e texto: as regras desses sóis (sem cartas, problemas nem poeira) estão em
 * src/sim/config.ts (`intro`, `cards`, `problems`, `dustStorm`). Só no modo solo; em grupo, o servidor conduz o sol.
 */

/** O que a cena faz num passo: ao entrar e ao sair dele. */
interface StepDef {
  id: string;
  enter?: (ctx: StepContext) => void;
  exit?: (ctx: StepContext) => void;
}

interface StepContext {
  base: BaseScene;
  location: Location;
}

/**
 * No máximo 3 passos por vez (docs/publico-e-impacto.md, "Aprende jogando"). Sol 1: a base fechada, depois por
 * dentro; a energia do dia. Sol 2: a Terra e a bateria. Sol 3: o treino de poeira e de tempestade solar.
 */
const MORNING: Record<number, StepDef[]> = {
  1: [
    { id: '1.base', enter: ({ base }) => base.setHullsOpen(false) },
    { id: '1.inside', enter: ({ base }) => base.setHullsOpen(true) },
    { id: '1.day' },
  ],
  2: [{ id: '2.earth' }, { id: '2.far' }, { id: '2.battery' }],
  3: [
    // Marte: o céu enche de poeira (F27). Lua: sem vento não há poeira no céu; o treino é a sombra das montanhas.
    {
      id: '3.dust',
      enter: ({ base, location }) => base.setDemo(location === 'moon' ? { dark: 0.85 } : { dust: 1.35 }),
      exit: ({ base }) => base.setDemo(null),
    },
    { id: '3.solar', enter: ({ base }) => base.setDemo({ alert: true }), exit: ({ base }) => base.setDemo(null) },
    { id: '3.end' },
  ],
};

/** Na noite do sol 1: a bateria sustenta a base sem Sol. */
const NIGHT: Record<number, StepDef[]> = {
  1: [{ id: '1.night' }],
};

export interface IntroHost {
  base: BaseScene;
  guide: IntroGuide;
  location: () => Location;
  /** O casco abriu ou fechou: o HUD atualiza o botão. */
  onHullChange: () => void;
}

export class IntroDirector {
  private on = false;
  private steps: StepDef[] = [];
  private index = 0;
  private params: Record<string, string | number> = {};

  constructor(private readonly host: IntroHost) {}

  /** Missão nova: com treino (solo), a base começa fechada; sem treino (grupo), aberta como sempre. */
  reset(withIntro: boolean): void {
    this.on = withIntro;
    this.host.guide.hide();
    this.host.base.setDemo(null);
    this.host.base.setHullsOpen(!withIntro, true);
    this.host.onHullChange();
  }

  /** O sol ainda é de treino? */
  active(sol: number): boolean {
    return this.on && sol >= 1 && sol <= CONFIG.intro.sols;
  }

  /** Manhã de um sol de treino: começa os passos do dia. */
  morning(state: GameState, nightCost: number): void {
    if (!this.active(state.sol)) return;
    const delay = state.messages.find((m) => 'delayMin' in m)?.delayMin ?? 0;
    const min = delay.toLocaleString(getLang() === 'pt' ? 'pt-BR' : 'en');
    this.run(MORNING[state.sol] ?? [], { sol: state.sol, min, cost: nightCost });
  }

  /** Noite de um sol de treino (chamado antes de a noite começar). */
  night(sol: number): void {
    if (!this.active(sol)) return;
    this.run(NIGHT[sol] ?? [], { sol });
  }

  /** Pular o treino: some o guia, acaba a demonstração e a base fica aberta. */
  skip(): void {
    this.on = false;
    this.steps = [];
    this.host.guide.hide();
    this.host.base.setDemo(null);
    this.host.base.setHullsOpen(true);
    this.host.onHullChange();
  }

  private run(steps: StepDef[], params: Record<string, string | number>): void {
    // Um passo ainda aberto (ex.: a criança começou o dia sem tocar em "Entendi") sai antes do próximo grupo.
    this.leave();
    this.steps = steps;
    this.params = params;
    this.index = 0;
    this.show();
  }

  private get ctx(): StepContext {
    return { base: this.host.base, location: this.host.location() };
  }

  private show(): void {
    const step = this.steps[this.index];
    if (!step) {
      this.host.guide.hide();
      return;
    }
    step.enter?.(this.ctx);
    this.host.onHullChange();
    const key = (k: string) => t(`intro.${step.id}.${k}` as StringKey, this.params);
    this.host.guide.show(
      {
        badge: t('intro.badge', this.params),
        title: key('title'),
        text: key('text'),
        last: this.index === this.steps.length - 1,
      },
      () => {
        this.leave();
        this.index++;
        this.show();
      },
      () => this.skip(),
    );
  }

  /** Sai do passo atual (desfaz o que ele mostrou, se precisar). */
  private leave(): void {
    this.steps[this.index]?.exit?.(this.ctx);
  }
}
