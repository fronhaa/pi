#!/usr/bin/env node
/**
 * Coleta eventos solares reais do DONKI (NASA) e gera:
 *   - data/donki-solar-events.json  dataset completo e curado (consulta e verificação; NÃO vai no build)
 *   - public/data/donki-flares.json  versão enxuta que o jogo carrega (erupções M e X)
 * Uso: npm run fetch-data   (lê NASA_API_KEY do .env; chave grátis em https://api.nasa.gov/)
 *
 * Opções (variáveis de ambiente):
 *   NASA_API_KEY   chave da api.nasa.gov (padrão: DEMO_KEY, limite ~10 req/h, costuma falhar)
 *   DONKI_START    ano inicial (padrão 2016)
 *   DONKI_END      data final AAAA-MM-DD (padrão: hoje)
 *   DONKI_BASE_URL base da API (padrão https://api.nasa.gov/DONKI;
 *                  alternativa sem chave: https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get)
 *   DONKI_REFRESH_DAYS  dias até um período ser considerado "fechado" (padrão 30)
 *   DONKI_FORCE=1  ignora o cache e baixa tudo de novo (~200 requisições)
 *
 * CACHE (a API tem limite: 1.000 req/h com chave própria, ~10/h com DEMO_KEY):
 *   Cada bloco de 60 dias é guardado em data/cache/donki/<tipo>/<início>.json, já enxuto.
 *   Blocos antigos e "assentados" são reaproveitados para sempre; só os recentes são buscados de novo.
 *   Se o limite estourar no meio, o que já veio fica salvo: rode de novo depois e ele continua dali.
 *
 * Tipos coletados: SEP (partículas), FLR (erupções X, via notificações) e CME-MARS (impacto previsto em Marte).
 * Detalhes e critérios de curadoria: docs/dados.md
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.NASA_API_KEY || 'DEMO_KEY';
const BASE = (process.env.DONKI_BASE_URL || 'https://api.nasa.gov/DONKI').replace(/\/$/, '');
const START_YEAR = Number(process.env.DONKI_START || 2016);
const END = process.env.DONKI_END || new Date().toISOString().slice(0, 10);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FULL = join(ROOT, 'data', 'donki-solar-events.json');
const OUT_GAME = join(ROOT, 'public', 'data', 'donki-flares.json');
const CACHE_DIR = join(ROOT, 'data', 'cache', 'donki');
const REFRESH_DAYS = Number(process.env.DONKI_REFRESH_DAYS || 30);
const FORCE = process.env.DONKI_FORCE === '1';
const stats = { requests: 0, cached: 0, rateLimitRemaining: null };

/** Erupções a partir desta classe entram na lista. O GDD usa M (média) e X (forte). */
const MIN_FLARE_CLASS = 'M1.0';

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

/**
 * Um bloco pode ser reaproveitado se foi baixado quando já estava "assentado":
 * pelo menos REFRESH_DAYS depois do fim do bloco (o DONKI ainda corrige eventos recentes).
 */
function readCache(type, start, end) {
  if (FORCE) return null;
  const file = join(CACHE_DIR, type, `${start}.json`);
  if (!existsSync(file)) return null;
  const c = JSON.parse(readFileSync(file, 'utf8'));
  const settledAt = new Date(`${end}T00:00:00Z`).getTime() + REFRESH_DAYS * DAY_MS;
  if (c.end !== end || new Date(c.fetchedAt).getTime() < settledAt) return null;
  return c.items;
}

