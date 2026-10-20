import type { Vec } from "./types";

/**
 * The simulation's time step, seconds. The interface steps the game in these and nothing else, so a game is a
 * sequence of whole ticks that can be recorded and replayed; 1/60 is one step per frame on a 60 Hz screen, and
 * short enough that a frame cannot skip over events.
 */
export const TICK = 1 / 60;
/** "no path" distance in the pathfinding fields */
export const INF = 1e9;
/** the middle element: the centre cell of a gate (index 1 of three) */
export const mid = <T>(a: T[]): T => a[(a.length - 1) >> 1];
/** the four step directions, in the order pathfinding tries them */
export const DIRS: Vec[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
