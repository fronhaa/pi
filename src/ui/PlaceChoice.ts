import { t, type StringKey } from '@/i18n';
import { DIFFICULTIES, type Difficulty } from '@/sim/config';
import { h } from '@/ui/dom';
import { levelAria, levelContent } from '@/ui/level';

type Place = 'mars' | 'moon';

/** O que a tela de escolha precisa da cena 3D (src/scene/LaunchScene.ts). */
export interface PlanetPicker {
  planetScreen(place: Place): { x: number; y: number; r: number };
  setHover(place: Place | null): void;
}

/**
 * Tela de escolha sobre a cena 3D: título no alto e, para cada planeta, um botão do tamanho do planeta 3D com o nome
 * e uma dica curta embaixo. Passar o mouse ou focar com o teclado mostra os 3 níveis da missão (src/sim/config.ts,
 * DIFFICULTY) logo abaixo; no celular (sem mouse), o primeiro toque no planeta abre os níveis. Tocar num nível
 * escolhe o lugar e o nível juntos. O nível marcado é o `preferred` (último jogado; na 1ª partida, o Fácil).
 * Botões de verdade: funcionam com teclado e leitor de tela. Só mostra e repassa a escolha; quem decide é o Game.
 */
export function showPlaceChoice3D(
  picker: PlanetPicker,
  preferred: Difficulty,
  onChoose: (place: Place, level: Difficulty) => void,
): void {
  const root = h('div', { class: 'place3d', role: 'dialog', 'aria-label': t('place.title') },
    h('div', { class: 'place3d-head' }, h('h2', {}, t('place.title')), h('p', {}, t('place.tap'))),
  );
  let raf = 0;
  const finish = (place: Place, level: Difficulty) => {
    cancelAnimationFrame(raf);
    picker.setHover(null);
    root.remove();
    onChoose(place, level);
  };

  const planets = (['mars', 'moon'] as const).map((place) => {
    const name = t(place === 'mars' ? 'place.mars' : 'place.moon');
    const levelsId = `place3d-levels-${place}`;
    const levelButtons = DIFFICULTIES.map((level) =>
      h('button', {
        type: 'button',
        class: `btn place3d-level${level === preferred ? ' primary' : ''}`,
        title: t(`level.${level}.hint` as StringKey),
        'aria-label': `${name}: ${levelAria(level)}`,
        onclick: () => finish(place, level),
      }, ...levelContent(level)) as HTMLButtonElement,
    );
    const levels = h('div', { id: levelsId, class: 'place3d-levels', role: 'group', 'aria-label': t('coop.level') }, ...levelButtons);
    const planetBtn = h('button', { type: 'button', class: 'place3d-pick', 'aria-expanded': 'false', 'aria-controls': levelsId },
      h('span', { class: 'place3d-name' }, name),
      h('span', { class: 'place3d-hint' }, t(place === 'mars' ? 'place.mars.short' : 'place.moon.short')),
    ) as HTMLButtonElement;
    const box = h('div', { class: `place3d-planet place3d-${place}` }, planetBtn, levels);
    box.addEventListener('pointerenter', () => picker.setHover(place));
    box.addEventListener('pointerleave', () => picker.setHover(null));
    box.addEventListener('focusin', () => picker.setHover(place));
    box.addEventListener('focusout', () => picker.setHover(null));
    // Toque (celular) ou Enter (teclado): abre os níveis deste planeta e fecha os do outro. O foco vai para o nível
    // marcado, para quem usa teclado escolher com Enter.
    planetBtn.addEventListener('click', (e) => {
      const opening = !box.classList.contains('open');
      for (const p of planets) setOpen(p, false);
      setOpen({ box, planetBtn }, opening);
      if (opening && e.detail === 0) levelButtons[DIFFICULTIES.indexOf(preferred)]?.focus();
    });
    root.append(box);
    return { place, box, planetBtn };
  });

  function setOpen(p: { box: HTMLElement; planetBtn: HTMLButtonElement }, open: boolean): void {
    p.box.classList.toggle('open', open);
    p.planetBtn.setAttribute('aria-expanded', String(open));
  }

  // Acompanha os planetas 3D (mudam com o tamanho da tela e balançam devagar).
  const follow = () => {
    for (const { place, box } of planets) {
      const { x, y, r } = picker.planetScreen(place);
      // Planeta perto da borda (celular em pé): o nome e os níveis não saem da tela (16 px de margem).
      const half = box.offsetWidth / 2;
      const left = Math.min(Math.max(x, half + 16), window.innerWidth - half - 16);
      box.style.left = `${left}px`;
      box.style.top = `${y - r}px`;
      box.style.setProperty('--planet', `${2 * r}px`);
    }
    raf = requestAnimationFrame(follow);
  };
  document.body.append(root);
  follow();
}
