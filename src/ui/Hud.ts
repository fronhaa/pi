import { CONFIG } from '@/sim/config';
import type { EnergyPlan, Flare, GameState, ProblemKind, Resources } from '@/sim/types';
import { PROBLEMS, taskBattery } from '@/sim/problems';
import type { Mission } from '@/sim/mission';
import { CONFIG as SIM, doseFor3 } from '@/sim/config';

/** Prévia calculada pela simulação (Mission.previewSol). */
export type PlanPreview = ReturnType<Mission['previewSol']>;
import { formatDate, getLang, t, type StringKey } from '@/i18n';
import type { MarsMessage } from '@/net/protocol';
import type { Role } from '@/sim/crew';
import { h, openDialog, patchChildren } from './dom';

type RoleId = Role;

export interface DayView {
  remaining: number;
  paused: boolean;
  selected: RoleId;
  /** Tempestade hoje (aviso recebido): ninguém sai da base. */
  evaBanned: boolean;
  /** Tem uma dupla lá fora (ou na câmara de descompressão). */
  evaActive: boolean;
  /** Dia de treino (sóis 1 a 3, sem problemas): o painel só explica que os painéis estão fazendo energia. */
  training?: boolean;
  /** Onde cada um está e o que está fazendo (parado, indo para a tarefa ou trabalhando). */
  crew: { role: RoleId; place: 'inside' | 'airlock' | 'outside'; activity: 'idle' | 'going' | 'working' }[];
  problems: {
    uid: number;
    kind: ProblemKind;
    status: 'open' | 'done' | 'pending';
    progress: number;
    worker?: string;
    phase?: 'airlock' | 'walking' | 'working';
  }[];
}

export interface HudCallbacks {
  /** Prévia do plano: o que acontece se o sol terminar com este plano (mesmo cálculo do jogo). */
  preview?(plan: EnergyPlan): PlanPreview | null;
  /** "Terminar o sol" ou "Começar o dia" (quando há problemas hoje). */
  onEndSol(plan: EnergyPlan): void;
  onSendProblem(uid: number): void;
  /** Termina a EVA: a dupla volta para dentro. */
  onEvaReturn(): void;
  onPause(): void;
  onEndDay(): void;
  onSelect(role: RoleId): void;
  onPlanChange(plan: EnergyPlan): void;
  onNasaData(): void;
  onToggleLang(): void;
  onHowTo(): void;
  /** Fecha ou abre o casco das cápsulas (só visual). */
  onToggleHull(): void;
  /** O casco está aberto (transparente)? */
  hullsOpen(): boolean;
  /** Bateria que a base gasta até amanhã (Marte: a noite; Lua: descanso ou noite fria da sombra). */
  nightCost?(): number;
}

type PlanKey = keyof EnergyPlan;
const PLAN_KEYS: PlanKey[] = ['life', 'shield', 'science'];

/** Modo em grupo: o que ESTE jogador pode fazer (docs/servidor-coop.md). null = jogo solo. */
export interface CoopHud {
  /** Partes do plano que o papel do jogador controla. */
  editable: PlanKey[];
  /** Só o comandante começa o dia, termina o sol e pausa. */
  canEnd: boolean;
  /** Aviso curto no topo do plano (ex.: "A Terra está mandando a mensagem…"). */
  note?: string;
}

/**
 * Interface sobre a cena (UI-001): barra superior, recursos, mensagens da Terra e plano de energia.
 * Só mostra o estado e repassa decisões; as regras ficam em src/sim.
 */
export class Hud {
  private state: GameState | null = null;
  private plan: EnergyPlan = { life: 3, shield: 1, science: 3 };
  private busy = false;
  /** Amostras que o rover já coletou hoje (cena): os tubos do painel enchem ao vivo. */
  private samplesToday = 0;
  /** Durante a noite, mostra o resultado do dia ainda com o número do sol que acabou. */
  private nightView: { res: Resources; sol: number } | null = null;

  private readonly top = h('header', { class: 'top' });
  /**
   * Meta da missão no topo (ciência e tubos). O desafio pede 2 ou 3 recursos centrais: o painel da esquerda
   * mostra só energia, suporte de vida e proteção; ciência é a meta e a dose é o risco dentro da proteção.
   */
  private readonly goal = h('div', { class: 'goal-slot' });
  private readonly resources = h('section', { class: 'resources panel', 'aria-labelledby': 'res-title' });
  private readonly messages = h('section', { class: 'messages panel', 'aria-live': 'polite', 'aria-labelledby': 'msg-title' });
  private readonly planEl = h('section', { class: 'plan panel', 'aria-labelledby': 'plan-title' });
  /** Painel do plano/dia recolhido: só o título e os botões principais, para ver a cena inteira. */
  private planCollapsed = false;
  private readonly crewChip = h('div', { class: 'crew-chip', 'aria-live': 'polite' });
  private crewView: { status: 'loading' | 'ready' | 'off'; role?: string } = { status: 'loading' };
  private placesView = { inside: 4, outside: 0 };
  private coop: CoopHud | null = null;
  private dayView: DayView | null = null;

