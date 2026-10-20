// Marks on the turrets. A turret already differs from the others by its colour and its level by its size and tint, so
// the marks say two other things: the specialisation chosen at level 5 (a letter of the player's language, on the
// left of the plate) and the number of overclocks (on the right). Stateless painter and the letters.
import type { Ctx } from "./types";

/** `name` without what is no letter at the start, its first `n` letters: a capital, then small ones ("Cl", "Пр"). */
function letters(name: string, n: number): string {
  const cs = Array.from(name.trim().replace(/^[^\p{L}]+/u, "")).slice(0, n);
  return cs.length ? cs[0].toLocaleUpperCase() + cs.slice(1).join("").toLocaleLowerCase() : "?";
}

/**
 * The marks of the specialisations of one tower, from their names in the current language: the first letter of each
 * name, capital. When two names would give the same mark (Cluster and Concussion), every mark of the tower gets one
 * more letter, as many as it takes to tell them apart, so the two never look alike.
 */
export function ultMarks(names: string[]): string[] {
  for (let n = 1; n <= 6; n++) {
    const marks = names.map((x) => letters(x, n));
    if (new Set(marks).size === marks.length) return marks;
  }
  return names.map((x) => letters(x, 6));
}

/** The left mark: the specialisation's mark from level 5 on, else nothing. `ults` are the ids in the data order. */
export function leftMark(ults: string[], names: string[], ult: string | undefined, lvl: number): string {
  const i = lvl >= 4 && ult ? ults.indexOf(ult) : -1;
  return i < 0 ? "" : ultMarks(names)[i];
}

/** The right mark: the number of overclocks, nothing without any. */
export const rightMark = (oc: number): string => (oc > 0 ? "+" + oc : "");

/** Paints `text` in cell units, centred on the origin, light with a heavy dark outline (readable on any plate). */
export function markText(c: Ctx, text: string, fill: string, z = 1) {
  c.font = `${0.3 * z}px "Russo One",sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  c.lineWidth = 0.09 * z;
  c.strokeStyle = "#000";
  c.strokeText(text, 0, 0);
  c.fillStyle = fill;
  c.fillText(text, 0, 0);
}
