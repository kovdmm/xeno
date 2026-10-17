import { W } from "../constants";
import type { Route, RouteKey } from "../types";

export const ROUTES: Record<RouteKey, Route> = {
  h: {
    spawn: [
      [0, 6],
      [0, 7],
      [0, 8],
    ],
    exit: [
      [21, 6],
      [21, 7],
      [21, 8],
    ],
    dir: [1, 0],
  },
  v: {
    spawn: [
      [10, 0],
      [11, 0],
      [12, 0],
    ],
    exit: [
      [10, 14],
      [11, 14],
      [12, 14],
    ],
    dir: [0, 1],
  },
};

/** cells (y * W + x) where nothing may be built: gates and spawns of both routes */
export const RESERVED = new Set<number>();
for (const r of Object.values(ROUTES)) for (const [x, y] of [...r.spawn, ...r.exit]) RESERVED.add(y * W + x);
