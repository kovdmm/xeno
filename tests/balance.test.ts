import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { BALANCE, parseBalance, validateBalance } from "../src/game/balance";
import { createGame, type GameApi } from "../src/game/game";
import type { GameEvent } from "../src/game/types";
import { towerStats } from "../src/game/rules";
import { mulberry32, run } from "./helpers/load";

const clone = () => structuredClone(BALANCE);
const problems = (mutate: (b: any) => unknown) => {
  const b = clone();
  mutate(b);
  return validateBalance(b);
};
const game = (mutate?: (b: any) => unknown, seed = 1) => {
  const b = clone();
  mutate?.(b);
  const g = createGame({ rng: mulberry32(seed), balance: b });
  g.S.credits = 1e6;
  return g;
};

describe("balance.yaml", () => {
  it("is the only data file and matches the bundled default", () => {
    expect(readdirSync(new URL("../src/game/data/", import.meta.url))).toEqual(["balance.yaml"]);
    const file = parse(readFileSync(new URL("../src/game/data/balance.yaml", import.meta.url), "utf8"));
    expect(file).toEqual(BALANCE);
  });

  it("passes validation", () => {
    expect(validateBalance(BALANCE)).toEqual([]);
    expect(() => parseBalance(clone())).not.toThrow();
  });

  it("contains no text meant for the player (that lives in src/i18n)", () => {
    const text = readFileSync(new URL("../src/game/data/balance.yaml", import.meta.url), "utf8");
    expect(text).not.toMatch(/^s*(name|name_en|desc|desc_en|short|short_en|label|label_en):/m);
  });
});

describe("validation catches mistakes with a path to the culprit", () => {
  it("a missing section", () => {
    expect(problems((b) => delete b.combat)).toEqual(["combat: missing section"]);
  });

  it("a number that is not a number", () => {
    expect(problems((b) => (b.combat.armorFloor = "0.25"))).toEqual([
      'combat.armorFloor: expected a number, got "0.25"',
    ]);
    expect(problems((b) => (b.scaling.unitHp = null))[0]).toMatch(/^scaling\.unitHp: expected a number/);
  });

  it("a tower array of the wrong length", () => {
    expect(problems((b) => b.towers.gun.cost.pop())).toEqual(["towers.gun.cost: expected an array of 4 numbers"]);
  });

  it("an ultimate that touches an unknown stat, divides by zero or repeats a stat", () => {
    expect(problems((b) => (b.towers.gun.ults.mini.mul = { speed: 2 }))[0]).toMatch(
      /ults\.mini\.mul\.speed: unknown tower stat/,
    );
    expect(problems((b) => (b.towers.gun.ults.mini.div.rate = 0))[0]).toMatch(/ults\.mini\.div\.rate: must be >=/);
    expect(problems((b) => (b.towers.gun.ults.mini.mul = { rate: 2 }))[0]).toMatch(/only one operation/);
    expect(problems((b) => (b.towers.gun.ults.sniper.set.prio = "weakest"))[0]).toMatch(
      /ults\.sniper\.set\.prio: bad value/,
    );
  });

  it("a duplicated hotkey", () => {
    expect(problems((b) => (b.towers.cannon.key = "1"))).toEqual(["hotkeys: tower and ability hotkeys must be unique"]);
  });

  it("an unknown enemy in a wave cycle, or one without a count formula", () => {
    expect(problems((b) => (b.waves.cycle[0] = "dragon"))[0]).toMatch(/waves\.cycle\[0\]: bad enemy "dragon"/);
    expect(problems((b) => delete b.waves.counts.runner)[0]).toMatch(/waves\.counts\.runner: no count formula/);
  });

  it("routes that leave the board or are not unit steps", () => {
    expect(problems((b) => (b.levels.crossroads.map.routes.h.exit[0] = [99, 0]))[0]).toMatch(/outside the board/);
    expect(problems((b) => (b.levels.crossroads.map.routes.v.dir = [1, 1]))[0]).toMatch(/unit step/);
  });

  it("nonsensical economy values", () => {
    expect(problems((b) => (b.economy.sellRefund = 1.5))[0]).toMatch(/sellRefund: must be <= 1/);
    expect(problems((b) => (b.scaling.rampLength = 0))[0]).toMatch(/rampLength: must be > 0/);
  });

  it("missing or extra towers, enemies, difficulties, abilities", () => {
    expect(problems((b) => delete b.towers.rail)).toEqual(["towers.rail: missing"]);
    expect(problems((b) => (b.enemies.dragon = b.enemies.crawler))).toEqual(["enemies.dragon: unknown key"]);
    expect(problems((b) => delete b.difficulty.insane)).toEqual(["difficulty.insane: missing"]);
    expect(problems((b) => delete b.abilities.nuke.delay)[0]).toMatch(/abilities\.nuke\.delay/);
  });

  it("parseBalance throws with every problem listed", () => {
    const b = clone();
    delete (b.towers as Partial<typeof b.towers>).rail;
    b.combat.armorFloor = NaN;
    expect(() => parseBalance(b)).toThrow(/towers\.rail: missing/);
    expect(() => parseBalance(b)).toThrow(/combat\.armorFloor/);
  });
});

