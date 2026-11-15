import { t } from '@/i18n';

/**
 * Intro da viagem (depois de escolher Marte ou Lua): contagem regressiva, o foguete decola da base de lançamento,
 * a Terra fica para trás e ele chega ao destino, com o tempo de viagem REAL (docs/ciencia-marte.md, F30 e F31).
 * Só visual: não muda regra. ~9 s, com botão "Pular" sempre visível (e Esc).
 *
 * Feita em SVG + CSS (src/ui/style.css, ".launch-*"), leve no celular. O desenho é um quadrado de 1000 × 1000 que
 * preenche a tela cortando as sobras: tudo o que importa fica na ÁREA SEGURA do meio (x 280–720, y 230–770), que
 * aparece inteira tanto no celular em pé quanto no computador deitado.
 * Com "reduzir movimento" no sistema, mostra só o destino e o fato, sem animação.
 */
const DURATION_MS = 9000;
const REDUCED_MS = 2500;

export function playLaunchIntro(place: 'mars' | 'moon', onDone: () => void): void {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const root = document.createElement('div');
  root.className = `launch-intro launch-${place}${reduced ? ' launch-reduced' : ''}`;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', t('launch.title'));
  root.innerHTML = `
    <svg class="launch-svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="launch-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#6FA8E0"/><stop offset="1" stop-color="#D6ECF8"/>
        </linearGradient>
      </defs>
      <rect width="1000" height="1000" fill="url(#launch-sky)"/>
      <rect class="launch-space" width="1000" height="1000" fill="#1B1630"/>
      <g class="launch-stars" fill="#F3E9DF">${stars()}</g>
      <g class="launch-dest">${place === 'mars' ? mars() : moon()}</g>
      <g class="launch-globe">
        <circle cx="500" cy="1000" r="330" fill="#3E7CC8" stroke="#BFE3FF" stroke-width="14"/>
        <path d="M300 800 C 360 740 450 770 500 730 C 560 690 640 720 690 780 C 650 830 560 820 520 860 C 450 900 360 870 300 800 Z" fill="#5FA35A"/>
        <path d="M600 900 C 640 870 700 880 740 910 L 720 960 C 680 950 640 950 600 900 Z" fill="#5FA35A"/>
      </g>
      <g class="launch-streaks" stroke="#F3E9DF" stroke-width="4" stroke-linecap="round">
        <line x1="340" y1="0" x2="340" y2="70"/><line x1="660" y1="180" x2="660" y2="260"/>
        <line x1="400" y1="420" x2="400" y2="480"/><line x1="610" y1="600" x2="610" y2="680"/>
        <line x1="300" y1="760" x2="300" y2="820"/><line x1="700" y1="880" x2="700" y2="950"/>
      </g>
      <g class="launch-ground">
        <ellipse cx="500" cy="1060" rx="900" ry="380" fill="#5FA35A"/>
        <ellipse cx="500" cy="1060" rx="900" ry="380" fill="none" stroke="#4C8A49" stroke-width="10"/>
        <circle cx="330" cy="660" r="34" fill="#4C8A49"/><circle cx="300" cy="675" r="26" fill="#4C8A49"/>
        <circle cx="700" cy="668" r="30" fill="#4C8A49"/>
        <rect x="586" y="420" width="26" height="272" fill="#9AA3AD" stroke="#473C3A" stroke-width="6"/>
        <line x1="586" y1="470" x2="612" y2="500" stroke="#473C3A" stroke-width="5"/>
        <line x1="612" y1="540" x2="586" y2="570" stroke="#473C3A" stroke-width="5"/>
        <line x1="586" y1="610" x2="612" y2="640" stroke="#473C3A" stroke-width="5"/>
        <rect x="548" y="500" width="44" height="12" fill="#9AA3AD" stroke="#473C3A" stroke-width="5"/>
        <rect x="420" y="690" width="200" height="20" rx="6" fill="#7A838C" stroke="#473C3A" stroke-width="6"/>
      </g>
      <g class="launch-smoke" fill="#F3EDE6">
        <circle cx="440" cy="700" r="48"/><circle cx="560" cy="700" r="52"/><circle cx="500" cy="720" r="62"/>
        <circle cx="380" cy="715" r="38"/><circle cx="620" cy="718" r="40"/>
      </g>
      <g class="launch-rocket">
        <g class="launch-flame">
          <path d="M478 600 Q500 700 522 600 Z" fill="#FFB347"/>
          <path d="M488 600 Q500 660 512 600 Z" fill="#FFE27A"/>
        </g>
        <path d="M466 548 L430 612 L478 596 Z" fill="#E8792B" stroke="#473C3A" stroke-width="6" stroke-linejoin="round"/>
        <path d="M534 548 L570 612 L522 596 Z" fill="#E8792B" stroke="#473C3A" stroke-width="6" stroke-linejoin="round"/>
        <path d="M500 420 C 538 456 546 520 541 600 L459 600 C 454 520 462 456 500 420 Z" fill="#F7F3EE" stroke="#473C3A" stroke-width="6" stroke-linejoin="round"/>
        <path d="M500 420 C 520 438 531 458 535 478 L465 478 C 469 458 480 438 500 420 Z" fill="#E8792B" stroke="#473C3A" stroke-width="6" stroke-linejoin="round"/>
        <circle cx="500" cy="528" r="18" fill="#7FE6EA" stroke="#473C3A" stroke-width="6"/>
      </g>
    </svg>
    <div class="launch-count" aria-hidden="true"><span>3</span><span>2</span><span>1</span></div>
    <p class="launch-liftoff">${t('launch.liftoff')}</p>
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
    root.classList.add('launch-out');
    window.setTimeout(() => root.remove(), 400);
    onDone();
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

/** Estrelas fixas (mesmas posições sempre: semente simples). */
function stars(): string {
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let out = '';
  for (let i = 0; i < 80; i++) out += `<circle cx="${(rnd() * 1000).toFixed(0)}" cy="${(rnd() * 1000).toFixed(0)}" r="${(1.5 + rnd() * 2.5).toFixed(1)}"/>`;
  return out;
}

/** Destino no alto da área segura, acima de onde o foguete viaja (não ficam um por cima do outro). */
function mars(): string {
  return `<circle cx="500" cy="300" r="90" fill="#C65B36" stroke="#473C3A" stroke-width="6"/>
    <circle cx="468" cy="275" r="17" fill="#A84A2C"/><circle cx="538" cy="320" r="12" fill="#A84A2C"/><circle cx="515" cy="262" r="8" fill="#A84A2C"/>
    <path d="M440 250 Q 500 236 560 250" stroke="#E8E2DA" stroke-width="8" fill="none" stroke-linecap="round" opacity="0.8"/>`;
}

function moon(): string {
  return `<circle cx="500" cy="300" r="90" fill="#BDB8B2" stroke="#473C3A" stroke-width="6"/>
    <circle cx="465" cy="280" r="18" fill="#9E9893"/><circle cx="537" cy="322" r="13" fill="#9E9893"/><circle cx="523" cy="258" r="9" fill="#9E9893"/>
    <circle cx="480" cy="335" r="8" fill="#9E9893"/>`;
}
