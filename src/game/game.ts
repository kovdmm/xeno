// A running game: state, event bus, commands and the tick. No DOM, canvas, sound or UI text in here.
import { abCost, cast as castAbility, stepAbilities } from "./abilities";
import { BALANCE } from "./balance";
import { buildOrigin, footprint, placeCheck, recompute, routePath, towerAt } from "./grid";
import { levelIds, makeLevel } from "./level";
import { moveCreep } from "./movement";
import { updateProjectile } from "./projectiles";
import { statsOf, towerStats, unitHP, upCost } from "./rules";
import { updateTower } from "./towers";
import { makeWave, sendWave, stepSpawners } from "./waves";
import type {
  AbilityKey,
  Balance,
  CastResult,
  DiffKey,
  Game,
  GameEvent,
  Level,
  PlaceResult,
  Rng,
  RouteKey,
  State,
  Tower,
  TowerStats,
  TowerType,
  UpgradeResult,
  Vec,
  Wave,
} from "./types";

export interface GameOptions {
  /** all numbers of the game; defaults to data/balance.yaml */
  balance?: Balance;
  /** source of randomness for the simulation; tests pass a seeded one */
  rng?: Rng;
  difficulty?: DiffKey;
  /** the level to start on; the first of the balance data by default */
  level?: string;
}

export interface GameApi {
  readonly balance: Balance;
  /** the current state; replaced by a new object on every `newGame` */
  readonly S: State;
  on(fn: (e: GameEvent) => void): () => void;
  newGame(difficulty?: string, level?: string): State;
  step(dt: number): void;
  // commands
  place(type: TowerType, x: number, y: number): PlaceResult;
  upgrade(t: Tower | null, ult?: string): UpgradeResult;
  sell(t: Tower | null): number;
  sendWave(early?: boolean): void;
  cast(k: AbilityKey, pt?: Vec): CastResult;
  cheat(code: string): { lives: number; credits: number } | null;
  // queries (read-only)
  stats(t: Tower): TowerStats;
  /** stats of a hypothetical tower: type, level, ultimate, overclock */
  towerStats(type: TowerType, lvl: number, ult?: string, oc?: number): TowerStats;
  upCost(t: Pick<Tower, "type" | "lvl" | "oc">): number;
  abCost(k: AbilityKey): number;
  makeWave(n: number): Wave;
  placeCheck(x: number, y: number, sz?: number): ReturnType<typeof placeCheck>;
  buildOrigin(type: TowerType, pt: Vec): Vec;
  towerAt(x: number, y: number): Tower | null;
  routePath(r: RouteKey): Vec[];
  unitHP(n: number): number;
  difficulty(): DiffKey;
  /** the level being played, and the ids of all of them */
  readonly level: Level;
  readonly levelIds: string[];
}

/** Cheats that switch something on for the rest of the game (the numeric ones live in `economy.cheats`). */
export const FLAG_CHEATS: Record<string, (S: State) => void> = {
  bagowpw: () => {}, // all maps open: the interface remembers it (the game itself has nothing locked)
  aspirine: (S) => (S.immortal = true),
  lxgiwyl: (S) => (S.freeTowers = true),
  crazytown: (S) => (S.grumble = true),
};

function initialState(g: Game): State {
  const D = g.D(),
    { width: W, height: H } = g.L;
  const S: State = {
    diff: g.diff,
    level: g.L.id,
    credits: D.credits,
    lives: D.lives,
    wave: 0,
    score: 0,
    started: false,
    over: false,
    won: false,
    t: 0,
    grid: new Array(W * H).fill(null),
    towers: [],
    creeps: [],
    proj: [],
    spawners: [],
    left: {},
    timer: 0,
    fields: {},
    cd: { stasis: 0, meteor: 0, napalm: 0, carpet: 0, nuke: 0 },
    meteors: [],
    zones: [],
    bombers: [],
    nukes: [],
    stasisT: 0,
  };
  for (const k of Object.keys(g.B.abilities) as AbilityKey[]) S.cd[k] = 0;
  return S;
}

