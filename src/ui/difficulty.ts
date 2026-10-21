// How the difficulties look: always ONE skull; the difficulty is its colour and its size, and Insane is the big one with
// crossbones. Only appearance; the numbers are in the balance data.
import type { DiffKey } from "../game/types";

interface Look {
  /** the size of the skull, 1 = the size asked for */
  size: number;
  col: string;
  /** the outline; Insane has one, and the crossbones behind the skull */
  edge?: string;
}

export const DIFF_LOOK: Record<DiffKey, Look> = {
  easy: { size: 0.68, col: "#4fd27a" },
  normal: { size: 0.84, col: "#ffad33" },
  hard: { size: 1, col: "#ff3b3b" },
  insane: { size: 1.3, col: "#4a0b16", edge: "#c0283c" },
};

/** The colour to write a difficulty's name in. */
export const diffColor = (k: DiffKey): string => DIFF_LOOK[k].edge || DIFF_LOOK[k].col;

const SKULL =
  '<path d="M12 2.6c-4.6 0-8.1 3.3-8.1 7.8 0 2.6 1.2 4.5 2.9 5.6v2.7c0 .7.5 1.2 1.2 1.2h8c.7 0 1.2-.5 1.2-1.2V16c1.7-1.1 2.9-3 2.9-5.6 0-4.5-3.5-7.8-8.1-7.8z"/><circle cx="8.7" cy="10.6" r="2.1" fill="#0a0d18"/><circle cx="15.3" cy="10.6" r="2.1" fill="#0a0d18"/><path d="M12 13.1l-1.2 2.2h2.4z" fill="#0a0d18"/><path d="M10.2 17.4v2.4M12 17.4v2.4M13.8 17.4v2.4" stroke="#0a0d18" stroke-width=".9"/>';

/**
 * SVG markup of a difficulty's skull. `px` is the size of a Hard skull (the middle one); Easy is smaller, Insane bigger
 * (and with crossbones), so the picture alone tells them apart even without the colour.
 */
export function skullIcon(k: DiffKey, px = 24): string {
  const d = DIFF_LOOK[k];
  const size = Math.round(px * d.size * 10) / 10;
  const style = `width:${size}px;height:${size}px`;
  if (d.edge) {
    return (
      `<svg class="skull" style="${style}" viewBox="0 0 32 32" aria-hidden="true"><g stroke="${d.edge}" stroke-width="4.4" stroke-linecap="round"><line x1="5" y1="29" x2="27" y2="17"/><line x1="5" y1="17" x2="27" y2="29"/></g>` +
      `<g stroke="${d.col}" stroke-width="2.8" stroke-linecap="round"><line x1="5" y1="29" x2="27" y2="17"/><line x1="5" y1="17" x2="27" y2="29"/></g>` +
      `<g transform="translate(4 0)" fill="${d.col}" stroke="${d.edge}" stroke-width=".8">${SKULL}</g></svg>`
    );
  }
  return `<svg class="skull" style="${style}" viewBox="0 0 24 24" aria-hidden="true"><g fill="${d.col}">${SKULL}</g></svg>`;
}
