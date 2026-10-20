import { describe, it, expect } from "vitest";
import { better, openDb, type ScoreInput } from "../../server/db";

let n = 0;
const entry = (o: Partial<ScoreInput> = {}): ScoreInput => ({
  level: "crossroads",
  diff: "easy",
  nick: "Ann",
  won: false,
  wave: 10,
  cleared: 10,
  score: 1000,
  seconds: 300,
  build: "b",
  created: 1_700_000_000,
  ipHash: "h",
  run: { v: 1 },
  runHash: "run-" + ++n, // every entry is another game unless a test says otherwise
  ...o,
});

describe("the ranking", () => {
  it("a win beats a loss, then more waves cleared, the higher score, the shorter game", () => {
    expect(better(entry({ won: true, cleared: 1 }), entry({ won: false, cleared: 99 }))).toBe(true);
    expect(better(entry({ cleared: 11 }), entry({ cleared: 10, score: 99999 }))).toBe(true);
    expect(better(entry({ score: 1001 }), entry({ score: 1000, seconds: 1 }))).toBe(true);
    expect(better(entry({ seconds: 299 }), entry({ seconds: 300 }))).toBe(true);
    expect(better(entry(), entry())).toBe(false);
  });

  it("the wave called does not rank: only the waves cleared do", () => {
    // 40 waves called but 5 dealt with, against 20 called and 8 dealt with
    expect(better(entry({ wave: 40, cleared: 5 }), entry({ wave: 20, cleared: 8 }))).toBe(false);
    expect(better(entry({ wave: 20, cleared: 8 }), entry({ wave: 40, cleared: 5 }))).toBe(true);
    const db = openDb(":memory:");
    db.saveScore(entry({ nick: "stacker", wave: 40, cleared: 5 }));
    db.saveScore(entry({ nick: "steady", wave: 20, cleared: 8 }));
    expect(db.top("crossroads", "easy", 10).map((r) => r.nick)).toEqual(["steady", "stacker"]);
  });
});

describe("the table", () => {
  it("lists the best first and numbers the places", () => {
    const db = openDb(":memory:");
    db.saveScore(entry({ nick: "low", cleared: 5 }));
    db.saveScore(entry({ nick: "high", cleared: 50 }));
    db.saveScore(entry({ nick: "winner", won: true, cleared: 20 }));
    db.saveScore(entry({ nick: "mid", cleared: 20, score: 5 }));
    const rows = db.top("crossroads", "easy", 10);
    expect(rows.map((r) => r.nick)).toEqual(["winner", "high", "mid", "low"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the maps and difficulties apart", () => {
    const db = openDb(":memory:");
    db.saveScore(entry({ level: "switchback" }));
    db.saveScore(entry({ diff: "hard" }));
    expect(db.top("crossroads", "easy", 10)).toHaveLength(0);
    expect(db.top("switchback", "easy", 10)).toHaveLength(1);
    expect(db.top("crossroads", "hard", 10)).toHaveLength(1);
  });

  it("a name keeps its best result only, whatever the case; a worse one changes nothing", () => {
    const db = openDb(":memory:");
    const a = db.saveScore(entry({ nick: "Ann", cleared: 10 }));
    expect(a).toMatchObject({ rank: 1, improved: true });
    const worse = db.saveScore(entry({ nick: "ANN", cleared: 5 }));
    expect(worse).toMatchObject({ id: a.id, improved: false, rank: 1 });
    const better2 = db.saveScore(entry({ nick: "ann", cleared: 12 }));
    expect(better2).toMatchObject({ id: a.id, improved: true });
    const rows = db.top("crossroads", "easy", 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ nick: "ann", cleared: 12 });
  });

  it("the place after saving is the place in the list, equal results ranked by age", () => {
    const db = openDb(":memory:");
    const first = db.saveScore(entry({ nick: "first" }));
    const second = db.saveScore(entry({ nick: "second" })); // exactly as good, later
    const best = db.saveScore(entry({ nick: "best", cleared: 99 }));
    expect([first.rank, second.rank, best.rank]).toEqual([1, 2, 1]);
    expect(db.top("crossroads", "easy", 10).map((r) => r.nick)).toEqual(["best", "first", "second"]);
    expect(db.saveScore(entry({ nick: "first", cleared: 1 })).rank).toBe(2); // not improved: its place is unchanged
  });

  it("limits the list", () => {
    const db = openDb(":memory:");
    for (let i = 0; i < 30; i++) db.saveScore(entry({ nick: "p" + i, cleared: i }));
    expect(db.top("crossroads", "easy", 5).map((r) => r.cleared)).toEqual([29, 28, 27, 26, 25]);
  });

  it("a game is entered once: its hash is remembered, also when it did not improve the name's place", () => {
    const db = openDb(":memory:");
    db.saveScore(entry({ nick: "a", cleared: 10, runHash: "g1" }));
    expect(db.hasRun("g1")).toBe(true);
    expect(db.hasRun("g2")).toBe(false);
    db.saveScore(entry({ nick: "a", cleared: 3, runHash: "g2" })); // worse: not entered, but seen
    expect(db.hasRun("g2")).toBe(true);
  });

  it("the administrator can remove an entry or a name", () => {
    const db = openDb(":memory:");
    const a = db.saveScore(entry({ nick: "a" }));
    db.saveScore(entry({ nick: "b" }));
    db.saveScore(entry({ nick: "b", level: "switchback" }));
    expect(db.removeScore(a.id)).toBe(1);
    expect(db.removeNick("B")).toBe(2);
    expect(db.count()).toBe(0);
  });
});

describe("seed tokens", () => {
  it("are used once, can be given back, and are forgotten after they expire", () => {
    const db = openDb(":memory:");
    expect(db.useToken("t1", 100)).toBe(true);
    expect(db.useToken("t1", 100)).toBe(false);
    db.releaseToken("t1");
    expect(db.useToken("t1", 100)).toBe(true);
    db.purgeTokens(101);
    expect(db.useToken("t1", 100)).toBe(true); // forgotten (and too old to be accepted by the api anyway)
  });
});
