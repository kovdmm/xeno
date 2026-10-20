// Records a seeded game as a Run (run.ts): wraps the game's commands and counts the ticks. A game that was not
// seeded, was stepped in anything but whole ticks, or was cheated in cannot be replayed, and has no run.
import { TICK } from "./constants";
import type { GameApi } from "./game";
import { SIM_BUILD, type Run } from "./run";

export function createRecorder(game: GameApi) {
  let run: Run | null = null;
  let ticks = 0;
  /** the game is not replayable (a cheat, or a step that was not a whole tick) */
  let broken = false;
  const log = (...a: [string, ...unknown[]]) => run && run.actions.push([ticks, ...a] as never);

  return {
    newGame(difficulty?: string, level?: string, seed?: number) {
      const S = game.newGame(difficulty, level, seed);
      ticks = 0;
      broken = false;
      run =
        seed === undefined
          ? null
          : { v: 1, build: SIM_BUILD, level: game.level.id, diff: game.difficulty(), seed, ticks: 0, actions: [] };
      return S;
    },
    step(dt: number) {
      if (run && !game.S.over) {
        if (dt === TICK) ticks++;
        else broken = true;
      }
      game.step(dt);
      if (run) run.ticks = ticks;
    },
    place: ((type, x, y) => {
      const r = game.place(type, x, y);
      if (r.ok) log("p", type, x, y);
      return r;
    }) as GameApi["place"],
    upgrade: ((t, ult) => {
      const r = game.upgrade(t, ult);
      if (r.ok && t) ult === undefined ? log("u", t.id) : log("u", t.id, ult);
      return r;
    }) as GameApi["upgrade"],
    sell: ((t) => {
      // only a sale that really happens is a command: a stale tower (sold already, or of a game before) is nothing
      const onBoard = !!t && !game.S.over && game.S.towers.includes(t);
      const v = game.sell(t);
      if (onBoard) log("s", t.id);
      return v;
    }) as GameApi["sell"],
    sendWave: ((early) => {
      if (!game.S.over) log("w", early ? 1 : 0);
      game.sendWave(early);
    }) as GameApi["sendWave"],
    cast: ((k, pt) => {
      const r = game.cast(k, pt);
      if (r.ok) pt ? log("c", k, pt[0], pt[1]) : log("c", k);
      return r;
    }) as GameApi["cast"],
    cheat: ((code) => {
      const r = game.cheat(code);
      if (r) broken = true;
      return r;
    }) as GameApi["cheat"],
    /** The finished run, or null while the game goes on or when it cannot be replayed. */
    run(): Run | null {
      return run && !broken && game.S.over ? run : null;
    },
  };
}

export type Recorder = ReturnType<typeof createRecorder>;
