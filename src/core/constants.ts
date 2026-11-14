/** Passo fixo da física (segundos). Ver docs/decisoes/0001-stack.md */
export const FIXED_DT = 1 / 60;

/** Limite de tempo acumulado por frame, evita "espiral da morte" após travadas/aba em background. */
export const MAX_FRAME_DT = 0.25;

export const GRAVITY = { x: 0, y: -20, z: 0 };
