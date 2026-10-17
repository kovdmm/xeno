// Builds the game modules for tests: a fresh `XT` registry per call (so no state leaks between tests) with
// browser globals stubbed on globalThis.
//
// Each module gets its own seeded random stream (XT.rng.core / fx / audio), so cosmetic randomness in the
// renderer can never shift the simulation. Timers and the clock go through XT.env, which the modules honour.
import { installI18n } from "../../src/i18n.js";
import { installCore } from "../../src/core.js";
import { installRender } from "../../src/render.js";
import { installAudio } from "../../src/audio.js";

const INSTALL = { i18n: installI18n, core: installCore, render: installRender, audio: installAudio };
// every browser global the modules touch; anything not provided by a test is removed again
const GLOBALS = ["window", "navigator", "matchMedia", "addEventListener", "Howl", "Howler", "localStorage", "document"];

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

function setGlobals(values) {
  for (const k of GLOBALS) {
    if (k in values) Object.defineProperty(globalThis, k, { value: values[k], configurable: true, writable: true });
    else delete globalThis[k];
  }
}

/** @param files module names in install order, e.g. ["core", "audio"]
 *  @param opts.seed seed of the core stream (fx = seed+1, audio = seed+2)
 *  @param opts.globals browser globals to provide (Howl, Howler, localStorage, document, ...);
 *         `setTimeout` is routed to the modules through XT.env instead of the real global */
export function loadXT(files, { seed = 1, globals = {} } = {}) {
  const { setTimeout = () => 0, ...rest } = globals;
  const noop = () => {};
  setGlobals({
    window: { devicePixelRatio: 1, addEventListener: noop },
    navigator: { languages: ["en"], language: "en" },
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    addEventListener: noop,
    ...rest,
  });
  const XT = {
    rng: { core: mulberry32(seed), fx: mulberry32(seed + 1), audio: mulberry32(seed + 2) },
    env: { setTimeout, now: () => 0 },
  };
  for (const f of files) INSTALL[f](XT);
  return XT;
}

/** Runs the simulation for `seconds` of game time in the same 25 ms steps the UI loop uses. */
export function run(core, seconds) {
  for (let t = 0; t < seconds; t += 0.025) {
    if (core.S.over) break;
    core.step(0.025);
  }
}
