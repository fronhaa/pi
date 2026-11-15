import { t, type StringKey } from '@/i18n';
import { COOP_ROLES, EARTH_OPTIONS, type CoopRole, type CoopState, type EarthOption } from '@/net/protocol';
import { h, openDialog, patchChildren } from './dom';

/**
 * Telas do modo em grupo (docs/servidor-coop.md): escolher o modo, a sala de espera
 * (criar/entrar, escolher papel, começar) e a vez da Terra.
 * Público de 7 a 12 anos: botões grandes, uma decisão por vez, frases curtas.
 */

/** Primeira tela quando há servidor: sozinho ou em grupo. */
export function showModeChoice(onSolo: () => void, onGroup: () => void): void {
  openDialog({
    title: t('coop.mode.title'),
    body: [h('p', {}, t('coop.mode.text'))],
    actions: [
      { label: `🧑‍🚀 ${t('coop.mode.solo')}`, primary: true, onClick: onSolo },
      { label: `👩‍🚀👨‍🚀 ${t('coop.mode.group')}`, onClick: onGroup },
    ],
  });
}

export interface LobbyCallbacks {
  create(): void;
  join(code: string): void;
  claim(role: CoopRole): void;
  release(role: CoopRole): void;
  start(): void;
  leave(): void;
}

/**
 * Sala de espera. Fica aberta e é redesenhada a cada estado do servidor
 * (não usa openDialog, que fecha ao clicar).
 */
export class Lobby {
  private readonly dialog = h('div', { class: 'dialog lobby', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lobby-title' });
  private readonly backdrop = h('div', { class: 'backdrop' }, this.dialog);
  private error = '';
  private codeValue = '';

  constructor(private readonly cb: LobbyCallbacks) {}

  isOpen(): boolean {
    return this.backdrop.isConnected;
  }

  open(): void {
    if (!this.backdrop.isConnected) document.body.append(this.backdrop);
  }

  close(): void {
    this.backdrop.remove();
  }

  showError(code: string): void {
    this.error = t(`coop.err.${code}` as StringKey);
  }

  /** Antes de entrar numa sala: criar ou digitar o código. */
  renderEntry(): void {
    this.open();
    const input = h('input', {
      id: 'room-code', class: 'code-input', maxlength: 4, autocomplete: 'off', autocapitalize: 'characters',
      inputmode: 'text', value: this.codeValue, 'aria-describedby': 'room-code-hint',
    });
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '');
      this.codeValue = input.value;
    });
    const join = () => {
      if (input.value.length === 4) {
        this.error = '';
        this.cb.join(input.value);
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') join();
    });
    this.dialog.replaceChildren(
      h('h2', { id: 'lobby-title' }, t('coop.lobby.title')),
      this.errorEl(),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => { this.error = ''; this.cb.create(); } }, `➕ ${t('coop.create')}`)),
      h('label', { for: 'room-code', class: 'code-label' }, t('coop.codeLabel')),
      h('div', { class: 'code-row' }, input, h('button', { class: 'btn', type: 'button', onclick: join }, t('coop.join'))),
      h('p', { id: 'room-code-hint', class: 'hint' }, t('coop.codeHint')),
      h('div', { class: 'actions row' }, h('button', { class: 'btn', type: 'button', onclick: () => this.cb.leave() }, t('coop.leave'))),
    );
    input.focus();
  }

  /** Dentro da sala: código grande, papéis e "Começar". */
  renderRoom(s: CoopState): void {
    this.open();
    const me = s.you;
    const hasCommander = s.players.some((p) => p.roles.includes('commander'));
    const owner = (role: CoopRole) => s.players.find((p) => p.roles.includes(role));

    const roleRow = (role: CoopRole) => {
      const p = owner(role);
      const mine = p?.id === me.id;
      const who = !p ? t('coop.free') : mine ? `${t('coop.player', { n: p.number })} (${t('coop.you')})` : t('coop.player', { n: p.number });
      return h('li', { class: `role-row${mine ? ' mine' : ''}` },
        h('div', {},
          h('strong', {}, t(`coop.role.${role}` as StringKey)),
          h('small', {}, t(`coop.role.hint.${role}` as StringKey))),
        h('span', { class: 'who' }, who),
        mine
          ? h('button', { class: 'btn', type: 'button', onclick: () => this.cb.release(role) }, t('coop.leaveRole'))
          : h('button', { class: 'btn primary', type: 'button', disabled: !!p, onclick: () => this.cb.claim(role) }, '✋'),
      );
    };

    const footer: (HTMLElement | null)[] = [];
    if (me.host) {
      footer.push(h('button', { class: 'btn primary', type: 'button', disabled: !hasCommander, onclick: () => this.cb.start() }, `🚀 ${t('coop.start')}`));
      if (!hasCommander) footer.push(h('p', { class: 'hint' }, t('coop.needCommander')));
    } else {
      footer.push(h('p', { class: 'hint' }, t('coop.waitHost')));
    }

    // A sala redesenha a cada estado do servidor: reaproveita os botões (recriar perde o clique, ver patchChildren).
    patchChildren(this.dialog, [
      h('h2', { id: 'lobby-title' }, t('coop.room', { code: '' }), h('span', { class: 'room-code', 'aria-label': s.code.split('').join(' ') }, s.code)),
      h('p', { class: 'hint' }, t('coop.share')),
      this.errorEl(),
      h('p', {}, h('strong', {}, t('coop.pickRole'))),
      h('ul', { class: 'roles' }, ...COOP_ROLES.map(roleRow)),
      h('p', { class: 'hint' }, `${t('coop.extraRoles')} ${owner('earth') ? '' : t('coop.autoEarth')}`),
      h('div', { class: 'actions' }, ...footer),
      h('div', { class: 'actions row' }, h('button', { class: 'btn', type: 'button', onclick: () => this.cb.leave() }, t('coop.leave'))),
    ]);
    this.error = '';
  }

  private errorEl(): HTMLElement | string {
    return this.error ? h('p', { class: 'coop-error', role: 'alert' }, this.error) : '';
  }
}

/** Vez da Terra: a previsão dos próximos sóis e as 5 mensagens possíveis. */
export function showEarthTurn(s: CoopState, onSend: (o: EarthOption) => void): () => void {
  const e = s.earth!;
  const items = e.forecast;
  const forecast = items.length
    ? h('ul', { class: 'forecast' }, ...items.map((f) =>
        h('li', { class: f.kind },
          f.kind === 'storm'
            ? t('coop.earth.storm', { sol: f.sol, label: f.flare?.label ?? '' })
            : t('coop.earth.dust', { sol: f.sol }))))
    : h('p', {}, t('coop.earth.calm'));
  return openDialog({
    title: `🌍 ${t('coop.earth.title')}`,
    body: [
      h('p', {}, h('strong', {}, t('coop.earth.forecast'))),
      forecast,
      h('p', {}, t('coop.earth.send')),
    ],
    actions: EARTH_OPTIONS.map((o) => ({ label: t(`coop.earth.opt.${o}` as StringKey), primary: o === 'none' ? false : undefined, onClick: () => onSend(o) })),
  });
}
