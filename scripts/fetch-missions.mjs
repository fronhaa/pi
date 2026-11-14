#!/usr/bin/env node
// Gera public/data/missions.json com as missões históricas do GDD
// (docs/game-design.md, seção "Calendário da missão: janelas históricas reais").
// Busca no DONKI as CMEs e os eventos SEP de cada janela e, no JPL Horizons,
// o atraso real das mensagens entre Terra e Marte em cada sol.
// Uso: npm run data:missions   (lê VITE_NASA_API_KEY do .env; sem ela, usa DEMO_KEY)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Carrega o .env da raiz, se existir (Node 20.12+). Variáveis já definidas no ambiente têm prioridade.
try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
} catch {
  // Sem .env: segue com DEMO_KEY.
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'missions.json');
const API_KEY = process.env.VITE_NASA_API_KEY || process.env.NASA_API_KEY || 'DEMO_KEY';

// Duração de um sol: 24 h 39 min 35,244 s (https://science.nasa.gov/mars/facts/).
const SOL_SECONDS = 88775.244;
const SOL_MS = SOL_SECONDS * 1000;
const MISSION_SOLS = 15;
const AU_KM = 149597870.7;
const LIGHT_KM_S = 299792.458;

// Tipo de velocidade da CME no DONKI → força da tempestade no jogo.
const STRENGTH_BY_TYPE = { S: 'weak', C: 'weak', O: 'medium', R: 'strong', ER: 'strong' };
const STORM_SOL_MIN = 4;
const STORM_SOL_MAX = 14;
const STORM_MIN_GAP = 2;

// Janelas escolhidas pela regra do GDD. As CMEs ficam fixas por ID para o arquivo
// não mudar de uma geração para outra; o script só confere e completa os dados.
const MISSIONS = [
  { id: 1, start: '2023-02-27', difficulty: 'medium', storms: ['2023-03-04T07:36:00-CME-001', '2023-03-07T21:36:00-CME-001', '2023-03-13T03:36:00-CME-001'] },
  { id: 2, start: '2023-07-25', difficulty: 'medium', storms: ['2023-07-28T15:53:00-CME-001', '2023-08-01T12:36:00-CME-001', '2023-08-05T07:12:00-CME-001'] },
  { id: 3, start: '2024-01-31', difficulty: 'hard', storms: ['2024-02-09T13:23:00-CME-001', '2024-02-12T06:36:00-CME-001', '2024-02-14T04:09:00-CME-001'] },
  { id: 4, start: '2024-05-06', difficulty: 'hard', storms: ['2024-05-09T09:24:00-CME-001', '2024-05-14T17:00:00-CME-001', '2024-05-20T05:36:00-CME-001'] },
  { id: 5, start: '2025-03-15', difficulty: 'hard', storms: ['2025-03-19T01:25:00-CME-001', '2025-03-21T16:00:00-CME-001', '2025-03-28T15:24:00-CME-001'] },
  { id: 6, start: '2025-10-18', difficulty: 'medium', storms: ['2025-10-21T20:24:00-CME-001', '2025-10-23T18:00:00-CME-001', '2025-10-26T20:36:00-CME-001'] },
];

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const parseUtc = (s) => Date.parse(s.endsWith('Z') ? s : `${s}Z`);
const solOf = (startMs, eventMs) => Math.floor((eventMs - startMs) / SOL_MS) + 1;

async function getJson(url, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === 3) throw new Error(`${label}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

function donki(type, startMs, endMs) {
  const url = `https://api.nasa.gov/DONKI/${type}?startDate=${isoDate(startMs)}&endDate=${isoDate(endMs)}&api_key=${API_KEY}`;
  // O DONKI devolve [] (ou corpo vazio) quando não houve eventos.
  return getJson(url, `DONKI ${type}`).then((d) => (Array.isArray(d) ? d : []));
}

