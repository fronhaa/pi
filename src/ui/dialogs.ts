import { CONFIG } from '@/sim/config';
import type { Card, GameState, HistoricalMission, SolReport } from '@/sim/types';
import type { FlareSource } from '@/data/flares';
import type { MissionSource } from '@/data/missions';
import { formatDate, t, type StringKey } from '@/i18n';
import { h, openDialog } from './dom';

/** Tutorial de 3 passos (GDD, "Janelas"). */
export function showTutorial(onDone: () => void, step = 1): void {
  const last = step === 3;
  openDialog({
    title: t(`tutorial.${step}.title` as StringKey),
    body: [h('p', {}, t(`tutorial.${step}.text` as StringKey)), h('p', { class: 'steps' }, `${step} / 3`)],
    actions: [{ label: last ? t('tutorial.start') : t('tutorial.next'), primary: true, onClick: () => (last ? onDone() : showTutorial(onDone, step + 1)) }],
    row: true,
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
  const criteria = [
    [o.status === 'won', 'end.star1'],
    [o.status === 'won' && r.science >= CONFIG.science.goal, 'end.star2'],
    [o.status === 'won' && r.science >= CONFIG.science.goal && r.dose < CONFIG.stars.doseFor3, 'end.star3'],
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
      h('ul', { class: 'criteria' }, ...criteria.map(([ok, key]) => h('li', {}, `${ok ? '✅' : '⬜'} ${t(key)}`))),
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
      s.flare.link ? h('span', {}, ' · ', h('a', { href: s.flare.link, target: '_blank', rel: 'noopener noreferrer' }, t('flare.link'))) : null,
    ))),
  );
}

/** Tela "Dados da NASA": cada fonte com selo honesto de estado (GDD, "Regras de honestidade"). */
export function showNasaData(source: FlareSource, missions: MissionSource, current: HistoricalMission | null): void {
  const snapshotBadge = (iso: string) => h('span', { class: 'badge real' }, t('data.badge.snapshot', { date: formatDate(iso) }));
  const donkiBadge =
    current && missions.kind === 'snapshot'
      ? snapshotBadge(missions.generatedAt)
      : source.kind === 'snapshot'
        ? snapshotBadge(source.fetchedAt)
        : h('span', { class: 'badge sim' }, t('data.badge.simulated'));
  const planned = () => h('span', { class: 'badge planned' }, t('data.badge.planned'));
  const link = (href: string) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, href.replace(/^https:\/\//, ''));

  openDialog({
    title: t('data.title'),
    body: [
      h('p', {}, t('data.intro')),
      h('ul', { class: 'sources' },
        current
          ? h('li', {}, h('strong', {}, t('data.donki.name')), donkiBadge, h('p', {}, t('data.donki.use.missions')),
              h('p', {}, t('data.donki.missions', { n: missions.missions.length, id: current.id, start: formatDate(current.startUtc), end: formatDate(current.endUtc) })),
              link('https://ccmc.gsfc.nasa.gov/tools/DONKI/'))
          : h('li', {}, h('strong', {}, t('data.donki.name')), donkiBadge, h('p', {}, t('data.donki.use')),
              source.kind === 'snapshot' ? h('p', {}, t('data.donki.count', { n: source.flares.length })) : null,
              link('https://ccmc.gsfc.nasa.gov/tools/DONKI/')),
        current && missions.kind === 'snapshot'
          ? h('li', {}, h('strong', {}, t('data.horizons.name')), snapshotBadge(missions.generatedAt), h('p', {}, t('data.horizons.use')), link('https://ssd.jpl.nasa.gov/horizons/'))
          : null,
        h('li', {}, h('strong', {}, t('data.osdr.name')), planned(), h('p', {}, t('data.osdr.use')), link('https://osdr.nasa.gov/bio/repo/')),
        h('li', {}, h('strong', {}, t('data.radlab.name')), planned(), h('p', {}, t('data.radlab.use')), link('https://visualization.osdr.nasa.gov/radlab/gui/data-api/')),
        h('li', {}, h('strong', {}, t('data.marstrek.name')), planned(), h('p', {}, t('data.marstrek.use')), link('https://trek.nasa.gov/mars/')),
      ),
    ],
    actions: [{ label: t('data.close'), primary: true, onClick: () => {} }],
    row: true,
    dismissible: true,
  });
}
