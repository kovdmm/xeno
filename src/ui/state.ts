// What the player has in hand right now. Plain data: the modules read and change it, nothing here is DOM.
import type { AbilityKey, DiffKey, Tower, TowerType, Vec } from "../game/types";

export const SPEEDS = [1, 2, 3, 5] as const;

export interface UiState {
  /** the tower whose card is open */
  sel: Tower | null;
  /** the tower type picked in the palette, waiting for a click on the field */
  build: TowerType | null;
  /** the aimed ability waiting for a click on the field */
  aim: AbilityKey | null;
  /** the board point under the pointer */
  hover: Vec | null;
  /** a screen covers the game, so it does not advance (the title screen starts like that) */
  paused: boolean;
  speedIdx: number;
  /** the board is turned 90 degrees (portrait): texts that mention directions must follow */
  rotated: boolean;
  diff: DiffKey;
  /** the best wave reached on this difficulty */
  best: number;
}

export const createState = (diff: DiffKey, best: number): UiState => ({
  sel: null,
  build: null,
  aim: null,
  hover: null,
  paused: true,
  speedIdx: 0,
  rotated: false,
  diff,
  best,
});

/** Drops everything picked or selected. */
export function clearPicks(s: UiState) {
  s.build = null;
  s.sel = null;
  s.aim = null;
}

export const speedOf = (s: UiState): number => (s.paused ? 0 : SPEEDS[s.speedIdx]);
