import { t, type StringKey } from '@/i18n';
import type { Difficulty } from '@/sim/config';
import { h } from './dom';

/**
 * Conteúdo de um botão de nível: o nome da missão e, embaixo, a idade recomendada (7+, 9+, 11+ anos; faixas de
 * docs/game-design.md, "Níveis de dificuldade"). Usado na tela dos planetas, no saguão do grupo e na janela de nível.
 */
export function levelContent(level: Difficulty): HTMLElement[] {
  return [
    h('span', { class: 'level-name' }, t(`level.${level}` as StringKey)),
    h('span', { class: `level-age level-${level}` }, `👧 ${t(`level.${level}.age` as StringKey)}`),
  ];
}

/** Nome do nível para leitor de tela e tela final: "🌱 Primeira missão, 7+ anos". */
export function levelAria(level: Difficulty): string {
  return `${t(`level.${level}` as StringKey)}, ${t(`level.${level}.age` as StringKey)}`;
}
