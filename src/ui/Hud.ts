import { CONFIG } from '@/sim/config';
import type { EnergyPlan, Flare, GameState, ProblemKind, Resources } from '@/sim/types';
import { PROBLEMS } from '@/sim/problems';
import type { Mission } from '@/sim/mission';
import { CONFIG as SIM, doseFor3 } from '@/sim/config';

/** Prévia calculada pela simulação (Mission.previewSol). */
export type PlanPreview = ReturnType<Mission['previewSol']>;
import { formatDate, getLang, t, type StringKey } from '@/i18n';
import type { MarsMessage } from '@/net/protocol';
import { h, openDialog, patchChildren } from './dom';

type RoleId = 'commander' | 'engineer' | 'medic' | 'scientist';

export interface DayView {
  remaining: number;
  paused: boolean;
  selected: RoleId;
  /** Tempestade hoje (aviso recebido): ninguém sai da base. */
  evaBanned: boolean;
  /** Tem uma dupla lá fora (ou na câmara de descompressão). */
  evaActive: boolean;
  crew: { role: RoleId; place: 'inside' | 'airlock' | 'outside' }[];
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
  /** Durante a noite, mostra o resultado do dia ainda com o número do sol que acabou. */
  private nightView: { res: Resources; sol: number } | null = null;

