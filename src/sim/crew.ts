import type { EnergyPlan } from './types.ts';

/**
 * Personagens jogáveis: a tripulação (docs/game-design.md, "Papéis" e "Tempo da tripulação").
 *
 * É a FONTE dos papéis: o tipo `Role` e a lista `ROLES` nascem aqui, na simulação. A cena só
 * diz ONDE cada papel fica (src/scenarios/layout.ts) e COMO ele aparece (src/scene/Crew.ts).
 * Personagem novo: entra aqui primeiro, depois cor/posição na cena e nome no i18n (`crew.<id>`).
 * Guia: docs/estrutura-do-projeto.md, "Personagem novo".
 */
export const ROLES = ['commander', 'engineer', 'medic', 'scientist'] as const;

export type Role = (typeof ROLES)[number];

export interface RoleDef {
  id: Role;
  /**
   * Parte do plano de energia que este papel decide no modo em grupo (null = não mexe em blocos).
   * O servidor Go tem a mesma tabela (server/internal/coop/game.go, BlockRole): mudou aqui, mude lá.
   */
  block: keyof EnergyPlan | null;
  /** Responde as cartas e termina o sol (modo em grupo). */
  leads: boolean;
}

export const ROLE_DEFS: Record<Role, RoleDef> = {
  commander: { id: 'commander', block: null, leads: true },
  engineer: { id: 'engineer', block: 'shield', leads: false },
  medic: { id: 'medic', block: 'life', leads: false },
  scientist: { id: 'scientist', block: 'science', leads: false },
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
