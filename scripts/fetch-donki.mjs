#!/usr/bin/env node
/**
 * Coleta eventos solares reais do DONKI (NASA) e gera src/data/solar-events.json.
 * Uso: npm run data:donki   (lê NASA_API_KEY do .env; chave grátis em https://api.nasa.gov/)
 *
 * Opções (variáveis de ambiente):
 *   NASA_API_KEY   chave da api.nasa.gov (padrão: DEMO_KEY, limite ~10 req/h, costuma falhar)
 *   DONKI_START    ano inicial (padrão 2016)
 *   DONKI_END      data final AAAA-MM-DD (padrão: hoje)
 *   DONKI_BASE_URL base da API (padrão https://api.nasa.gov/DONKI;
 *                  alternativa sem chave: https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get)
 *
 * Tipos coletados: SEP (partículas), FLR (erupções X, via notificações) e CME-MARS (impacto previsto em Marte).
 * Detalhes e critérios de curadoria: docs/dados.md
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.NASA_API_KEY || 'DEMO_KEY';
const BASE = (process.env.DONKI_BASE_URL || 'https://api.nasa.gov/DONKI').replace(/\/$/, '');
const START_YEAR = Number(process.env.DONKI_START || 2016);
const END = process.env.DONKI_END || new Date().toISOString().slice(0, 10);
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'solar-events.json');

/** Erupções a partir desta classe entram na lista (X = as mais fortes). */
const MIN_FLARE_CLASS = 'X1.0';

// ---------- coleta ----------

/** A api.nasa.gov recusa intervalos maiores que 60 dias (HTTP 400). */
const MAX_DAYS = 60;
const DAY_MS = 86_400_000;
const iso = (d) => d.toISOString().slice(0, 10);

function dateRanges() {
  const ranges = [];
  const end = new Date(`${END}T00:00:00Z`);
  let start = new Date(`${START_YEAR}-01-01T00:00:00Z`);
  while (start <= end) {
    const chunkEnd = new Date(Math.min(start.getTime() + (MAX_DAYS - 1) * DAY_MS, end.getTime()));
    ranges.push([iso(start), iso(chunkEnd)]);
    start = new Date(chunkEnd.getTime() + DAY_MS);
  }
  return ranges;
}

async function fetchType(type, extraParams = {}) {
  const path = type === 'FLR-notifications' ? 'notifications' : type;
  const all = [];
  const ranges = dateRanges();
  let count = 0;
  for (const [start, end] of ranges) {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('startDate', start);
    url.searchParams.set('endDate', end);
    for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
    if (BASE.includes('api.nasa.gov')) url.searchParams.set('api_key', API_KEY);

    const res = await fetch(url);
    if (res.status === 429) {
      throw new Error(
        `Limite de requisições atingido (429) em ${type} ${start}. ` +
          (API_KEY === 'DEMO_KEY' ? 'Use sua própria chave: NASA_API_KEY no .env (https://api.nasa.gov/).' : 'Tente mais tarde.'),
      );
    }
    if (!res.ok) throw new Error(`${type} ${start}..${end}: HTTP ${res.status} ${await res.text()}`);

    const text = await res.text();
    const data = text.trim() ? JSON.parse(text) : [];
    all.push(...(Array.isArray(data) ? data : []));
    count++;
  }
  console.log(`  ${type}: ${all.length} eventos em ${count} requisições`);
  return all;
}

/**
 * O endpoint DONKI/FLR da api.nasa.gov responde 404 (testado em 2026-11-14).
 * Alternativa: as notificações de erupção, que trazem linhas fixas como
 * "Flare intensity: X1.6 class." e "Activity ID: 2024-05-03T02:11:00-FLR-001.".
 * O DONKI só emite notificação para erupções significativas.
 */
export function flaresFromNotifications(messages) {
  const byId = new Map();
  for (const m of messages) {
    const body = m.messageBody || '';
    const classType = /Flare intensity:\s*([ABCMX]\d+(?:\.\d+)?)/i.exec(body)?.[1]?.toUpperCase();
    if (!classType) continue;
    const begin = /Flare start time:\s*(\S+?Z)/i.exec(body)?.[1] ?? null;
    const peak = /Flare peak time:\s*(\S+?Z)/i.exec(body)?.[1] ?? null;
    const id = /Activity ID:\s*(\S+?-FLR-\d+)/i.exec(body)?.[1] ?? (begin ? `${begin}-FLR-?` : m.messageID);
    const region = /Active Region\s+(\d+)/i.exec(body)?.[1];
    const flare = {
      flrID: id,
      classType,
      beginTime: begin,
      peakTime: peak,
      activeRegionNum: region ? Number(region) : null,
      link: m.messageURL,
    };
    // Atualizações do mesmo evento: fica a de maior intensidade
    const prev = byId.get(id);
    if (!prev || flareFlux(classType) > flareFlux(prev.classType)) byId.set(id, flare);
  }
  return [...byId.values()];
}

