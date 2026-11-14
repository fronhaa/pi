/**
 * Busca de caminho pequena para a tripulação contornar os prédios da base.
 * Grafo de visibilidade: nós nos cantos das caixas de obstáculo (alargadas pelo raio do astronauta);
 * dois nós se ligam se o segmento entre eles não atravessa nenhuma caixa. Dijkstra no grafo.
 * Poucos obstáculos (6), então é instantâneo. Plano XZ, sem Three.js.
 */
export interface Point {
  x: number;
  z: number;
}

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Caixas no plano a partir dos obstáculos da base, alargadas por `margin`. */
export function boxesFrom(obstacles: { center: { x: number; z: number }; half: { x: number; z: number } }[], margin: number): Box[] {
  return obstacles.map((o) => ({
    minX: o.center.x - o.half.x - margin,
    maxX: o.center.x + o.half.x + margin,
    minZ: o.center.z - o.half.z - margin,
    maxZ: o.center.z + o.half.z + margin,
  }));
}

function inside(p: Point, b: Box): boolean {
  return p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;
}

/** O segmento a→b atravessa o interior da caixa? (teste de "slabs") */
function segmentHitsBox(a: Point, b: Point, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [p, d, min, max] of [
    [a.x, dx, box.minX, box.maxX],
    [a.z, dz, box.minZ, box.maxZ],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (p <= min || p >= max) return false;
    } else {
      let ta = (min - p) / d;
      let tb = (max - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 >= t1) return false;
    }
  }
  // Toca só de raspão (na borda) não conta como atravessar.
  return t1 - t0 > 1e-6;
}

/** Dá para ir de a até b em linha reta sem atravessar nenhuma caixa? */
export function isClear(a: Point, b: Point, boxes: Box[]): boolean {
  return clear(a, b, boxes);
}

function clear(a: Point, b: Point, boxes: Box[]): boolean {
  return boxes.every((box) => !segmentHitsBox(a, b, box));
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Caminho de `from` até `to` desviando das caixas. Retorna os pontos a seguir (sem o ponto de partida,
 * terminando em `to`). Se não houver caminho, retorna só `[to]` (tenta em linha reta).
 */
export function findPath(from: Point, to: Point, boxes: Box[]): Point[] {
  // Caixas que contêm a partida ou o destino são ignoradas (senão nunca haveria caminho).
  const active = boxes.filter((b) => !inside(from, b) && !inside(to, b));
  if (clear(from, to, active)) return [to];

  // Folga além da caixa alargada: o astronauta passa pelo canto sem raspar.
  const pad = 0.25;
  const corners: Point[] = [];
  for (const b of active) {
    for (const p of [
      { x: b.minX - pad, z: b.minZ - pad },
      { x: b.maxX + pad, z: b.minZ - pad },
      { x: b.minX - pad, z: b.maxZ + pad },
      { x: b.maxX + pad, z: b.maxZ + pad },
    ]) {
      if (!active.some((o) => inside(p, o))) corners.push(p);
    }
  }
  const nodes = [from, to, ...corners];
  const n = nodes.length;
  const best = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  best[0] = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u === -1 || best[i] < best[u])) u = i;
    if (u === -1 || best[u] === Infinity) break;
    if (u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const d = best[u] + dist(nodes[u], nodes[v]);
      if (d < best[v] && clear(nodes[u], nodes[v], active)) {
        best[v] = d;
        prev[v] = u;
      }
    }
  }
  if (prev[1] === -1) return [to];
  const path: Point[] = [];
  for (let v = 1; v !== 0; v = prev[v]) path.unshift(nodes[v]);
  return path;
}
