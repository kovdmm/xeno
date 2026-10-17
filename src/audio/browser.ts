// The audio system wired to the browser: howler.js (a classic script, so a global), localStorage, timers.
import type { GameEvent } from "../game/types";
import type { KeyValueStore } from "../storage";
import { createHowlerOut } from "./howlerOut";
import { createAudioSystem, type AudioSystem } from "./system";

export interface BrowserAudioOptions {
  storage: KeyValueStore;
  /** subscribes to the game's events */
  onGameEvent(fn: (e: GameEvent) => void): void;
  /** how many laser beams are firing right now (for the beam hum) */
  beams(): number;
  /** random stream for the sound (tests seed it) */
  rng?: () => number;
  /** timer for the delayed start of the music (tests drive it by hand) */
  schedule?: (fn: () => void, ms: number) => unknown;
}

export function createBrowserAudio(o: BrowserAudioOptions): AudioSystem {
  const g = globalThis as unknown as {
    Howl: never;
    Howler: never;
    addEventListener: (type: string, fn: () => void) => void;
  };
  const A = createAudioSystem({
    out: createHowlerOut({ Howl: g.Howl, Howler: g.Howler, addEventListener: (t, f) => g.addEventListener(t, f) }),
    storage: o.storage,
    rng: o.rng || Math.random,
    schedule: o.schedule || ((fn, ms) => setTimeout(fn, ms)),
    beams: o.beams,
  });
  if (A.ok) o.onGameEvent((e) => A.handleEvent(e));
  return A;
}
