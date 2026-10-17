// How the difficulties look: the skull icons and colours. Only appearance; the numbers are in the balance data.
import type { DiffKey } from "../game/types";

interface Look {
  /** how many skulls, or "x" for the crossbones one */
  icon: number | "x";
  col: string;
  edge?: string;
}

export const DIFF_LOOK: Record<DiffKey, Look> = {
  easy: { icon: 1, col: "#4fd27a" },
  normal: { icon: 2, col: "#ffad33" },
  hard: { icon: 3, col: "#ff3b3b" },
  insane: { icon: "x", col: "#4a0b16", edge: "#c0283c" },
};

/** The colour to write a difficulty's name in. */
export const diffColor = (k: DiffKey): string => DIFF_LOOK[k].edge || DIFF_LOOK[k].col;

const SKULL =
  '<path d="M12 2.6c-4.6 0-8.1 3.3-8.1 7.8 0 2.6 1.2 4.5 2.9 5.6v2.7c0 .7.5 1.2 1.2 1.2h8c.7 0 1.2-.5 1.2-1.2V16c1.7-1.1 2.9-3 2.9-5.6 0-4.5-3.5-7.8-8.1-7.8z"/><circle cx="8.7" cy="10.6" r="2.1" fill="#0a0d18"/><circle cx="15.3" cy="10.6" r="2.1" fill="#0a0d18"/><path d="M12 13.1l-1.2 2.2h2.4z" fill="#0a0d18"/><path d="M10.2 17.4v2.4M12 17.4v2.4M13.8 17.4v2.4" stroke="#0a0d18" stroke-width=".9"/>';

/** SVG markup of a difficulty's skulls. */
export function skullIcon(k: DiffKey, cls = ""): string {
  const d = DIFF_LOOK[k];
  if (d.icon === "x") {
    return (
      `<svg class="big ${cls}" viewBox="0 0 32 32" aria-hidden="true"><g stroke="${d.edge}" stroke-width="4.4" stroke-linecap="round"><line x1="5" y1="29" x2="27" y2="17"/><line x1="5" y1="17" x2="27" y2="29"/></g>` +
      `<g stroke="${d.col}" stroke-width="2.8" stroke-linecap="round"><line x1="5" y1="29" x2="27" y2="17"/><line x1="5" y1="17" x2="27" y2="29"/></g>` +
      `<g transform="translate(4 0)" fill="${d.col}" stroke="${d.edge}" stroke-width=".8">${SKULL}</g></svg>`
    );
  }
  let o = "";
  for (let i = 0; i < d.icon; i++)
    o += `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="${d.col}">${SKULL}</g></svg>`;
  return o;
}