  constructor(
    root: HTMLElement,
    private readonly cb: HudCallbacks,
  ) {
    root.append(this.top, this.resources, this.messages, this.planEl, this.crewChip);
  }

  setState(state: GameState): void {
    this.state = state;
    this.nightView = null;
    this.render();
  }

  showNight(res: Resources, sol: number): void {
    this.nightView = { res, sol };
    this.renderTop();
    this.renderResources();
  }

  /** Início de um sol: mantém o plano anterior, ajustado aos blocos de hoje. */
  newSol(): void {
    this.clampPlan();
    this.render();
    this.cb.onPlanChange({ ...this.plan });
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.renderPlan();
  }

  getPlan(): EnergyPlan {
    return { ...this.plan };
  }

  /** Modo em grupo: permissões deste jogador. null volta ao solo. */
  setCoop(coop: CoopHud | null): void {
    this.coop = coop;
    this.renderPlan();
  }

  /** Modo em grupo: o plano vem do servidor (todos veem o mesmo). */
  setPlan(plan: EnergyPlan): void {
    this.plan = { ...plan };
    this.renderPlan();
  }

  /** Dia em tempo real: troca o plano de energia pela lista de problemas. null = volta ao plano. */
  setDay(view: DayView | null): void {
    this.dayView = view;
    this.renderPlan();
  }

  /** Estado da movimentação da tripulação (física carregada sob demanda). */
  setCrew(status: 'loading' | 'ready' | 'off', role?: string): void {
    this.crewView = { status, role };
    this.renderCrew();
  }

  /** Quantos astronautas estão dentro e fora da base (EVA). */
  setPlaces(inside: number, outside: number): void {
    if (this.placesView.inside === inside && this.placesView.outside === outside) return;
    this.placesView = { inside, outside };
    this.renderCrew();
  }

  /** Aviso curto que some sozinho (ex.: fato sobre a gravidade de Marte). */
  toast(text: string, source?: string): void {
    const el = h('div', { class: 'toast panel', role: 'status' }, text, source ? h('small', {}, source) : null);
    document.body.append(el);
    window.setTimeout(() => el.remove(), 7000);
  }

  private renderCrew(): void {
    const c = this.crewView;
    const places = h('strong', {}, t('eva.inOut', this.placesView));
    this.crewChip.hidden = false;
    // Ninguém lá fora: no celular o contador some (o painel do dia já mostra quem está dentro e fora).
    this.crewChip.classList.toggle('idle', this.placesView.outside === 0);
    // Lá fora (EVA), o astronauta escolhido anda com setas ou toque; dentro, só o contador.
    const out = this.placesView.outside > 0;
    patchChildren(this.crewChip, [
      c.status === 'loading'
        ? h('span', {}, places, ` · ${t('scene.loadingPhysics')}`)
        : c.status === 'off' || !out
          ? h('span', {}, places)
          : h('span', {},
              places,
              ` · ${t('crew.selected', { name: t(`crew.${c.role}` as StringKey) })}`,
              h('span', { class: 'keys' }, ` · ${t('crew.hint.keys')}`),
              h('span', { class: 'touch' }, ` · ${t('crew.hint.touch')}`),
            ),
    ]);
  }

  render(): void {
    this.clampPlan();
    this.renderCrew();
    this.renderTop();
    this.renderResources();
    this.renderMessages();
    this.renderPlan();
  }

  // ---------- partes ----------

  private renderTop(): void {
    const s = this.state && this.nightView ? { ...this.state, sol: this.nightView.sol } : this.state;
    const sol = s?.sol ?? 1;
    const solText = t('top.sol', { sol, total: CONFIG.sols });
    const pct = Math.min(100, (sol / CONFIG.sols) * 100);
    patchChildren(this.top, [
      h('div', { class: 'title top-chip' }, t('game.title')),
      // A pílula do Sol inteira é o "?": tocar explica o que é um sol.
      h('button', {
        class: 'sol top-chip', type: 'button', 'aria-label': t('a11y.helpFor', { name: solText }),
        onclick: () => openHelp('help.sol', solText),
      },
        h('span', {}, solText),
        h('span', { class: 'sol-track', 'aria-hidden': 'true' }, h('i', { style: `width:${pct}%` })),
        h('span', { class: 'help', 'aria-hidden': 'true' }, '?'),
      ),
      this.goal,
      h('div', { class: 'top-actions' },
        // Ver a base por dentro (casco transparente) ou por fora (fechado, como é de verdade).
        topButton('👁️', t(this.cb.hullsOpen() ? 'top.hull.close' : 'top.hull.open'), () => {
          this.cb.onToggleHull();
          this.renderTop();
        }),
        // Fontes da NASA ficam dentro do "Como jogar" (menos botões no HUD; o juiz ainda encontra no jogo).
        topButton('📖', t('top.help'), () => this.cb.onHowTo()),
      ),
    ]);
  }

