import * as THREE from 'three';

/**
 * Texturas desenhadas por código (canvas) para a estação, no estilo cel-shading: cores chapadas,
 * linhas de painel, rebites e poeira com borda ondulada em dois tons (nada de ruído fotográfico).
 * São quase brancas: multiplicam a cor do material, então a peça continua com a cor da paleta.
 * Vão embutidas no .glb como PNG.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, name: string, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.name = name;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const SEAM = '#cdc7c1';
const SEAM_LIGHT = '#ffffff';
const RIVET = '#c4beb8';
const DUST_1 = '#f0dbc3';
const DUST_2 = '#e2bd98';

/** Linha de junta de painel: sulco escuro com brilho do lado de baixo, e rebites. */
function seam(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, rivets = true): void {
  g.lineCap = 'round';
  g.strokeStyle = SEAM;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.strokeStyle = SEAM_LIGHT;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x0 + 1.5, y0 + 3);
  g.lineTo(x1 + 1.5, y1 + 3);
  g.stroke();
  if (!rivets) return;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.floor(len / 30);
  const nx = (-(y1 - y0) / len) * 9;
  const ny = ((x1 - x0) / len) * 9;
  g.fillStyle = RIVET;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(x0 + (x1 - x0) * t + nx * s, y0 + (y1 - y0) * t + ny * s, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** Faixa de poeira com borda ondulada (dois tons), entre a linha `edge` e a borda `towardY`. */
function dustBand(g: CanvasRenderingContext2D, w: number, edge: number, towardY: number, color: string, wobble: number, seed: number): void {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, towardY);
  for (let x = 0; x <= w; x += 4) {
    const y = edge + Math.sin(x * 0.045 + seed) * wobble + Math.sin(x * 0.13 + seed * 2.3) * wobble * 0.5;
    g.lineTo(x, y);
  }
  g.lineTo(w, towardY);
  g.closePath();
  g.fill();
}

/**
 * Casco dos módulos do habitat. u = ao longo do módulo (X), v = volta em torno do eixo:
 * v = 0 e 1 embaixo, 0,25 atrás, 0,5 no teto, 0,75 na frente (ver tubeUV).
 */
export function hullTexture(dust: 'mars' | 'neutral' = 'mars'): THREE.CanvasTexture {
  const W = 512;
  const H = 1024;
  const [c, g] = canvas(W, H);
  const Y = (v: number) => (1 - v) * H;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);

  // poeira embaixo (dos dois lados do fecho da textura, que fica no fundo do módulo)
  const d1 = dust === 'mars' ? DUST_1 : '#e6e1db';
  const d2 = dust === 'mars' ? DUST_2 : '#cfc8c0';
  dustBand(g, W, Y(0.17), Y(0), d1, 9, 1);
  dustBand(g, W, Y(0.11), Y(0), d2, 7, 4);
  dustBand(g, W, Y(0.83), Y(1), d1, 9, 2);
  dustBand(g, W, Y(0.89), Y(1), d2, 7, 5);

  // faixa antiderrapante no teto
  g.fillStyle = '#ebe7e3';
  g.fillRect(W * 0.1, Y(0.535), W * 0.8, Y(0.465) - Y(0.535));
  g.strokeStyle = '#dbd5cf';
  g.lineWidth = 3;
  for (let x = W * 0.1; x < W * 0.9; x += 14) {
    g.beginPath();
    g.moveTo(x, Y(0.535));
    g.lineTo(x + 10, Y(0.465));
    g.stroke();
  }

  // juntas: ombros, laterais e emendas no meio
  const x0 = W * 0.06;
  const x1 = W * 0.94;
  for (const v of [0.4, 0.6, 0.2, 0.8]) seam(g, x0, Y(v), x1, Y(v));
  for (const [va, vb] of [[0.2, 0.4], [0.6, 0.8]]) seam(g, W * 0.5, Y(va), W * 0.5, Y(vb));
  // escotilhas de manutenção pequenas na lateral de baixo
  g.strokeStyle = SEAM;
  g.lineWidth = 3;
  for (const v of [0.86 - 0.025, 0.14 + 0.025]) {
    for (const u of [0.25, 0.75]) {
      g.beginPath();
      g.roundRect(W * u - 34, Y(v) - 16, 68, 32, 8);
      g.stroke();
    }
  }
  // escorridos leves de poeira descendo das juntas
  g.fillStyle = '#f3ece5';
  for (let i = 0; i < 14; i++) {
    const u = 0.08 + ((i * 0.37) % 0.84);
    const top = i % 2 ? Y(0.6) : Y(0.4);
    const dir = i % 2 ? 1 : -1;
    g.fillRect(W * u, top + 3 * dir, 5, (16 + (i % 4) * 9) * dir);
  }
  return toTexture(c, dust === 'mars' ? 'hull_panels' : 'hull_panels_neutral', dust !== 'mars');
}

