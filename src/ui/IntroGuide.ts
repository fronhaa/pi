import { h } from './dom';
import { t } from '@/i18n';

/** Um passo do treino já com o texto pronto (o Game monta e decide o que a cena faz). */
export interface GuideStep {
  badge: string;
  title: string;
  text: string;
  /** Último passo do grupo: o botão vira "Entendi". */
  last: boolean;
}

/**
 * Balão do treino dos sóis 1 a 3 (docs/game-design.md, "Introdução: sóis 1 a 3"). Não bloqueia a tela: a criança lê,
 * toca em "Próximo" e continua jogando. Só mostra e repassa os toques; quem decide os passos é o Game.
 */
export class IntroGuide {
  private el: HTMLElement | null = null;

  show(step: GuideStep, onNext: () => void, onSkip: () => void): void {
    this.hide();
    const next = h('button', { class: 'btn primary', type: 'button', onclick: () => onNext() }, step.last ? t('intro.done') : t('intro.next'));
    this.el = h('section', { class: 'intro-guide panel', role: 'status', 'aria-live': 'polite' },
      h('small', { class: 'intro-badge' }, step.badge),
      h('h3', {}, step.title),
      h('p', {}, step.text),
      h('div', { class: 'intro-actions' },
        h('button', { class: 'btn intro-skip', type: 'button', onclick: () => onSkip() }, t('intro.skip')),
        next,
      ),
    );
    document.body.append(this.el);
    document.body.classList.add('guiding');
    next.focus({ preventScroll: true });
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
    document.body.classList.remove('guiding');
  }

  get visible(): boolean {
    return this.el !== null;
  }
}