  private renderResources(): void {
    const r = this.nightView?.res ?? this.state?.res;
    if (!r) return;
    // Faixas da dose: amarelo a partir da 3ª estrela perdida, vermelho mais adiante (na Lua a dose diária é maior).
    const doseWarn = doseFor3(this.state?.location ?? 'mars');
    const doseBad = Math.max(70, doseWarn + 15);
    const level = (v: number, invert = false) => {
      const k = invert ? 100 - v : v;
      return k >= 50 ? 'good' : k >= 25 ? 'warn' : 'bad';
    };
    // Tubos: o que sobra, já descontando as amostras que o rover coletou hoje (ao vivo).
    const tubesLeft = (r.tubes ?? CONFIG.samples.tubes) - (this.tubesPlan()?.filled ?? 0);
    // Os 3 recursos centrais (desafio: "life support, power, shielding"). A dose fica DENTRO da proteção, como
    // risco: pouca proteção, mais dose. Nenhuma regra muda; só onde cada número aparece.
    const doseCls = r.dose >= doseBad ? 'bad' : r.dose >= doseWarn ? 'warn' : 'good';
    patchChildren(this.resources, [
      h('h2', { id: 'res-title' }, t('res.title')),
      resource('res.battery', 'help.battery', r.battery, CONFIG.battery.max, level(r.battery), [], undefined, '⚡'),
      resource('res.life', 'help.life', r.life, CONFIG.life.max, level(r.life), [], undefined, '💧'),
      resource('res.shield', 'help.shield', r.shield, CONFIG.shield.max, level(r.shield), [], undefined, '🛡️'),
      riskLine(r.dose, CONFIG.dose.max, doseCls, [doseWarn, doseBad]),
    ]);
    // Meta da missão, no topo: ciência (o objetivo) e tubos de amostra (o que a ciência gasta).
    // Tubos (regra em src/sim/day.ts): com energia na ciência, mostra o que a expedição de hoje vai gastar.
    const today = this.tubesToday();
    const tubesCls = level((tubesLeft / CONFIG.samples.tubes) * 100);
    const sci = Math.round(r.science);
    patchChildren(this.goal, [
      h('button', {
        class: 'goal top-chip', type: 'button', 'aria-label': t('a11y.helpFor', { name: t('res.science') }),
        onclick: () => openHelp('help.science', t('res.science')),
      },
        h('span', { class: 'lbl-long' }, `⭐ ${t('goal.science', { n: sci, goal: CONFIG.science.goal })}`),
        h('span', { class: 'lbl-short' }, `⭐ ${sci}/${CONFIG.science.goal}`),
        h('span', { class: 'sol-track goal-track', role: 'meter', 'aria-label': t('res.science'), 'aria-valuemin': 0, 'aria-valuemax': CONFIG.science.goal, 'aria-valuenow': sci },
          h('i', { style: `width:${Math.min(100, (sci / CONFIG.science.goal) * 100)}%` })),
      ),
      // Tubos só aparecem no topo quando estão acabando (o custo de hoje já aparece no plano, na linha da ciência).
      tubesLeft <= CONFIG.samples.perExpedition * TUBES_LOW_EXPEDITIONS
        ? h('button', {
          class: `goal tubes top-chip tone-${tubesCls}`, type: 'button', 'aria-label': t('a11y.helpFor', { name: t('res.tubes') }),
          onclick: () => openHelp('help.tubes', t('res.tubes')),
        }, `🧪 ${t('goal.tubes', { n: tubesLeft })}${today ? ` · ${today}` : ''}`)
        : null,
    ]);
  }

  /** O que a expedição de hoje vai fazer com os tubos (pela prévia do plano), ou nada à noite e sem ciência. */
  /** O rover coletou mais uma amostra (cena): atualiza os tubos do painel. */
  setSamplesToday(n: number): void {
    this.samplesToday = n;
    this.renderResources();
  }

