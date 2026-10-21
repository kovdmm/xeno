// Seasons of the highscore table: the table shows and enters only the current one, the older ones stay in the file,
// and a database made before seasons is migrated once without losing a row.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { migrateSeasons, openDb, type ScoreInput } from "../../server/db";
import { SEASON } from "../../server/limits";

const dirs: string[] = [];
const file = () => {
  const d = mkdtempSync(join(tmpdir(), "scores-seasons-"));
  dirs.push(d);
  return join(d, "scores.db");
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

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
  runHash: "run-" + ++n,
  ...o,
});

/** a database as the service made it before seasons: no season column, one name once per map and difficulty */
const LEGACY = `
  CREATE TABLE scores (
    id INTEGER PRIMARY KEY, level TEXT NOT NULL, diff TEXT NOT NULL, nick TEXT NOT NULL, nick_key TEXT NOT NULL,
    won INTEGER NOT NULL, wave INTEGER NOT NULL, cleared INTEGER NOT NULL, score INTEGER NOT NULL, seconds REAL NOT NULL,
    build TEXT NOT NULL, created INTEGER NOT NULL, ip_hash TEXT NOT NULL, run BLOB NOT NULL, run_hash TEXT NOT NULL UNIQUE,
    UNIQUE (level, diff, nick_key)
  );
  CREATE INDEX scores_rank ON scores (level, diff, won DESC, cleared DESC, score DESC, seconds ASC);
  CREATE TABLE used_tokens (id TEXT PRIMARY KEY, exp INTEGER NOT NULL);
  CREATE TABLE seen_runs (hash TEXT PRIMARY KEY, created INTEGER NOT NULL);
`;
const legacy = (path: string, names: string[]) => {
  const db = new DatabaseSync(path);
  db.exec(LEGACY);
  const ins = db.prepare(
    "INSERT INTO scores (level, diff, nick, nick_key, won, wave, cleared, score, seconds, build, created, ip_hash, run, run_hash) VALUES ('crossroads','easy',?,?,0,10,10,?,300,'old',1,'h',x'00',?)",
  );
  names.forEach((nick, i) => ins.run(nick, nick.toLowerCase(), 1000 - i, "legacy-" + i));
  db.close();
};

describe("seasons", () => {
  it("this release is a new season, after the one that ran before seasons existed", () => {
    expect(SEASON).toBeGreaterThanOrEqual(2);
  });

  it("the table shows, ranks and enters only the current season; the older rows stay in the file", () => {
    const path = file();
    const one = openDb(path, 1);
    one.saveScore(entry({ nick: "Old", score: 5000 }));
    one.close();
    const two = openDb(path, 2);
    expect(two.top(null, null, 10)).toEqual([]); // nothing of season 1 is shown
    const saved = two.saveScore(entry({ nick: "New", score: 100 }));
    expect(saved.rank).toBe(1); // a worse score, but alone in this season
    expect(two.top(null, null, 10).map((r) => r.nick)).toEqual(["New"]);
    // archived, not deleted: the same file still has it, and it can be listed by season
    expect(two.top(null, null, 10, 1).map((r) => r.nick)).toEqual(["Old"]);
    expect(two.seasons()).toEqual([
      { season: 1, n: 1 },
      { season: 2, n: 1 },
    ]);
    expect(two.count()).toBe(2);
    two.close();
  });

  it("a name has its own best in each season", () => {
    const path = file();
    const one = openDb(path, 1);
    one.saveScore(entry({ nick: "Ann", score: 5000 }));
    one.close();
    const two = openDb(path, 2);
    expect(two.saveScore(entry({ nick: "Ann", score: 10 })).improved).toBe(true); // not compared with season 1
    expect(two.saveScore(entry({ nick: "Ann", score: 5 })).improved).toBe(false);
    expect(two.top(null, null, 10).map((r) => r.score)).toEqual([10]);
    expect(two.top(null, null, 10, 1).map((r) => r.score)).toEqual([5000]);
    two.close();
  });
});

describe("the migration of a database made before seasons", () => {
  it("keeps every row as season 1, shows none of them in the new season, and lets the same names enter again", () => {
    const path = file();
    legacy(path, ["Ann", "Bob", "Cy"]);
    const db = openDb(path, 2);
    expect(db.count()).toBe(3);
    expect(db.seasons()).toEqual([{ season: 1, n: 3 }]);
    expect(db.top(null, null, 10)).toEqual([]);
    expect(db.top(null, null, 10, 1).map((r) => r.nick)).toEqual(["Ann", "Bob", "Cy"]);
    // the rule "one entry per name, map and difficulty" is per season now: Ann can enter season 2
    expect(db.saveScore(entry({ nick: "Ann" })).rank).toBe(1);
    expect(db.top(null, null, 10, 1)).toHaveLength(3);
    db.close();
  });

  it("is safe to run again: a second start changes nothing", () => {
    const path = file();
    legacy(path, ["Ann", "Bob"]);
    openDb(path, 2).close();
    const again = openDb(path, 2);
    expect(again.seasons()).toEqual([{ season: 1, n: 2 }]);
    expect(again.top(null, null, 10, 1).map((r) => r.nick)).toEqual(["Ann", "Bob"]);
    again.close();
    // and on a database that already has the column the function says it did nothing
    const raw = new DatabaseSync(path);
    expect(migrateSeasons(raw)).toBe(false);
    raw.close();
  });

  it("a new database starts with the column and loses nothing", () => {
    const db = openDb(":memory:", 2);
    db.saveScore(entry());
    expect(db.seasons()).toEqual([{ season: 2, n: 1 }]);
    db.close();
  });
});
