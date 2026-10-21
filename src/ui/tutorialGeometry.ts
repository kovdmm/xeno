// Where the tutorial's marks go on the screen. Pure: the rectangles come in, rectangles and sides go out.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The box on the screen that holds the given board cells. `field` is the canvas's box; in portrait the board is turned 90
 * degrees clockwise (the inverse of the pointer's mapping in input.ts).
 */
export function cellsBox(
  cells: readonly (readonly [number, number])[],
  field: Box,
  W: number,
  H: number,
  rotated: boolean,
): Box {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const at = (bx: number, by: number) => {
    const u = rotated ? 1 - by / H : bx / W,
      v = rotated ? bx / W : by / H;
    const sx = field.x + u * field.w,
      sy = field.y + v * field.h;
    x0 = Math.min(x0, sx);
    x1 = Math.max(x1, sx);
    y0 = Math.min(y0, sy);
    y1 = Math.max(y1, sy);
  };
  for (const [x, y] of cells) {
    at(x, y);
    at(x + 1, y + 1);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The smallest box around all of them. */
export function union(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x)),
    y0 = Math.min(...boxes.map((b) => b.y)),
    x1 = Math.max(...boxes.map((b) => b.x + b.w)),
    y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The text box goes to the side of the screen that the marked thing is not on (the top when there is nothing marked). */
export function boxSide(marked: Box | null, viewHeight: number): "top" | "bottom" {
  if (!marked) return "top";
  return marked.y + marked.h / 2 > viewHeight / 2 ? "top" : "bottom";
}

/** The arrow stands above the marked thing, or below it when there is no room above. */
export function arrowSide(marked: Box, room = 60): "above" | "below" {
  return marked.y < room ? "below" : "above";
}

/** A box has a size on the screen (an element that is hidden or not built has none). */
export const visible = (b: Box): boolean => b.w > 0 && b.h > 0 && Number.isFinite(b.x + b.y);
