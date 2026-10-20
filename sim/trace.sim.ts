// Prints how one bot game goes, wave by wave. Narrow it with SIM_LEVELS, SIM_DIFFS, SIM_STRATEGIES.
import { it } from "vitest";
import { BALANCE } from "../src/game/balance";
import type { DiffKey } from "../src/game/types";
import { play, STRATEGIES } from "./bot";

it("trace", () => {
  const lines: string[] = [];
  const o = play({
    balance: BALANCE,
    level: process.env.SIM_LEVELS ?? "switchback",
    diff: (process.env.SIM_DIFFS ?? "easy") as DiffKey,
    strategy: STRATEGIES[process.env.SIM_STRATEGIES ?? "rush"],
    seed: 1,
    trace: (l) => lines.push(l),
  });
  process.stdout.write(lines.join("\n") + "\n" + JSON.stringify(o) + "\n");
});
