// A simple player for balance measurements: it builds and upgrades turrets along the enemy paths and, if the
// strategy says so, calls waves early. It does not build mazes (it never blocks or lengthens a path on purpose),
// so what it reaches is a floor for what a thoughtful human reaches, not an average.
import { createGame, type GameApi } from "../src/game/game";
import { mulberry32 } from "../src/game/rng";
import type { Balance, DiffKey, Tower, TowerType } from "../src/game/types";
import { mapKey, type Baked } from "./maze";
import mazes from "./mazes.json";

/** What a sensible player builds first: guns hit both ground and air, missiles only fly-by targets. */
const OPENING: TowerType[] = ["gun", "gun", "gun", "gun", "cannon", "gun", "frost", "gun", "missile"];

export interface Strategy {
  name: string;
  /** the turrets it builds, in turn */
  towers: TowerType[];
  /** call the next wave early once at most this many enemies are on the board; negative = never call early */
  callAt: number;
  /** the first turrets it builds; defaults to a general opening */
  opening?: TowerType[];
  /** put every upgrade into the most upgraded turret instead of the least upgraded one */
  focus?: boolean;
  /** build along the baked longest maze of the level (sim/mazes.json) instead of the greedy placement */
  maze?: boolean;
  /** every n-th turret that can shoot flyers goes on the flyers' straight lane instead of along the maze (default 3) */
  airEvery?: number;
  /** waves per extra turret: a new one is built while there are fewer than 5 + wave / this (default 3); larger = fewer turrets, more upgrades */
  wavesPerTower?: number;
  /** the intended way to play: once there are this many guns, one of them is pumped to level 5 before anything else is
   *  bought (the money is saved for it), then one more for every `starStep` further guns */
  starAfter?: number;
  starStep?: number;
}

const BASIC: TowerType[] = ["gun", "cannon", "frost", "missile"];
const FULL: TowerType[] = ["gun", "cannon", "frost", "missile", "plasma", "laser", "rail", "artillery"];

