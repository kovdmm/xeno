// The campaign: which of the maps × difficulties are open. A pure rule over the data, nothing is stored here.
// A difficulty of a map opens when the best wave on the previous difficulty of that map reaches the map's
// `unlock.difficulty`; a map opens when the best wave on the easiest difficulty of the previous map of the list reaches
// that map's `unlock.nextMap`. The first map and the easiest difficulty are always open.
import type { Balance, Unlock } from "./types";

export interface CampaignMap {
  id: string;
  unlock: Unlock;
}

/** Why a cell is closed: the best wave `need` that is missing on `from` (a map id, or a difficulty of the same map). */
export type Lock = { kind: "map"; from: string; need: number } | { kind: "difficulty"; from: string; need: number };

/** The maps in the order of the data, and the difficulties from the easiest. */
export const campaignOf = (B: Balance): { maps: CampaignMap[]; diffs: string[] } => ({
  maps: Object.entries(B.levels).map(([id, d]) => ({ id, unlock: d.unlock })),
  diffs: Object.keys(B.difficulty),
});

/**
 * What keeps the cell (map, difficulty) closed, or null when it is open. `best` is the best wave reached on a cell.
 * A closed map shows its own lock even for the higher difficulties on it.
 */
export function lockOf(
  maps: readonly CampaignMap[],
  diffs: readonly string[],
  level: string,
  diff: string,
  best: (level: string, diff: string) => number,
): Lock | null {
  const i = maps.findIndex((m) => m.id === level),
    j = diffs.indexOf(diff);
  if (i < 0 || j < 0) return null;
  if (i > 0) {
    const prev = maps[i - 1],
      need = prev.unlock.nextMap ?? Infinity;
    if (best(prev.id, diffs[0]) < need) return { kind: "map", from: prev.id, need };
  }
  if (j > 0) {
    const need = maps[i].unlock.difficulty;
    if (best(level, diffs[j - 1]) < need) return { kind: "difficulty", from: diffs[j - 1], need };
  }
  return null;
}