/** Painéis para peças em caixa (torre, escotilha): cada face recebe a textura inteira. */
export function boxTexture(dust: 'mars' | 'neutral' = 'mars'): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  // poeira neutra (cinza-bege) para o que vai à Lua e a Marte
  dustBand(g, S, S * 0.86, S, dust === 'mars' ? DUST_1 : '#e6e1db', 6, 3);
  dustBand(g, S, S * 0.93, S, dust === 'mars' ? DUST_2 : '#cfc8c0', 4, 7);
  const m = S * 0.07;
  seam(g, m, m, S - m, m);
  seam(g, m, S * 0.55, S - m, S * 0.55);
  seam(g, S * 0.5, m, S * 0.5, S * 0.55);
  seam(g, m, m, m, S * 0.82, false);
  seam(g, S - m, m, S - m, S * 0.82, false);
  // grade de ventilação
  g.fillStyle = '#d6d0ca';
  for (let i = 0; i < 4; i++) g.fillRect(S * 0.6, S * 0.64 + i * 14, S * 0.26, 6);
  return toTexture(c, dust === 'mars' ? 'box_panels' : 'box_panels_neutral', dust !== 'mars');
}

/** Faixas de perigo (laranja e cinza-chumbo na diagonal), para degrau e rodapé. Repete em U. */
export function hazardTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#46424a';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#e8792b';
  for (let x = -64; x < 320; x += 48) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 24, 64);
    g.lineTo(x + 24 + 64, 0);
    g.lineTo(x + 64, 0);
    g.closePath();
    g.fill();
  }
  return toTexture(c, 'hazard', true);
}

/** Faixa de parafusos (base da cúpula). Repete em U. */
export function boltTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#d9dfe2';
  g.fillRect(0, 26, 128, 12);
  g.fillStyle = '#c3cbd0';
  for (const x of [32, 96]) {
    g.beginPath();
    g.arc(x, 32, 7, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#b5bec4';
  g.fillRect(62, 4, 4, 56);
  return toTexture(c, 'bolt_band', true);
}

/** Plaquinhas dos módulos ("HAB 01" a "HAB 04" e "COM"): atlas 2 x 4. */
export const LABELS = ['HAB 01', 'HAB 02', 'HAB 03', 'HAB 04', 'COM', 'JZ-1', 'LAB', 'AIRLOCK'];
export function labelTexture(): THREE.CanvasTexture {
  const CW = 256;
  const CH = 96;
  const [c, g] = canvas(CW * 2, CH * 4);
  g.clearRect(0, 0, c.width, c.height);
  LABELS.forEach((text, i) => {
    const x = (i % 2) * CW;
    const y = Math.floor(i / 2) * CH;
    g.fillStyle = '#46424a';
    g.beginPath();
    g.roundRect(x + 6, y + 6, CW - 12, CH - 12, 18);
    g.fill();
    g.fillStyle = '#e8792b';
    g.beginPath();
    g.roundRect(x + 20, y + 22, 14, CH - 44, 6);
    g.fill();
    g.fillStyle = '#f3f1ee';
    g.font = 'bold 46px "Arial Black", "Helvetica Neue", Arial, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText(text, x + CW / 2 + 12, y + CH / 2 + 2, CW - 70);
  });
  return toTexture(c, 'labels');
}

/** Plano de plaquinha com a UV da célula `i` do atlas de LABELS. Olha para +Z. */
export function labelGeometry(i: number, w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv');
  const cx = i % 2;
  const cy = Math.floor(i / 2);
  for (let k = 0; k < uv.count; k++) {
    const u = (cx + uv.getX(k)) / 2;
    const v = 1 - (cy + 1 - uv.getY(k)) / 4;
    uv.setXY(k, u, v);
  }
  return g;
}

/**
 * UV cilíndrica para um tubo deitado no eixo X e centrado na origem:
 * u = posição ao longo do comprimento, v = ângulo em volta (fecho embaixo, onde a textura é lisa).
 */
export function tubeUV(geo: THREE.BufferGeometry, len: number): void {
  const p = geo.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    uv[i * 2] = THREE.MathUtils.clamp(x / len + 0.5, 0, 1);
    uv[i * 2 + 1] = (Math.atan2(z, y) + Math.PI) / (Math.PI * 2);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Multiplica a coordenada U (para texturas que repetem). */
export function scaleUV(geo: THREE.BufferGeometry, su: number, sv = 1): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}
