// A running game: state, event bus, commands and the tick. No DOM, canvas, sound or UI text in here.
import { abCost, cast as castAbility, stepAbilities } from "./abilities";
import { H, W } from "./constants";
import { AKEYS } from "./data/abilities";
import { DIFF } from "./data/difficulty";
import { TT } from "./data/towers";
import { buildOrigin, footprint, placeCheck, recompute, routePath, towerAt } from "./grid";
import { moveCreep } from "./movement";
import { updateProjectile } from "./projectiles";
import { statsOf, unitHP, upCost } from "./rules";
import { updateTower } from "./towers";
import { makeWave, sendWave, stepSpawners } from "./waves";
import type {
  AbilityKey,
  CastResult,
  DiffKey,
  Game,
  GameEvent,
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
  /** source of randomness for the simulation; tests pass a seeded one */
  rng?: Rng;
  difficulty?: DiffKey;
}

export interface GameApi {
  /** the current state; replaced by a new object on every `newGame` */
  readonly S: State;
  on(fn: (e: GameEvent) => void): () => void;
  newGame(difficulty?: string): State;
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
  abCost(k: AbilityKey): number;
  makeWave(n: number): Wave;
  placeCheck(x: number, y: number, sz?: number): ReturnType<typeof placeCheck>;
  buildOrigin(type: TowerType, pt: Vec): Vec;
  towerAt(x: number, y: number): Tower | null;
  routePath(r: RouteKey): Vec[];
  unitHP(n: number): number;
  difficulty(): DiffKey;
}

function initialState(g: Game): State {
  const D = g.D();
  const S: State = {
    diff: g.diff,
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
    fields: { h: new Int32Array(0), v: new Int32Array(0) },
    cd: { stasis: 0, meteor: 0, napalm: 0, carpet: 0, nuke: 0 },
    meteors: [],
    zones: [],
    bombers: [],
    nukes: [],
    stasisT: 0,
  };
  for (const k of AKEYS) S.cd[k] = 0;
  return S;
}

export function createGame(opts: GameOptions = {}): GameApi {
  const listeners: ((e: GameEvent) => void)[] = [];
  let nextId = 1;
  const g: Game = {
    S: undefined as unknown as State,
    diff: opts.difficulty && DIFF[opts.difficulty] ? opts.difficulty : "easy",
    rand: opts.rng ?? Math.random,
    emit: (e) => {
      for (const fn of listeners) fn(e);
    },
    newId: () => nextId++,
    D: () => DIFF[g.diff],
  };

  function newGame(difficulty?: string): State {
    if (difficulty && Object.hasOwn(DIFF, difficulty)) g.diff = difficulty as DiffKey;
    g.S = initialState(g);
    recompute(g);
    g.emit({ type: "reset" });
    return g.S;
  }

  function place(type: TowerType, x: number, y: number): PlaceResult {
    const S = g.S,
      d = TT[type],
      z = d.size || 1;
    if (S.over) return { ok: false, code: "over" };
    if (S.credits < d.cost[0]) return { ok: false, code: "noCred" };
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
      inv: d.cost[0],
      beam: null,
    };
    for (const [cx, cy] of footprint(x, y, z)) S.grid[cy * W + cx] = t;
    S.towers.push(t);
    S.credits -= d.cost[0];
    recompute(g);
    g.emit({ type: "built", tower: t });
    return { ok: true, tower: t };
  }

  function upgrade(t: Tower | null, u?: string): UpgradeResult {
    const S = g.S;
    if (!t || S.over) return { ok: false, code: "over" };
    if (t.lvl === 3 && !TT[t.type].ults[u as string]) return { ok: false, code: "pickUlt" };
    const c = upCost(t);
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
    const v = Math.floor(t.inv * 0.7);
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
    if (code === "hesoyam") {
      const S = g.S;
      S.lives = Math.max(S.lives, 100);
      S.credits += 250000;
      S.cheated = true;
      g.emit({ type: "cheat", code });
      return { lives: S.lives, credits: 250000 };
    }
    return null;
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
    stats: statsOf,
    abCost: (k) => abCost(g, k),
    makeWave: (n) => makeWave(g, n),
    placeCheck: (x, y, sz) => placeCheck(g, x, y, sz),
    buildOrigin,
    towerAt: (x, y) => towerAt(g, x, y),
    routePath: (r) => routePath(g, r),
    unitHP: (n) => unitHP(g.D(), n),
    difficulty: () => g.diff,
  };
}