// Distância Terra-Marte a cada 6 h. O Horizons responde texto dentro do JSON.
async function earthMarsDistances(startMs, endMs) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: "'499'",
    CENTER: "'500@399'",
    MAKE_EPHEM: "'YES'",
    OBJ_DATA: "'NO'",
    EPHEM_TYPE: "'OBSERVER'",
    START_TIME: `'${new Date(startMs).toISOString().slice(0, 16).replace('T', ' ')}'`,
    STOP_TIME: `'${new Date(endMs).toISOString().slice(0, 16).replace('T', ' ')}'`,
    STEP_SIZE: "'6h'",
    QUANTITIES: "'20'",
  });
  const data = await getJson(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`, 'Horizons');
  const text = data?.result ?? '';
  const a = text.indexOf('$$SOE');
  const b = text.indexOf('$$EOE');
  if (a < 0 || b < 0) throw new Error('Horizons: tabela $$SOE/$$EOE não encontrada');
  return text
    .slice(a + 5, b)
    .trim()
    .split('\n')
    .map((line) => {
      // Ex.: " 2024-May-06 00:00     2.034...  -1.23..."
      const [day, time, delta] = line.trim().split(/\s+/);
      return { ms: Date.parse(`${day} ${time} UTC`), au: Number(delta) };
    })
    .filter((r) => Number.isFinite(r.ms) && Number.isFinite(r.au));
}

const delayMinutes = (au) => Math.round(((au * AU_KM) / LIGHT_KM_S / 60) * 10) / 10;

function nearest(rows, ms) {
  return rows.reduce((best, r) => (Math.abs(r.ms - ms) < Math.abs(best.ms - ms) ? r : best));
}

async function buildMission(m) {
  const startMs = Date.parse(`${m.start}T00:00:00Z`);
  const endMs = startMs + MISSION_SOLS * SOL_MS;

  const [cmes, seps, distances] = await Promise.all([
    donki('CME', startMs, endMs),
    donki('SEP', startMs, endMs),
    earthMarsDistances(startMs, endMs),
  ]);
  if (distances.length === 0) throw new Error(`Missão ${m.id}: Horizons sem dados`);

  const storms = m.storms.map((activityId) => {
    const cme = cmes.find((c) => c?.activityID === activityId);
    if (!cme) throw new Error(`Missão ${m.id}: CME ${activityId} não encontrada no DONKI`);
    const analyses = cme.cmeAnalyses ?? [];
    const analysis = analyses.find((a) => a?.isMostAccurate) ?? analyses[0];
    const strength = STRENGTH_BY_TYPE[analysis?.type];
    if (!strength) throw new Error(`Missão ${m.id}: CME ${activityId} sem tipo de velocidade válido`);
    const eventMs = parseUtc(cme.startTime);
    return {
      sol: solOf(startMs, eventMs),
      activityId,
      startTime: new Date(eventMs).toISOString(),
      cmeType: analysis.type,
      speedKmS: analysis.speed ?? null,
      strength,
      link: cme.link ?? null,
    };
  });

  storms.sort((a, b) => a.sol - b.sol);
  storms.forEach((s, i) => {
    if (s.sol < STORM_SOL_MIN || s.sol > STORM_SOL_MAX) {
      throw new Error(`Missão ${m.id}: tempestade no sol ${s.sol}, fora de ${STORM_SOL_MIN}–${STORM_SOL_MAX}`);
    }
    if (i > 0 && s.sol - storms[i - 1].sol < STORM_MIN_GAP) {
      throw new Error(`Missão ${m.id}: tempestades nos sóis ${storms[i - 1].sol} e ${s.sol}, menos de ${STORM_MIN_GAP} sóis de distância`);
    }
  });

  const sols = Array.from({ length: MISSION_SOLS }, (_, i) => {
    const solStartMs = startMs + i * SOL_MS;
    return {
      sol: i + 1,
      startUtc: new Date(solStartMs).toISOString(),
      earthDelayMinutes: delayMinutes(nearest(distances, solStartMs).au),
    };
  });

  const sepEvents = seps
    .filter((e) => e?.eventTime)
    .map((e) => {
      const eventMs = parseUtc(e.eventTime);
      return { sol: solOf(startMs, eventMs), sepId: e.sepID ?? null, eventTime: new Date(eventMs).toISOString(), link: e.link ?? null };
    })
    .filter((e) => e.sol >= 1 && e.sol <= MISSION_SOLS);

  const delays = sols.map((s) => s.earthDelayMinutes);
  return {
    id: m.id,
    difficulty: m.difficulty,
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
    earthDelayMinutes: { min: Math.min(...delays), max: Math.max(...delays) },
    storms,
    sols,
    sepEvents,
  };
}

const missions = [];
for (const m of MISSIONS) {
  missions.push(await buildMission(m));
  const last = missions.at(-1);
  console.log(
    `Missão ${last.id}: ${last.storms.map((s) => `sol ${s.sol} ${s.cmeType}`).join(', ')}; ` +
      `atraso ${last.earthDelayMinutes.min}–${last.earthDelayMinutes.max} min; ${last.sepEvents.length} SEP`,
  );
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  solSeconds: SOL_SECONDS,
  sources: [
    { name: 'NASA DONKI (CME, SEP)', url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/' },
    { name: 'NASA JPL Horizons', url: 'https://ssd.jpl.nasa.gov/horizons/' },
  ],
  missions,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Gerado: ${OUT}`);