export const STRATEGIES: Record<string, Strategy> = {
  // waits for the timer: what a new player does
  patient: { name: "patient", towers: BASIC, callAt: -1 },
  // calls the next wave when at most 4 enemies are on the board (those still to spawn do not count)
  rush: { name: "rush", towers: BASIC, callAt: 4 },
  // calls it while up to 12 are still alive
  greedy: { name: "greedy", towers: BASIC, callAt: 12 },
  "rush-full": { name: "rush-full", towers: FULL, callAt: 4 },
  "greedy-full": { name: "greedy-full", towers: FULL, callAt: 12 },
  // compositions (all call early like "rush"): which turrets carry a game, and does focusing upgrades pay
  "gun-spread": { name: "gun-spread", towers: ["gun"], opening: [], callAt: 4 },
  "gun-air2": { name: "gun-air2", towers: ["gun"], opening: [], callAt: 4, airEvery: 2 },
  "gun-air5": { name: "gun-air5", towers: ["gun"], opening: [], callAt: 4, airEvery: 5 },
  "gun-missile": { name: "gun-missile", towers: ["gun", "gun", "gun", "missile"], opening: [], callAt: 4 },
  "gun-many": { name: "gun-many", towers: ["gun"], opening: [], callAt: 4, wavesPerTower: 1.5 },
  "gun-few": { name: "gun-few", towers: ["gun"], opening: [], callAt: 4, wavesPerTower: 6 },
  "gun-fewer": { name: "gun-fewer", towers: ["gun"], opening: [], callAt: 4, wavesPerTower: 12 },
  // the intended play: a pumped gun after the first few
  "star-gun": { name: "star-gun", towers: ["gun"], opening: [], callAt: 4, starAfter: 6 },
  "star-gun10": { name: "star-gun10", towers: ["gun"], opening: [], callAt: 4, starAfter: 10 },
  "star-maze": {
    name: "star-maze",
    towers: ["gun"],
    opening: [],
    callAt: 4,
    starAfter: 6,
    maze: true,
    wavesPerTower: 3,
  },
  "star-maze-dense": {
    name: "star-maze-dense",
    towers: ["gun"],
    opening: [],
    callAt: 4,
    starAfter: 6,
    maze: true,
    wavesPerTower: 1.5,
  },
  "star-maze10": {
    name: "star-maze10",
    towers: ["gun"],
    opening: [],
    callAt: 4,
    starAfter: 10,
    maze: true,
    wavesPerTower: 1.5,
  },
  "star-maze14": {
    name: "star-maze14",
    towers: ["gun"],
    opening: [],
    callAt: 4,
    starAfter: 14,
    maze: true,
    wavesPerTower: 1.5,
  },
  "star-gun14": { name: "star-gun14", towers: ["gun"], opening: [], callAt: 4, starAfter: 14 },
  "gun-focus": { name: "gun-focus", towers: ["gun"], opening: [], callAt: 4, focus: true },
  "gun-frost": { name: "gun-frost", towers: ["gun", "gun", "frost"], opening: [], callAt: 4, focus: true },
  "gun-cannon": { name: "gun-cannon", towers: ["gun", "gun", "cannon"], opening: [], callAt: 4, focus: true },
  "gun-rail": { name: "gun-rail", towers: ["gun", "gun", "rail"], opening: [], callAt: 4, focus: true },
  "gun-laser": { name: "gun-laser", towers: ["gun", "gun", "laser"], opening: [], callAt: 4, focus: true },
  "gun-plasma": { name: "gun-plasma", towers: ["gun", "gun", "plasma"], opening: [], callAt: 4, focus: true },
  "gun-artillery": {
    name: "gun-artillery",
    towers: ["gun", "gun", "gun", "artillery"],
    opening: [],
    callAt: 4,
    focus: true,
  },
  "no-gun": { name: "no-gun", towers: ["cannon", "rail", "plasma", "laser"], opening: [], callAt: 4, focus: true },
  "mix-focus": { name: "mix-focus", towers: BASIC, callAt: 4, focus: true },
  // the same compositions on the longest maze
  "maze-gun": { name: "maze-gun", towers: ["gun"], opening: [], callAt: 4, maze: true },
  "maze-gun-cannon": { name: "maze-gun-cannon", towers: ["gun", "gun", "cannon"], opening: [], callAt: 4, maze: true },
  "maze-gun-rail": { name: "maze-gun-rail", towers: ["gun", "gun", "rail"], opening: [], callAt: 4, maze: true },
  "maze-gun-frost": { name: "maze-gun-frost", towers: ["gun", "gun", "frost"], opening: [], callAt: 4, maze: true },
  "maze-mix": { name: "maze-mix", towers: BASIC, callAt: 4, maze: true },
  "maze-patient": { name: "maze-patient", towers: ["gun"], opening: [], callAt: -1, maze: true },
};

export interface Outcome {
  level: string;
  diff: DiffKey;
  strategy: string;
  seed: number;
  /** the last wave called */
  wave: number;
  won: boolean;
  lives: number;
  /** game time in minutes */
  minutes: number;
  towers: number;
  /** the summed walk of the enemies at the end of the game (cells, over all routes) */
  walk: number;
  /** waves called early / all waves */
  earlyShare: number;
}

// moved to the game (the server replays runs with it); the simulator keeps importing it from here
export { mulberry32 };

/** a player does not call waves back to back: at least this many seconds between two early calls */
const MIN_CALL_GAP = 6;

const DT = 0.05,
  THINK = 0.25,
  /** a game that lasts longer than this (game minutes) is stopped */
  MAX_MINUTES = 240;

/** The summed walking distance from every route's middle entrance to its exit, with the given extra blocked cells. */
function walkLength(game: GameApi, blocked: Set<number>): number {
  const { width: W, height: H, routes, walls } = game.level;
  const solid = new Uint8Array(W * H);
  for (const [x, y] of walls) solid[y * W + x] = 1;
  game.S.grid.forEach((c, i) => c && (solid[i] = 1));
  for (const i of blocked) solid[i] = 1;
  let total = 0;
  for (const R of Object.values(routes)) {
    const d = new Int32Array(W * H).fill(-1),
      q: number[] = [];
    for (const [x, y] of R.exit) ((d[y * W + x] = 0), q.push(y * W + x));
    for (let h = 0; h < q.length; h++) {
      const i = q[h],
        x = i % W,
        y = (i / W) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (d[j] >= 0 || solid[j]) continue;
        d[j] = d[i] + 1;
        q.push(j);
      }
    }
    const m = R.spawn[(R.spawn.length / 2) | 0];
    total += Math.max(0, d[m[1] * W + m[0]]);
  }
  return total;
}