  /**
   * Tubos de hoje pela prévia do plano: quantos a expedição vai encher e quantos o rover já encheu (ao vivo,
   * uma amostra por parada de estudo). À noite, sem ciência ou sem prévia: nada (vale o número da regra).
   */
  private tubesPlan(): { used: number; filled: number; none: boolean } | null {
    if (this.nightView || !this.state || this.plan.science === 0) return null;
    const pv = this.cb.preview?.(this.getPlan());
    if (!pv) return null;
    const used = pv.tubesUsed ?? 0;
    return { used, filled: Math.min(this.samplesToday, used), none: !!pv.noTubes };
  }

  private tubesToday(): string | undefined {
    const p = this.tubesPlan();
    if (!p) return undefined;
    if (p.none) return t('res.tubes.none');
    if (p.used === 0) return undefined;
    return p.filled > 0 ? t('res.tubes.filled', { n: p.filled, total: p.used }) : t('res.tubes.today', { n: p.used });
  }

  private renderMessages(): void {
    const msgs = (this.state?.messages ?? []) as MarsMessage[];
    patchChildren(this.messages, [h('h2', { id: 'msg-title' }, t('msg.title')), ...msgs.map(messageEl)]);
  }

  private renderDay(v: DayView): void {
    const name = (role?: string) => (role ? t(`crew.${role}` as StringKey) : '');
    const focusedLabel = (document.activeElement as HTMLElement | null)?.getAttribute?.('aria-label');
    const item = (p: DayView['problems'][number]): HTMLElement => {
      const def = PROBLEMS[p.kind];
      const problem = t(`problem.${p.kind}` as StringKey);
      const status =
        p.status === 'done' ? t('day.done')
        : p.phase === 'working' ? t('day.working', { name: name(p.worker), pct: Math.round(p.progress * 100) })
        : p.phase === 'airlock' ? t('eva.airlock', { name: name(p.worker) })
        : p.worker ? t('day.walking', { name: name(p.worker) })
        : def.outside && v.evaBanned ? t('eva.bannedWait')
        : t('day.waiting');
      let action: HTMLElement | null = null;
      if (p.status === 'open' && !p.worker) {
        const banned = def.outside && v.evaBanned;
        const noPower = def.optional && (this.state?.res.battery ?? 0) < taskBattery(p.kind);
        const label = banned ? t('eva.bannedShort') : noPower ? t('day.noPower') : def.outside ? t('eva.send') : def.optional ? t('day.sendTask') : t('day.fixInside');
        const aria = def.outside ? t('eva.sendAria', { problem }) : def.optional ? t('day.sendTaskAria', { problem }) : t('day.fixInsideAria', { problem });
        action = h('button', { class: 'btn', type: 'button', 'aria-label': aria, disabled: v.paused || banned || noPower, onclick: () => this.cb.onSendProblem(p.uid) }, label);
      }
      const icon = p.status === 'done' ? '✅' : p.kind === 'harvest' ? '🌱' : p.kind === 'analysis' ? '🔬' : '⚠️';
      return h('div', { class: `problem ${p.status === 'done' ? 'done' : ''} ${def.optional ? 'optional' : ''}` },
        h('div', { class: 'name' },
          `${icon} ${problem}`,
          h('small', {}, `${t(`problem.${p.kind}.where` as StringKey)} · ${def.outside ? t('problem.outside') : t('problem.inside')}`),
          def.optional ? h('small', { class: 'task-cost' }, t(`day.taskGain.${p.kind}` as StringKey, { battery: taskBattery(p.kind), gain: p.kind === 'harvest' ? CONFIG.indoorTasks.harvest.life : CONFIG.indoorTasks.analysis.science })) : null,
          h('small', { class: 'status' }, status),
          p.progress > 0 && p.status !== 'done' ? h('div', { class: 'bar good' }, h('i', { style: `width:${Math.round(p.progress * 100)}%` })) : null,
        ),
        action,
      );
    };
    // Problemas primeiro; as tarefas opcionais (colher, analisar) numa subseção "Se sobrar tempo:".
    const problems = v.problems.filter((p) => !PROBLEMS[p.kind].optional).map(item);
    const optional = v.problems.filter((p) => PROBLEMS[p.kind].optional).map(item);
    const items = [...problems, ...(optional.length ? [h('p', { class: 'day-optional' }, t('day.optional')), ...optional] : [])];
    const placeIcon = { inside: '🏠', airlock: '🚪', outside: '👩‍🚀' } as const;
    const crewRow = h('div', { class: 'crew-row', role: 'group', 'aria-label': t('eva.crewTitle') },
      h('span', { class: 'crew-row-title' }, 'EVA', helpButton('help.eva', 'EVA')),
      ...v.crew.map((c) => {
        // Ícone mostra o que a pessoa está fazendo agora: 🔧 trabalhando, 🚶 indo, senão onde ela está.
        const icon = c.place === 'airlock' ? placeIcon.airlock : c.activity === 'working' ? '🔧' : c.activity === 'going' ? '🚶' : placeIcon[c.place];
        const doing = c.activity === 'idle' ? '' : `, ${t(`crew.doing.${c.activity}` as StringKey)}`;
        const where = `${t(`crew.place.${c.place}` as StringKey)}${doing}`;
        return h('button', {
          type: 'button', class: `crew-pick ${c.place}`, 'aria-pressed': String(c.role === v.selected),
          'aria-label': `${name(c.role)}, ${where}`, title: `${name(c.role)} · ${where}`,
          onclick: () => this.cb.onSelect(c.role),
        }, `${icon} ${t(`crew.short.${c.role}` as StringKey)}`);
      }),
    );
    patchChildren(this.planEl, [
      h('div', { class: 'plan-top' },
        h('strong', { id: 'plan-title' }, v.paused ? t('day.paused') : t('day.title')),
        h('span', { class: 'clock', 'aria-label': t('day.remaining', { s: v.remaining }) }, `☀️ ${t('day.remaining', { s: v.remaining })}`),
        this.collapseButton(),
      ),
      ...(v.training
        ? [h('p', { class: 'day-hint' }, t('intro.day'))]
        : [
            v.evaBanned ? h('p', { class: 'day-warn', role: 'status' }, t('eva.banned')) : h('p', { class: 'day-hint' }, t('day.hint')),
            crewRow,
            ...(items.length ? items : [h('p', { class: 'day-hint' }, t('day.none'))]),
          ]),
      this.coop?.note ? h('p', { class: 'coop-note', role: 'status' }, this.coop.note) : '',
      !this.coop || this.coop.canEnd
        ? h('div', { class: 'plan-actions' },
            v.evaActive ? h('button', { class: 'btn', type: 'button', 'aria-label': t('eva.return'), disabled: v.paused, onclick: () => this.cb.onEvaReturn() }, t('eva.return')) : null,
            h('button', { class: 'btn', type: 'button', 'aria-label': v.paused ? t('day.resume') : t('day.pause'), onclick: () => this.cb.onPause() }, v.paused ? t('day.resume') : t('day.pause')),
            h('button', { class: 'btn primary', type: 'button', 'aria-label': t('day.end'), onclick: () => this.cb.onEndDay() }, t('day.end')),
          )
        :'',
    ]);
    if (focusedLabel) this.planEl.querySelector<HTMLElement>(`[aria-label="${CSS.escape(focusedLabel)}"]`)?.focus();
  }

