// Levels: boards, routes and walls that come from the balance data. Every level in the data is played, and
// the rules that make a level valid are checked on purpose-built bad ones.
import { describe, expect, it } from "vitest";
import { BALANCE, validateBalance } from "../src/game/balance";
import { createGame } from "../src/game/game";
import { cellsOf, levelIds, makeLevel, routeKeys, wallSet } from "../src/game/level";
import { mulberry32 } from "./helpers/load";

const clone = () => JSON.parse(JSON.stringify(BALANCE));
const game = (level, b = BALANCE, seed = 1) => {
  const g = createGame({ balance: b, rng: mulberry32(seed), level });
  g.newGame("easy", level);
  return g;
};
const problems = (mutate) => {
  const b = clone();
  mutate(b);
  return validateBalance(b);
};
const L0 = (b) => b.levels.crossroads.map;

describe("the levels in the data", () => {
  it("there are several, the first is the default, and each is valid", () => {
    expect(levelIds(BALANCE)).toEqual(["crossroads", "switchback", "fronts", "corner"]);
    expect(validateBalance(BALANCE)).toEqual([]);
    expect(createGame().level.id).toBe("crossroads");
  });

  it.each(levelIds(BALANCE))("%s: the board, the routes and the fields follow the data", (id) => {
    const g = game(id);
    const L = makeLevel(BALANCE, id);
    expect(g.level.id).toBe(id);
    expect(g.S.level).toBe(id);
    expect(g.S.grid).toHaveLength(L.width * L.height);
    expect(Object.keys(g.S.fields).sort()).toEqual(routeKeys(L).sort());
    for (const r of routeKeys(L)) {
      expect(g.S.fields[r]).toHaveLength(L.width * L.height);
      // every spawn cell is connected to the exit
      for (const [x, y] of L.routes[r].spawn) expect(g.S.fields[r][y * L.width + x]).toBeLessThan(1e6);
      const path = g.routePath(r);
      const last = path.at(-1);
      const exits = L.routes[r].exit.map((c) => c.join(","));
      const before = path.at(-2);
      expect(exits).toContain(before!.join(",")); // the road ends on an exit cell...
      expect(last).not.toEqual(before); // ...and goes on outside the board
    }
  });

  it.each(levelIds(BALANCE))("%s: a few waves cross the board and end (killed or through the gate)", (id) => {
    const g = game(id);
    g.S.lives = 1e6; // no towers: everything gets through, the game must not end meanwhile
    const start = g.S.lives;
    for (let w = 1; w <= 6; w++) {
      g.sendWave();
      g.S.timer = Infinity; // the next wave is called by hand
      for (let t = 0; t < 1200 && (g.S.creeps.length || g.S.spawners.length) && !g.S.over; t += 0.05) g.step(0.05);
      expect(g.S.creeps.length, `${id} wave ${w}`).toBe(0);
    }
    expect(g.S.lives).toBeLessThan(start); // they reached the exit and were counted
  });

  it.each(levelIds(BALANCE))("%s: enemies come in through the spawn cells and the first steps follow dir", (id) => {
    const g = game(id);
    const L = g.level;
    g.sendWave();
    g.step(0.5);
    const c = g.S.creeps.find((e) => !e.fly);
    if (!c) return;
    const R = L.routes[c.route];
    // the creep is on the line of its spawn cells, one step outside the board or just inside it
    expect(R.spawn.some(([sx, sy]) => Math.abs(c.x - sx) <= 1.5 && Math.abs(c.y - sy) <= 1.5)).toBe(true);
  });
});

describe("routes", () => {
  it("a level with one route sends every wave down it and never calls a wave 'both'", () => {
    const g = game("switchback");
    for (let n = 1; n <= 80; n++) {
      const w = g.makeWave(n);
      expect(w.route, `wave ${n}`).toBe("main");
      for (const e of w.list) expect(e.route).toBe("main");
    }
  });

  it("three routes take turns, and every so often a wave uses all three", () => {
    const g = game("fronts");
    const seen = new Set();
    for (let n = 1; n <= 12; n++) seen.add(g.makeWave(n).route);
    for (const r of ["east", "south", "west"]) expect(seen.has(r), r).toBe(true);
    const both = Array.from({ length: 80 }, (_, i) => g.makeWave(i + 1)).find((w) => w.route === "both");
    expect(both).toBeDefined();
    expect(new Set(both!.list.map((e) => e.route)).size).toBeGreaterThan(1);
  });

  it("two routes alternate exactly as before: odd waves h, even waves v", () => {
    const g = game("crossroads");
    expect([1, 2, 3, 4].map((n) => g.makeWave(n).route)).toEqual(["h", "v", "h", "v"]);
  });

  it("the final wave comes at the level's own end", () => {
    for (const id of levelIds(BALANCE)) {
      const g = game(id);
      const fin = g.level.finalWave;
      expect(g.makeWave(fin).type).toBe("queen");
      expect(g.makeWave(fin - 1).type).not.toBe("queen");
    }
  });

  it("enemies leave along exitDir: the corner level lets them out through the bottom", () => {
    const g = game("corner");
    const lives = g.S.lives;
    g.sendWave();
    for (let t = 0; t < 400 && g.S.lives === lives; t += 0.05) g.step(0.05);
    expect(g.S.lives).toBeLessThan(lives); // one got through
    const p = g.routePath("main");
    expect(p.at(-1)![1]).toBe(g.level.height); // one step below the bottom row
  });
});

