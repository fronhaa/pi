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
    if (k.startsWith('on') && typeof v === 'function') on(el, k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/**
 * Eventos ficam num mapa no elemento, com UM ouvinte por tipo que chama a função atual do mapa.
 * Assim `patchChildren` troca a função sem recriar o botão.
 */
const HANDLERS = Symbol('handlers');
type WithHandlers = Element & { [HANDLERS]?: Record<string, EventListener> };

function on(el: Element, type: string, fn: EventListener): void {
  const e = el as WithHandlers;
  const map = (e[HANDLERS] ??= {});
  if (!map[type]) el.addEventListener(type, (ev) => (el as WithHandlers)[HANDLERS]?.[type]?.(ev));
  map[type] = fn;
}

/**
 * Redesenha `parent` com os filhos novos REAPROVEITANDO os elementos que já estão lá (mesma tag na mesma posição):
 * só atualiza texto, atributos e eventos. Sem isso, um botão recriado entre o "apertar" e o "soltar" do dedo
 * perde o clique (o HUD do dia redesenha 4 vezes por segundo; no modo em grupo, a cada estado do servidor).
 */
export function patchChildren(parent: Element, children: Child[]): void {
  const next: Node[] = children
    .filter((c): c is Node | string => c !== null && c !== undefined && c !== false && c !== '')
    .map((c) => (typeof c === 'string' ? document.createTextNode(c) : c));
  const old = Array.from(parent.childNodes);
  next.forEach((n, i) => {
    const o = old[i];
    if (!o) parent.append(n);
    else if (o.nodeType === n.nodeType && o.nodeName === n.nodeName) morph(o, n);
    else parent.replaceChild(n, o);
  });
  for (let i = next.length; i < old.length; i++) old[i].remove();
}

function morph(o: Node, n: Node): void {
  if (!(o instanceof Element) || !(n instanceof Element)) {
    if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
    return;
  }
  for (const a of Array.from(o.attributes)) if (!n.hasAttribute(a.name)) o.removeAttribute(a.name);
  for (const a of Array.from(n.attributes)) if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
  const om = (o as WithHandlers)[HANDLERS];
  const nm = (n as WithHandlers)[HANDLERS] ?? {};
  if (om) for (const type of Object.keys(om)) if (!nm[type]) delete om[type];
  for (const [type, fn] of Object.entries(nm)) on(o, type, fn);
  patchChildren(o, Array.from(n.childNodes));
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
/** Logotipo do jogo (public/assets/ui): no topo das janelas de abertura. */
function gameLogo(): HTMLImageElement {
  return h('img', { class: 'dialog-logo', src: `${import.meta.env.BASE_URL}assets/ui/artemis-quest-logo.png`, alt: 'Artemis Quest', width: 720, height: 367 });
}

export function openDialog(opts: {
  title: string;
  body: Child[];
  actions: DialogAction[];
  row?: boolean;
  dismissible?: boolean;
  label?: string;
  /** Logotipo do jogo acima do título (janelas de abertura). */
  logo?: boolean;
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
    opts.logo ? gameLogo() : null,
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
