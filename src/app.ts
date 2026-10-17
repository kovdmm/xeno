// The app's services, built from their parts: the translator, the game, the renderer factory and the sound.
// No interface in here: src/main.ts adds that. Tests build the same services with seeded streams.
import { createBrowserAudio } from "./audio/browser";
import { createCore } from "./core";
import { createBrowserI18n } from "./i18n/browser";
import { browserRenderer } from "./render/browser";
import { THEME } from "./render/theme";
import { localStorageStore } from "./storage";

/**
 * Seams for tests: each subsystem has its own random stream, so cosmetic randomness (effects, sound) can never
 * shift the simulation; the clock and the timer are replaceable too. Nothing set means the real ones.
 */
export interface Hooks {
  rng?: { core?: () => number; fx?: () => number; audio?: () => number };
  env?: { now?: () => number; setTimeout?: (fn: () => void, ms: number) => unknown };
}

export function createApp(hooks: Hooks = {}) {
  const store = localStorageStore();
  const i18n = createBrowserI18n(store);
  const core = createCore(i18n, hooks.rng?.core);
  const createRenderer = browserRenderer(core, { rand: hooks.rng?.fx, clock: hooks.env?.now });
  const audio = createBrowserAudio({
    storage: store,
    onGameEvent: core.on,
    beams: () => {
      const S = core.S;
      let n = 0;
      if (!S.over) for (const t of S.towers) if (t.beam) n += t.beam.length;
      return n;
    },
    rng: hooks.rng?.audio,
    schedule: hooks.env?.setTimeout,
  });
  return { store, i18n, core, createRenderer, audio, THEME };
}

export type App = ReturnType<typeof createApp>;
