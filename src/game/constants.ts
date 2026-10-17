import type { Vec } from "./types";

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
