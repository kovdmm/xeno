// How the walk of the baked maze grows with the number of towers built along it (money-free). Run with
// `yarn sim sim/mazecurve.sim.ts`.
import { it } from "vitest";
import { BALANCE } from "../src/game/balance";
import { makeLevel } from "../src/game/level";
import { walk, type Baked } from "./maze";
import mazes from "./mazes.json";

it("walk by towers", () => {
  const sizes = [0, 5, 10, 15, 20, 30, 40, 60, 80, 100, 130];
  const rows = ["level\t" + sizes.join("\t")];
  for (const [id, m] of Object.entries(mazes as unknown as Record<string, Baked>)) {
    const L = makeLevel(BALANCE, id);
    const solid = new Uint8Array(L.width * L.height),
      dist = new Int32Array(solid.length),
      queue = new Int32Array(solid.length);
    for (const [x, y] of L.walls) solid[y * L.width + x] = 1;
    const out: number[] = [];
    for (let n = 0; n <= Math.max(...sizes); n++) {
      if (n > 0 && m.order[n - 1]) solid[m.order[n - 1][1] * L.width + m.order[n - 1][0]] = 1;
      if (sizes.includes(n)) out.push(Math.round(walk(L, solid, dist, queue)));
    }
    rows.push(id + "\t" + out.join("\t"));
  }
  process.stdout.write(rows.join("\n") + "\n");
});
