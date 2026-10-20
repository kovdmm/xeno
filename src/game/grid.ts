// The board: pathfinding fields, route paths and placement rules.
import { DIRS, INF, mid } from "./constants";
import { exitDir, reservedCells, routeKeys, wallSet } from "./level";
import type { Balance, Game, PlaceCode, RouteKey, Tower, TowerType, Vec } from "./types";

/** Distance to the exit of route `r` for every cell; `blocked` cells are treated as walls. */
export function bfs(g: Game, r: RouteKey, blocked: number[] | null): Int32Array {
  const { width: W, height: H, routes: ROUTES } = g.L,
    walls = wallSet(g.L);
  const d = new Int32Array(W * H).fill(INF),
    q: number[] = [];
  for (const [x, y] of ROUTES[r].exit) {
    const i = y * W + x;
    d[i] = 0;
    q.push(i);
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h],
      x = i % W,
      y = (i / W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (d[j] !== INF || g.S.grid[j] || walls.has(j) || (blocked && blocked.includes(j))) continue;
      d[j] = d[i] + 1;
      q.push(j);
    }
  }
  return d;
}

export function recompute(g: Game): void {
  for (const r of routeKeys(g.L)) g.S.fields[r] = bfs(g, r, null);
}

/** Next cell downhill in field `f`, preferring to keep going straight. */
export function pickNext(g: Game, f: Int32Array, x: number, y: number, ldx: number, ldy: number): Vec | null {
  const { width: W, height: H } = g.L;
  let bx = -1,
    by = -1,
    bd = INF,
    same = false;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx,
      ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const v = f[ny * W + nx];
    if (v >= INF) continue;
    const s = dx === ldx && dy === ldy;
    if (v < bd || (v === bd && s && !same)) {
      bd = v;
      bx = nx;
      by = ny;
      same = s;
    }
  }
  return bx < 0 ? null : [bx, by];
}

/** Cells the creeps of a route currently walk, from the middle entrance to the exit (for drawing). */
export function routePath(g: Game, r: RouteKey): Vec[] {
  const { width: W, height: H, routes: ROUTES } = g.L;
  const f = g.S.fields[r],
    R = ROUTES[r],
    X = exitDir(g.L, r);
  let [x, y] = mid(R.spawn),
    ldx = R.dir[0],
    ldy = R.dir[1],
    guard = 0;
  const p: Vec[] = [
    [x - R.dir[0], y - R.dir[1]],
    [x, y],
  ];
  while (f[y * W + x] > 0 && guard++ < W * H) {
    const n = pickNext(g, f, x, y, ldx, ldy);
    if (!n) break;
    ldx = n[0] - x;
    ldy = n[1] - y;
    x = n[0];
    y = n[1];
    p.push([x, y]);
  }
  p.push([x + X[0], y + X[1]]);
  return p;
}

export function footprint(x: number, y: number, sz: number): Vec[] {
  const a: Vec[] = [];
  for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) a.push([x + dx, y + dy]);
  return a;
}

/* Returns '' when a tower of size sz fits at (x,y); otherwise a reason code:
   out, busy (silent) · pcEdge, pc22, pcWall, pcRes, pcEnemy, pcBlock, pcTrap (shown to the player). */
export function placeCheck(g: Game, x: number, y: number, sz = 1): PlaceCode {
  const { width: W, height: H, routes: ROUTES } = g.L;
  const S = g.S;
  const cells = footprint(x, y, sz);
  for (const [cx, cy] of cells) if (cx < 0 || cy < 0 || cx >= W || cy >= H) return sz > 1 ? "pcEdge" : "out";
  const idx = cells.map(([cx, cy]) => cy * W + cx);
  for (const i of idx) if (S.grid[i]) return sz > 1 ? "pc22" : "busy";
  const walls = wallSet(g.L);
  for (const i of idx) if (walls.has(i)) return "pcWall";
  for (const i of idx) if (reservedCells(g.L).has(i)) return "pcRes";
  for (const c of S.creeps) {
    if (c.fly || c.dead) continue;
    for (const i of idx) {
      if (c.ti === i || (c.ci === i && Math.hypot(c.x - (i % W), c.y - ((i / W) | 0)) < g.B.board.enemyBlockRadius))
        return "pcEnemy";
    }
  }
  const f: Record<RouteKey, Int32Array> = {};
  for (const r of routeKeys(g.L)) {
    f[r] = bfs(g, r, idx);
    for (const [sx, sy] of ROUTES[r].spawn) if (f[r][sy * W + sx] >= INF) return "pcBlock";
  }
  for (const c of S.creeps) {
    if (c.fly || c.dead || c.ti < 0) continue;
    if (f[c.route][c.ti] >= INF) return "pcTrap";
  }
  return "";
}

/** Top-left cell for a tower of this type centred on a point given in cell units. */
export function buildOrigin(B: Balance, type: TowerType, pt: Vec): Vec {
  const z = B.towers[type].size || 1;
  return z === 1 ? [Math.floor(pt[0]), Math.floor(pt[1])] : [Math.round(pt[0] - z / 2), Math.round(pt[1] - z / 2)];
}

export const towerAt = (g: Game, x: number, y: number): Tower | null => {
  const { width: W, height: H } = g.L;
  return x < 0 || y < 0 || x >= W || y >= H ? null : g.S.grid[y * W + x];
};
