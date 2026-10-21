// The Xenopedia model: a page for everything in the game's data, in every language, with the numbers the game uses.
import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/game/balance";
import { createGame } from "../src/game/game";
import type { DiffKey } from "../src/game/types";
import { TEXTS } from "../src/i18n/texts";
import { buildPedia, PEDIA_WAVES, type PediaSource } from "../src/xenopedia/model";

const CODES = ["en", "ru", "de", "ua", "sv"] as const;
const source = (c: (typeof CODES)[number]): PediaSource => ({
  B: BALANCE,
  text: (path) => path.split(".").reduce((o: any, k) => o?.[k], TEXTS[c].game) ?? path,
});
const DIFFS = Object.keys(BALANCE.difficulty) as DiffKey[];

describe("the Xenopedia has a page for everything in the data", () => {
  const pedia = buildPedia(source("en"));

  it("every tower, ultimate, enemy and ability, in the order of the data", () => {
    expect(pedia.towers.map((t) => t.id)).toEqual(Object.keys(BALANCE.towers));
    expect(pedia.enemies.map((e) => e.id)).toEqual(Object.keys(BALANCE.enemies));
    expect(pedia.abilities.map((a) => a.id)).toEqual(Object.keys(BALANCE.abilities));
    for (const t of pedia.towers) expect(t.ultimates.map((u) => u.id)).toEqual(Object.keys(BALANCE.towers[t.id].ults));
  });

  it.each(CODES)("%s: every page has its words, never the path of a missing text", (c) => {
    const p = buildPedia(source(c));
    const words: [string, string][] = [
      ...p.towers.flatMap(
        (t) =>
          [
            [t.id, t.name],
            [t.id + " desc", t.desc],
            ...t.ultimates.flatMap((u) => [
              [u.id, u.name],
              [u.id + " desc", u.desc],
            ]),
          ] as [string, string][],
      ),
      ...p.enemies.map((e) => [e.id, e.name] as [string, string]),
      ...p.abilities.flatMap(
        (a) =>
          [
            [a.id, a.name],
            [a.id + " desc", a.desc],
          ] as [string, string][],
      ),
    ];
    for (const [what, w] of words) {
      expect(w.trim(), what).not.toBe("");
      expect(w, what).not.toMatch(/^(towers|enemies|abilities)\./);
    }
  });

  it("all numbers are finite and the levels get stronger", () => {
    const nums = (o: unknown): number[] =>
      typeof o === "number" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(nums) : [];
    for (const n of nums(pedia)) expect(Number.isFinite(n)).toBe(true);
    for (const t of pedia.towers) {
      expect(t.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
      for (let i = 1; i < 4; i++) expect(t.levels[i].dps, t.id).toBeGreaterThan(t.levels[i - 1].dps);
      for (const u of t.ultimates) expect(u.row.level).toBe(5);
    }
    for (const e of pedia.enemies) {
      expect(e.rows.map((r) => r.wave)).toEqual([...PEDIA_WAVES]);
      for (const d of DIFFS)
        for (let i = 1; i < e.rows.length; i++)
          expect(e.rows[i].hp[d], `${e.id} ${d}`).toBeGreaterThan(e.rows[i - 1].hp[d]);
    }
  });
});

describe("the numbers are the game's own, so a page cannot go stale", () => {
  const pedia = buildPedia(source("en"));

  it("a tower's rows are what a built tower has, and the ultimate's row what an upgraded one has", () => {
    for (const t of pedia.towers) {
      const g = createGame({ level: "crossroads" });
      g.newGame("easy", "crossroads");
      g.cheat("hesoyam");
      const tower = g.place(t.id, 5, 5);
      if (!tower.ok) throw new Error("cannot place " + t.id);
      for (let i = 0; i < 4; i++) {
        const row = t.levels[i];
        expect(g.stats(tower.tower), `${t.id} level ${row.level}`).toEqual(row.stats);
        if (i < 3) {
          expect(g.upCost(tower.tower), `${t.id} price of level ${row.level + 1}`).toBe(t.levels[i + 1].cost);
          g.upgrade(tower.tower);
        }
      }
      expect(g.upCost(tower.tower), `${t.id} ultimate price`).toBe(t.ultimates[0].row.cost);
      expect(t.levels[0].cost).toBe(BALANCE.towers[t.id].cost[0]);
      g.upgrade(tower.tower);
      for (const u of t.ultimates) {
        const copy = createGame({ level: "crossroads" });
        copy.newGame("easy", "crossroads");
        copy.cheat("hesoyam");
        const x = copy.place(t.id, 5, 5);
        if (!x.ok) throw new Error("cannot place");
        for (let i = 0; i < 3; i++) copy.upgrade(x.tower);
        expect(copy.upgrade(x.tower, u.id).ok, `${t.id} ${u.id}`).toBe(true);
        expect(copy.stats(x.tower), `${t.id} ${u.id}`).toEqual(u.row.stats);
        // the first overclock costs what the page says
        expect(copy.upCost(x.tower), `${t.id} overclock`).toBe(t.overclock.firstCost);
      }
    }
  });

  it("an enemy's health, armour and reward are those of a creep of that wave on that difficulty", () => {
    for (const diff of DIFFS) {
      const g = createGame({ level: "switchback" }); // the map with hp 1
      g.newGame(diff, "switchback");
      g.sendWave(); // wave 1: crawlers
      for (let i = 0; i < 200 && !g.S.creeps.length; i++) g.step(0.05);
      const c = g.S.creeps[0];
      const row = pedia.enemies.find((e) => e.id === c.type)!.rows.find((r) => r.wave === 1)!;
      expect([c.max, c.armor, c.rw], diff).toEqual([row.hp[diff], row.armor[diff], row.reward[diff]]);
    }
  });

  it("an ability's price on a wave is the game's price", () => {
    for (const diff of DIFFS)
      for (const a of pedia.abilities) {
        const g = createGame();
        g.newGame(diff);
        expect(g.abCost(a.id), `${a.id} ${diff}`).toBe(a.costs.find((r) => r.wave === 1)!.cost[diff]);
      }
  });

  it("changing the balance changes the page", () => {
    const b = structuredClone(BALANCE);
    b.towers.gun.dmg[0] *= 2;
    b.abilities.nuke.base += 100;
    const p = buildPedia({ ...source("en"), B: b });
    expect(p.towers[0].levels[0].stats.dmg).toBe(pedia.towers[0].levels[0].stats.dmg * 2);
    const nuke = (q: typeof pedia) => q.abilities.find((a) => a.id === "nuke")!.costs[0].cost.easy;
    expect(nuke(p)).toBeGreaterThan(nuke(pedia));
  });
});
