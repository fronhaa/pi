/** Passo fixo da física (segundos). Ver docs/decisoes/0001-stack.md */
export const FIXED_DT = 1 / 60;

/** Limite de tempo acumulado por frame, evita "espiral da morte" após travadas/aba em background. */
export const MAX_FRAME_DT = 0.25;

/** Gravidade padrão da Terra (m/s²), usada só para comparar. */
export const EARTH_G = 9.81;

/**
 * Gravidade de Marte: cerca de 38% da Terra.
 * Fonte: NASA/JPL, Mars 2020 Perseverance Landing Press Kit, Quick Facts
 * (https://www.jpl.nasa.gov/news/press_kits/mars_2020/landing/quick_facts/).
 * Valor em m/s² calculado: 0,38 × 9,81 ≈ 3,73.
 */
export const MARS_GRAVITY_RATIO = 0.38;
export const MARS_G = MARS_GRAVITY_RATIO * EARTH_G;

export const GRAVITY = { x: 0, y: -MARS_G, z: 0 };

/**
 * Volta para casa à noite (m/s): andando para dormir no habitat, correndo para o abrigo na tempestade.
 * Valores de jogo, escolhidos para todos entrarem em poucos segundos (o andar normal é 2,4 m/s).
 */
export const NIGHT_WALK_SPEED = 4;
export const STORM_RUN_SPEED = 6;
