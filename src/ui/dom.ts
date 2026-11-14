/** Mini helper para criar elementos sem framework. */
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | EventListener | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

let openCount = 0;

export interface DialogAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

/**
 * Janela modal acessível (role=dialog, foco no primeiro botão, Esc fecha se `dismissible`).
 * Retorna a função que fecha a janela.
 */
export function openDialog(opts: {
  title: string;
  body: Child[];
  actions: DialogAction[];
  row?: boolean;
  dismissible?: boolean;
  label?: string;
}): () => void {
  const previous = document.activeElement as HTMLElement | null;
  const titleId = `dlg-${Date.now()}-${openCount++}`;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    previous?.focus?.();
  };
  const buttons = opts.actions.map((a) =>
    h('button', { class: `btn${a.primary ? ' primary' : ''}`, type: 'button', onclick: () => { close(); a.onClick(); } }, a.label),
  );
  const dialog = h(
    'div',
    { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('h2', { id: titleId }, opts.title),
    ...opts.body,
    h('div', { class: `actions${opts.row ? ' row' : ''}` }, ...buttons),
  );
  const backdrop = h('div', { class: 'backdrop' }, dialog);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.dismissible) {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      // Mantém o foco dentro da janela.
      const focusables = dialog.querySelectorAll<HTMLElement>('button, a[href]');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    e.stopPropagation(); // teclas não vazam para o jogo enquanto a janela está aberta
  };
  document.addEventListener('keydown', onKey, true);
  document.body.append(backdrop);
  // preventScroll: janelas longas (ex.: Dados da NASA) abrem mostrando o topo.
  (buttons.find((_, i) => opts.actions[i].primary) ?? buttons[0])?.focus({ preventScroll: true });
  return close;
}

export function isDialogOpen(): boolean {
  return document.querySelector('.backdrop') !== null;
}
