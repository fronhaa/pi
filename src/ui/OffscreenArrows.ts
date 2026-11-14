import * as THREE from 'three';
import { h } from './dom';

export interface OffscreenItem {
  uid: number;
  /** Ponto no mundo (onde fica o "!"). */
  world: THREE.Vector3;
  /** Texto curto ao lado da seta e rótulo para leitor de tela. */
  label: string;
  ariaLabel: string;
}

/** Margens da área segura (px): a seta não cobre a barra superior nem a faixa da tripulação. */
const MARGIN = 28;
const TOP_SAFE = 136; // abaixo da barra superior e da faixa da tripulação

/**
 * Setas na borda da tela apontando para problemas que estão fora do enquadramento
 * (ex.: rover atolado longe da base). Clicar na seta = mandar o astronauta selecionado.
 */
export class OffscreenArrows {
  private readonly els = new Map<number, HTMLButtonElement>();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onClick: (uid: number) => void,
  ) {}

  update(items: OffscreenItem[], camera: THREE.Camera): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const hgt = rect.height;
    const seen = new Set<number>();
    const placed: { el: HTMLButtonElement; x: number; y: number }[] = [];

    for (const it of items) {
      // Atrás da câmera? (no espaço da câmera, z positivo = atrás)
      const behind = this.tmp.copy(it.world).applyMatrix4(camera.matrixWorldInverse).z > 0;
      const ndc = this.tmp.copy(it.world).project(camera);
      let x = ((ndc.x + 1) / 2) * w;
      let y = ((1 - ndc.y) / 2) * hgt;
      const onScreen = !behind && x >= MARGIN && x <= w - MARGIN && y >= TOP_SAFE && y <= hgt - MARGIN;
      if (onScreen) continue;

      // Direção do centro da tela até o problema; presa na borda da área segura.
      const cx = w / 2;
      const cy = (TOP_SAFE + hgt) / 2;
      let dx = x - cx;
      let dy = y - cy;
      if (behind) {
        dx = -dx;
        dy = -dy;
      }
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const tx = dx > 0 ? (w - MARGIN - cx) / dx : dx < 0 ? (MARGIN - cx) / dx : Infinity;
      const ty = dy > 0 ? (hgt - MARGIN - cy) / dy : dy < 0 ? (TOP_SAFE - cy) / dy : Infinity;
      const t = Math.min(tx, ty);
      x = cx + dx * t;
      y = cy + dy * t;

      // Não deixa duas setas encostadas: empurra ao longo da borda.
      for (const p of placed) {
        if (Math.hypot(p.x - x, p.y - y) < 56) {
          const alongX = y <= TOP_SAFE + 1 || y >= hgt - MARGIN - 1;
          if (alongX) x = Math.min(w - MARGIN, p.x + 56);
          else y = Math.min(hgt - MARGIN, p.y + 56);
        }
      }

      let el = this.els.get(it.uid);
      if (!el) {
        el = h('button', { class: 'offscreen-arrow', type: 'button', onclick: () => this.onClick(it.uid) },
          h('span', { class: 'pointer', 'aria-hidden': 'true' }, '➤'),
          h('span', { class: 'bang', 'aria-hidden': 'true' }, '!'),
          h('span', { class: 'label' }),
        );
        document.body.append(el);
        this.els.set(it.uid, el);
      }
      el.setAttribute('aria-label', it.ariaLabel);
      (el.querySelector('.label') as HTMLElement).textContent = it.label;
      el.style.left = `${rect.left + x}px`;
      el.style.top = `${rect.top + y}px`;
      (el.querySelector('.pointer') as HTMLElement).style.transform = `rotate(${Math.atan2(dy, dx)}rad) translateX(26px)`;
      // Rótulo do lado de dentro da tela, para não sair dela.
      el.classList.toggle('label-left', dx > 0.3);
      placed.push({ el, x, y });
      seen.add(it.uid);
    }

    // Setas próximas: só o "!" (o nome continua no aria-label e na lista de problemas do HUD).
    for (const a of placed) a.el.classList.toggle('compact', placed.some((b) => b !== a && Math.hypot(a.x - b.x, a.y - b.y) < 220));

    for (const [uid, el] of this.els) {
      if (!seen.has(uid)) {
        el.remove();
        this.els.delete(uid);
      }
    }
  }

  clear(): void {
    for (const el of this.els.values()) el.remove();
    this.els.clear();
  }
}
