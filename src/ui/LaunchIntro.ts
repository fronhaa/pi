import { t } from '@/i18n';

/**
 * Intro da viagem (depois de escolher Marte ou Lua): um foguete sai da Terra e chega ao destino, com o tempo de
 * viagem REAL (docs/ciencia-marte.md, F30 e F31). Só visual: não muda regra. ~8 s, com botão "Pular" sempre visível.
 * Feita em SVG + CSS (src/ui/style.css, ".launch-*"): leve no celular e independente da cena 3D.
 * Com "reduzir movimento" no sistema, mostra só o fato por um instante, sem animação.
 */
const DURATION_MS = 8200;
const REDUCED_MS = 2500;

export function playLaunchIntro(place: 'mars' | 'moon', onDone: () => void): void {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const root = document.createElement('div');
  root.className = `launch-intro launch-${place}${reduced ? ' launch-reduced' : ''}`;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', t('launch.title'));
  root.innerHTML = `
    <svg class="launch-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="launch-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7FB6E6"/><stop offset="1" stop-color="#CFE6F5"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#launch-sky)"/>
      <rect class="launch-space" width="1600" height="900" fill="#1B1630"/>
      <g class="launch-stars" fill="#F3E9DF">${stars()}</g>
      <g class="launch-dest">${place === 'mars' ? mars() : moon()}</g>
      <g class="launch-earth">
        <circle cx="800" cy="1500" r="900" fill="#3E7CC8"/>
        <path d="M200 1080 C 420 980 560 1040 700 990 C 820 950 900 1000 1040 960 C 1180 925 1290 990 1400 1050 L1400 1200 L200 1200 Z" fill="#5FA35A"/>
        <circle cx="800" cy="1500" r="900" fill="none" stroke="#BFE3FF" stroke-width="18" opacity="0.6"/>
      </g>
      <g class="launch-smoke" fill="#F3EDE6">
        <circle cx="740" cy="760" r="70"/><circle cx="860" cy="770" r="80"/><circle cx="800" cy="800" r="95"/>
        <circle cx="680" cy="810" r="60"/><circle cx="930" cy="815" r="65"/>
      </g>
      <g class="launch-rocket">
        <g class="launch-flame"><path d="M772 690 Q800 800 828 690 Z" fill="#FFB347"/><path d="M784 690 Q800 760 816 690 Z" fill="#FFE27A"/></g>
        <path d="M740 610 L700 690 L760 670 Z" fill="#E8792B" stroke="#473C3A" stroke-width="6" stroke-linejoin="round"/>
        <path d="M860 610 L900 690 L840 670 Z" fill="#E8792B" stroke="#473C3A" stroke-width="6" stroke-linejoin="round"/>
        <path d="M800 440 C 850 490 862 570 856 690 L744 690 C 738 570 750 490 800 440 Z" fill="#F7F3EE" stroke="#473C3A" stroke-width="6" stroke-linejoin="round"/>
        <path d="M800 440 C 828 466 842 492 848 520 L752 520 C 758 492 772 466 800 440 Z" fill="#E8792B" stroke="#473C3A" stroke-width="6" stroke-linejoin="round"/>
        <circle cx="800" cy="580" r="26" fill="#7FE6EA" stroke="#473C3A" stroke-width="6"/>
      </g>
    </svg>
    <div class="launch-text">
      <p class="launch-liftoff">${t('launch.liftoff')}</p>
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
  for (let i = 0; i < 70; i++) out += `<circle cx="${(rnd() * 1600).toFixed(0)}" cy="${(rnd() * 900).toFixed(0)}" r="${(1.5 + rnd() * 2.5).toFixed(1)}"/>`;
  return out;
}

function mars(): string {
  return `<circle cx="800" cy="180" r="140" fill="#C65B36" stroke="#473C3A" stroke-width="6"/>
    <circle cx="750" cy="140" r="26" fill="#A84A2C"/><circle cx="860" cy="210" r="18" fill="#A84A2C"/><circle cx="820" cy="120" r="12" fill="#A84A2C"/>
    <path d="M700 110 Q 800 90 900 110" stroke="#E8E2DA" stroke-width="10" fill="none" stroke-linecap="round" opacity="0.8"/>`;
}

function moon(): string {
  return `<circle cx="800" cy="180" r="140" fill="#BDB8B2" stroke="#473C3A" stroke-width="6"/>
    <circle cx="745" cy="150" r="28" fill="#9E9893"/><circle cx="855" cy="215" r="20" fill="#9E9893"/><circle cx="835" cy="120" r="14" fill="#9E9893"/>
    <circle cx="770" cy="235" r="12" fill="#9E9893"/>`;
}
