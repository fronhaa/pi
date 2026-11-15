import { CONFIG, DIFFICULTIES, doseFor3, tuning, type Difficulty } from '@/sim/config';
import type { Card, GameState, HistoricalMission, SolReport } from '@/sim/types';
import { formatDate, t, type StringKey } from '@/i18n';
import { h, openDialog } from './dom';
import { levelAria, levelContent } from './level';

/**
 * Como jogar (3 passos, GDD, "Janelas"). As fontes da NASA ficam só na documentação (docs/fontes-nasa.md), não no jogo.
 */
export function showTutorial(onDone: () => void, step = 1): void {
  const last = step === 3;
  const actions = [{ label: last ? t('tutorial.start') : t('tutorial.next'), primary: true, onClick: () => (last ? onDone() : showTutorial(onDone, step + 1)) }];
  openDialog({
    title: t(`tutorial.${step}.title` as StringKey),
    body: [h('p', {}, t(`tutorial.${step}.text` as StringKey)), h('p', { class: 'steps' }, `${step} / 3`)],
    actions,
    row: true,
  });
}

/**
 * Depois do lugar: o nível da missão (src/sim/config.ts, DIFFICULTY). Uma decisão por tela (docs/publico-e-impacto.md).
 * O botão marcado é o último nível jogado; na primeira partida, a Primeira missão.
 */
export function showLevelChoice(preferred: Difficulty, onChoose: (level: Difficulty) => void): void {
  openDialog({
    title: t('level.title'),
    body: [
      h('p', {}, t('level.text')),
      ...DIFFICULTIES.map((l) => h('p', {}, t(`level.${l}.hint` as StringKey))),
      h('p', { class: 'source' }, h('small', {}, `🛰️ ${t('level.nasa')}`)),
    ],
    actions: DIFFICULTIES.map((l) => ({ label: levelAria(l), content: levelContent(l), primary: l === preferred, onClick: () => onChoose(l) })),
    row: true,
  });
}

/** Missão histórica: logo depois da abertura, antes do sol 1 (as datas e as tempestades são reais). */
export function showMissionStart(text: string, onGo: () => void): void {
  openDialog({
    title: t('mission.title'),
    body: [h('p', {}, text)],
    actions: [{ label: t('mission.go'), primary: true, onClick: onGo }],
  });
}

/** Carta de decisão: toda opção tem custo. */
export function showCard(card: Card, onChoose: (optionId: string) => void): void {
  openDialog({
    title: `${t('card.title')}: ${t(`card.${card.id}.title` as StringKey)}`,
    body: [h('p', {}, t(`card.${card.id}.text` as StringKey))],
    actions: card.options.map((o) => ({ label: t(`card.${card.id}.${o.id}` as StringKey), onClick: () => onChoose(o.id) })),
  });
}

/** Relatório do sol: causa e efeito, mais a lição da carta, se houve. */
export function showReport(report: SolReport, state: GameState, onNext: () => void): void {
  const cardId = state.cardSols.get(report.sol);
  const playing = state.outcome.status === 'playing';
  openDialog({
    title: t('report.title', { sol: report.sol }),
    body: [
      h('ul', { class: 'report-lines' }, ...report.lines.map((l) => h('li', { class: l.tone ?? '' }, t(l.key, translateParams(l.params))))),
      cardId ? h('p', { class: 'lesson' }, `💡 ${t(`card.${cardId}.lesson` as StringKey)}`) : null,
    ],
    actions: [{ label: playing ? t('report.next', { sol: report.sol + 1 }) : t('a11y.close'), primary: true, onClick: onNext }],
    row: true,
  });
}

/** Parâmetros que são chaves de texto (ex.: "problem.antenna") viram o nome traduzido. */
function translateParams(params?: Record<string, string | number>): Record<string, string | number> | undefined {
  if (!params) return params;
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'string' && v.startsWith('problem.') ? t(v) : v]));
}

/** Fim da missão: explica o porquê, sem parecer castigo, e convida a tentar outra estratégia. */
export function showEnd(state: GameState, onAgain: () => void): void {
  const o = state.outcome;
  const r = state.res;
  let title: string;
  let text: string;
  let stars = 0;
  if (o.status === 'won') {
    title = t('end.won.title');
    text = t('end.won.text', { sol: CONFIG.sols });
    stars = o.stars;
  } else if (o.status === 'lost') {
    title = t(`end.lost.${o.reason}.title` as StringKey);
    text = t(`end.lost.${o.reason}.text` as StringKey, { sol: o.sol });
  } else {
    return;
  }
  const goal = tuning(state.difficulty).scienceGoal;
  const criteria = [
    [o.status === 'won', 'end.star1'],
    [o.status === 'won' && r.science >= goal, 'end.star2'],
    [o.status === 'won' && r.science >= goal && r.dose < doseFor3(state.location), 'end.star3'],
  ] as const;
  // A lição mais relevante para o que aconteceu vem primeiro.
  const lessons: StringKey[] =
    o.status === 'lost' && o.reason === 'dose' ? ['end.lesson.shield', 'end.lesson.delay', 'end.lesson.energy']
    : o.status === 'lost' ? ['end.lesson.energy', 'end.lesson.shield', 'end.lesson.delay']
    : stars === 1 ? ['end.lesson.science', 'end.lesson.energy', 'end.lesson.delay']
    : ['end.lesson.shield', 'end.lesson.energy', 'end.lesson.delay'];
  const hist = state.historical;
  const lessonText = (k: StringKey) =>
    k === 'end.lesson.delay' && hist
      ? t('end.lesson.delay.real', { min: Math.min(...hist.delays), max: Math.max(...hist.delays) })
      : t(k);

  openDialog({
    title,
    body: [
      h('p', {}, text),
      h('div', { class: 'stars', 'aria-label': t('end.stars', { n: stars }) },
        ...[1, 2, 3].map((i) => h('span', { class: i <= stars ? '' : 'off', 'aria-hidden': 'true' }, '★'))),
      // 3 estrelas no Fácil não são 3 estrelas no Difícil: o nível aparece junto.
      h('p', { class: 'level-badge' }, t('end.level', { name: levelAria(state.difficulty ?? 'medium', state.location) })),
      h('ul', { class: 'criteria' }, ...criteria.map(([ok, key]) => h('li', {}, `${ok ? '✅' : '⬜'} ${t(key, { limit: doseFor3(state.location), goal })}`))),
      hist ? missionRecap(hist) : null,
      h('h3', {}, t('end.learned')),
      h('ul', {}, ...lessons.map((k) => h('li', {}, lessonText(k)))),
    ],
    actions: [{ label: t('end.again'), primary: true, onClick: onAgain }],
    row: true,
  });
}

/** Fim da missão histórica: as datas reais e as tempestades que aconteceram de verdade. */
function missionRecap(m: HistoricalMission): HTMLElement {
  return h('div', { class: 'mission-recap' },
    h('p', {}, t('end.mission', { start: formatDate(m.startUtc), end: formatDate(m.endUtc) })),
    h('ul', {}, ...m.storms.map((s) => h('li', {},
      t('end.mission.storm', { sol: s.sol, date: formatDate(s.flare.time!), strength: t(`storm.strength.${s.flare.cls}` as StringKey) }),
    ))),
  );
}
