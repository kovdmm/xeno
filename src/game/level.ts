// Levels: which board is played. A level is data (balance.levels); this module turns an entry into the
// shape the simulation reads, and answers questions about it.
import type { Balance, Level, Rect, RouteKey, Vec } from "./types";

/** The ids of the levels, in the order of the balance data (the first is the default). */
export const levelIds = (B: Balance): string[] => Object.keys(B.levels);

/** The cells of a list of blocks. */
export function cellsOf(rects: Rect[]): Vec[] {
  const out: Vec[] = [];
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]);
  return out;
}

export function makeLevel(B: Balance, id: string): Level {
  const d = B.levels[id];
  if (!d) throw new Error(`unknown level "${id}"`);
  return {
    id,
    width: d.map.width,
    height: d.map.height,
    finalWave: d.finalWave,
    routes: d.map.routes,
    walls: cellsOf(d.map.walls ?? []),
  };
}

/** The route names of a level, in data order. */
export const routeKeys = (L: Level): RouteKey[] => Object.keys(L.routes);

/** The step enemies take when they leave through the exit. */
export const exitDir = (L: Level, r: RouteKey): Vec => L.routes[r].exitDir ?? L.routes[r].dir;

const wallCache = new WeakMap<Level, Set<number>>();
/** The wall cells as indices (y * width + x). */
export function wallSet(L: Level): Set<number> {
  let s = wallCache.get(L);
  if (!s) {
    s = new Set(L.walls.map(([x, y]) => y * L.width + x));
    wallCache.set(L, s);
  }
  return s;
}

const reservedCache = new WeakMap<Level, Set<number>>();
/** Cells where nothing may be built: the gates, and the walls. */
export function reservedCells(L: Level): Set<number> {
  let s = reservedCache.get(L);
  if (!s) {
    s = new Set(wallSet(L));
    for (const r of Object.values(L.routes)) for (const [x, y] of [...r.spawn, ...r.exit]) s.add(y * L.width + x);
    reservedCache.set(L, s);
  }
  return s;
}
