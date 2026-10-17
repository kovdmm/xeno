// Where the gates are, worked out from the cells in the route data: the same drawing code serves a gate of any
// width at any edge. Pure geometry in board units (cell corners), no drawing.
import type { Route, Vec } from "../game/types";

const centre = (cells: Vec[]): Vec => {
  let x = 0,
    y = 0;
  for (const c of cells) ((x += c[0] + 0.5), (y += c[1] + 0.5));
  return [x / cells.length, y / cells.length];
};

export interface GateGeometry {
  /** the middle of the entrance cells */
  spawn: Vec;
  /** the middle of the exit cells */
  exit: Vec;
  /** how wide the entrance is compared with the usual three cells: breaches and veins scale with it */
  span: number;
  /** the rectangle covered by the exit cells: x, y, width, height */
  exitBox: [number, number, number, number];
  /** the board edge the enemies come in through (the middle of it) and the one they leave through */
  entryEdge: Vec;
  exitEdge: Vec;
  /** the step they come in by and leave by */
  dir: Vec;
  exitDir: Vec;
}

export function gateGeometry(r: Route): GateGeometry {
  const spawn = centre(r.spawn),
    exit = centre(r.exit);
  const dir = r.dir,
    exitDir = r.exitDir ?? r.dir;
  const xs = r.exit.map((c) => c[0]),
    ys = r.exit.map((c) => c[1]);
  const minx = Math.min(...xs),
    miny = Math.min(...ys);
  return {
    spawn,
    exit,
    span: Math.max(1, r.spawn.length / 3),
    exitBox: [minx, miny, Math.max(...xs) + 1 - minx, Math.max(...ys) + 1 - miny],
    entryEdge: [spawn[0] - dir[0] * 0.5, spawn[1] - dir[1] * 0.5],
    exitEdge: [exit[0] + exitDir[0] * 0.5, exit[1] + exitDir[1] * 0.5],
    dir,
    exitDir,
  };
}

/** The lane a flyer takes, from where the entrance meets the board edge to where the exit does. */
export function laneOf(r: Route): { from: Vec; to: Vec; length: number; angle: number } {
  const g = gateGeometry(r);
  const dx = g.exitEdge[0] - g.entryEdge[0],
    dy = g.exitEdge[1] - g.entryEdge[1];
  return { from: g.entryEdge, to: g.exitEdge, length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}
