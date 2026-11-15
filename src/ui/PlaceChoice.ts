import { t } from '@/i18n';
import { h } from '@/ui/dom';

type Place = 'mars' | 'moon';

/** O que a tela de escolha precisa da cena 3D (src/scene/LaunchScene.ts). */
export interface PlanetPicker {
  planetScreen(place: Place): { x: number; y: number; r: number };
  setHover(place: Place | null): void;
}

/**
 * Tela de escolha (Marte ou Lua) sobre a cena 3D: título no alto e um botão por planeta, do tamanho do planeta 3D,
 * com o nome e uma dica curta embaixo. Tocar no planeta escolhe. Botões de verdade: funcionam com teclado e leitor
 * de tela. Só mostra e repassa a escolha; quem decide o que acontece é o Game.
 */
export function showPlaceChoice3D(picker: PlanetPicker, onChoose: (place: Place) => void): void {
  const root = h('div', { class: 'place3d', role: 'dialog', 'aria-label': t('place.title') },
    h('div', { class: 'place3d-head' }, h('h2', {}, t('place.title')), h('p', {}, t('place.tap'))),
  );
  const buttons = (['mars', 'moon'] as const).map((place) => {
    const btn = h('button', { type: 'button', class: `place3d-planet place3d-${place}` },
      h('span', { class: 'place3d-name' }, t(place === 'mars' ? 'place.mars' : 'place.moon')),
      h('span', { class: 'place3d-hint' }, t(place === 'mars' ? 'place.mars.short' : 'place.moon.short')),
    ) as HTMLButtonElement;
    btn.addEventListener('pointerenter', () => picker.setHover(place));
    btn.addEventListener('pointerleave', () => picker.setHover(null));
    btn.addEventListener('focus', () => picker.setHover(place));
    btn.addEventListener('blur', () => picker.setHover(null));
    btn.addEventListener('click', () => {
      cancelAnimationFrame(raf);
      picker.setHover(null);
      root.remove();
      onChoose(place);
    });
    root.append(btn);
    return { place, btn };
  });

  // Acompanha os planetas 3D (mudam com o tamanho da tela e balançam devagar).
  let raf = 0;
  const follow = () => {
    for (const { place, btn } of buttons) {
      const { x, y, r } = picker.planetScreen(place);
      btn.style.left = `${x}px`;
      btn.style.top = `${y - r}px`;
      btn.style.setProperty('--planet', `${2 * r}px`);
    }
    raf = requestAnimationFrame(follow);
  };
  document.body.append(root);
  follow();
}