function writeCache(type, start, end, items) {
  const dir = join(CACHE_DIR, type);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${start}.json`), JSON.stringify({ start, end, fetchedAt: new Date().toISOString(), items }) + '\n');
}

/**
 * Busca um tipo em blocos de 60 dias, usando o cache. `normalize` reduz a resposta crua ao que
 * a curadoria usa (o cache guarda só isso, para ficar pequeno no git).
 */
async function fetchType(type, normalize, extraParams = {}) {
  const path = type === 'FLR-notifications' ? 'notifications' : type;
  const all = [];
  const ranges = dateRanges();
  let fetched = 0;
  let reused = 0;
  for (const [start, end] of ranges) {
    const cached = readCache(type, start, end);
    if (cached) {
      all.push(...cached);
      reused++;
      stats.cached++;
      continue;
    }
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('startDate', start);
    url.searchParams.set('endDate', end);
    for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
    if (BASE.includes('api.nasa.gov')) url.searchParams.set('api_key', API_KEY);

    const res = await fetch(url);
    stats.requests++;
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining !== null) stats.rateLimitRemaining = Number(remaining);
    if (res.status === 429) {
      throw new Error(
        `Limite de requisições atingido (429) em ${type} ${start}. O que já veio está salvo no cache; rode de novo mais tarde e ele continua dali. ` +
          (API_KEY === 'DEMO_KEY' ? 'Use sua própria chave: NASA_API_KEY no .env (https://api.nasa.gov/).' : ''),
      );
    }
    if (!res.ok) throw new Error(`${type} ${start}..${end}: HTTP ${res.status} ${await res.text()}`);

    const text = await res.text();
    const data = text.trim() ? JSON.parse(text) : [];
    const items = normalize(Array.isArray(data) ? data : []);
    writeCache(type, start, end, items);
    all.push(...items);
    fetched++;
  }
  console.log(`  ${type}: ${all.length} itens | ${fetched} blocos baixados, ${reused} do cache`);
  return all;
}

// ---------- normalização (o que fica no cache) ----------

const normalizeSEP = (raw) =>
  raw.map((s) => ({
    sepID: s.sepID,
    eventTime: s.eventTime,
    instruments: (s.instruments || []).map((i) => ({ displayName: i.displayName })),
    linkedEvents: (s.linkedEvents || []).map((e) => ({ activityID: e.activityID })),
    link: s.link,
  }));

/** Junta erupções vindas de blocos diferentes: mesma atividade fica com a maior intensidade. */
function dedupeFlares(flares) {
  const byId = new Map();
  for (const f of flares) {
    const prev = byId.get(f.flrID);
    if (!prev || flareFlux(f.classType) > flareFlux(prev.classType)) byId.set(f.flrID, f);
  }
  return [...byId.values()];
}

/** Junta CMEs de blocos diferentes: fica a simulação mais recente. */
function dedupeMarsCMEs(events) {
  const byId = new Map();
  for (const e of events) {
    const prev = byId.get(e.id);
    if (!prev || e.modelCompletionTime > prev.modelCompletionTime) byId.set(e.id, e);
  }
  return [...byId.values()];
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
  const seps = await fetchType('SEP', normalizeSEP);
  const flares = dedupeFlares(await fetchType('FLR-notifications', flaresFromNotifications, { type: 'FLR' }));
  console.log(`  FLR: ${flares.length} erupções extraídas das notificações`);
  const marsCMEs = dedupeMarsCMEs(await fetchType('WSAEnlilSimulations', curateMarsCMEs));
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

  mkdirSync(dirname(OUT_FULL), { recursive: true });
  writeFileSync(OUT_FULL, JSON.stringify(out, null, 2) + '\n');

  // Versão do jogo: só o que a simulação usa, sem espaços (o arquivo é baixado pelo jogador).
  const game = {
    source: 'NASA DONKI',
    sourceUrl: out.sourceUrl,
    fetchedAt: out.fetchedAt,
    flares: events
      .filter((e) => e.type === 'FLR')
      .map((e) => ({ id: e.id, time: e.time, cls: e.classType, link: e.link })),
  };
  mkdirSync(dirname(OUT_GAME), { recursive: true });
  writeFileSync(OUT_GAME, JSON.stringify(game) + '\n');

  console.log('\nGerado data/donki-solar-events.json', out.counts);
  console.log(`Gerado public/data/donki-flares.json (${game.flares.length} erupções M/X)`);
  console.log(
    `\nRequisições à API: ${stats.requests} | blocos do cache: ${stats.cached}` +
      (stats.rateLimitRemaining !== null ? ` | limite restante nesta hora: ${stats.rateLimitRemaining}` : ''),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`\nErro: ${err.message}`);
    process.exit(1);
  });
}