/** Cells to build on, best first: the ones that lengthen the enemies' walk the most (a maze) and still reach it. */
function ranked(game: GameApi, reach: number, air = false): [number, number][] {
  const { width: W, height: H } = game.level;
  const path: [number, number][] = [];
  if (air) {
    // flyers cross in a straight line from the entrance to the exit, whatever the maze looks like
    for (const R of Object.values(game.level.routes)) {
      const mid = (c: [number, number][]) => c[(c.length / 2) | 0];
      const [sx, sy] = mid(R.spawn),
        [ex, ey] = mid(R.exit),
        n = Math.ceil(Math.hypot(ex - sx, ey - sy) * 2);
      for (let i = 0; i <= n; i++) path.push([sx + ((ex - sx) * i) / n, sy + ((ey - sy) * i) / n]);
    }
  } else for (const r of Object.keys(game.level.routes)) for (const [x, y] of game.routePath(r)) path.push([x, y]);
  const base = air ? 0 : walkLength(game, new Set());
  const out: { x: number; y: number; s: number }[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (game.placeCheck(x, y, 1) !== "") continue;
      let cov = 0;
      for (const [px, py] of path) if (Math.hypot(px - x, py - y) <= reach) cov++;
      if (cov < 3) continue;
      const gain = air ? 0 : walkLength(game, new Set([y * W + x])) - base;
      out.push({ x, y, s: gain * MAZE_WEIGHT + cov * 0.5 });
    }
  out.sort((a, b) => b.s - a.s || a.y - b.y || a.x - b.x);
  return out.map((c) => [c.x, c.y]);
}

/** how much a cell's lengthening of the walk (in cells) counts against its coverage of the path */
const MAZE_WEIGHT = 3;

/** A cell of the baked maze that a turret can build on now: of those that fit and reach the roads the enemies walk
 *  now, the one that reaches the most road (so that every route gets defended), the earlier in the build order the better. */
function mazeSpot(
  game: GameApi,
  order: [number, number][],
  reach: number,
  fits: (c: [number, number]) => boolean,
): [number, number] | undefined {
  const path: [number, number][] = [];
  for (const r of Object.keys(game.level.routes)) for (const c of game.routePath(r)) path.push(c);
  let best: [number, number] | undefined,
    bestScore = -Infinity;
  order.forEach((c, rank) => {
    if (!fits(c)) return;
    const cover = path.filter(([px, py]) => Math.hypot(px - c[0], py - c[1]) <= reach).length;
    if (cover < 3) return;
    const score = cover - rank * 0.05;
    if (score > bestScore) ((best = c), (bestScore = score));
  });
  return best;
}

