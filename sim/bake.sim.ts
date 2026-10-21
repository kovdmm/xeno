// Bakes the longest maze of every level into sim/mazes.json (the bot builds along it). Run with
// `yarn sim sim/bake.sim.ts`; SIM_ITER sets the effort (iterations per level), SIM_LEVELS narrows the levels.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { BALANCE } from "../src/game/balance";
import { makeLevel } from "../src/game/level";
import { mapKey, optimize, type Baked } from "./maze";

it("bake mazes", { timeout: 3600 * 1000 }, () => {
  const iterations = +(process.env.SIM_ITER ?? 400000);
  const levels = process.env.SIM_LEVELS ? process.env.SIM_LEVELS.split(",") : Object.keys(BALANCE.levels);
  const out: Record<string, Baked> = {};
  for (const id of levels) {
    const L = makeLevel(BALANCE, id, "easy");
    const t0 = Date.now();
    let best = optimize(L, { iterations, seed: 1 });
    for (const seed of [2, 3]) {
      const m = optimize(L, { iterations, seed });
      if (m.length > best.length) best = m;
    }
    out[id] = { ...best, key: mapKey(BALANCE, id) };
    process.stdout.write(
      `${id}: walk ${best.base} -> ${best.length} with ${best.order.length} towers (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`,
    );
  }
  writeFileSync("sim/mazes.json", JSON.stringify(out) + "\n");
});