  private readonly top = h('header', { class: 'top panel' });
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
    patchChildren(this.top, [
      h('div', { class: 'title' }, t('game.title'), h('small', {}, t('game.subtitle'))),
      h('span', { class: 'sol' }, t('top.sol', { sol: s?.sol ?? 1, total: CONFIG.sols })),
      helpButton('help.sol', t('top.sol', { sol: s?.sol ?? 1, total: CONFIG.sols })),
      h('button', { class: 'btn', type: 'button', onclick: () => this.cb.onHowTo() }, t('top.help')),
      h('button', { class: 'btn', type: 'button', onclick: () => this.cb.onNasaData() }, t('top.nasaData')),
      h('button', { class: 'btn', type: 'button', onclick: () => this.cb.onToggleLang(), lang: t('top.lang') === 'English' ? 'en' : 'pt-BR' }, t('top.lang')),
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
    patchChildren(this.resources, [
      h('h2', { id: 'res-title' }, 'Base'),
      resource('res.battery', 'help.battery', r.battery, CONFIG.battery.max, level(r.battery)),
      resource('res.life', 'help.life', r.life, CONFIG.life.max, level(r.life)),
      resource('res.shield', 'help.shield', r.shield, CONFIG.shield.max, level(r.shield)),
      resource('res.dose', 'help.dose', r.dose, CONFIG.dose.max, r.dose >= doseBad ? 'bad' : r.dose >= doseWarn ? 'warn' : 'good', [doseWarn, doseBad]),
      resource('res.science', 'help.science', r.science, CONFIG.science.goal, 'sci', [], t('res.goal', { n: CONFIG.science.goal })),
    ]);
  }

  private renderMessages(): void {
    const msgs = (this.state?.messages ?? []) as MarsMessage[];
    patchChildren(this.messages, [h('h2', { id: 'msg-title' }, t('msg.title')), ...msgs.map(messageEl)]);
  }

  private renderDay(v: DayView): void {
    const name = (role?: string) => (role ? t(`crew.${role}` as StringKey) : '');
    const focusedLabel = (document.activeElement as HTMLElement | null)?.getAttribute?.('aria-label');
    const items = v.problems.map((p) => {
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
        const label = banned ? t('eva.bannedShort') : def.outside ? t('eva.send') : t('day.fixInside');
        const aria = def.outside ? t('eva.sendAria', { problem }) : t('day.fixInsideAria', { problem });
        action = h('button', { class: 'btn', type: 'button', 'aria-label': aria, disabled: v.paused || banned, onclick: () => this.cb.onSendProblem(p.uid) }, label);
      }
      return h('div', { class: `problem ${p.status === 'done' ? 'done' : ''}` },
        h('div', { class: 'name' },
          `${p.status === 'done' ? '✅' : '⚠️'} ${problem}`,
          h('small', {}, `${t(`problem.${p.kind}.where` as StringKey)} · ${def.outside ? t('problem.outside') : t('problem.inside')}`),
          h('small', { class: 'status' }, status),
          p.progress > 0 && p.status !== 'done' ? h('div', { class: 'bar good' }, h('i', { style: `width:${Math.round(p.progress * 100)}%` })) : null,
        ),
        action,
      );
    });
    const placeIcon = { inside: '🏠', airlock: '🚪', outside: '👩‍🚀' } as const;
    const crewRow = h('div', { class: 'crew-row', role: 'group', 'aria-label': t('eva.crewTitle') },
      h('span', { class: 'crew-row-title' }, 'EVA', helpButton('help.eva', 'EVA')),
      ...v.crew.map((c) => {
        const where = t(`crew.place.${c.place}` as StringKey);
        return h('button', {
          type: 'button', class: `crew-pick ${c.place}`, 'aria-pressed': String(c.role === v.selected),
          'aria-label': `${name(c.role)}, ${where}`, title: `${name(c.role)} · ${where}`,
          onclick: () => this.cb.onSelect(c.role),
        }, `${placeIcon[c.place]} ${t(`crew.short.${c.role}` as StringKey)}`);
      }),
    );
    patchChildren(this.planEl, [
      h('div', { class: 'plan-top' },
        h('strong', { id: 'plan-title' }, v.paused ? t('day.paused') : t('day.title')),
        h('span', { class: 'clock', 'aria-label': t('day.remaining', { s: v.remaining }) }, `☀️ ${t('day.remaining', { s: v.remaining })}`),
        this.collapseButton(),
      ),
      v.evaBanned ? h('p', { class: 'day-warn', role: 'status' }, t('eva.banned')) : h('p', { class: 'day-hint' }, t('day.hint')),
      crewRow,
      ...(items.length ? items : [h('p', { class: 'day-hint' }, t('day.none'))]),
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
    const btn = h('button', {
      class: 'collapse', type: 'button', 'aria-expanded': String(!this.planCollapsed), 'aria-label': label(), title: label(),
      onclick: () => {
        this.planCollapsed = !this.planCollapsed;
        this.planEl.classList.toggle('collapsed', this.planCollapsed);
        btn.setAttribute('aria-expanded', String(!this.planCollapsed));
        btn.setAttribute('aria-label', label());
        btn.title = label();
        btn.textContent = this.planCollapsed ? '▴' : '▾';
      },
    }, this.planCollapsed ? '▴' : '▾');
    return btn;
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
      return h('span', { class: `forecast ${pv.sciGain > 0 ? 'up' : 'same'}` }, pv.stormTonight && pv.sciGain > 0 ? t('preview.scienceStorm', { n: fmt(pv.sciGain) }) : `+${fmt(pv.sciGain)}`);
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

function helpButton(textKey: StringKey, name: string): HTMLButtonElement {
  return h('button', {
    class: 'help', type: 'button', 'aria-label': t('a11y.helpFor', { name }),
    onclick: () => openDialog({ title: name, body: [h('p', {}, t(textKey))], actions: [{ label: t('a11y.close'), onClick: () => {} }], dismissible: true }),
  }, '?');
}

function resource(nameKey: StringKey, helpKey: StringKey, value: number, max: number, cls: string, marks: number[] = [], extra?: string) {
  const name = t(nameKey);
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const shown = Math.round(value * 10) / 10;
  const shownText = shown.toLocaleString(getLang() === 'pt' ? 'pt-BR' : 'en');
  return h('div', { class: 'res' },
    h('div', { class: 'res-head' }, name, helpButton(helpKey, name),
      h('span', { class: 'val' }, extra ? `${shownText} · ${extra}` : shownText)),
    h('div', { class: `bar ${cls}`, role: 'meter', 'aria-label': name, 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': shown },
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
