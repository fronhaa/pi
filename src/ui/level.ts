import { t, type StringKey } from '@/i18n';
import type { Difficulty, Location } from '@/sim/config';
import { h } from './dom';

/**
 * Idade recomendada de cada nível, por lugar (docs/game-design.md, "Níveis de dificuldade"). Na Lua o mesmo nível
 * é mais difícil (sem ar contra a radiação, dias de sombra; o `npm run balance` dá bem menos 3★ que em Marte), então
 * o Normal e o Expert pedem mais idade. Só recomendação mostrada no botão: não muda regra.
 */
export const RECOMMENDED_AGE: Record<Location, Record<Difficulty, number>> = {
  mars: { easy: 7, medium: 9, hard: 11 },
  moon: { easy: 7, medium: 10, hard: 12 },
};

function age(level: Difficulty, place: Location): string {
  return t('level.age', { n: RECOMMENDED_AGE[place][level] });
}

/**
 * Conteúdo de um botão de nível: o nome da missão e, embaixo, a idade recomendada naquele lugar. Usado na tela dos
 * planetas, no saguão do grupo e na janela de nível (o modo em grupo é só em Marte).
 */
export function levelContent(level: Difficulty, place: Location = 'mars'): HTMLElement[] {
  return [
    h('span', { class: 'level-name' }, t(`level.${level}` as StringKey)),
    h('span', { class: `level-age level-${level}` }, `👧 ${age(level, place)}`),
  ];
}

/** Nome do nível para leitor de tela e tela final: "🌱 Primeira missão, 7+ anos". */
export function levelAria(level: Difficulty, place: Location = 'mars'): string {
  return `${t(`level.${level}` as StringKey)}, ${age(level, place)}`;
}
