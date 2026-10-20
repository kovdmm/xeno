// The longest maze: where to put turrets (as walls) so that the enemies' walk is as long as possible. Money is
// ignored, only the roads count: the objective is the walking distance from the entrances to the exits, summed over
// all routes of the level. Adding a wall never shortens a walk, so any build order of a finished layout is safe as long
// as every entrance still reaches its exit; `order` below is the order to build in (the walk grows as early as it can).
import { mulberry32 } from "./bot";
import { reservedCells } from "../src/game/level";
import type { Balance, Level } from "../src/game/types";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export interface Maze {
  /** the summed walk with no towers, and with the whole layout */
  base: number;
  length: number;
  /** the cells to build on, in the order to build them */
  order: [number, number][];
}

/** Summed mean walk of every route (entrance cells to exit cells) with `solid` cells blocked; -1 if some entrance is shut in. */
export function walk(L: Level, solid: Uint8Array, dist: Int32Array, queue: Int32Array): number {
  const { width: W, height: H } = L;
  let total = 0;
  for (const R of Object.values(L.routes)) {
    dist.fill(-1);
    let tail = 0;
    for (const [x, y] of R.exit) {
      dist[y * W + x] = 0;
      queue[tail++] = y * W + x;
    }
    for (let head = 0; head < tail; head++) {
      const i = queue[head],
        x = i % W,
        y = (i / W) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (dist[j] >= 0 || solid[j]) continue;
        dist[j] = dist[i] + 1;
        queue[tail++] = j;
      }
    }
    let sum = 0;
    for (const [x, y] of R.spawn) {
      const d = dist[y * W + x];
      if (d < 0) return -1;
      sum += d;
    }
    total += sum / R.spawn.length;
  }
  return total;
}

export function optimize(L: Level, opts: { iterations: number; seed?: number; wallPenalty?: number }): Maze {
  const { width: W, height: H } = L;
  const rnd = mulberry32(opts.seed ?? 1);
  const lambda = opts.wallPenalty ?? 0.02;
  const fixed = new Uint8Array(W * H);
  for (const i of reservedCells(L)) fixed[i] = 1;
  const free: number[] = [];
  for (let i = 0; i < W * H; i++) if (!fixed[i]) free.push(i);

  // the walk treats only the level's walls as solid: the gates can be walked through, just not built on
  const walls0 = new Uint8Array(W * H);
  for (const [x, y] of L.walls) walls0[y * W + x] = 1;
  const solid = Uint8Array.from(walls0),
    dist = new Int32Array(W * H),
    queue = new Int32Array(W * H);
  const base = walk(L, solid, dist, queue);
  let walls = 0,
    cur = base,
    best = base,
    bestWalls = 0,
    bestSet = Uint8Array.from(solid);

  for (let it = 0; it < opts.iterations; it++) {
    const T = 3 * Math.pow(0.02 / 3, it / opts.iterations); // the temperature falls from 3 to 0.02
    const a = free[(rnd() * free.length) | 0];
    // a move adds a wall, removes one, or (half of the removals) shifts it to a neighbouring cell
    let dw = 0,
      b = -1;
    solid[a] ^= 1;
    dw += solid[a] ? 1 : -1;
    if (!solid[a] && rnd() < 0.5) {
      const [dx, dy] = DIRS[(rnd() * 4) | 0],
        x = (a % W) + dx,
        y = ((a / W) | 0) + dy;
      if (x >= 0 && y >= 0 && x < W && y < H && !solid[y * W + x] && !fixed[y * W + x]) {
        b = y * W + x;
        solid[b] = 1;
        dw++;
      }
    }
    const w = walk(L, solid, dist, queue);
    const was = cur - lambda * walls,
      score = w - lambda * (walls + dw);
    if (w >= 0 && (score >= was || rnd() < Math.exp((score - was) / T))) {
      cur = w;
      walls += dw;
      if (score > best - lambda * bestWalls) {
        best = w;
        bestWalls = walls;
        bestSet = Uint8Array.from(solid);
      }
    } else {
      solid[a] ^= 1;
      if (b >= 0) solid[b] = 0;
    }
  }

  // The build order. Two candidates; the better one (the larger area under the walk-by-towers curve) is kept:
  //  - forward: each step takes the cell that lengthens the walk most (ties: next to something already solid);
  //  - peeled: start from the finished layout and take away, again and again, the cell whose loss shortens the walk
  //    least; built in the reverse order, the most valuable cells come first.
  const cells: number[] = [];
  for (let i = 0; i < W * H; i++) if (bestSet[i] && !fixed[i]) cells.push(i);
  const toXY = (i: number): [number, number] => [i % W, (i / W) | 0];
  const near = (work: Uint8Array, i: number) => {
    const x = i % W,
      y = (i / W) | 0;
    let n = 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || work[ny * W + nx]) n++;
    }
    return n;
  };
  /** the cells in the order they are built, and the area under the curve of the walk after each */
  const area = (seq: number[]) => {
    const work = Uint8Array.from(walls0);
    let sum = 0;
    for (const i of seq) {
      work[i] = 1;
      sum += walk(L, work, dist, queue);
    }
    return sum;
  };

  const forward: number[] = [];
  {
    const left = new Set(cells),
      work = Uint8Array.from(walls0);
    let now = base;
    while (left.size) {
      let pick = -1,
        pickGain = -Infinity,
        pickNear = -1;
      for (const i of left) {
        work[i] = 1;
        const w = walk(L, work, dist, queue);
        work[i] = 0;
        if (w < 0) continue;
        const g = w - now,
          n = near(work, i);
        if (g > pickGain || (g === pickGain && n > pickNear)) ((pick = i), (pickGain = g), (pickNear = n));
      }
      if (pick < 0) break;
      work[pick] = 1;
      now += pickGain;
      left.delete(pick);
      forward.push(pick);
    }
  }
  const peeled: number[] = [];
  {
    const left = new Set(cells),
      work = Uint8Array.from(walls0);
    for (const i of cells) work[i] = 1;
    let now = best;
    while (left.size) {
      let pick = -1,
        pickLoss = Infinity,
        pickNear = Infinity;
      for (const i of left) {
        work[i] = 0;
        const w = walk(L, work, dist, queue);
        work[i] = 1;
        if (w < 0) continue;
        const loss = now - w,
          n = near(work, i);
        if (loss < pickLoss || (loss === pickLoss && n < pickNear)) ((pick = i), (pickLoss = loss), (pickNear = n));
      }
      if (pick < 0) break;
      work[pick] = 0;
      now -= pickLoss;
      left.delete(pick);
      peeled.push(pick);
    }
    peeled.reverse();
  }
  const seq = peeled.length === cells.length && area(peeled) > area(forward) ? peeled : forward;
  return { base, length: best, order: seq.map(toXY) };
}

/** A baked maze with the fingerprint of the map it was made for. */
export interface Baked extends Maze {
  key: string;
}

/** The part of a level's data that a maze depends on: when it changes, the baked maze is stale. */
export function mapKey(B: Balance, id: string): string {
  return JSON.stringify(B.levels[id].map);
}
