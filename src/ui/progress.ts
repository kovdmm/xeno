// What the game remembers between visits: the chosen difficulty and the best wave on each.
import type { DiffKey } from "../game/types";
import type { KeyValueStore } from "../storage";

export interface Progress {
  /** the saved difficulty; "easy" when nothing valid is saved */
  readDiff(): DiffKey;
  saveDiff(k: DiffKey): void;
  /** the best wave reached on a difficulty (the old single record counts for "easy") */
  bestOf(k: DiffKey): number;
  saveBest(k: DiffKey, wave: number): void;
}

export function createProgress(store: KeyValueStore, diffs: readonly string[], finalWave: number): Progress {
  return {
    readDiff() {
      const saved = store.get("xt-diff");
      return (saved && diffs.includes(saved) ? saved : "easy") as DiffKey;
    },
    saveDiff: (k) => store.set("xt-diff", k),
    bestOf: (k) =>
      Math.min(finalWave, +(store.get("xt-best-" + k) ?? 0) || (k === "easy" ? +(store.get("xt-best") ?? 0) || 0 : 0)),
    saveBest: (k, wave) => store.set("xt-best-" + k, String(wave)),
  };
}
