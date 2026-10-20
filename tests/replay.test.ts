import { describe, it, expect } from "vitest";
import { TICK } from "../src/game/constants";
import { createGame, type GameApi } from "../src/game/game";
import { createRecorder } from "../src/game/recorder";
import { outcomeOf, replay, RUN_LIMITS, SIM_BUILD, type Run } from "../src/game/run";
import { loadXT } from "./helpers/load";
import type { Tower } from "../src/game/types";
import { autoPlay } from "./helpers/player";

/** plays a game that ends within a few thousand ticks: it builds for a while, then calls every wave at once */
function recorded(seed = 11, level = "crossroads", diff = "hard", maxTicks = 40000) {
  const game = createGame();
  const rec = createRecorder(game);
  const ticks = autoPlay(game, rec, { seed, level, diff, maxTicks, callAt: -1, collapseAt: 4000 });
  return { game, rec, ticks, run: rec.run() };
}

/** a game by hand that gives every kind of command: place, upgrade, sell, call a wave, cast an ability */
function fullRun(seed = 21) {
  const game = createGame();
  const rec = createRecorder(game);
  rec.newGame("easy", "crossroads", seed);
  const placed: Tower[] = [];
  // guns beside the first enemy route, a few cells apart
  const route = game.routePath(Object.keys(game.level.routes)[0]);
  for (let i = 4; i < route.length && placed.length < 3; i += 5) {
    for (const dy of [1, -1]) {
      const r = rec.place("gun", route[i][0], route[i][1] + dy);
      if (r.ok) {
        placed.push(r.tower);
        break;
      }
    }
  }
  rec.sendWave(true);
  let upgraded = false,
    cast = false,
    sold = false;
  for (let tick = 0; tick < 40000 && !game.S.over; tick++) {
    if (tick % 10 === 0) {
      const S = game.S;
      if (!upgraded && (cast || tick > 2000) && S.credits >= game.upCost(placed[0]))
        upgraded = rec.upgrade(placed[0]).ok;
      if (!cast && S.credits >= game.abCost("stasis")) cast = rec.cast("stasis").ok;
      if (!sold && tick > 600) (rec.sell(placed[2]), (sold = true));
      if (tick > 3000 && tick % 100 === 0) rec.sendWave(true); // the base falls in the end
    }
    rec.step(TICK);
  }
  return { game, rec, run: rec.run() };
}
const ended = (game: GameApi) => outcomeOf(game.S);

describe("a recorded run replays to the same game", () => {
  it("the result of the replay is the result of the game that was played, to the bit", () => {
    const { game, run } = recorded();
    expect(game.S.over).toBe(true);
    expect(run).not.toBeNull();
    const r = replay(run);
    expect(r).toEqual({ ok: true, outcome: ended(game) });
  });

  it("the run is plain data: it survives JSON", () => {
    const { game, run } = recorded(5, "switchback", "hard");
    const r = replay(JSON.parse(JSON.stringify(run)));
    expect(r).toEqual({ ok: true, outcome: ended(game) });
  });

  it("every kind of command is recorded and replayed: place, upgrade, sell, call a wave, cast", () => {
    const { game, run } = fullRun();
    expect(run).not.toBeNull();
    const ops = new Set(run!.actions.map((a) => a[1]));
    for (const op of ["p", "u", "s", "w", "c"]) expect(ops.has(op as never), op).toBe(true);
    expect(run!.build).toBe(SIM_BUILD);
    expect(replay(run)).toEqual({ ok: true, outcome: ended(game) });
  });

  it("a long game with many commands replays too", () => {
    const { game, run } = recorded(3, "switchback", "easy");
    expect(run!.actions.length).toBeGreaterThan(20);
    expect(replay(run)).toEqual({ ok: true, outcome: ended(game) });
  });

  it("different seeds give different games", () => {
    const a = recorded(1, "crossroads", "hard");
    const b = recorded(2, "crossroads", "hard");
    expect(a.run!.seed).not.toBe(b.run!.seed);
    expect(JSON.stringify(ended(a.game))).not.toBe(JSON.stringify(ended(b.game)));
  });
});

