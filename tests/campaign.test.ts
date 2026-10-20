// The campaign rules and the unlock data: which maps × difficulties are open, from the best waves.
import { describe, expect, it } from "vitest";
import { BALANCE, validateBalance } from "../src/game/balance";
import { campaignOf, lockOf } from "../src/game/campaign";

const { maps, diffs } = campaignOf(BALANCE);
const [m0, m1, m2, m3] = maps.map((m) => m.id);
const bests =
  (table: Record<string, number> = {}) =>
  (level: string, diff: string) =>
    table[`${level}/${diff}`] ?? 0;
const open = (table: Record<string, number>) =>
  maps.flatMap((m) => diffs.filter((d) => !lockOf(maps, diffs, m.id, d, bests(table))).map((d) => `${m.id}/${d}`));

describe("the campaign data", () => {
  it("lists the maps in the order of the campaign and the difficulties from the easiest", () => {
    expect([m0, m1, m2, m3]).toEqual(["switchback", "corner", "crossroads", "fronts"]);
    expect(diffs).toEqual(["easy", "normal", "hard", "insane"]);
  });

  it("every map has a difficulty threshold, every map but the last a next-map threshold, all reachable", () => {
    for (const [i, m] of maps.entries()) {
      const final = BALANCE.levels[m.id].finalWave;
      expect(m.unlock.difficulty, m.id).toBeGreaterThan(0);
      expect(m.unlock.difficulty, m.id).toBeLessThanOrEqual(final);
      if (i < maps.length - 1) {
        expect(m.unlock.nextMap, m.id).toBeGreaterThan(0);
        expect(m.unlock.nextMap, m.id).toBeLessThanOrEqual(final);
      } else expect(m.unlock.nextMap).toBeUndefined();
    }
  });

  it("validation catches a missing or unreachable threshold and a next-map threshold on the last map", () => {
    const problems = (mutate: (b: any) => unknown) => {
      const b = structuredClone(BALANCE) as any;
      mutate(b);
      return validateBalance(b);
    };
    expect(problems((b) => delete b.levels.corner.unlock)[0]).toMatch(/levels\.corner\.unlock: expected/);
    expect(problems((b) => delete b.levels.corner.unlock.nextMap)[0]).toMatch(/levels\.corner\.unlock\.nextMap/);
    expect(problems((b) => (b.levels.corner.unlock.difficulty = 81))[0]).toMatch(/above the final wave/);
    expect(problems((b) => (b.levels.fronts.unlock.nextMap = 5))[0]).toMatch(/opens nothing after it/);
  });
});

describe("what is open", () => {
  it("at the start only the first map on the easiest difficulty", () => {
    expect(open({})).toEqual(["switchback/easy"]);
  });

  it("a difficulty opens when the best wave on the previous one reaches the map's threshold", () => {
    const need = maps[0].unlock.difficulty;
    expect(open({ "switchback/easy": need - 1 })).toEqual(["switchback/easy"]);
    expect(open({ "switchback/easy": need })).toEqual(["switchback/easy", "switchback/normal"]);
    expect(open({ "switchback/easy": need, "switchback/normal": need })).toEqual([
      "switchback/easy",
      "switchback/normal",
      "switchback/hard",
    ]);
  });

  it("the next map opens (on easy only) with the best wave on easy of the previous one", () => {
    const next = maps[0].unlock.nextMap!;
    expect(open({ "switchback/easy": next - 1 })).not.toContain("corner/easy");
    const o = open({ "switchback/easy": next });
    expect(o).toContain("corner/easy");
    expect(o).not.toContain("corner/normal"); // a difficulty needs its own record on the map
    // a record on another difficulty of the previous map does not count for the map lock
    expect(open({ "switchback/normal": 999 })).not.toContain("corner/easy");
  });

  it("a closed map shows its own lock, a closed difficulty shows the previous difficulty", () => {
    const b = bests({ "switchback/easy": 5 });
    expect(lockOf(maps, diffs, m1, "easy", b)).toEqual({ kind: "map", from: m0, need: maps[0].unlock.nextMap });
    expect(lockOf(maps, diffs, m1, "hard", b)).toEqual({ kind: "map", from: m0, need: maps[0].unlock.nextMap });
    expect(lockOf(maps, diffs, m0, "hard", b)).toEqual({
      kind: "difficulty",
      from: "normal",
      need: maps[0].unlock.difficulty,
    });
    expect(lockOf(maps, diffs, m0, "easy", b)).toBeNull();
  });

  it("with every record at the final wave everything is open, the last map has no next", () => {
    const all = Object.fromEntries(
      maps.flatMap((m) => diffs.map((d) => [`${m.id}/${d}`, BALANCE.levels[m.id].finalWave])),
    );
    expect(open(all)).toHaveLength(maps.length * diffs.length);
    expect(lockOf(maps, diffs, "nowhere", "easy", bests())).toBeNull(); // unknown ids are not this rule's business
  });
});
