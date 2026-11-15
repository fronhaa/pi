import { t } from '@/i18n';

/**
 * Viagem (depois de escolher Marte ou Lua): o foguete já está em órbita da Terra; o motor liga, ele sai da órbita
 * (F37) e chega ao destino, com o tempo de viagem REAL (docs/ciencia-marte.md, F30 e F31). Só visual: não muda regra.
 * ~7 s, com botão "Pular" sempre visível (e Esc).
 *
 * Este arquivo é só o texto por cima ("Motor ligado!", fato, "Pular"). O desenho é a cena 3D cartoon
 * src/scene/LaunchScene.ts, que o jogo desenha por trás (fundo transparente aqui). Os tempos do CSS (".launch-*" em
 * src/ui/style.css) seguem os da cena (T_BURN).
 * Com "reduzir movimento" no sistema, a cena fica parada perto do destino e aparece só o fato.
 */
const DURATION_MS = 7200;
const REDUCED_MS = 2500;

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function playLaunchIntro(place: 'mars' | 'moon', onDone: () => void): void {
  const reduced = prefersReducedMotion();
  const root = document.createElement('div');
  root.className = `launch-intro launch-${place}${reduced ? ' launch-reduced' : ''}`;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', t('launch.title'));
  root.innerHTML = `
    <p class="launch-note launch-burn"><strong>${t('launch.burn.title')}</strong> ${t(place === 'mars' ? 'launch.burn.mars' : 'launch.burn.moon')}</p>
    <div class="launch-text">
      <p class="launch-fact">${t(place === 'mars' ? 'launch.fact.mars' : 'launch.fact.moon')}</p>
      <p class="launch-source">${t(place === 'mars' ? 'launch.source.mars' : 'launch.source.moon')}</p>
    </div>
    <button type="button" class="btn launch-skip">${t('launch.skip')}</button>`;

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    window.removeEventListener('keydown', onKey);
    // Escurece a tela, troca para a base por trás e só então some (sem "piscar" a base no meio da viagem).
    root.classList.add('launch-closing');
    window.setTimeout(() => {
      onDone();
      root.classList.add('launch-out');
      window.setTimeout(() => root.remove(), 400);
    }, 250);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') finish();
  };
  const timer = window.setTimeout(finish, reduced ? REDUCED_MS : DURATION_MS);
  root.querySelector<HTMLButtonElement>('.launch-skip')!.addEventListener('click', finish);
  window.addEventListener('keydown', onKey);
  document.body.append(root);
  root.querySelector<HTMLButtonElement>('.launch-skip')!.focus({ preventScroll: true });
}
