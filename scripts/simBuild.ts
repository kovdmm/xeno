import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** the files of src/game that only check the simulation (determinism fingerprints), by exact name */
export const NOT_THE_GAME = new Set(["digests.ts", "dmathCheck.ts", "selfCheck.ts"]);

/**
 * A fingerprint of the simulation: every source file of src/game and the balance data. A recorded run only
 * replays to the same result on the same simulation, so the client puts this into the run and the server accepts
 * only runs of its own build. Both are built from the same checkout, so the numbers agree without anybody
 * having to bump a version.
 */
export function simBuild(root = "src/game"): string {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|yaml)$/.test(e.name) && !NOT_THE_GAME.has(e.name)) files.push(p);
    }
  };
  walk(root);
  const h = createHash("sha1");
  // line endings must not matter: a checkout on Windows and one on Linux are the same simulation
  for (const f of files)
    h.update(f.replaceAll("\\", "/"))
      .update("\0")
      .update(readFileSync(f, "utf8").replaceAll("\r\n", "\n"))
      .update("\0");
  return h.digest("hex").slice(0, 12);
}

/** the `define` entry of the vite and vitest configs */
export const simBuildDefine = () => ({ __SIM_BUILD__: JSON.stringify(simBuild()) });
