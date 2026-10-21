import { describe, expect, it } from "vitest";
import { arrowSide, boxSide, cellsBox, union, visible } from "../../src/ui/tutorialGeometry";

const round = (b: { x: number; y: number; w: number; h: number }) => ({
  x: Math.round(b.x),
  y: Math.round(b.y),
  w: Math.round(b.w),
  h: Math.round(b.h),
});
const FIELD = { x: 100, y: 50, w: 400, h: 200 }; // a 20 x 10 board, 20 px a cell

describe("where the marked cells are on the screen", () => {
  it("a cell of an upright board is a 20 px square at its place", () => {
    expect(cellsBox([[0, 0]], FIELD, 20, 10, false)).toEqual({ x: 100, y: 50, w: 20, h: 20 });
    expect(cellsBox([[19, 9]], FIELD, 20, 10, false)).toEqual({ x: 480, y: 230, w: 20, h: 20 });
  });

  it("several cells make one box around them", () => {
    expect(
      cellsBox(
        [
          [2, 1],
          [4, 3],
        ],
        FIELD,
        20,
        10,
        false,
      ),
    ).toEqual({ x: 140, y: 70, w: 60, h: 60 });
  });

  it("a turned board (portrait): the first column becomes the top row, the last row the left column", () => {
    const tall = { x: 0, y: 0, w: 200, h: 400 }; // the 20 x 10 board turned: 10 wide, 20 high on the screen, 20 px a cell
    expect(round(cellsBox([[0, 9]], tall, 20, 10, true))).toEqual({ x: 0, y: 0, w: 20, h: 20 }); // board's left bottom: screen's top left
    expect(round(cellsBox([[19, 0]], tall, 20, 10, true))).toEqual({ x: 180, y: 380, w: 20, h: 20 }); // right top: bottom right
  });

  it("agrees with where a tap on that cell lands (the inverse of the pointer's mapping)", () => {
    // input.ts: rotated: [v * W, H - u * H] for the point at (u, v) of the canvas
    const u = 0.35,
      v = 0.8;
    const [bx, by] = [v * 20, 10 - u * 10];
    const b = cellsBox([[Math.floor(bx), Math.floor(by)]], { x: 0, y: 0, w: 200, h: 400 }, 20, 10, true);
    expect(u * 200).toBeGreaterThanOrEqual(b.x);
    expect(u * 200).toBeLessThanOrEqual(b.x + b.w);
    expect(v * 400).toBeGreaterThanOrEqual(b.y);
    expect(v * 400).toBeLessThanOrEqual(b.y + b.h);
  });
});

describe("the text box and the arrow", () => {
  const box = (y: number, h = 40) => ({ x: 10, y, w: 40, h });

  it("the union is the smallest box around them, and nothing gives none", () => {
    expect(union([box(10), { x: 100, y: 200, w: 10, h: 10 }])).toEqual({ x: 10, y: 10, w: 100, h: 200 });
    expect(union([])).toBeNull();
  });

  it("the texts keep to the other half of the screen (the top when nothing is marked)", () => {
    expect(boxSide(box(700), 800)).toBe("top");
    expect(boxSide(box(20), 800)).toBe("bottom");
    expect(boxSide(null, 800)).toBe("top");
  });

  it("the arrow is above the marked thing, or below it when it is at the very top", () => {
    expect(arrowSide(box(300))).toBe("above");
    expect(arrowSide(box(30))).toBe("below");
  });

  it("an element that is not on screen has no box to mark", () => {
    expect(visible({ x: 0, y: 0, w: 0, h: 0 })).toBe(false);
    expect(visible({ x: NaN, y: 0, w: 5, h: 5 })).toBe(false);
    expect(visible(box(10))).toBe(true);
  });
});
