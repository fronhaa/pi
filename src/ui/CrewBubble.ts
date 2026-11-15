import * as THREE from 'three';
import { h } from './dom';

/** Margens da tela (px): o balão não cobre a barra de cima nem sai pelas bordas. */
const MARGIN = 16;
const TOP_SAFE = 120;
/** Com o guia do treino aberto, o balão fica abaixo dele. */
const TOP_SAFE_GUIDING = 250;
/** Quanto tempo o balão fica (s): tempo de uma criança de 7 anos ler duas frases curtas. */
const BUBBLE_SECONDS = 9;

/**
 * Balão em cima de um astronauta (texto no padrão ~400L, docs/linguagem-e-ui-criancas.md: ícone + título em negrito
 * e no máximo 2 frases curtas): um fato real da NASA que tem a ver com o que ELE está fazendo (indo à academia,
 * trabalhando na estufa, pulando, saindo em EVA). Segue o astronauta na tela; se ele sair do enquadramento, fica
 * preso na borda (sem a setinha). Some sozinho ou ao tocar. Só mostra: quem decide quando é o Game.
 */
export class CrewBubble {
  private el: HTMLElement | null = null;
  private anchor: (() => THREE.Vector3 | null) | null = null;
  private left = 0;
  private readonly tmp = new THREE.Vector3();

  /** `anchor` dá o ponto no mundo (em cima da cabeça) a cada quadro; null = o astronauta sumiu (some o balão). */
  show(title: string, text: string, anchor: () => THREE.Vector3 | null): void {
    this.hide();
    this.anchor = anchor;
    this.left = BUBBLE_SECONDS;
    this.el = h('button', { class: 'crew-bubble panel', type: 'button', role: 'status', onclick: () => this.hide() },
      h('strong', { class: 'crew-bubble-title' }, title),
      h('span', {}, text),
    );
    this.el.style.visibility = 'hidden'; // até o primeiro update posicionar
    document.body.append(this.el);
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
    this.anchor = null;
  }

  update(dt: number, camera: THREE.Camera, canvas: HTMLCanvasElement): void {
    if (!this.el || !this.anchor) return;
    // Com uma janela aberta (escolha do lugar, missão, relatório), o balão espera escondido e não perde tempo:
    // o fato aparece quando a criança volta para a cena.
    if (document.querySelector('.backdrop')) {
      this.el.style.visibility = 'hidden';
      return;
    }
    this.left -= dt;
    const world = this.anchor();
    if (this.left <= 0 || !world) {
      this.hide();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const behind = this.tmp.copy(world).applyMatrix4(camera.matrixWorldInverse).z > 0;
    const ndc = this.tmp.copy(world).project(camera);
    let x = ((ndc.x + 1) / 2) * rect.width + rect.left;
    let y = ((1 - ndc.y) / 2) * rect.height + rect.top;
    if (behind) y = rect.bottom; // atrás da câmera: vai para a borda de baixo
    // O balão fica ACIMA do ponto (a setinha aponta para a cabeça). Preso dentro da área segura.
    const bw = this.el.offsetWidth;
    const bh = this.el.offsetHeight;
    const top = document.body.classList.contains('guiding') ? TOP_SAFE_GUIDING : TOP_SAFE;
    const minX = MARGIN + bw / 2;
    const maxX = window.innerWidth - MARGIN - bw / 2;
    const minY = top + bh;
    const maxY = window.innerHeight - MARGIN;
    const clamped = behind || x < minX || x > maxX || y < minY || y > maxY;
    x = THREE.MathUtils.clamp(x, minX, Math.max(minX, maxX));
    y = THREE.MathUtils.clamp(y, minY, Math.max(minY, maxY));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.classList.toggle('edge', clamped);
    this.el.style.visibility = 'visible';
  }
}
