/**
 * Caminho no chão (plano XZ) desviando das caixas de obstáculo da base.
 * Grafo de visibilidade: os nós são os cantos das caixas (alargadas pelo raio do astronauta),
 * e dois nós se ligam quando a reta entre eles não atravessa nenhuma caixa. Dijkstra acha o mais curto.
 * Puro (sem Three.js nem Rapier): poucas caixas, roda em microssegundos.
 */
export interface Point {
  x: number;
  z: number;
}

export interface Box {
  center: Point;
  half: Point;
}

/** Folga extra dos cantos, para o nó não encostar na caixa usada no teste de colisão. */
const CORNER_MARGIN = 0.15;

export function findPath(from: Point, to: Point, boxes: Box[], radius: number): Point[] {
  const solid = boxes.map((b) => inflate(b, radius + 0.05));
  // Caixa que já contém a origem ou o destino é ignorada (astronauta encostado numa parede).
  const active = solid.filter((b) => !inside(from, b) && !inside(to, b));
  if (clear(from, to, active)) return [to];

  const corners = boxes
    .map((b) => inflate(b, radius + 0.05 + CORNER_MARGIN))
    .flatMap((b) => [
      { x: b.minX, z: b.minZ },
      { x: b.minX, z: b.maxZ },
      { x: b.maxX, z: b.minZ },
      { x: b.maxX, z: b.maxZ },
    ])
    .filter((p) => !active.some((b) => inside(p, b)));

  const nodes = [from, ...corners, to];
  const goal = nodes.length - 1;
  const dist = nodes.map(() => Infinity);
  const prev = nodes.map(() => -1);
  const done = nodes.map(() => false);
  dist[0] = 0;

  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) return [to]; // sem caminho: tenta a reta (a física para no obstáculo)
    if (u === goal) break;
    done[u] = true;
    for (let v = 0; v < nodes.length; v++) {
      if (done[v] || v === u) continue;
      const d = dist[u] + Math.hypot(nodes[v].x - nodes[u].x, nodes[v].z - nodes[u].z);
      if (d < dist[v] && clear(nodes[u], nodes[v], active)) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }

  const path: Point[] = [];
  for (let i = goal; i > 0; i = prev[i]) path.unshift(nodes[i]);
  return path;
}

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function inflate(b: Box, r: number): Rect {
  return { minX: b.center.x - b.half.x - r, maxX: b.center.x + b.half.x + r, minZ: b.center.z - b.half.z - r, maxZ: b.center.z + b.half.z + r };
}

function inside(p: Point, b: Rect): boolean {
  return p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;
}

/** A reta a→b não atravessa nenhuma caixa (método das placas, em 2D). */
function clear(a: Point, b: Point, boxes: Rect[]): boolean {
  return boxes.every((box) => !segmentHits(a, b, box));
}

function segmentHits(a: Point, b: Point, box: Rect): boolean {
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
  return true;
}
