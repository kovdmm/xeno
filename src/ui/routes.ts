// How a route reads to the player: the way it runs on the screen, worked out from where it starts and ends.
import { mid } from "../game/constants";
import type { Route } from "../game/types";

export type ScreenDirection = "right" | "left" | "down" | "up";

/**
 * Which way a route runs on the screen. On the landscape screen board x runs right and board y runs down; in
 * portrait the board is turned 90 degrees (board x runs down, board y runs right to left).
 */
export function screenDirection(route: Pick<Route, "spawn" | "exit">, rotated: boolean): ScreenDirection {
  const [sx, sy] = mid(route.spawn),
    [ex, ey] = mid(route.exit);
  const bx = ex - sx,
    by = ey - sy;
  const [dx, dy] = rotated ? [-by, bx] : [bx, by];
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "down" : "up";
}

/** The text key of that direction: "left → right" and so on. */
export const routeLabelKey = (route: Pick<Route, "spawn" | "exit">, rotated: boolean): string =>
  "dir" + screenDirection(route, rotated).replace(/^./, (c) => c.toUpperCase());
