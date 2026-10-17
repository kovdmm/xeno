import type { Vec } from "./types";

/** board size in cells */
export const W = 22;
export const H = 15;
export const INF = 1e9;
/** the last wave: the Swarm Queen */
export const FINAL = 200;
export const DIRS: Vec[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
