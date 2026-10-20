// A recorded run and its replay. A game is a function of its seed and the player's commands (see dmath.ts, rng.ts
// and the fixed TICK), so a run is just: the level, the difficulty, the seed, how many ticks it lasted and the
// commands with the tick they were given at. The server replays it and takes the result from its own game; what
// the player claims is never trusted.
import { TICK } from "./constants";
import { createGame } from "./game";
import type { Balance, State } from "./types";

/** a fingerprint of the simulation code and data the run was played on (scripts/simBuild.ts) */
export const SIM_BUILD: string = typeof __SIM_BUILD__ === "undefined" ? "dev" : __SIM_BUILD__;

/** the most a run may have: 90 minutes of game time, and a generous number of commands */
export const RUN_LIMITS = { ticks: 90 * 60 * 60, actions: 20000 } as const;

const RUN_KEYS = ["v", "build", "level", "diff", "seed", "ticks", "actions"];

/** [tick, op, ...args]; the tick is the number of ticks stepped before the command was given */
export type Action =
  | [tick: number, op: "p", type: string, x: number, y: number] // place a tower
  | [tick: number, op: "u", tower: number, ult?: string] // upgrade (ult: the pick at level 4)
  | [tick: number, op: "s", tower: number] // sell
  | [tick: number, op: "w", early: 0 | 1] // call the next wave
  | [tick: number, op: "c", ability: string, x?: number, y?: number]; // cast an ability

export interface Run {
  v: 1;
  /** SIM_BUILD of the game that recorded it */
  build: string;
  level: string;
  diff: string;
  /** the seed of the game's random stream */
  seed: number;
  /** the ticks stepped in the whole game */
  ticks: number;
  actions: Action[];
}

/** what a finished game came to */
export interface Outcome {
  won: boolean;
  /** the last wave called (what the end screen says) */
  wave: number;
  /** the waves that were really dealt with: all of 1..cleared are fully killed or through. This ranks, not `wave`:
   *  calling waves early stacks them and must not buy a place */
  cleared: number;
  score: number;
  lives: number;
  /** game time in seconds */
  seconds: number;
}

export type ReplayError =
  | "format" // not a run at all
  | "limits" // too long or too many commands
  | "level"
  | "diff"
  | "action" // a command that cannot be given at that moment: the run does not match the game
  | "unfinished" // the game was not over at the recorded end
  | "build" // recorded on another simulation than this one
  | "cheated"
  | "slow"; // the replay took longer than allowed

export type ReplayResult = { ok: true; outcome: Outcome } | { ok: false; error: ReplayError; detail?: string };

/** the most CPU time a replay may take when the caller does not say (ms): there is no replay without a deadline */
export const DEFAULT_DEADLINE_MS = 15000;
/** the clock is read every this many ticks */
const DEADLINE_EVERY = 16;

/** How a game came to its end. */
export function outcomeOf(S: State): Outcome {
  let cleared = 0;
  while (S.left[cleared + 1] === 0) cleared++;
  return { won: S.won, wave: S.wave, cleared, score: S.score, lives: S.lives, seconds: S.t };
}

const fail = (error: ReplayError, detail?: string): ReplayResult => ({ ok: false, error, detail });
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isCoord = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1000;

/** Checks the shape of a run that came from outside; returns what is wrong with it, or null. */
export function checkRun(run: unknown, B: Balance): ReplayResult | null {
  if (typeof run !== "object" || run === null) return fail("format", "not an object");
  const r = run as Record<string, unknown>;
  if (r.v !== 1 || typeof r.build !== "string") return fail("format", "version");
  // exactly these seven fields: a run with a note tucked in is another text for the same game
  const keys = Object.keys(r);
  if (keys.length !== RUN_KEYS.length || !RUN_KEYS.every((k) => keys.includes(k))) return fail("format", "fields");
  if (typeof r.level !== "string" || !Object.hasOwn(B.levels, r.level)) return fail("level");
  if (typeof r.diff !== "string" || !Object.hasOwn(B.difficulty, r.diff)) return fail("diff");
  if (!isInt(r.seed, 0, 0xffffffff)) return fail("format", "seed");
  if (!isInt(r.ticks, 0, RUN_LIMITS.ticks)) return fail("limits", "ticks");
  if (!Array.isArray(r.actions)) return fail("format", "actions");
  if (r.actions.length > RUN_LIMITS.actions) return fail("limits", "actions");
  let last = 0;
  for (const a of r.actions as unknown[]) {
    if (!Array.isArray(a) || !isInt(a[0], 0, r.ticks as number) || a[0] < last) return fail("format", "action tick");
    last = a[0];
    const ok =
      a[1] === "p"
        ? a.length === 5 &&
          typeof a[2] === "string" &&
          Object.hasOwn(B.towers, a[2]) &&
          isInt(a[3], -1000, 1000) &&
          isInt(a[4], -1000, 1000)
        : a[1] === "u"
          ? (a.length === 3 || (a.length === 4 && typeof a[3] === "string" && a[3].length <= 32)) && isInt(a[2], 0, 1e9)
          : a[1] === "s"
            ? a.length === 3 && isInt(a[2], 0, 1e9)
            : a[1] === "w"
              ? a.length === 3 && (a[2] === 0 || a[2] === 1)
              : a[1] === "c"
                ? typeof a[2] === "string" &&
                  Object.hasOwn(B.abilities, a[2]) &&
                  // every ability but stasis is aimed
                  ((a.length === 3 && a[2] === "stasis") || (a.length === 5 && isCoord(a[3]) && isCoord(a[4])))
                : false;
    if (!ok) return fail("format", "action " + String(a[1]));
  }
  return null;
}

