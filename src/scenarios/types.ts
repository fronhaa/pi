import type * as THREE from 'three';
import type { Location } from '@/sim/config';

/**
 * Um cenário = um lugar onde a base pode ficar (Marte, Lua…). Padrão Strategy: a cena da base
 * (src/scene/BaseScene.ts) é a mesma, e o cenário diz o que muda NA APARÊNCIA e na física de andar.
 *
 * O que NÃO entra aqui:
 * - Regras e números do jogo: src/sim/config.ts (ex.: CONFIG.moon) e a `Location` na Mission.
 * - Textos: src/i18n (o que muda na Lua está em src/i18n/moon.ts).
 * - Posição dos prédios: src/scene/base/layout.ts (igual em todos os lugares).
 *
 * Cenário novo: docs/estrutura-do-projeto.md, "Cenário novo".
 */
export interface Scenario {
  id: Location;
  /** Gravidade para a física da tripulação (m/s²), com fonte em src/core/constants.ts. */
  gravity: number;
  /** Cores do chão, das pedras, das mesas e da poeira (as dos prédios e plantas não mudam). */
  terrain: { soil: number; rock: number; lit: number; dust: number };
  /** Céu de dia, com poeira, em alerta e à noite. */
  sky: { day: number; dust: number; alert: number; night: number };
  sun: {
    color: number;
    position: readonly [number, number, number];
    /** Intensidade com o Sol pleno (a luz do dia, de 0 a 1, vem do estado da cena). */
    intensity: number;
  };
  /** Luz ambiente (céu + chão). */
  hemiIntensity: number;
  /** Altura das mesas no horizonte (1 = como em Marte). */
  mesaHeight: number;
  /**
   * Sem ar (Lua): quase sem névoa, estrelas até de dia, a poeira não sobe no céu
   * (fica só nos painéis) e o pontinho da Terra some (ela é grande, nos `extras`).
   */
  airless: boolean;
  /**
   * Quanto o fim do turno escurece a cena (1 = noite de verdade). Na Lua o Sol não se põe a cada 24 h:
   * só a noite da sombra das montanhas escurece de verdade (`SceneState.shadow`).
   */
  restDarkness: number;
  /** Objetos que só existem neste lugar (ex.: a Terra grande e as crateras da Lua). Montados uma vez, escondidos fora dele. */
  buildExtras?: () => THREE.Object3D;
}
