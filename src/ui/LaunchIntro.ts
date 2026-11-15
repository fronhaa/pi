import { t } from '@/i18n';

/**
 * Viagem (depois de escolher Marte ou Lua): o foguete já está em órbita da Terra; o motor liga, ele sai da órbita
 * (F37) e chega ao destino, com o tempo de viagem REAL (docs/ciencia-marte.md, F30 e F31). Só visual: não muda regra.
 * ~12 s (depois da saída da órbita; devagar para a criança ler), com botão "Pular" sempre visível (e Esc).
 *
 * Este arquivo é só o texto por cima ("Motor ligado!", fato, "Pular"). O desenho é a cena 3D cartoon
 * src/scene/LaunchScene.ts, que o jogo desenha por trás (fundo transparente aqui). Os tempos do CSS (".launch-*" em
 * src/ui/style.css) seguem os da cena (contados da saída da órbita).
 * Com "reduzir movimento" no sistema, a cena fica parada perto do destino e aparece só o fato.
 */
const DURATION_MS = 12500;
const REDUCED_MS = 6000;

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * `departIn`: segundos do toque até o foguete sair da órbita (LaunchScene.begin). O texto começa no toque: "Motor
 * ligado!" fica do toque até um bom tempo depois da saída (a criança lê devagar) e o fato entra depois dele.
 */
export function playLaunchIntro(place: 'mars' | 'moon', onDone: () => void, departIn = 0): void {
  const reduced = prefersReducedMotion();
  const root = document.createElement('div');
  root.className = `launch-intro launch-${place}${reduced ? ' launch-reduced' : ''}`;
  root.style.setProperty('--go', `${departIn}s`);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', t('launch.title'));
  root.innerHTML = `
    <p class="launch-note launch-burn"><strong>${t('launch.burn.title')}</strong> ${t(place === 'mars' ? 'launch.burn.mars' : 'launch.burn.moon')}</p>
    <div class="launch-text">
      <p class="launch-fact">${t(place === 'mars' ? 'launch.fact.mars' : 'launch.fact.moon')}</p>
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
  const timer = window.setTimeout(finish, reduced ? REDUCED_MS : departIn * 1000 + DURATION_MS);
  root.querySelector<HTMLButtonElement>('.launch-skip')!.addEventListener('click', finish);
  window.addEventListener('keydown', onKey);
  document.body.append(root);
  root.querySelector<HTMLButtonElement>('.launch-skip')!.focus({ preventScroll: true });
}
