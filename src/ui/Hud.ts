import { CONFIG } from '@/sim/config';
import type { EnergyPlan, Flare, GameState, Message, Resources } from '@/sim/types';
import { formatDate, getLang, t, type StringKey } from '@/i18n';
import { h, openDialog } from './dom';

export interface HudCallbacks {
  onEndSol(plan: EnergyPlan): void;
  onPlanChange(plan: EnergyPlan): void;
  onNasaData(): void;
  onToggleLang(): void;
  onHowTo(): void;
}

type PlanKey = keyof EnergyPlan;
const PLAN_KEYS: PlanKey[] = ['life', 'shield', 'science'];

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
  private readonly crewChip = h('div', { class: 'crew-chip', 'aria-live': 'polite' });
  private crewView: { status: 'loading' | 'ready' | 'off'; role?: string } = { status: 'loading' };

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

  /** Estado da movimentação da tripulação (física carregada sob demanda). */
  setCrew(status: 'loading' | 'ready' | 'off', role?: string): void {
    this.crewView = { status, role };
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
    if (c.status === 'off') {
      this.crewChip.hidden = true;
      return;
    }
    this.crewChip.hidden = false;
    this.crewChip.replaceChildren(
      c.status === 'loading'
        ? h('span', {}, t('scene.loadingPhysics'))
        : h('span', {},
            h('strong', {}, t('crew.selected', { name: t(`crew.${c.role}` as StringKey) })),
            h('span', { class: 'keys' }, ` · ${t('crew.hint.keys')}`),
            h('span', { class: 'touch' }, ` · ${t('crew.hint.touch')}`),
          ),
    );
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
    this.top.replaceChildren(
      h('div', { class: 'title' }, t('game.title'), h('small', {}, t('game.subtitle'))),
      h('span', { class: 'sol' }, t('top.sol', { sol: s?.sol ?? 1, total: CONFIG.sols })),
      helpButton('help.sol', t('top.sol', { sol: s?.sol ?? 1, total: CONFIG.sols })),
      h('button', { class: 'btn', type: 'button', onclick: () => this.cb.onHowTo() }, t('top.help')),
      h('button', { class: 'btn', type: 'button', onclick: () => this.cb.onNasaData() }, t('top.nasaData')),
      h('button', { class: 'btn', type: 'button', onclick: () => this.cb.onToggleLang(), lang: t('top.lang') === 'English' ? 'en' : 'pt-BR' }, t('top.lang')),
    );
  }

  private renderResources(): void {
    const r = this.nightView?.res ?? this.state?.res;
    if (!r) return;
    const level = (v: number, invert = false) => {
      const k = invert ? 100 - v : v;
      return k >= 50 ? 'good' : k >= 25 ? 'warn' : 'bad';
    };
    this.resources.replaceChildren(
      h('h2', { id: 'res-title' }, 'Base'),
      resource('res.battery', 'help.battery', r.battery, CONFIG.battery.max, level(r.battery)),
      resource('res.life', 'help.life', r.life, CONFIG.life.max, level(r.life)),
      resource('res.shield', 'help.shield', r.shield, CONFIG.shield.max, level(r.shield)),
      resource('res.dose', 'help.dose', r.dose, CONFIG.dose.max, r.dose >= 70 ? 'bad' : r.dose >= 50 ? 'warn' : 'good', [50, 70]),
      resource('res.science', 'help.science', r.science, CONFIG.science.goal, 'sci', [], t('res.goal', { n: CONFIG.science.goal })),
    );
  }

  private renderMessages(): void {
    const msgs = this.state?.messages ?? [];
    this.messages.replaceChildren(h('h2', { id: 'msg-title' }, t('msg.title')), ...msgs.map(messageEl));
  }

  private renderPlan(): void {
    const s = this.state;
    if (!s) return;
    const used = this.plan.life + this.plan.shield + this.plan.science;
    const leftover = s.blocks - used;
    const blocked = this.busy || s.pendingCard !== null || s.outcome.status !== 'playing';

    const blocks = h('div', { class: 'blocks', 'aria-hidden': 'true' });
    for (const k of PLAN_KEYS) for (let i = 0; i < this.plan[k]; i++) blocks.append(h('span', { class: k }));
    for (let i = 0; i < leftover; i++) blocks.append(h('span', { class: 'battery' }));

    const row = (k: PlanKey) => {
      const name = t(`plan.${k}` as StringKey);
      return h(
        'div',
        { class: 'plan-row' },
        h('div', { class: 'name' }, name, h('small', {}, t(`plan.hint.${k}` as StringKey))),
        h('button', { type: 'button', 'aria-label': t('plan.minus', { name }), disabled: blocked || this.plan[k] === 0, onclick: () => this.change(k, -1) }, '−'),
        h('div', { class: 'count', 'aria-live': 'polite' }, String(this.plan[k])),
        h('button', { type: 'button', 'aria-label': t('plan.plus', { name }), disabled: blocked || leftover === 0, onclick: () => this.change(k, +1) }, '+'),
      );
    };

    const focusedLabel = (document.activeElement as HTMLElement | null)?.getAttribute?.('aria-label');
    this.planEl.replaceChildren(
      h('div', { class: 'plan-top' },
        h('strong', { id: 'plan-title' }, t('plan.today', { n: s.blocks })),
        s.res.dust > 0 ? h('span', { class: 'dust' }, t('plan.dustNote', { n: Math.round(s.res.dust) })) : null,
        blocks,
      ),
      ...PLAN_KEYS.map(row),
      h('div', { class: 'plan-row battery' },
        h('div', { class: 'name' }, t('plan.battery'), h('small', {}, t('plan.hint.battery'))),
        h('span'), h('div', { class: 'count' }, String(leftover)), h('span'),
      ),
      h('div', { class: 'plan-actions' },
        h('button', {
          class: 'btn primary', type: 'button', disabled: blocked,
          onclick: () => this.cb.onEndSol(this.getPlan()),
        }, s.pendingCard ? t('plan.answerCardFirst') : t('plan.endSol')),
      ),
    );
    // Mantém o foco do teclado no mesmo botão depois de redesenhar.
    if (focusedLabel) this.planEl.querySelector<HTMLElement>(`[aria-label="${CSS.escape(focusedLabel)}"]`)?.focus();
  }

  private change(k: PlanKey, delta: number): void {
    const s = this.state;
    if (!s) return;
    const used = this.plan.life + this.plan.shield + this.plan.science;
    if (delta > 0 && used >= s.blocks) return;
    if (delta < 0 && this.plan[k] === 0) return;
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
    h('span', { class: 'badge real' }, t('flare.real', { date: formatDate(f.time!) })),
    f.link ? h('a', { href: f.link, target: '_blank', rel: 'noopener noreferrer' }, t('flare.link')) : null,
  );
}

function messageEl(m: Message): HTMLElement {
  const delay = 'delayMin' in m ? h('span', { class: 'meta' }, t('msg.delay', { n: m.delayMin })) : null;
  switch (m.kind) {
    case 'stormAlert':
      return h('div', { class: 'msg storm' }, t('msg.stormAlert', { label: m.flare.label, sol: m.impactSol }), h('span', { class: 'meta' }, flareBadge(m.flare)), delay);
    case 'stormToday':
      return h('div', { class: 'msg storm' }, t('msg.stormToday', { label: m.flare.label }), h('span', { class: 'meta' }, flareBadge(m.flare)), delay);
    case 'dustAlert':
      return h('div', { class: 'msg dust' }, t('msg.dustAlert'), delay);
    case 'dustNow':
      return h('div', { class: 'msg dust' }, t('msg.dustNow'));
    case 'allClear':
      return h('div', { class: 'msg' }, t('msg.allClear'), delay);
  }
}