describe("the numbers really drive the game (an injected balance changes behaviour)", () => {
  it("sell refund", () => {
    const t = (g: GameApi) => {
      const r = g.place("gun", 5, 5);
      if (!r.ok) throw new Error(r.code);
      return r.tower;
    };
    const a = game(),
      b = game((x) => (x.economy.sellRefund = 0.5));
    expect(a.sell(t(a))).toBe(10);
    expect(b.sell(t(b))).toBe(7);
  });

  it("tower prices and starting credits", () => {
    const g = game((b) => {
      b.towers.gun.cost[0] = 99;
      b.difficulty.easy.credits = 120;
    });
    g.S.credits = g.balance.difficulty.easy.credits;
    expect(g.place("gun", 5, 5).ok).toBe(true);
    expect(g.S.credits).toBe(21);
    expect(g.newGame("easy").credits).toBe(120);
  });

  it("an ultimate is plain data: change a multiplier and the stats follow", () => {
    const b = clone();
    b.towers.gun.ults.sniper.mul!.dmg = 10;
    expect(towerStats(b, "gun", 4, "sniper").dmg).toBe(b.towers.gun.dmg[3] * 10);
    expect(towerStats(BALANCE, "gun", 4, "sniper").dmg).toBe(BALANCE.towers.gun.dmg[3] * 6);
  });

  it("the board size (an injected 10x8 board with its own routes)", () => {
    const g = game((b) => {
      b.levels.crossroads.map = {
        width: 10,
        height: 8,
        routes: {
          h: { spawn: [[0, 3]], exit: [[9, 3]], dir: [1, 0] },
          v: { spawn: [[4, 0]], exit: [[4, 7]], dir: [0, 1] },
        },
      };
    });
    expect(g.S.grid).toHaveLength(80);
    expect(g.placeCheck(0, 3)).toBe("pcRes");
    expect(g.placeCheck(12, 3)).toBe("out");
    expect(g.routePath("h")).toHaveLength(12);
    g.sendWave();
    run(g, 30);
    expect(g.S.creeps.length + g.S.lives).toBeGreaterThan(0);
  });

  it("wave composition: counts, caps and the boss cycle", () => {
    const g = game((b) => {
      b.waves.counts.crawler = { base: 3, divisor: 1000 };
      b.waves.bossEvery = 4;
    });
    expect(g.makeWave(1).list).toHaveLength(3); // wave 1 is a crawler wave
    expect(g.makeWave(4).type).toBe("boss");
    expect(g.makeWave(10).type).not.toBe("boss"); // no longer a multiple of 4
  });

  it("the wave clear bonus and score", () => {
    const g = game((b) => {
      b.economy.waveClearBonus = { base: 100, perWave: 0 };
      b.economy.score = { perReward: 1, perWave: 0 };
    });
    for (let x = 4; x < 14; x++) g.place("gun", x, 5);
    g.sendWave();
    const events: Extract<GameEvent, { type: "toast" }>[] = [];
    g.on((e) => e.type === "toast" && events.push(e));
    run(g, 120);
    expect(events.find((e) => e.key === "cleared")!.vars!.b).toBe(100);
    expect(g.S.score).toBeGreaterThan(0);
    expect(g.S.score).toBeLessThan(500); // with perReward 10 it would be many times that
  });

  it("combat constants: armor floor", () => {
    const g = game((b) => (b.combat.armorFloor = 1)); // armor can never reduce damage
    g.sendWave();
    run(g, 0.2);
    const c = g.S.creeps[0];
    c.armor = 1000;
    c.hp = c.max = 1000;
    g.place("gun", 5, 5);
    c.x = 5;
    c.y = 5;
    c.ox = c.oy = 0;
    run(g, 1);
    expect(c.max - c.hp).toBeGreaterThan(5); // at the default 25% floor one second of fire is ~13 at best
  });

  it("ability numbers and cheats", () => {
    const g = game((b) => {
      b.abilities.stasis.slow = 0.1;
      b.abilities.stasis.duration = 3;
      delete b.economy.cheats.hesoyam;
      b.economy.cheats.xyzzy = { minLives: 7, credits: 5 };
    });
    g.sendWave();
    run(g, 0.2);
    g.cast("stasis");
    expect(g.S.creeps.every((c) => c.slow === 0.1 && c.slowT > 2.9 && c.slowT <= 3)).toBe(true);
    expect(g.S.stasisT).toBe(3);
    const lives = g.S.lives;
    expect(g.cheat("xyzzy")).toEqual({ lives: Math.max(lives, 7), credits: 5 });
    expect(g.cheat("hesoyam")).toBeNull(); // not in this balance
  });
});
