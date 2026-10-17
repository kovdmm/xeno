import { describe, expect, it } from "vitest";
import { gateGeometry, laneOf } from "../../src/render/gates";
import { mapThumb } from "../../src/ui/mapThumb";
import { BALANCE } from "../../src/game/balance";

const R = BALANCE.levels.crossroads.map.routes;

describe("gate geometry follows the cells in the route data", () => {
  it("the first campaign's gates are where they always were drawn (the middle cell of three)", () => {
    const h = gateGeometry(R.h);
    expect(h.spawn).toEqual([0.5, 7.5]); // the centre of cell [0, 7]
    expect(h.exit).toEqual([21.5, 7.5]);
    expect(h.span).toBe(1);
    expect(h.exitBox).toEqual([21, 6, 1, 3]);
    const v = gateGeometry(R.v);
    expect(v.spawn).toEqual([11.5, 0.5]);
    expect(v.exitBox).toEqual([10, 14, 3, 1]);
  });

  it("a wider gate is centred on its cells and scales the breach", () => {
    const g = gateGeometry({ spawn: [[0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]], exit: [[9, 3]], dir: [1, 0] });
    expect(g.spawn).toEqual([0.5, 5]); // between the third and fourth cell
    expect(g.span).toBe(2);
    expect(g.exitBox).toEqual([9, 3, 1, 1]);
  });

  it("the edges are where the entrance and the exit meet the border of the board", () => {
    const g = gateGeometry(R.h);
    expect(g.entryEdge).toEqual([0, 7.5]);
    expect(g.exitEdge).toEqual([22, 7.5]);
  });

  it("exitDir sends the exit edge another way than dir (the corner level leaves through the bottom)", () => {
    const r = BALANCE.levels.corner.map.routes.main;
    const g = gateGeometry(r);
    expect(g.dir).toEqual([1, 0]);
    expect(g.exitDir).toEqual([0, 1]);
    expect(g.exitEdge[1]).toBe(14); // the bottom edge of a 14-row board
  });

  it("a flyer's lane runs straight between the two edges; along an axis it is the whole board", () => {
    const lane = laneOf(R.h);
    expect(lane.from).toEqual([0, 7.5]);
    expect(lane.length).toBe(22);
    expect(lane.angle).toBe(0);
    expect(laneOf(R.v).angle).toBeCloseTo(Math.PI / 2);
    expect(laneOf(R.v).length).toBe(15);
    const corner = laneOf(BALANCE.levels.corner.map.routes.main);
    expect(corner.angle).toBeGreaterThan(0); // slanted: the exit is lower than the entrance
    expect(corner.length).toBeGreaterThan(15);
  });
});

describe("the picture of a level", () => {
  it("shows the board, the walls, the entrances and the exits", () => {
    const svg = mapThumb(BALANCE.levels.switchback);
    expect(svg).toContain('viewBox="0 0 24 15"');
    expect((svg.match(/fill="#6d675e"/g) || []).length).toBe(2); // two blocks of wall
    expect((svg.match(/fill="#ff2a55"/g) || []).length).toBe(3); // three entrance cells
    expect((svg.match(/fill="#ffb22e"/g) || []).length).toBe(3); // three exit cells
  });

  it("every level has one, with a cell for every gate", () => {
    for (const [id, d] of Object.entries(BALANCE.levels)) {
      const cells = Object.values(d.map.routes).reduce((n, r) => n + r.spawn.length + r.exit.length, 0);
      const svg = mapThumb(d);
      expect((svg.match(/fill="#ff2a55"|fill="#ffb22e"/g) || []).length, id).toBe(cells);
    }
  });
});