export function createGame(opts: GameOptions = {}): GameApi {
  const listeners: ((e: GameEvent) => void)[] = [];
  let nextId = 1;
  const B = opts.balance ?? BALANCE;
  const g: Game = {
    S: undefined as unknown as State,
    L: makeLevel(B, opts.level && Object.hasOwn(B.levels, opts.level) ? opts.level : levelIds(B)[0]),
    B,
    diff: opts.difficulty && Object.hasOwn(B.difficulty, opts.difficulty) ? opts.difficulty : "easy",
    rand: opts.rng ?? Math.random,
    emit: (e) => {
      for (const fn of listeners) fn(e);
    },
    newId: () => nextId++,
    D: () => B.difficulty[g.diff],
  };

  function newGame(difficulty?: string, level?: string): State {
    if (difficulty && Object.hasOwn(B.difficulty, difficulty)) g.diff = difficulty as DiffKey;
    if (level && Object.hasOwn(B.levels, level) && level !== g.L.id) g.L = makeLevel(B, level);
    g.S = initialState(g);
    recompute(g);
    g.emit({ type: "reset" });
    return g.S;
  }

  function place(type: TowerType, x: number, y: number): PlaceResult {
    const S = g.S,
      d = B.towers[type],
      W = g.L.width,
      z = d.size || 1;
    if (S.over) return { ok: false, code: "over" };
    const price = S.freeTowers ? 0 : d.cost[0];
    if (S.credits < price) return { ok: false, code: "noCred" };
    const why = placeCheck(g, x, y, z);
    if (why) return { ok: false, code: why };
    const t: Tower = {
      id: g.newId(),
      type,
      lvl: 0,
      oc: 0,
      gx: x,
      gy: y,
      size: z,
      x: x + (z - 1) / 2,
      y: y + (z - 1) / 2,
      cd: 0,
      ang: -Math.PI / 2,
      inv: price,
      beam: null,
    };
    for (const [cx, cy] of footprint(x, y, z)) S.grid[cy * W + cx] = t;
    S.towers.push(t);
    S.credits -= price;
    recompute(g);
    g.emit({ type: "built", tower: t });
    return { ok: true, tower: t };
  }

  function upgrade(t: Tower | null, u?: string): UpgradeResult {
    const S = g.S;
    if (!t || S.over) return { ok: false, code: "over" };
    if (t.lvl === 3 && !B.towers[t.type].ults[u as string]) return { ok: false, code: "pickUlt" };
    const c = S.freeTowers ? 0 : upCost(B, t);
    if (S.credits < c) return { ok: false, code: "noCred" };
    S.credits -= c;
    t.inv += c;
    if (t.lvl >= 4) {
      t.oc++;
      g.emit({ type: "upgraded", tower: t });
      return { ok: true, overclock: t.oc };
    }
    t.lvl++;
    if (t.lvl === 4) t.ult = u;
    g.emit({ type: "upgraded", tower: t });
    return { ok: true, ult: t.lvl === 4 ? (u as string) : null };
  }

  function sell(t: Tower | null): number {
    if (!t) return 0;
    const S = g.S;
    const v = Math.floor(t.inv * B.economy.sellRefund);
    S.credits += v;
    for (let i = 0; i < S.grid.length; i++) if (S.grid[i] === t) S.grid[i] = null;
    S.towers = S.towers.filter((x) => x !== t);
    recompute(g);
    g.emit({ type: "sold", tower: t });
    return v;
  }

  // Returns the applied effect or null for an unknown code. A cheated game is flagged (no records).
  function cheat(code: string): { lives: number; credits: number } | null {
    code = String(code || "")
      .trim()
      .toLowerCase();
    const S = g.S;
    if (Object.hasOwn(FLAG_CHEATS, code)) {
      FLAG_CHEATS[code](S);
      S.cheated = true;
      g.emit({ type: "cheat", code });
      return { lives: S.lives, credits: 0 };
    }
    const ch = Object.hasOwn(B.economy.cheats, code) ? B.economy.cheats[code] : null;
    if (!ch) return null;
    S.lives = Math.max(S.lives, ch.minLives);
    S.credits += ch.credits;
    S.cheated = true;
    g.emit({ type: "cheat", code });
    return { lives: S.lives, credits: ch.credits };
  }

  /** Advances the simulation by dt seconds (the UI calls it in steps of at most 25 ms). */
  function step(dt: number): void {
    const S = g.S;
    S.t += dt;
    if (S.started && !S.over) stepSpawners(g, dt);
    for (const c of S.creeps) if (!c.dead) moveCreep(g, c, dt);
    if (S.over) return;
    stepAbilities(g, dt);
    for (const t of S.towers) updateTower(g, t, dt);
    for (const p of S.proj) updateProjectile(g, p, dt);
    S.proj = S.proj.filter((p) => !p.dead);
    S.creeps = S.creeps.filter((c) => !c.dead);
  }

  newGame();

  return {
    balance: B,
    get S() {
      return g.S;
    },
    on(fn) {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    newGame,
    step,
    place,
    upgrade,
    sell,
    sendWave: (early) => sendWave(g, early),
    cast: (k, pt) => castAbility(g, k, pt),
    cheat,
    stats: (t) => statsOf(B, t),
    towerStats: (type, lvl, ult, oc) => towerStats(B, type, lvl, ult, oc),
    upCost: (t) => upCost(B, t),
    abCost: (k) => abCost(g, k),
    makeWave: (n) => makeWave(g, n),
    placeCheck: (x, y, sz) => placeCheck(g, x, y, sz),
    buildOrigin: (type, pt) => buildOrigin(B, type, pt),
    towerAt: (x, y) => towerAt(g, x, y),
    routePath: (r) => routePath(g, r),
    unitHP: (n) => unitHP(B, g.D(), n),
    difficulty: () => g.diff,
    get level() {
      return g.L;
    },
    levelIds: levelIds(B),
  };
}
