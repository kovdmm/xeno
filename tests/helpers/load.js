// Loads the legacy `window.XT` IIFE scripts into an isolated vm context, so tests can run them in Node
// without a browser. Each module gets its own seeded random stream (XT.rng.core / fx / audio), so cosmetic
// randomness in the renderer can never shift the simulation. Math.random itself throws inside the sandbox:
// any use that bypasses XT.rng is a bug.
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param files script names under js/ in load order, e.g. ["core"]
 *  @param opts.seed seed of the core stream (fx = seed+1, audio = seed+2)  @param opts.globals extra globals */
export function loadXT(files, { seed = 1, globals = {} } = {}) {
  const win = {
    XT: { rng: { core: mulberry32(seed), fx: mulberry32(seed + 1), audio: mulberry32(seed + 2) } },
    addEventListener() {},
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  const sandbox = {
    window: win,
    navigator: { languages: ["en"], language: "en" },
    matchMedia: win.matchMedia,
    setTimeout: () => 0,
    addEventListener() {},
    performance: { now: () => 0 },
    console,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    ...globals,
  };
  sandbox.globalThis = sandbox;
  const ctx = createContext(sandbox);
  runInContext('Math.random = () => { throw new Error("Math.random used: take it from XT.rng"); }', ctx);
  for (const f of files) {
    runInContext(readFileSync(resolve(ROOT, "js", f + ".js"), "utf8"), ctx, {
      filename: pathToFileURL(resolve(ROOT, "js", f + ".js")).href,
    });
  }
  return win.XT;
}

/** Runs the simulation for `seconds` of game time in the same 25 ms steps the UI loop uses. */
export function run(core, seconds) {
  for (let t = 0; t < seconds; t += 0.025) {
    if (core.S.over) break;
    core.step(0.025);
  }
}