export function play(opts: {
  balance: Balance;
  level: string;
  diff: DiffKey;
  strategy: Strategy;
  seed: number;
  /** called at the start of every wave with a line about the state */
  trace?: (line: string) => void;
}): Outcome {
  const { balance, level, diff, strategy, seed, trace } = opts;
  const game = createGame({ balance, rng: mulberry32(seed), difficulty: diff, level });
  const S = () => game.S;
  let built = 0,
    early = 0,
    sinceThink = THINK;

  const upgradeTarget = (): Tower | undefined => {
    let best: Tower | undefined,
      bestKey = Infinity;
    for (const t of S().towers) {
      const key = (t.lvl + t.oc * 0.5) * (strategy.focus ? -1 : 1);
      if (key < bestKey) ((best = t), (bestKey = key));
    }
    return best;
  };

  /** the price of the next turret it would build */
  const nextCost = () => {
    const opening = strategy.opening ?? OPENING;
    const type = built < opening.length ? opening[built] : strategy.towers[built % strategy.towers.length];
    return game.balance.towers[type].cost[0];
  };

  // the baked maze of this level, unless the map has changed since it was made
  const baked = (mazes as unknown as Record<string, Baked>)[level];
  const maze = strategy.maze && baked && baked.key === mapKey(balance, level) ? baked : undefined;
  if (strategy.maze && !maze) throw new Error(`no up-to-date baked maze for "${level}": run yarn sim sim/bake.sim.ts`);

  function spend() {
    for (let guard = 0; guard < 20; guard++) {
      const wantTowers = maze
        ? 6 + Math.floor(S().wave / (strategy.wavesPerTower ?? 1.1))
        : Math.min(45, 5 + Math.floor(S().wave / (strategy.wavesPerTower ?? 3)));
      const guns = S().towers.filter((x) => x.type === "gun");
      if (strategy.starAfter && guns.length >= strategy.starAfter) {
        const want = 1 + Math.floor((guns.length - strategy.starAfter) / (strategy.starStep ?? 10));
        if (guns.filter((x) => x.lvl >= 4).length < want) {
          const star = guns.filter((x) => x.lvl < 4).sort((a, b) => b.lvl - a.lvl)[0];
          if (star) {
            if (S().credits < game.upCost(star)) return; // save up for it
            game.upgrade(star, Object.keys(game.balance.towers.gun.ults)[0]);
            continue;
          }
        }
      }
      if (S().towers.length < wantTowers) {
        const opening = strategy.opening ?? OPENING;
        const type = built < opening.length ? opening[built] : strategy.towers[built % strategy.towers.length];
        const d = game.balance.towers[type];
        if (S().credits < d.cost[0]) return;
        const size = d.size || 1;
        const air =
          type === "missile" || (!!d.air && built % (strategy.airEvery ?? 3) === (strategy.airEvery ?? 3) - 1);
        const fits = ([x, y]: [number, number]) => game.placeCheck(x, y, size) === "";
        const spot =
          (maze && size === 1 && !air ? mazeSpot(game, maze.order, d.range[0] + 0.5, fits) : undefined) ??
          ranked(game, d.range[0] + 0.5, air).find(fits);
        if (!spot) {
          built++; // nowhere for this type: try the next one
          if (built > 200) return;
          continue;
        }
        if (game.place(type, spot[0], spot[1]).ok) built++;
        continue;
      }
      const t = upgradeTarget();
      if (!t) return;
      const c = game.upCost(t);
      if (S().credits < c) return;
      const ults = Object.keys(game.balance.towers[t.type].ults);
      if (!game.upgrade(t, ults[0]).ok) return;
    }
  }

  let seen = 0,
    lastCall = -Infinity;
  const pending = () => S().spawners.reduce((a, s) => a + s.list.length, 0);
  while (!S().over && S().t < MAX_MINUTES * 60) {
    sinceThink += DT;
    if (sinceThink >= THINK) {
      sinceThink = 0;
      spend();
      const s = S();
      const ready =
        s.wave === 0
          ? s.towers.length >= 4 || s.credits < nextCost()
          : strategy.callAt >= 0 &&
            s.creeps.length <= strategy.callAt &&
            pending() <= 3 &&
            s.t - lastCall >= MIN_CALL_GAP &&
            s.wave < game.level.finalWave &&
            s.timer > 0;
      if (ready) {
        game.sendWave(true);
        early++;
        lastCall = s.t;
      }
    }
    game.step(DT);
    const s = S();
    if (s.wave > seen) {
      seen = s.wave;
      trace?.(
        `w${s.wave} t=${(s.t / 60).toFixed(1)}m credits=${s.credits} lives=${s.lives} towers=${s.towers.map((x) => x.type[0] + x.lvl).join(" ")}`,
      );
    }
  }
  return {
    level,
    diff,
    strategy: strategy.name,
    seed,
    wave: S().wave,
    won: S().won,
    lives: S().lives,
    minutes: Math.round(S().t / 6) / 10,
    towers: S().towers.length,
    walk: walkLength(game, new Set()),
    earlyShare: S().wave ? Math.round((early / S().wave) * 100) / 100 : 0,
  };
}
