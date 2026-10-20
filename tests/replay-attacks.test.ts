// Runs made by hand to get past the replay: each of them must be refused, or must not buy anything.
import { describe, it, expect } from "vitest";
import { TICK } from "../src/game/constants";
import { createGame } from "../src/game/game";
import { createRecorder } from "../src/game/recorder";
import { replay, SIM_BUILD, type Run } from "../src/game/run";
import { recordedGame } from "../src/game/selfCheck";

const good = (): Run => JSON.parse(JSON.stringify(recordedGame().run));

describe("a run that tries to get past the replay", () => {
  it("the honest run is accepted (the control for everything below)", () => {
    expect(replay(good()).ok).toBe(true);
  });

  it("cannot take long: a replay always has a deadline, also when the caller gives none", () => {
    let t = 0;
    const slowClock = () => (t += 1e6); // every look at the clock is a million ms later
    expect(replay(good(), { now: slowClock })).toMatchObject({ ok: false, error: "slow" });
    t = 0;
    expect(replay(good(), { now: slowClock, deadlineMs: 1e12 }).ok).toBe(true); // an explicit, huge deadline is the caller's choice
  });

  it("must be recorded on this simulation", () => {
    const run = good();
    run.build = "an-older-build";
    expect(replay(run)).toMatchObject({ ok: false, error: "build" });
    expect(replay(run, { build: "an-older-build" }).ok).toBe(true); // the check is against what the caller says is current
  });

  it("has one encoding: a note tucked into the run is refused", () => {
    const run = { ...good(), note: "same game, other text" };
    expect(replay(run)).toMatchObject({ ok: false, error: "format" });
    const missing: Record<string, unknown> = { ...good() };
    delete missing.seed;
    expect(replay(missing)).toMatchObject({ ok: false, error: "format" });
  });

  it("has one encoding: a recorded end later than the game's is refused", () => {
    const run = good();
    run.ticks += 1;
    expect(replay(run)).toMatchObject({ ok: false, error: "format" });
  });

  it("has one encoding: a command after the game ended is refused, even a harmless one", () => {
    const run = good();
    run.actions.push([run.ticks, "w", 1]);
    expect(replay(run)).toMatchObject({ ok: false, error: "format" });
  });

  it("cannot pick an ultimate that does not exist, by a name every object has", () => {
    const game = createGame();
    game.newGame("easy", "crossroads", 5);
    let site: [number, number] | null = null;
    for (let y = 0; y < game.level.height && !site; y++)
      for (let x = 0; x < game.level.width && !site; x++) if (game.placeCheck(x, y) === "") site = [x, y];
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      const run: Run = {
        v: 1,
        build: SIM_BUILD,
        level: "crossroads",
        diff: "easy",
        seed: 5,
        ticks: 10,
        actions: [
          [0, "p", "gun", site![0], site![1]],
          [0, "u", 1, name],
        ],
      };
      expect(replay(run), name).toMatchObject({ ok: false, error: "action" });
    }
  });

  it("the log holds one sale per tower (not the same tower twice, not a tower of the game before), and nothing after the end", () => {
    const game = createGame();
    const rec = createRecorder(game);
    rec.newGame("hard", "crossroads", 7);
    const old = rec.place("gun", 5, 5);
    if (!old.ok) throw new Error("place failed");
    rec.newGame("hard", "crossroads", 8);
    rec.sell(old.tower); // a tower of the game before: nothing to log
    const r = rec.place("gun", 5, 5);
    if (!r.ok) throw new Error("place failed");
    rec.sell(r.tower);
    rec.sell(r.tower); // the same tower again
    while (!game.S.over) {
      rec.sendWave(true);
      for (let i = 0; i < 60 && !game.S.over; i++) rec.step(TICK);
    }
    rec.sell(r.tower);
    rec.sendWave(true);
    const run = rec.run()!;
    expect(run.actions.filter((a) => a[1] === "s")).toHaveLength(1);
    expect(run.actions.every((a) => a[0] < run.ticks)).toBe(true);
    expect(replay(run).ok).toBe(true);
  });
});

describe("what ranks is the wave dealt with, not the wave called", () => {
  it("calling waves at once calls many and clears few", () => {
    const game = createGame();
    const rec = createRecorder(game);
    rec.newGame("hard", "crossroads", 4);
    while (!game.S.over) {
      rec.sendWave(true);
      for (let i = 0; i < 30 && !game.S.over; i++) rec.step(TICK);
    }
    const r = replay(rec.run());
    if (!r.ok) throw new Error("replay failed");
    expect(r.outcome.wave).toBeGreaterThan(r.outcome.cleared + 2); // the stacked waves
    expect(r.outcome.cleared).toBeGreaterThanOrEqual(0);
  });

  it("cleared counts only the unbroken run of dealt-with waves from the first", () => {
    // a game where wave 1 is cleared and wave 2 is not: cleared is 1, however far the called waves go
    const { run, ended } = recordedGame();
    expect(ended.cleared).toBeLessThan(ended.wave);
    expect(ended.cleared).toBeGreaterThanOrEqual(1);
    const r = replay(run);
    expect(r.ok && r.outcome.cleared).toBe(ended.cleared);
  });
});
