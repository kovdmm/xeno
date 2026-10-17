// What the game remembers between visits: the chosen difficulty and level, and the best wave on each of them.
import type { DiffKey } from "../game/types";
import type { KeyValueStore } from "../storage";

export interface Progress {
  /** the saved difficulty; "easy" when nothing valid is saved */
  readDiff(): DiffKey;
  saveDiff(k: DiffKey): void;
  /** the saved level; the first one when nothing valid is saved */
  readLevel(): string;
  saveLevel(id: string): void;
  /** the best wave reached on a level at a difficulty (the old single record counts for the first level, easy) */
  bestOf(level: string, diff: DiffKey): number;
  saveBest(level: string, diff: DiffKey, wave: number): void;
}

/** `levels` are the ids in order with their length; the first level keeps the keys older versions used. */
export function createProgress(
  store: KeyValueStore,
  diffs: readonly string[],
  levels: readonly { id: string; finalWave: number }[],
): Progress {
  const first = levels[0].id;
  const key = (level: string, diff: string) => (level === first ? "xt-best-" + diff : `xt-best-${level}-${diff}`);
  const num = (k: string) => +(store.get(k) ?? 0) || 0;
  return {
    readDiff() {
      const saved = store.get("xt-diff");
      return (saved && diffs.includes(saved) ? saved : "easy") as DiffKey;
    },
    saveDiff: (k) => store.set("xt-diff", k),
    readLevel() {
      const saved = store.get("xt-level");
      return saved && levels.some((l) => l.id === saved) ? saved : first;
    },
    saveLevel: (id) => store.set("xt-level", id),
    bestOf(level, diff) {
      const cap = levels.find((l) => l.id === level)?.finalWave ?? 0;
      return Math.min(cap, num(key(level, diff)) || (level === first && diff === "easy" ? num("xt-best") : 0));
    },
    saveBest: (level, diff, wave) => store.set(key(level, diff), String(wave)),
  };
}