describe("a run that does not match the game is refused", () => {
  const base = () => JSON.parse(JSON.stringify(recorded().run)) as Run;

  it("a command moved to another place no longer fits", () => {
    const run = base();
    const good = replay(run);
    expect(good.ok).toBe(true);
    const p = run.actions.find((a) => a[1] === "p")!;
    (p as unknown as number[])[3] += 37;
    // either the command fails (no such cell) or the game ends otherwise: it is never the recorded result
    expect(replay(run)).not.toEqual(good);
  });

  it("a command that is not possible at that moment is an error", () => {
    const run = base();
    run.actions.unshift([0, "u", 999999]); // no such tower
    expect(replay(run)).toMatchObject({ ok: false, error: "action" });
  });

  it("a run cut short is unfinished", () => {
    const run = base();
    run.ticks = Math.floor(run.ticks / 2);
    run.actions = run.actions.filter((a) => a[0] <= run.ticks);
    expect(replay(run)).toMatchObject({ ok: false, error: "unfinished" });
  });

  it("another seed does not reproduce the recorded game", () => {
    const run = base();
    const good = replay(run);
    run.seed = (run.seed + 1) >>> 0;
    const r = replay(run);
    expect(r.ok && good.ok && JSON.stringify(r.outcome) === JSON.stringify(good.outcome)).toBe(false);
  });

  it("shape errors: not a run, unknown level or difficulty, bad seed, too long, too many commands", () => {
    const run = base();
    const mut = (f: (r: Record<string, unknown>) => void) => {
      const r = JSON.parse(JSON.stringify(run));
      f(r);
      return replay(r);
    };
    expect(replay(null)).toMatchObject({ ok: false, error: "format" });
    expect(replay("run")).toMatchObject({ ok: false, error: "format" });
    expect(replay({})).toMatchObject({ ok: false, error: "format" });
    expect(mut((r) => (r.v = 2))).toMatchObject({ error: "format" });
    expect(mut((r) => (r.level = "nowhere"))).toMatchObject({ error: "level" });
    expect(mut((r) => (r.level = "__proto__"))).toMatchObject({ error: "level" });
    expect(mut((r) => (r.diff = "godlike"))).toMatchObject({ error: "diff" });
    expect(mut((r) => (r.seed = -1))).toMatchObject({ error: "format" });
    expect(mut((r) => (r.seed = 1.5))).toMatchObject({ error: "format" });
    expect(mut((r) => (r.seed = 2 ** 32))).toMatchObject({ error: "format" });
    expect(mut((r) => (r.ticks = RUN_LIMITS.ticks + 1))).toMatchObject({ error: "limits" });
    expect(mut((r) => (r.actions = new Array(RUN_LIMITS.actions + 1).fill([0, "w", 1])))).toMatchObject({
      error: "limits",
    });
    expect(mut((r) => (r.actions = "none"))).toMatchObject({ error: "format" });
  });

  it("shape errors in a command: unknown op, wrong arity, bad types, ticks out of order, aimed ability without a point", () => {
    const run = base();
    const withAction = (a: unknown) => replay({ ...run, actions: [a] });
    expect(withAction([0, "x"])).toMatchObject({ error: "format" });
    expect(withAction([0, "p", "gun", 1])).toMatchObject({ error: "format" });
    expect(withAction([0, "p", "dragon", 1, 1])).toMatchObject({ error: "format" });
    expect(withAction([0, "p", "gun", 1.5, 1])).toMatchObject({ error: "format" });
    expect(withAction([0, "p", "__proto__", 1, 1])).toMatchObject({ error: "format" });
    expect(withAction([-1, "w", 1])).toMatchObject({ error: "format" });
    expect(withAction([run.ticks + 1, "w", 1])).toMatchObject({ error: "format" });
    expect(withAction([0, "w", 2])).toMatchObject({ error: "format" });
    expect(withAction([0, "c", "meteor"])).toMatchObject({ error: "format" }); // would crash the game
    expect(withAction([0, "c", "meteor", NaN, 1])).toMatchObject({ error: "format" });
    expect(withAction([0, "c", "meteor", 1e9, 1])).toMatchObject({ error: "format" });
    expect(withAction("p")).toMatchObject({ error: "format" });
    expect(
      replay({
        ...run,
        actions: [
          [5, "w", 1],
          [4, "w", 1],
        ],
      }),
    ).toMatchObject({ error: "format" });
  });

  it("a game with a cheat in it has no run (and the format has no command to cheat with)", () => {
    const game = createGame();
    const rec = createRecorder(game);
    rec.newGame("hard", "crossroads", 4);
    rec.cheat("hesoyam");
    while (!game.S.over) {
      rec.sendWave(true);
      for (let i = 0; i < 60 && !game.S.over; i++) rec.step(TICK);
    }
    expect(rec.run()).toBeNull();
  });
});

describe("what can be recorded", () => {
  it("nothing while the game goes on", () => {
    const game = createGame();
    const rec = createRecorder(game);
    rec.newGame("easy", "crossroads", 1);
    rec.step(TICK);
    expect(rec.run()).toBeNull();
  });

  it("nothing for a game without a seed", () => {
    const game = createGame();
    const rec = createRecorder(game);
    rec.newGame("hard", "crossroads");
    while (!game.S.over) {
      rec.sendWave(true);
      for (let i = 0; i < 60 && !game.S.over; i++) rec.step(TICK);
    }
    expect(rec.run()).toBeNull();
  });

  it("nothing when the game was stepped in anything but whole ticks", () => {
    const game = createGame();
    const rec = createRecorder(game);
    rec.newGame("hard", "crossroads", 2);
    while (!game.S.over) {
      rec.sendWave(true);
      for (let i = 0; i < 60 && !game.S.over; i++) rec.step(i === 5 ? 0.02 : TICK);
    }
    expect(rec.run()).toBeNull();
  });

  it("a new game starts a new recording", () => {
    const game = createGame();
    const rec = createRecorder(game);
    rec.newGame("hard", "crossroads", 1);
    rec.sendWave(true);
    rec.newGame("hard", "crossroads", 2);
    while (!game.S.over) {
      rec.sendWave(true);
      for (let i = 0; i < 60 && !game.S.over; i++) rec.step(TICK);
    }
    const run = rec.run()!;
    expect(run.seed).toBe(2);
    expect(run.actions.filter((a) => a[1] === "w").length).toBeGreaterThan(0);
    expect(replay(run).ok).toBe(true);
  });
});

describe("the app's core records seeded games and leaves the tests' games alone", () => {
  it("a game started with a seed through the core replays", () => {
    const C = loadXT().core;
    C.newGame("hard", "crossroads", 9);
    while (!C.S.over) {
      C.sendWave(true);
      for (let i = 0; i < 60 && !C.S.over; i++) C.step(TICK);
    }
    const run = C.run();
    expect(run).not.toBeNull();
    expect(replay(run)).toEqual({ ok: true, outcome: outcomeOf(C.S) });
  });

  it("a game of a test, with the test's own random stream, has no seed and no run", () => {
    const C = loadXT().core;
    C.newGame("hard", "crossroads");
    while (!C.S.over) {
      C.sendWave(true);
      for (let i = 0; i < 60 && !C.S.over; i++) C.step(TICK);
    }
    expect(C.run()).toBeNull();
  });
});
