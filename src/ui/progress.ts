// What the game remembers between visits: the chosen difficulty and level, the best wave on each map and difficulty,
// the wins, and what the campaign has opened from them.
import type { Lock } from "../game/campaign";
import type { DiffKey } from "../game/types";
import type { KeyValueStore } from "../storage";

export interface Progress {
  /** the saved difficulty and map when both are valid and open; otherwise the first map on easy */
  readChoice(): { level: string; diff: DiffKey };
  saveDiff(k: DiffKey): void;
  saveLevel(id: string): void;
  /** the best wave reached on a level at a difficulty */
  bestOf(level: string, diff: DiffKey): number;
  saveBest(level: string, diff: DiffKey, wave: number): void;
  /** whether the last wave was cleared on a level at a difficulty */
  wonOf(level: string, diff: DiffKey): boolean;
  saveWon(level: string, diff: DiffKey): void;
  /** what keeps a map × difficulty closed (null: open); the "bagowpw" cheat opens everything */
  lockOf(level: string, diff: DiffKey): Lock | null;
  /** the "bagowpw" cheat: every map is open (cheated games stay out of the records) */
  mapsOpen(): boolean;
  openAllMaps(): void;
}

/** What keeps a map × difficulty closed, from the best waves (null: open): the campaign's rule over the game's data. */
export type LockRule = (level: string, diff: string, best: (level: string, diff: string) => number) => Lock | null;

/** `levels` are the ids in the order of the campaign with their length; `lock` is the campaign's rule. */
export function createProgress(
  store: KeyValueStore,
  diffs: readonly string[],
  levels: readonly { id: string; finalWaves: Record<string, number> }[],
  lock: LockRule,
): Progress {
  const key = (kind: string, level: string, diff: string) => `xt-${kind}-${level}-${diff}`;
  const num = (k: string) => +(store.get(k) ?? 0) || 0;
  const bestOf = (level: string, diff: string) => {
    const cap = levels.find((l) => l.id === level)?.finalWaves[diff] ?? 0;
    return Math.min(cap, num(key("best", level, diff)));
  };
  const progress: Progress = {
    readChoice() {
      const savedDiff = store.get("xt-diff"),
        savedLevel = store.get("xt-level");
      const diff = (savedDiff && diffs.includes(savedDiff) ? savedDiff : "easy") as DiffKey,
        level = savedLevel && levels.some((l) => l.id === savedLevel) ? savedLevel : levels[0].id;
      // a pair that is still closed (the records were lost, or the data changed) is not kept
      return progress.lockOf(level, diff) ? { level: levels[0].id, diff: "easy" } : { level, diff };
    },
    saveDiff: (k) => store.set("xt-diff", k),
    saveLevel: (id) => store.set("xt-level", id),
    bestOf,
    saveBest: (level, diff, wave) => store.set(key("best", level, diff), String(wave)),
    wonOf: (level, diff) => store.get(key("won", level, diff)) === "1",
    saveWon: (level, diff) => store.set(key("won", level, diff), "1"),
    lockOf: (level, diff) => (progress.mapsOpen() ? null : lock(level, diff, bestOf)),
    mapsOpen: () => store.get("xt-allmaps") === "1",
    openAllMaps: () => store.set("xt-allmaps", "1"),
  };
  return progress;
}
