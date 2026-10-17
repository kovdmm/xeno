// A small picture of a level for its card: the board, the walls and where enemies come in and go out.
import type { LevelDef } from "../game/types";

const WALL = "#6d675e",
  FLOOR = "#1b211e",
  IN = "#ff2a55",
  OUT = "#ffb22e";

/** SVG markup, one unit per cell. */
export function mapThumb(d: Pick<LevelDef, "map">): string {
  const { width: W, height: H, routes, walls = [] } = d.map;
  const cell = (x: number, y: number, fill: string) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
  let body = `<rect width="${W}" height="${H}" fill="${FLOOR}"/>`;
  for (const w of walls) body += `<rect x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" fill="${WALL}"/>`;
  for (const r of Object.values(routes)) {
    for (const [x, y] of r.spawn) body += cell(x, y, IN);
    for (const [x, y] of r.exit) body += cell(x, y, OUT);
  }
  return `<svg class="map" viewBox="0 0 ${W} ${H}" aria-hidden="true" shape-rendering="crispEdges">${body}</svg>`;
}