  /** Botão ▾/▴ no topo do painel: recolhe ou mostra o conteúdo (o botão principal continua visível). */
  private collapseButton(): HTMLElement {
    const label = () => t(this.planCollapsed ? 'hud.expand' : 'hud.collapse');
    return h('button', {
      class: 'collapse', type: 'button', 'aria-expanded': String(!this.planCollapsed), 'aria-label': label(), title: label(),
      onclick: (e: Event) => {
        // O botão da tela pode ser um antigo reaproveitado pelo patchChildren: usa o que foi clicado, não `btn`.
        const btn = e.currentTarget as HTMLElement;
        this.planCollapsed = !this.planCollapsed;
        this.planEl.classList.toggle('collapsed', this.planCollapsed);
        btn.setAttribute('aria-expanded', String(!this.planCollapsed));
        btn.setAttribute('aria-label', label());
        btn.title = label();
        btn.textContent = this.planCollapsed ? '▴' : '▾';
      },
    }, this.planCollapsed ? '▴' : '▾');
  }

  private renderPlan(): void {
    const s = this.state;
    if (!s) return;
    if (this.dayView) {
      this.renderDay(this.dayView);
      return;
    }
    const used = this.plan.life + this.plan.shield + this.plan.science;
    const leftover = s.blocks - used;
    const blocked = this.busy || s.pendingCard !== null || s.outcome.status !== 'playing';
    const coop = this.coop;
    const canEdit = (k: PlanKey) => !coop || coop.editable.includes(k);

    const blocks = h('div', { class: 'blocks', 'aria-hidden': 'true' });
    for (const k of PLAN_KEYS) for (let i = 0; i < this.plan[k]; i++) blocks.append(h('span', { class: k }));
    for (let i = 0; i < leftover; i++) blocks.append(h('span', { class: 'battery' }));

    // Prévia: o resultado previsto de cada linha, recalculado a cada + ou −.
    const pv = blocked ? null : this.cb.preview?.(this.getPlan()) ?? null;
    const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString(getLang() === 'pt' ? 'pt-BR' : 'en');
    const arrow = (from: number, to: number, label?: string) => {
      const d = Math.round((to - from) * 10) / 10;
      const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
      return h('span', { class: `forecast ${cls}` }, `${label ? label + ' ' : ''}${fmt(from)} → ${fmt(to)}`);
    };
    const forecastFor = (k: PlanKey) => {
      if (!pv) return null;
      if (k === 'life') return arrow(s.res.life, pv.after.life, t('preview.tonight'));
      if (k === 'shield') return arrow(s.res.shield, pv.after.shield, t('preview.tonight'));
      const gain = pv.stormTonight && pv.sciGain > 0 ? t('preview.scienceStorm', { n: fmt(pv.sciGain) }) : `+${fmt(pv.sciGain)}`;
      // Custo em tubos de amostra (regra em src/sim/day.ts): a expedição de hoje gasta 3; sem tubos, a ciência cai.
      // `tubesUsed` pode faltar na prévia de um servidor antigo (modo em grupo).
      const tubes = pv.tubesUsed > 0 ? t('preview.tubes', { n: pv.tubesUsed }) : pv.noTubes ? t('preview.noTubes') : '';
      return h('span', { class: `forecast ${pv.sciGain > 0 ? 'up' : 'same'}` }, tubes ? `${gain} · ${tubes}` : gain);
    };
    const warnings: { text: string; tone: 'bad' | 'warn' | 'info' }[] = [];
    if (pv) {
      if (pv.missing > 0) warnings.push({ text: t('preview.batteryShort', { life: fmt(pv.lifeLost) }), tone: 'bad' });
      if (pv.stormTonight) warnings.push({ text: t('preview.stormTonight', { label: pv.stormTonight.label, dose: pv.stormDose, shield: Math.round(Math.min(SIM.shield.max, Math.max(0, s.res.shield + pv.shieldDelta))) }), tone: 'bad' });
      if (pv.stormTomorrow) warnings.push({ text: t('preview.stormTomorrow', { label: pv.stormTomorrow.label, dose: pv.doseTomorrowIfNow, shield: Math.round(pv.after.shield) }), tone: 'warn' });
      if (pv.after.life <= 0) warnings.push({ text: t('preview.lifeZero'), tone: 'bad' });
      else if (pv.after.life <= 25) warnings.push({ text: t('preview.lifeLow', { v: fmt(pv.after.life) }), tone: 'bad' });
      if (pv.after.dose >= SIM.dose.max) warnings.push({ text: t('preview.doseMax'), tone: 'bad' });
      else if (s.res.dose < doseFor3(s.location) && pv.after.dose >= doseFor3(s.location)) {
        warnings.push({ text: t('preview.doseStar', { v: fmt(pv.after.dose), limit: doseFor3(s.location) }), tone: 'warn' });
      }
    }

    const row = (k: PlanKey) => {
      const name = t(`plan.${k}` as StringKey);
      return h(
        'div',
        { class: 'plan-row' },
        h('div', { class: 'name' }, name, forecastFor(k), h('small', {}, t(`plan.hint.${k}` as StringKey))),
        h('button', { type: 'button', 'aria-label': t('plan.minus', { name }), disabled: blocked || !canEdit(k) || this.plan[k] === 0, onclick: () => this.change(k, -1) }, '−'),
        h('div', { class: 'count', 'aria-live': 'polite' }, String(this.plan[k])),
        h('button', { type: 'button', 'aria-label': t('plan.plus', { name }), disabled: blocked || !canEdit(k) || leftover === 0, onclick: () => this.change(k, +1) }, '+'),
      );
    };

    const focusedLabel = (document.activeElement as HTMLElement | null)?.getAttribute?.('aria-label');
    patchChildren(this.planEl, [
      h('div', { class: 'plan-top' },
        h('strong', { id: 'plan-title' }, t('plan.today', { n: s.blocks })),
        s.location === 'moon' ? h('span', { class: 'dust' }, t('plan.sunNote', { n: s.sunlight[s.sol - 1] ?? 100 })) : null,
        s.res.dust > 0 ? h('span', { class: 'dust' }, t('plan.dustNote', { n: Math.round(s.res.dust) })) : null,
        blocks,
        coop?.note ? h('p', { class: 'coop-note', role: 'status' }, coop.note) : null,
        coop && coop.editable.length > 0
          ? h('p', { class: 'coop-note' }, t('coop.yourParts', { parts: coop.editable.map((k) => t(`plan.${k}` as StringKey)).join(', ') }))
          : null,
        this.collapseButton(),
      ),
      ...PLAN_KEYS.map(row),
      h('div', { class: 'plan-row battery' },
        h('div', { class: 'name' }, t('plan.battery'), pv ? arrow(s.res.battery, pv.after.battery, t('preview.afterNight')) : null, h('small', {}, t('plan.hint.battery', { cost: pv?.nightCost ?? this.cb.nightCost?.() ?? SIM.battery.nightCost }))),
        h('span'), h('div', { class: 'count' }, String(leftover)), h('span'),
      ),
      ...(pv ? [h('div', { class: 'preview', 'aria-live': 'polite' },
        ...warnings.map((w) => h('p', { class: `warn tone-${w.tone}` }, w.text)),
        warnings.length === 0 ? h('p', { class: 'warn tone-ok' }, t('preview.allGood')) : null,
        s.problems.length > 0 ? h('p', { class: 'note' }, t('preview.noProblems')) : null,
      )] : []),
      h('div', { class: 'plan-actions' },
        h('button', {
          class: 'btn primary', type: 'button', disabled: blocked || (coop !== null && !coop.canEnd),
          onclick: () => this.cb.onEndSol(this.getPlan()),
        }, s.pendingCard ? t('plan.answerCardFirst')
          : coop && !coop.canEnd ? t('coop.notYours')
          : s.problems.length > 0 ? t('plan.startDay') : t('plan.endSol')),
      ),
    ]);
    // Mantém o foco do teclado no mesmo botão depois de redesenhar.
    if (focusedLabel) this.planEl.querySelector<HTMLElement>(`[aria-label="${CSS.escape(focusedLabel)}"]`)?.focus();
  }

