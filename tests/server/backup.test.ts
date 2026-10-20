import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../../server/db";

describe("the backup", () => {
  it("is a consistent copy that opens as a database of its own, and refuses to overwrite", () => {
    const dir = mkdtempSync(join(tmpdir(), "scores-backup-"));
    const db = openDb(join(dir, "live.db"));
    db.saveScore({
      level: "crossroads",
      diff: "easy",
      nick: "Ann",
      won: false,
      wave: 9,
      cleared: 7,
      score: 100,
      seconds: 60,
      build: "b",
      created: 1,
      ipHash: "h",
      run: { v: 1 },
      runHash: "r1",
    });
    const file = join(dir, "copy.db");
    db.backup(file);
    db.saveScore({
      ...{
        level: "crossroads",
        diff: "easy",
        nick: "Bob",
        won: false,
        wave: 1,
        cleared: 1,
        score: 1,
        seconds: 1,
        build: "b",
        created: 2,
        ipHash: "h",
        run: {},
      },
      runHash: "r2",
    });
    const copy = openDb(file);
    expect(copy.top("crossroads", "easy", 10).map((r) => r.nick)).toEqual(["Ann"]); // as it was when it was made
    expect(() => db.backup(file)).toThrow();
    copy.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
});