// ---------- curadoria ----------

/** "X2.3" -> 2.3 * 10^-4 (fluxo de raio-X em W/m²); permite comparar classes. */
export function flareFlux(classType) {
  const m = /^([ABCMX])(\d+(?:\.\d+)?)/.exec(classType || '');
  if (!m) return 0;
  const base = { A: 1e-8, B: 1e-7, C: 1e-6, M: 1e-5, X: 1e-4 }[m[1]];
  return base * Number(m[2]);
}

export function curate(seps, flares, marsCmeEvents = []) {
  const flareById = new Map(flares.map((f) => [f.flrID, f]));
  const flaresLinkedToSEP = new Set(seps.flatMap((s) => (s.linkedEvents || []).map((e) => e.activityID)));
  const minFlux = flareFlux(MIN_FLARE_CLASS);

  const sepEvents = seps.map((s) => {
    const instruments = (s.instruments || []).map((i) => i.displayName);
    const linkedFlares = (s.linkedEvents || [])
      .map((e) => flareById.get(e.activityID))
      .filter(Boolean)
      .sort((a, b) => flareFlux(b.classType) - flareFlux(a.classType));
    return {
      id: s.sepID,
      type: 'SEP',
      time: s.eventTime,
      instruments,
      linkedFlareClass: linkedFlares[0]?.classType ?? null,
      link: s.link,
    };
  });

  const flareEvents = flares
    .filter((f) => flareFlux(f.classType) >= minFlux)
    .map((f) => ({
      id: f.flrID,
      type: 'FLR',
      time: f.peakTime || f.beginTime,
      classType: f.classType,
      activeRegion: f.activeRegionNum ?? null,
      causedSEP: flaresLinkedToSEP.has(f.flrID),
      link: f.link,
    }));

  return [...sepEvents, ...flareEvents, ...marsCmeEvents].sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * CMEs que o modelo WSA-ENLIL da NASA previu que atingiriam Marte.
 * Atenção: é PREVISÃO de modelo, não medição em Marte.
 * Uma CME pode ter várias simulações (refeitas com dados novos): fica a mais recente.
 * Simulações com várias CMEs são atribuídas à mais rápida delas.
 */
export function curateMarsCMEs(sims) {
  const byCme = new Map();
  for (const sim of sims) {
    const mars = (sim.impactList || []).find((i) => i.location === 'Mars');
    const inputs = sim.cmeInputs || [];
    if (!mars || inputs.length === 0) continue;
    const main = [...inputs].sort((a, b) => (b.speed ?? 0) - (a.speed ?? 0))[0];
    const event = {
      id: main.CMEID,
      type: 'CME-MARS',
      time: main.cmeStartTime,
      speedKmS: main.speed ?? null,
      predictedArrivalAtMars: mars.arrivalTime,
      glancingBlow: Boolean(mars.isGlancingBlow),
      modelCompletionTime: sim.modelCompletionTime,
      link: sim.link,
    };
    const prev = byCme.get(event.id);
    if (!prev || event.modelCompletionTime > prev.modelCompletionTime) byCme.set(event.id, event);
  }
  return [...byCme.values()];
}

// ---------- main ----------

async function main() {
  console.log(`DONKI ${BASE} | ${START_YEAR}..${END} | chave: ${API_KEY === 'DEMO_KEY' ? 'DEMO_KEY' : 'própria'}`);
  const seps = await fetchType('SEP');
  const flares = flaresFromNotifications(await fetchType('FLR-notifications', { type: 'FLR' }));
  console.log(`  FLR: ${flares.length} erupções extraídas das notificações`);
  const marsCMEs = curateMarsCMEs(await fetchType('WSAEnlilSimulations'));
  console.log(`  CME-MARS: ${marsCMEs.length} CMEs com impacto previsto em Marte`);
  const events = curate(seps, flares, marsCMEs);

  const out = {
    source: 'NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information)',
    sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
    api: BASE,
    fetchedAt: new Date().toISOString(),
    range: { start: `${START_YEAR}-01-01`, end: END },
    criteria: {
      SEP: 'todos os eventos de partículas solares (detectados por instrumentos perto da Terra e STEREO-A)',
      FLR: `erupções a partir da classe ${MIN_FLARE_CLASS}, extraídas das notificações do DONKI (endpoint FLR indisponível)`,
      'CME-MARS': 'CMEs com impacto em Marte PREVISTO pelo modelo WSA-ENLIL (previsão, não medição); simulação mais recente por CME',
    },
    counts: {
      rawSEP: seps.length,
      rawFLR: flares.length,
      SEP: events.filter((e) => e.type === 'SEP').length,
      FLR: events.filter((e) => e.type === 'FLR').length,
      'CME-MARS': marsCMEs.length,
    },
    events,
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nGerado src/data/solar-events.json`, out.counts);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`\nErro: ${err.message}`);
    process.exit(1);
  });
}
