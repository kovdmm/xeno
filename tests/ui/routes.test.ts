import { describe, expect, it } from "vitest";
import { routeLabelKey, screenDirection } from "../../src/ui/routes";
import { TEXTS } from "../../src/i18n/texts";
import { BALANCE } from "../../src/game/balance";

const route = (spawn, exit) => ({ spawn, exit });

describe("how a route reads on the screen", () => {
  const h = route([[0, 6], [0, 7], [0, 8]], [[21, 6], [21, 7], [21, 8]]); // enters on the left, leaves on the right
  const v = route([[10, 0], [11, 0], [12, 0]], [[10, 14], [11, 14], [12, 14]]); // enters at the top, leaves at the bottom

  it("landscape: board x is to the right, board y is down", () => {
    expect(screenDirection(h, false)).toBe("right");
    expect(screenDirection(v, false)).toBe("down");
    expect(screenDirection(route([[21, 7]], [[0, 7]]), false)).toBe("left");
    expect(screenDirection(route([[5, 14]], [[5, 0]]), false)).toBe("up");
  });

  it("portrait: the board is turned, board x runs down the screen and board y right to left", () => {
    expect(screenDirection(h, true)).toBe("down");
    expect(screenDirection(v, true)).toBe("left");
    expect(screenDirection(route([[21, 7]], [[0, 7]]), true)).toBe("up");
    expect(screenDirection(route([[5, 14]], [[5, 0]]), true)).toBe("right");
  });

  it("a diagonal route is described by the longer way it goes", () => {
    expect(screenDirection(route([[0, 0]], [[20, 4]]), false)).toBe("right");
    expect(screenDirection(route([[0, 0]], [[3, 12]]), false)).toBe("down");
  });

  it("the text key follows", () => {
    expect(routeLabelKey(h, false)).toBe("dirRight");
    expect(routeLabelKey(h, true)).toBe("dirDown");
    expect(routeLabelKey(v, true)).toBe("dirLeft");
  });

  it("every direction has a text in every language, and the first campaign keeps its old wording", () => {
    for (const code of Object.keys(TEXTS))
      for (const k of ["dirRight", "dirLeft", "dirDown", "dirUp"]) expect(TEXTS[code].ui[k], `${code}.${k}`).toBeTruthy();
    const R = BALANCE.levels.crossroads.map.routes;
    expect(TEXTS.en.ui[routeLabelKey(R.h, false)]).toBe("left → right");
    expect(TEXTS.en.ui[routeLabelKey(R.v, false)]).toBe("top → bottom");
    expect(TEXTS.en.ui[routeLabelKey(R.h, true)]).toBe("top → bottom");
    expect(TEXTS.en.ui[routeLabelKey(R.v, true)]).toBe("right → left");
    expect(TEXTS.de.ui[routeLabelKey(R.v, true)]).toBe("rechts → links");
  });
});