describe("walls", () => {
  it("cannot be built on and are never walked through", () => {
    const g = game("switchback");
    g.cheat("hesoyam");
    expect(g.placeCheck(5, 4)).toBe("pcWall"); // a wall cell has its own message
    const [gx, gy] = g.level.routes.main.spawn[0];
    expect(g.placeCheck(gx, gy)).toBe("pcRes"); // a gate keeps the entrance text
    expect(g.placeCheck(5, 5)).toBe(""); // next to it
    const L = g.level,
      walls = wallSet(L);
    expect(walls.size).toBe(40);
    for (const [x, y] of g.routePath("main")) if (x >= 0 && y >= 0 && x < L.width && y < L.height) expect(walls.has(y * L.width + x)).toBe(false);
  });

  it("make the road long: the walk is much longer than the straight line", () => {
    const g = game("switchback");
    expect(g.routePath("main").length).toBeGreaterThan(60);
  });

  it("towers that would seal the road are still refused", () => {
    const g = game("switchback");
    g.cheat("hesoyam");
    // the gap in the first wall is x 20..23 on row 4: fill three of the four cells...
    for (const x of [20, 21, 22]) expect(g.place("gun", x, 4).ok).toBe(true);
    // ...the fourth would close it
    expect(g.placeCheck(23, 4)).toBe("pcBlock");
  });

  it("blocks of cells expand to cells", () => {
    expect(cellsOf([{ x: 1, y: 2, w: 2, h: 2 }])).toEqual([[1, 2], [2, 2], [1, 3], [2, 3]]);
  });
});

describe("changing the level", () => {
  it("newGame(difficulty, level) switches the board and starts clean", () => {
    const g = createGame({ rng: mulberry32(3) });
    g.newGame("easy");
    g.cheat("hesoyam");
    g.place("gun", 5, 5);
    const crossroads = g.S;
    g.newGame("hard", "fronts");
    expect(g.level.id).toBe("fronts");
    expect(g.S).not.toBe(crossroads);
    expect(g.S.towers).toEqual([]);
    expect(g.S.grid).toHaveLength(23 * 15);
    expect(g.difficulty()).toBe("hard");
    g.newGame("hard"); // no level given: the board stays
    expect(g.level.id).toBe("fronts");
  });

  it("an unknown level is ignored", () => {
    const g = game("corner");
    g.newGame("easy", "nowhere");
    expect(g.level.id).toBe("corner");
    expect(createGame({ level: "nowhere" }).level.id).toBe("crossroads");
  });

  it("the simulation of the first level is what it always was (the golden file covers it in full)", () => {
    const a = game("crossroads", BALANCE, 5);
    a.cheat("hesoyam");
    a.place("gun", 5, 5);
    a.sendWave();
    for (let i = 0; i < 400; i++) a.step(0.05);
    const b = createGame({ rng: mulberry32(5) });
    b.cheat("hesoyam");
    b.place("gun", 5, 5);
    b.sendWave();
    for (let i = 0; i < 400; i++) b.step(0.05);
    expect(JSON.stringify([a.S.credits, a.S.score, a.S.lives])).toBe(JSON.stringify([b.S.credits, b.S.score, b.S.lives]));
  });
});

describe("what makes a level valid", () => {
  it("needs a level, a good id, a size and a length", () => {
    expect(problems((b) => (b.levels = {}))[0]).toMatch(/levels: expected at least one level/);
    expect(problems((b) => (b.levels.Bad_Id = b.levels.crossroads))[0]).toMatch(/the id must be lower case/);
    expect(problems((b) => (L0(b).width = 2))[0]).toMatch(/map\.width: must be >= 3/);
    expect(problems((b) => (b.levels.crossroads.finalWave = 0))[0]).toMatch(/finalWave/);
  });

  it("gates: on the board, on the edge, a unit step, not shared", () => {
    expect(problems((b) => (L0(b).routes.h.exit[0] = [99, 0]))[0]).toMatch(/outside the board/);
    expect(problems((b) => (L0(b).routes.v.dir = [1, 1]))[0]).toMatch(/unit step/);
    expect(problems((b) => (L0(b).routes.h.exitDir = [2, 0]))[0]).toMatch(/exitDir.*unit step/);
    expect(problems((b) => (L0(b).routes.h.spawn[1] = [3, 7]))[0]).toMatch(/not on the edge/);
    expect(problems((b) => (L0(b).routes.h.exit[0] = [20, 7]))[0]).toMatch(/not on the edge/);
    expect(problems((b) => (L0(b).routes.v.spawn[0] = [0, 6]))[0]).toMatch(/gate twice|not on the edge/);
    expect(problems((b) => (L0(b).routes = {}))[0]).toMatch(/at least one route/);
    expect(problems((b) => (L0(b).routes.Up = L0(b).routes.h))[0]).toMatch(/route name/);
  });

  it("walls: whole blocks on the board, not on a gate", () => {
    const withWall = (w) => problems((b) => (b.levels.switchback.map.walls = [w]));
    expect(withWall({ x: 1, y: 1, w: 0, h: 1 })[0]).toMatch(/at least 1/);
    expect(withWall({ x: 1.5, y: 1, w: 1, h: 1 })[0]).toMatch(/whole numbers/);
    expect(withWall({ x: 22, y: 5, w: 5, h: 1 })[0]).toMatch(/outside the board/);
    expect(withWall({ x: 0, y: 1, w: 1, h: 1 })[0]).toMatch(/covers the gate cell \[0, 1\]/);
    expect(problems((b) => (b.levels.switchback.map.walls = "x"))[0]).toMatch(/list of blocks/);
  });

  it("a spawn that cannot reach its exit is refused, with the cell named", () => {
    const sealed = problems((b) => (b.levels.switchback.map.walls = [{ x: 0, y: 4, w: 24, h: 1 }]));
    expect(sealed.some((p) => /spawn: \[0, 1\] cannot reach the exit/.test(p))).toBe(true);
  });
});
