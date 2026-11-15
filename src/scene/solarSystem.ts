/**
 * Posições de hoje no Sistema Solar, CALCULADAS (não é ao vivo): Terra e Marte em volta do Sol e a Lua em volta da
 * Terra. Só para a tela de escolha (src/scene/LaunchScene.ts); não muda regra. Fontes e trechos em
 * docs/ciencia-marte.md (F38 e F39).
 *
 * - Terra e Marte: método e Tabela 1 do JPL, "Approximate Positions of the Planets"
 *   (https://ssd.jpl.nasa.gov/planets/approx_pos.html), válida de 1800 a 2050. A "Terra" da tabela é o baricentro
 *   Terra-Lua ("EM Bary"), que fica a menos de 5.000 km do centro da Terra: no desenho, é a Terra.
 * - Lua: fase pela idade desde a lua nova mais recente do catálogo da NASA/GSFC (Phases of the Moon 2001 to 2100;
 *   lista de 2026 abaixo) e, fora dela, o mês sinódico médio do mesmo catálogo. A Lua fica na direção do Sol na lua nova e do lado oposto na cheia.
 *
 * Puro (sem three.js, sem DOM): roda no navegador e nos testes do Node.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** Elementos keplerianos e taxas por século (Tabela 1 do JPL, 1800–2050; ângulos em graus, a em ua). */
interface Elements {
  a: [number, number];
  e: [number, number];
  I: [number, number];
  L: [number, number];
  peri: [number, number];
  node: [number, number];
}

const TABLE1: Record<'earth' | 'mars', Elements> = {
  // "EM Bary" (baricentro Terra-Lua)
  earth: {
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    peri: [102.93768193, 0.32327364],
    node: [0.0, 0.0],
  },
  mars: {
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    peri: [-23.94362959, 0.44441088],
    node: [49.55953891, -0.29257343],
  },
};

/** A Tabela 1 só vale de 1800 a 2050: fora disso, usa a data mais próxima dentro do intervalo. */
const VALID_FROM = Date.UTC(1800, 0, 1);
const VALID_TO = Date.UTC(2050, 11, 31);

/**
 * Luas novas de 2026 (UT), do catálogo da NASA/GSFC "Phases of the Moon: 2001 to 2100", e o mês sinódico médio do
 * mesmo catálogo (29,530588 dias), usado só antes da primeira e depois da última da lista.
 */
const NEW_MOONS_UTC = [
  [0, 18, 19, 52], [1, 17, 12, 1], [2, 19, 1, 23], [3, 17, 11, 52], [4, 16, 20, 1], [5, 15, 2, 54],
  [6, 14, 9, 43], [7, 12, 17, 37], [8, 11, 3, 27], [9, 10, 15, 50], [10, 9, 7, 2], [11, 9, 0, 52],
].map(([mo, d, h, mi]) => Date.UTC(2026, mo, d, h, mi));
const SYNODIC_DAYS = 29.530588;
const DAY_MS = 86_400_000;

const rad = (d: number) => (d * Math.PI) / 180;

/** Séculos desde J2000.0 (T do JPL). A diferença entre o relógio (UTC) e o tempo das efemérides (~1 min) não importa aqui. */
function centuries(date: Date): number {
  const ms = Math.min(Math.max(date.getTime(), VALID_FROM), VALID_TO);
  const jd = ms / DAY_MS + 2440587.5;
  return (jd - 2451545.0) / 36525;
}

/** Equação de Kepler M = E − e·sen E (radianos), pelo método de Newton, como no passo 3 do JPL. */
function solveKepler(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 30; i++) {
    const dE = (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/** Posição no plano da eclíptica J2000 (ua), dada a anomalia média em graus (passos 4 e 5 do JPL). */
function eclipticXY(el: ReturnType<typeof elementsAt>, Mdeg: number): Vec2 {
  const { a, e, I, peri, node } = el;
  const w = rad(peri - node);
  const O = rad(node);
  const i = rad(I);
  let M = ((Mdeg % 360) + 540) % 360 - 180; // −180° a +180°
  M = rad(M);
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return {
    x: (Math.cos(w) * Math.cos(O) - Math.sin(w) * Math.sin(O) * Math.cos(i)) * xp +
      (-Math.sin(w) * Math.cos(O) - Math.cos(w) * Math.sin(O) * Math.cos(i)) * yp,
    y: (Math.cos(w) * Math.sin(O) + Math.sin(w) * Math.cos(O) * Math.cos(i)) * xp +
      (-Math.sin(w) * Math.sin(O) + Math.cos(w) * Math.cos(O) * Math.cos(i)) * yp,
  };
}

function elementsAt(body: 'earth' | 'mars', T: number) {
  const t = TABLE1[body];
  const at = (k: keyof Elements) => t[k][0] + t[k][1] * T;
  return { a: at('a'), e: at('e'), I: at('I'), L: at('L'), peri: at('peri'), node: at('node') };
}

/**
 * Posição heliocêntrica (ua) no plano da eclíptica J2000, vista do norte da eclíptica: x aponta para o equinócio de
 * março e os planetas giram no sentido anti-horário. (A altura fora do plano, menos de 2° em Marte, fica de fora.)
 */
export function heliocentric(body: 'earth' | 'mars', date: Date): Vec2 {
  const el = elementsAt(body, centuries(date));
  return eclipticXY(el, el.L - el.peri);
}

/** Pontos da órbita inteira (ua), para desenhar a elipse. */
export function orbitPath(body: 'earth' | 'mars', date: Date, n = 160): Vec2[] {
  const el = elementsAt(body, centuries(date));
  return Array.from({ length: n + 1 }, (_, k) => eclipticXY(el, (k / n) * 360));
}

/**
 * Ângulo da Lua em volta da Terra (radianos, anti-horário, mesmo plano de `heliocentric`). Na lua nova a Lua está na
 * direção do Sol; a cada mês sinódico dá uma volta em relação a ele.
 */
export function moonAngle(date: Date, earth: Vec2 = heliocentric('earth', date)): number {
  const sun = Math.atan2(-earth.y, -earth.x); // direção do Sol vista da Terra
  return sun + (2 * Math.PI * moonAge(date)) / SYNODIC_DAYS;
}

/** Idade da Lua em dias (0 = nova, ~14,8 = cheia), contada da lua nova da lista mais recente. */
export function moonAge(date: Date): number {
  const t = date.getTime();
  let ref = NEW_MOONS_UTC[0];
  for (const nm of NEW_MOONS_UTC) if (nm <= t) ref = nm;
  const days = (t - ref) / DAY_MS;
  return ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
}
