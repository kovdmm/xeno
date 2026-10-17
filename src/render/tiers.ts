// Level colours of a tower, apart from its type: a heat ladder, and a colour per type for the ultimate.
import { fitted } from "./color";
import type { TowerType } from "./theme";

/* The level has its own colour, apart from the tower type: a heat ladder from cold steel through
   yellow and orange to the red of the ultimate. It shows on the rim, the level diodes and the lights, so the
   level reads at a glance even where two towers are the same size. The panel colours the level name with it. */
export const TIER = ["#a3aab2", "#dcc84e", "#ff9a2a", "#ff5a26", "#ff1c2c"];

/* The ultimate (level 5) takes a colour of its own per tower type. The hues differ, the brightness does not:
   each is fitted to the same relative luminance, so no tower's ultimate shines brighter than another's. */
export const ULT_HUE: Record<TowerType, number> = {
  gun: 190,
  cannon: 358,
  frost: 218,
  missile: 268,
  laser: 148,
  plasma: 82,
  rail: 318,
  artillery: 34,
};
export const ULT_LUM = 0.27;

// a type's two specialisations sit a few degrees either side of its hue: related, but tellable apart
const SPEC_SHIFT = 16;
const cache: Record<string, string> = {};

/**
 * Colour of level `l` (0..4). `spec` is the index of the chosen specialisation (-1 for none).
 */
export function tierColor(l: number, type: TowerType, spec: number): string {
  const hue = ULT_HUE[type];
  if (l < 4 || hue == null) return TIER[Math.min(l, 4)];
  return (cache[type + "|" + spec] ||= fitted(hue + (spec < 0 ? 0 : spec ? SPEC_SHIFT : -SPEC_SHIFT), ULT_LUM));
}
