// Adapter that connects the audio system (src/audio) to the rest of the app, which still finds everything on
// the `XT` registry: howler.js backend, localStorage settings, core events, laser beams from the game state.
// Temporary: it goes away once main.js wires these parts itself.
import { createAudioSystem } from "./audio/system";
import { createHowlerOut } from "./audio/howlerOut";
import { localStorageStore } from "./storage";

export function installAudio(XT) {
  const g = globalThis;
  const A = createAudioSystem({
    out: createHowlerOut({ Howl: g.Howl, Howler: g.Howler, addEventListener: (t, f) => g.addEventListener(t, f) }),
    storage: localStorageStore(),
    // randomness comes from XT.rng.audio when set (tests seed it)
    rng: (XT.rng && XT.rng.audio) || Math.random,
    schedule: (XT.env && XT.env.setTimeout) || ((fn, ms) => setTimeout(fn, ms)),
    beams: () => {
      const S = XT.core && XT.core.S;
      let n = 0;
      if (S && !S.over) for (const t of S.towers) if (t.beam) n += t.beam.length;
      return n;
    },
  });
  if (A.ok) XT.core.on((e) => A.handleEvent(e));
  XT.audio = A;
}