  private change(k: PlanKey, delta: number): void {
    const s = this.state;
    if (!s) return;
    const used = this.plan.life + this.plan.shield + this.plan.science;
    if (delta > 0 && used >= s.blocks) return;
    if (delta < 0 && this.plan[k] === 0) return;
    if (this.coop && !this.coop.editable.includes(k)) return;
    this.plan[k] += delta;
    this.renderPlan();
    this.renderResources(); // o "−3 hoje" dos tubos acompanha a ciência
    this.cb.onPlanChange(this.getPlan());
  }

  private clampPlan(): void {
    const blocks = this.state?.blocks ?? CONFIG.energy.panelBlocks;
    // Tira blocos primeiro da ciência, depois da blindagem, por último da vida.
    for (const k of ['science', 'shield', 'life'] as PlanKey[]) {
      const over = this.plan.life + this.plan.shield + this.plan.science - blocks;
      if (over > 0) this.plan[k] = Math.max(0, this.plan[k] - over);
    }
  }
}

function openHelp(textKey: StringKey, name: string): void {
  openDialog({ title: name, body: [h('p', {}, t(textKey))], actions: [{ label: t('a11y.close'), onClick: () => {} }], dismissible: true });
}

function helpButton(textKey: StringKey, name: string): HTMLButtonElement {
  return h('button', {
    class: 'help', type: 'button', 'aria-label': t('a11y.helpFor', { name }), onclick: () => openHelp(textKey, name),
  }, '?');
}