/**
 * Plays the run again from its seed and returns how the game ended. A run that does not match the game is an error,
 * not a result: a command that fails, a game that is not over at the recorded end, a recorded end that is later than
 * the game's, commands left over. So a game has exactly one encoding. `deadlineMs` (DEFAULT_DEADLINE_MS if not given)
 * bounds the CPU time, `build` is the simulation the run must have been recorded on (SIM_BUILD).
 */
export function replay(
  run: unknown,
  opts: { balance?: Balance; deadlineMs?: number; build?: string; now?: () => number } = {},
): ReplayResult {
  const game = createGame({ balance: opts.balance });
  const B = game.balance;
  const bad = checkRun(run, B);
  if (bad) return bad;
  const r = run as Run;
  if (r.build !== (opts.build ?? SIM_BUILD)) return fail("build");
  const deadline = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const now = opts.now ?? (() => performance.now());
  const t0 = now();

  try {
    game.newGame(r.diff, r.level, r.seed);
    let next = 0;
    let tick = 0;
    for (; ; tick++) {
      while (next < r.actions.length && r.actions[next][0] === tick) {
        // the recorder never logs a command of a finished game: it would be a second way to write the same game
        if (game.S.over) return fail("format", "a command after the game ended");
        const err = apply(game, r.actions[next++]);
        if (err) return fail("action", `tick ${tick}: ${err}`);
      }
      if (tick >= r.ticks || game.S.over) break;
      game.step(TICK);
      if (tick % DEADLINE_EVERY === 0 && now() - t0 > deadline) return fail("slow");
    }
    const S = game.S;
    if (S.cheated) return fail("cheated");
    if (!S.over) return fail("unfinished");
    if (tick !== r.ticks) return fail("format", "the run goes on after the game ended");
    if (next !== r.actions.length) return fail("format", "commands left over");
    return { ok: true, outcome: outcomeOf(S) };
  } catch (e) {
    // a hostile run must not take the server down
    return fail("action", "exception: " + (e instanceof Error ? e.message : String(e)));
  }
}

/** Gives one recorded command; returns what went wrong, or null. */
function apply(game: ReturnType<typeof createGame>, a: Action): string | null {
  switch (a[1]) {
    case "p": {
      const res = game.place(a[2] as never, a[3], a[4]);
      return res.ok ? null : "place " + res.code;
    }
    case "u": {
      const t = game.S.towers.find((x) => x.id === a[2]);
      if (!t) return "upgrade: no tower " + a[2];
      // an ultimate is one of the tower's own two (a name like "constructor" is not)
      if (a[3] !== undefined && !Object.hasOwn(game.balance.towers[t.type].ults, a[3]))
        return "upgrade: no such ultimate";
      const res = game.upgrade(t, a[3]);
      return res.ok ? null : "upgrade " + res.code;
    }
    case "s": {
      const t = game.S.towers.find((x) => x.id === a[2]);
      if (!t) return "sell: no tower " + a[2];
      game.sell(t);
      return null;
    }
    case "w":
      game.sendWave(a[2] === 1);
      return null;
    case "c": {
      const res = game.cast(a[2] as never, a.length === 5 ? [a[3] as number, a[4] as number] : undefined);
      return res.ok ? null : "cast " + res.code;
    }
  }
}
