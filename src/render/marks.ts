// Letter marks on the turrets, so towers tell apart where their colours merge: the letter of the type (or, from the
// ultimate on, of the specialisation) on the left, "+n" for the upgrades on the right. Stateless painter and the table.
import type { Ctx } from "./types";

/*
 * The letters are symbols derived from the ids in balance.yaml, not translated texts, so they live here and not in the
 * language files. All 24 are different (towers and ultimates together), so a letter never means two things.
 * `tests/render/marks.test.ts` checks the uniqueness and that every tower and ultimate of the balance has a letter.
 */
export const TOWER_MARK: Record<string, string> = {
  gun: "G",
  cannon: "C",
  frost: "F",
  missile: "R", // rocket
  laser: "L",
  plasma: "Q",
  rail: "I",
  artillery: "D",
};
export const ULT_MARK: Record<string, string> = {
  mini: "M",
  sniper: "S",
  cluster: "U",
  shock: "H",
  zero: "Z",
  brittle: "B",
  swarm: "W",
  sam: "A",
  prism: "P",
  heat: "T",
  nova: "N",
  plague: "V",
  gauss: "X",
  auto: "Y",
  salvo: "O",
  nuke: "K",
};

/** The left mark: the specialisation letter once the ultimate is chosen, else the letter of the type. */
export const leftMark = (type: string, ult: string | undefined, lvl: number): string =>
  (lvl >= 4 && ult && ULT_MARK[ult]) || TOWER_MARK[type] || "?";
/** The right mark: the number of upgrades above the first level, nothing on level 1. */
export const rightMark = (lvl: number): string => (lvl > 0 ? "+" + Math.min(lvl, 4) : "");

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