/** Botão do topo: ícone + texto (no celular só o ícone; o texto vira o nome lido pelo leitor de tela). */
function topButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  return h('button', { class: 'top-btn top-chip', type: 'button', 'aria-label': label, title: label, onclick: onClick },
    h('span', { 'aria-hidden': 'true' }, icon),
    h('span', { class: 'label', 'aria-hidden': 'true' }, label),
  );
}

/**
 * Dose de radiação como RISCO, dentro da proteção (não é uma barra a mais para cuidar): linha pequena e discreta
 * enquanto está baixa; amarela e vermelha perto do limite (as mesmas faixas de antes).
 */
function riskLine(value: number, max: number, cls: string, marks: number[]) {
  const name = t('res.dose');
  const shown = Math.round(value * 10) / 10;
  const shownText = shown.toLocaleString(getLang() === 'pt' ? 'pt-BR' : 'en');
  return h('div', { class: `risk risk-${cls}` },
    h('div', { class: 'res-head' }, `☢ ${name}`, helpButton('help.dose', name),
      h('span', { class: 'val' }, t('risk.of', { n: shownText, max }))),
    h('div', { class: `bar thin ${cls}`, role: 'meter', 'aria-label': name, 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': shown },
      h('i', { style: `width:${Math.max(0, Math.min(100, (value / max) * 100))}%` }),
      ...marks.map((m) => h('span', { class: 'mark', style: `left:${(m / max) * 100}%` })),
    ),
  );
}

/** Tubos aparecem no topo quando sobram tubos para esta quantidade de expedições (ou menos). */
const TUBES_LOW_EXPEDITIONS = 3;

function resource(nameKey: StringKey, helpKey: StringKey, value: number, max: number, cls: string, marks: number[] = [], extra?: string, icon?: string) {
  const label = t(nameKey);
  // Nome longo no computador e curto no celular (o CSS escolhe), para não quebrar em duas linhas.
  const shortKey = `${nameKey}.short` as StringKey;
  const short = t(shortKey);
  const name = h('span', {},
    icon ? `${icon} ` : '',
    h('span', { class: 'lbl-long' }, label),
    h('span', { class: 'lbl-short' }, short === shortKey ? label : short));
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const shown = Math.round(value * 10) / 10;
  const shownText = shown.toLocaleString(getLang() === 'pt' ? 'pt-BR' : 'en');
  return h('div', { class: 'res' },
    h('div', { class: 'res-head' }, name, helpButton(helpKey, label),
      h('span', { class: 'val' }, extra ? `${shownText} · ${extra}` : shownText)),
    h('div', { class: `bar ${cls}`, role: 'meter', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': shown },
      h('i', { style: `width:${pct}%` }),
      ...marks.map((m) => h('span', { class: 'mark', style: `left:${(m / max) * 100}%` })),
    ),
  );
}

export function flareBadge(f: Flare): HTMLElement {
  if (!f.real) return h('span', {}, h('span', { class: 'badge sim' }, t('flare.simulated')));
  return h('span', {},
    h('span', { class: 'badge real' }, t(f.source === 'cme' ? 'flare.real.cme' : 'flare.real', { date: formatDate(f.time!) })),
    f.link ? h('a', { href: f.link, target: '_blank', rel: 'noopener noreferrer' }, t('flare.link')) : null,
  );
}

/** Texto do aviso: erupção (classe) ou nuvem de plasma de missão histórica (força e velocidade). */
function stormText(f: Flare, when: 'alert' | 'today', sol?: number): string {
  if (f.source !== 'cme') {
    return when === 'alert' ? t('msg.stormAlert', { label: f.label, sol: sol ?? 0 }) : t('msg.stormToday', { label: f.label });
  }
  const strength = t(`storm.strength.${f.cls}` as StringKey);
  const speed = f.speedKmS ? f.speedKmS.toLocaleString(getLang() === 'pt' ? 'pt-BR' : 'en') : '?';
  return when === 'alert' ? t('msg.stormAlert.cme', { strength, speed, sol: sol ?? 0 }) : t('msg.stormToday.cme', { strength });
}

function messageEl(m: MarsMessage): HTMLElement {
  const delay = 'delayMin' in m ? h('span', { class: 'meta' }, t('msg.delay', { n: m.delayMin })) : null;
  switch (m.kind) {
    case 'earth':
      return h('div', { class: `msg${m.option === 'storm' ? ' storm' : m.option === 'dust' ? ' dust' : ''}` },
        t('msg.earth', { text: t(`coop.earth.opt.${m.option}` as StringKey) }),
        m.flare ? h('span', { class: 'meta' }, flareBadge(m.flare)) : null, delay);
    case 'stormAlert':
      return h('div', { class: 'msg storm' }, stormText(m.flare, 'alert', m.impactSol), h('span', { class: 'meta' }, flareBadge(m.flare)), delay);
    case 'stormToday':
      return h('div', { class: 'msg storm' }, stormText(m.flare, 'today'), h('span', { class: 'meta' }, flareBadge(m.flare)), delay);
    case 'dustAlert':
      return h('div', { class: 'msg dust' }, t('msg.dustAlert'), delay);
    case 'dustNow':
      return h('div', { class: 'msg dust' }, t('msg.dustNow'));
    case 'allClear':
      return h('div', { class: 'msg' }, t('msg.allClear'), delay);
    case 'noSignal':
      return h('div', { class: 'msg storm' }, t('msg.noSignal'));
    case 'shadowAlert':
      return h('div', { class: 'msg dust' }, t('msg.shadowAlert', { n: SIM.moon.shadow.sols }), delay);
    case 'sunForecast':
      return h('div', { class: 'msg' },
        m.next.length ? t('msg.sunForecast', { today: m.today, next: m.next.map((n) => `${n}%`).join(', ') }) : t('msg.sunForecast.last', { today: m.today }),
        h('span', { class: 'meta' }, t('msg.sunForecast.note')));
    case 'shadowNow':
      return h('div', { class: 'msg dust' }, m.left > 1 ? t('msg.shadowNow', { n: m.left }) : t('msg.shadowNow.last'));
  }
}
