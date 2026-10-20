// Plays the bot on every level × difficulty × strategy and prints how far it gets. Run with `yarn sim`;
// narrow it with SIM_LEVELS, SIM_DIFFS, SIM_STRATEGIES (comma lists) and SIM_SEEDS (a count).
import { it } from "vitest";
import { BALANCE } from "../src/game/balance";
import { patched } from "./patch";
import type { DiffKey } from "../src/game/types";
import { play, STRATEGIES, type Outcome } from "./bot";

const list = (name: string, all: string[]) => (process.env[name] ? process.env[name]!.split(",") : all);
const levels = list("SIM_LEVELS", Object.keys(BALANCE.levels));
const diffs = list("SIM_DIFFS", Object.keys(BALANCE.difficulty)) as DiffKey[];
const strategies = list("SIM_STRATEGIES", ["patient", "rush", "greedy"]);
const seeds = +(process.env.SIM_SEEDS ?? 3);

it("matrix", { timeout: 6 * 3600 * 1000 }, () => {
  const balance = patched();
  const rows: string[] = [];
  const header = ["level", "diff", "strategy", "waves (per seed)", "of", "won", "minutes", "lives", "early", "walk"];
  for (const level of levels)
    for (const diff of diffs)
      for (const name of strategies) {
        const out: Outcome[] = [];
        for (let seed = 1; seed <= seeds; seed++)
          out.push(play({ balance, level, diff, strategy: STRATEGIES[name], seed }));
        const avg = (f: (o: Outcome) => number) => out.reduce((a, o) => a + f(o), 0) / out.length;
        rows.push(
          [
            level,
            diff,
            name,
            out.map((o) => o.wave).join("/"),
            BALANCE.levels[level].finalWave,
            out.filter((o) => o.won).length + "/" + out.length,
            avg((o) => o.minutes).toFixed(1),
            avg((o) => o.lives).toFixed(1),
            avg((o) => o.earlyShare).toFixed(2),
            avg((o) => o.walk).toFixed(0),
          ].join("\t"),
        );
        process.stdout.write(rows[rows.length - 1] + "\n");
      }
  process.stdout.write("\n" + header.join("\t") + "\n" + rows.join("\n") + "\n");
});
