import { describe, it, expect, beforeEach } from "vitest";
import { loadXT, run } from "./helpers/load.js";

let C, events;
function fresh(diff = "easy", seed = 1) {
  C = loadXT(["core"], { seed }).core;
  events = [];
  C.on((e) => events.push(e));
  C.newGame(diff);
  C.S.credits = 1e6;
  return C;
}
const count = (type) => events.filter((e) => e.type === type).length;
const wall = (x, skipY = -1) => {
  for (let y = 0; y < C.H; y++) if (y !== skipY) expect(C.place("gun", x, y).ok).toBe(true);
};

describe("data tables", () => {
  beforeEach(() => fresh());

  it("every tower has 4 levels of cost/dmg/rate/range and two ultimates", () => {
    expect(C.TKEYS.length).toBe(8);
    for (const k of C.TKEYS) {
      const d = C.TT[k];
      for (const f of ["cost", "dmg", "rate", "range"]) expect(d[f], `${k}.${f}`).toHaveLength(4);
      expect(Object.keys(d.ults), k).toHaveLength(2);
      expect(d.name && d.name_en && d.desc && d.desc_en, k).toBeTruthy();
    }
  });

  it("tower hotkeys, ability hotkeys and difficulty keys are unique and complete", () => {
    const keys = [...C.TKEYS.map((k) => C.TT[k].key), ...C.AKEYS.map((k) => C.AB[k].key)];
    expect(new Set(keys).size).toBe(keys.length);
    expect(C.DKEYS).toEqual(["easy", "normal", "hard", "insane"]);
  });

  it("every difficulty and ability is localised", () => {
    for (const k of C.DKEYS) expect(C.DIFF[k].name_en && C.DIFF[k].desc_en, k).toBeTruthy();
    for (const k of C.AKEYS) expect(C.AB[k].name_en && C.AB[k].desc_en && C.AB[k].short_en, k).toBeTruthy();
  });
});

describe("tower stats and upgrade cost", () => {
  beforeEach(() => fresh());

  it("level 0..3 read straight from the tables", () => {
    for (const k of C.TKEYS)
      for (let l = 0; l < 4; l++) {
        const s = C.st(k, l);
        expect(s.dmg).toBe(C.TT[k].dmg[l]);
        expect(s.range).toBe(C.TT[k].range[l]);
        expect(s.rate).toBe(C.TT[k].rate[l]);
      }
  });

  it("ultimates modify level-4 stats and make everything piercing", () => {
    expect(C.st("gun", 4, "mini").rate).toBeCloseTo(C.TT.gun.rate[3] / 6);
    const sn = C.st("gun", 4, "sniper");
    expect(sn.dmg).toBe(C.TT.gun.dmg[3] * 6);
    expect(sn.range).toBeCloseTo(C.TT.gun.range[3] * 1.7);
    expect(sn.prio).toBe("strong");
    expect(sn.pierce).toBe(true);
    expect(C.st("laser", 4, "prism").beams).toBe(4);
    expect(C.st("artillery", 4, "salvo").multi).toBe(5);
    expect(C.st("artillery", 4, "nuke").splash).toBe(3.5);
  });

  it("overclock multiplies damage and burn by 1.25^n", () => {
    const base = C.st("plasma", 4, "plague");
    const oc = C.st("plasma", 4, "plague", 3);
    expect(oc.dmg).toBeCloseTo(base.dmg * 1.25 ** 3);
    expect(oc.burn).toBeCloseTo(base.burn * 1.25 ** 3);
  });

  it("an unknown ultimate leaves level 4 as plain level 3", () => {
    expect(C.st("gun", 4, "nope").dmg).toBe(C.TT.gun.dmg[3]);
  });

  it("upCost: table, then 3x the last step, then +45% per overclock", () => {
    const t = { type: "gun", lvl: 0, oc: 0 };
    expect(C.upCost(t)).toBe(25);
    t.lvl = 2;
    expect(C.upCost(t)).toBe(80);
    t.lvl = 3;
    expect(C.upCost(t)).toBe(240);
    t.lvl = 4;
    expect(C.upCost(t)).toBe(120);
    t.oc = 2;
    expect(C.upCost(t)).toBe(Math.round(120 * 1.45 ** 2));
  });
});

describe("placement and pathfinding", () => {
  beforeEach(() => fresh());

  it("an empty field gives a straight route spawn → exit", () => {
    const p = C.routePath("h");
    expect(p[0]).toEqual([-1, 7]);
    expect(p.at(-1)).toEqual([C.W, 7]);
    expect(p).toHaveLength(C.W + 2);
    const v = C.routePath("v");
    expect(v[1]).toEqual([11, 0]);
    expect(v.at(-1)).toEqual([11, C.H]);
  });

  it("placeCheck reports reasons", () => {
    expect(C.placeCheck(-1, 3)).toBe("out");
    expect(C.placeCheck(0, 7)).toBe("pcRes");
    expect(C.placeCheck(21, 0, 2)).toBe("pcEdge");
    expect(C.placeCheck(5, 5)).toBe("");
    C.place("gun", 5, 5);
    expect(C.placeCheck(5, 5)).toBe("busy");
    expect(C.placeCheck(4, 4, 2)).toBe("pc22");
  });

  it("refuses a placement that seals the route, and allows the gap", () => {
    wall(5, 7);
    expect(C.placeCheck(5, 7)).toBe("pcBlock");
    expect(C.place("gun", 5, 7)).toEqual({ ok: false, code: "pcBlock" });
  });

  it("the route bends around towers", () => {
    wall(5, 3);
    const p = C.routePath("h");
    expect(p.some(([x, y]) => x === 5 && y === 3)).toBe(true);
    expect(p.length).toBeGreaterThan(C.W + 2);
  });

  it("selling reopens the path", () => {
    wall(5, 7);
    C.sell(C.towerAt(5, 3));
    expect(C.towerAt(5, 3)).toBeNull();
    expect(C.placeCheck(5, 7)).toBe("");
  });

  it("2x2 towers occupy four cells and buildOrigin centres them", () => {
    const r = C.place("artillery", 4, 4);
    expect(r.ok).toBe(true);
    for (const [x, y] of [
      [4, 4],
      [5, 4],
      [4, 5],
      [5, 5],
    ])
      expect(C.towerAt(x, y)).toBe(r.tower);
    expect(r.tower.x).toBe(4.5);
    expect(C.buildOrigin("artillery", [5, 5])).toEqual([4, 4]);
    expect(C.buildOrigin("gun", [5.7, 5.2])).toEqual([5, 5]);
  });

  it("will not build on top of a ground creep", () => {
    C.sendWave();
    run(C, 1);
    const c = C.S.creeps.find((x) => !x.fly);
    expect(c).toBeTruthy();
    expect(C.placeCheck(c.tx, c.ty)).toBe("pcEnemy");
  });
});

describe("economy commands", () => {
  beforeEach(() => fresh());

  it("place charges the build cost and emits `built`", () => {
    C.S.credits = 100;
    const r = C.place("cannon", 5, 5);
    expect(r.ok).toBe(true);
    expect(C.S.credits).toBe(65);
    expect(count("built")).toBe(1);
  });

  it("not enough credits is refused without side effects", () => {
    C.S.credits = 10;
    expect(C.place("gun", 5, 5)).toEqual({ ok: false, code: "noCred" });
    expect(C.S.towers).toHaveLength(0);
    expect(C.S.credits).toBe(10);
  });

  it("upgrades 0→3 then needs an ultimate choice", () => {
    const t = C.place("gun", 5, 5).tower;
    for (let i = 0; i < 3; i++) expect(C.upgrade(t).ok).toBe(true);
    expect(t.lvl).toBe(3);
    expect(C.upgrade(t)).toEqual({ ok: false, code: "pickUlt" });
    expect(C.upgrade(t, "mini")).toEqual({ ok: true, ult: "mini" });
    expect(t.lvl).toBe(4);
    expect(C.upgrade(t)).toEqual({ ok: true, overclock: 1 });
    expect(t.inv).toBe(15 + 25 + 45 + 80 + 240 + 120);
  });

  it("sell refunds 70% of everything invested", () => {
    const t = C.place("gun", 5, 5).tower;
    C.upgrade(t);
    const before = C.S.credits;
    expect(C.sell(t)).toBe(Math.floor(40 * 0.7));
    expect(C.S.credits).toBe(before + 28);
    expect(count("sold")).toBe(1);
  });

  it("commands are rejected once the game is over", () => {
    C.S.over = true;
    expect(C.place("gun", 5, 5)).toEqual({ ok: false, code: "over" });
    expect(C.cast("stasis").code).toBe("over");
  });

  it("newGame applies the difficulty start values", () => {
    for (const k of C.DKEYS) {
      C.newGame(k);
      expect(C.S.credits).toBe(C.DIFF[k].credits);
      expect(C.S.lives).toBe(C.DIFF[k].lives);
      expect(C.difficulty()).toBe(k);
    }
  });

  it("the cheat sets lives, credits and the cheated flag", () => {
    C.newGame("easy");
    expect(C.cheat("  HESOYAM ")).toEqual({ lives: 100, credits: 250000 });
    expect(C.S.cheated).toBe(true);
    expect(C.cheat("xyzzy")).toBeNull();
  });
});

describe("waves", () => {
  beforeEach(() => fresh());

  it("makeWave is well formed for every wave on every difficulty", () => {
    for (const d of C.DKEYS) {
      C.newGame(d);
      for (let n = 1; n <= C.FINAL; n++) {
        const w = C.makeWave(n);
        expect(w.list.length, `${d} #${n}`).toBeGreaterThan(0);
        expect(["h", "v", "both"]).toContain(w.route);
        for (const e of w.list) {
          expect(C.ET[e.type], `${d} #${n} ${e.type}`).toBeDefined();
          expect(e.gap).toBeGreaterThan(0);
          expect(e.m).toBeGreaterThan(0);
          expect(["h", "v"]).toContain(e.route);
        }
      }
    }
  });

  it("every tenth wave is a boss wave, the last one is the queen", () => {
    expect(C.makeWave(10).type).toBe("boss");
    expect(C.makeWave(50).list.filter((e) => e.type === "boss")).toHaveLength(5);
    const f = C.makeWave(C.FINAL);
    expect(f.type).toBe("queen");
    expect(f.list.at(-1).type).toBe("queen");
  });

  it("easy never mixes in healers/blinkers, hard does", () => {
    const kinds = (d) => {
      C.newGame(d);
      const s = new Set();
      for (let n = 1; n <= 100; n++) C.makeWave(n).list.forEach((e) => s.add(e.type));
      return s;
    };
    expect(kinds("easy").has("healer")).toBe(false);
    expect(kinds("easy").has("blinker")).toBe(false);
    expect(kinds("hard").has("healer")).toBe(true);
    expect(kinds("hard").has("blinker")).toBe(true);
  });

  it("unit HP grows with the wave number and the difficulty", () => {
    const hp = (d, n) => (C.newGame(d), C.unitHP(n));
    expect(hp("easy", 1)).toBe(32);
    expect(hp("easy", 20)).toBeGreaterThan(hp("easy", 10));
    expect(hp("hard", 40)).toBeGreaterThan(hp("easy", 40));
    expect(hp("insane", 40)).toBeGreaterThan(hp("hard", 40));
  });

  it("sendWave starts the clock, spawns over time and emits `wave`", () => {
    C.sendWave();
    expect(C.S.wave).toBe(1);
    expect(C.S.started).toBe(true);
    expect(count("wave")).toBe(1);
    run(C, 0.1);
    expect(C.S.creeps.length).toBeGreaterThan(0);
    expect(C.S.left[1]).toBe(C.makeWave(1).list.length);
  });

  it("calling the next wave early pays the remaining seconds as a bonus", () => {
    C.sendWave();
    const timer = Math.floor(C.S.timer);
    const credits = C.S.credits;
    C.sendWave(true);
    expect(C.S.credits).toBe(credits + timer);
    expect(events.find((e) => e.type === "toast" && e.key === "early").vars.b).toBe(timer);
  });

  it("the timer sends waves automatically", () => {
    C.sendWave();
    run(C, C.S.timer + 0.5);
    expect(C.S.wave).toBe(2);
  });
});

describe("simulation", () => {
  beforeEach(() => fresh());

  it("with no defence, wave 1 leaks and costs lives", () => {
    C.sendWave();
    run(C, 90);
    expect(count("leak")).toBeGreaterThan(0);
    expect(C.S.lives).toBeLessThan(20);
  });

  it("losing all lives ends the game exactly once", () => {
    C.S.lives = 1;
    C.sendWave();
    run(C, 120);
    expect(C.S.over).toBe(true);
    expect(C.S.won).toBe(false);
    expect(C.S.lives).toBe(0);
    expect(count("end")).toBe(1);
  });

  it("towers kill creeps, pay the reward and raise the score", () => {
    for (let x = 4; x < 10; x++) C.place("gun", x, 5);
    const credits = C.S.credits;
    C.sendWave();
    run(C, 60);
    expect(count("kill")).toBeGreaterThan(0);
    expect(C.S.score).toBeGreaterThan(0);
    expect(C.S.credits).toBeGreaterThan(credits);
    expect(count("shot")).toBeGreaterThan(0);
  });

  it("clearing a wave pays 4+n credits and toasts `cleared`", () => {
    for (let x = 4; x < 14; x++) C.place("gun", x, 5);
    C.sendWave();
    run(C, 120);
    const t = events.find((e) => e.type === "toast" && e.key === "cleared");
    expect(t.vars).toEqual({ n: 1, b: 5 });
  });

  it("a laser (piercing) ignores armour", () => {
    C.sendWave();
    run(C, 0.1);
    const c = C.S.creeps[0];
    c.armor = 100;
    c.hp = c.max = 1000;
    const laser = C.place("laser", 5, 5).tower;
    c.x = laser.x;
    c.y = laser.y;
    c.ox = c.oy = 0;
    C.step(0.025);
    expect(1000 - c.hp).toBeCloseTo(C.stats(laser).dmg * 0.025, 1);
  });

  it("non-piercing hits are reduced by armour but never below 25%", () => {
    C.sendWave();
    run(C, 0.1);
    const c = C.S.creeps[0];
    c.armor = 100;
    c.hp = c.max = 1000;
    const gun = C.place("gun", 5, 5).tower;
    c.x = gun.x;
    c.y = gun.y;
    c.ox = c.oy = 0;
    run(C, 1);
    const dealt = 1000 - c.hp;
    expect(count("shot")).toBeGreaterThan(0);
    expect(dealt).toBeGreaterThan(0);
    // 7 dmg bullets: floor is 25% = 1.75 per hit
    expect(dealt % 1.75).toBeCloseTo(0, 5);
  });

  it("air/ground capabilities", () => {
    expect(C.ET.flyer.fly).toBe(1);
    expect(C.TT.cannon.air).toBe(0);
    expect(C.TT.missile.ground).toBe(0);
    expect(C.st("missile", 4, "sam").ground).toBe(1);
  });
});

describe("abilities", () => {
  beforeEach(() => fresh());

  it("cost scales with the wave, a cast starts the cooldown", () => {
    C.S.wave = 10;
    expect(C.abCost("stasis")).toBe(150 + 15 * 10);
    const cr = C.S.credits;
    expect(C.cast("stasis")).toEqual({ ok: true });
    expect(C.S.credits).toBe(cr - 300);
    expect(C.S.cd.stasis).toBe(45);
    expect(C.cast("stasis")).toEqual({ ok: false, code: "cd", s: 45 });
    expect(events.some((e) => e.type === "cast" && e.ability === "stasis")).toBe(true);
  });

  it("refuses without credits", () => {
    C.S.credits = 1;
    expect(C.cast("nuke", [5, 5]).code).toBe("noCred");
  });

  it("stasis slows creeps", () => {
    C.sendWave();
    run(C, 0.2);
    C.cast("stasis");
    expect(C.S.creeps.every((c) => c.slow === 0.75 && c.slowT > 7)).toBe(true);
    expect(C.S.stasisT).toBe(8);
  });

  it("nuke explodes after 1.5 s and wipes weak creeps in the radius", () => {
    C.sendWave();
    run(C, 3);
    const c = C.S.creeps[0];
    const [x, y] = C.pos(c);
    C.cast("nuke", [x + 0.5, y + 0.5]);
    expect(C.S.nukes).toHaveLength(1);
    run(C, 1);
    expect(events.some((e) => e.kind === "nuke")).toBe(false);
    run(C, 0.6);
    expect(events.some((e) => e.type === "explode" && e.kind === "nuke")).toBe(true);
    expect(c.dead).toBe(true);
  });

  it("meteors, napalm and carpet bombing create their runtime objects", () => {
    C.cast("meteor", [5, 5]);
    C.cast("napalm", [8, 8]);
    C.cast("carpet", [3, 9]);
    expect(C.S.meteors).toHaveLength(15);
    expect(C.S.zones).toHaveLength(1);
    expect(C.S.bombers).toHaveLength(1);
    run(C, 5);
    expect(events.some((e) => e.type === "explode" && e.kind === "bomb")).toBe(true);
    expect(events.some((e) => e.type === "explode" && e.kind === "meteor")).toBe(true);
  });
});

describe("determinism (golden run)", () => {
  function play(seed) {
    fresh("normal", seed);
    C.S.credits = 100000;
    const mix = [
      ["gun", 4],
      ["cannon", 6],
      ["frost", 8],
      ["plasma", 10],
      ["rail", 12],
      ["laser", 14],
    ];
    for (const [type, x] of mix) {
      const t = C.place(type, x, 5).tower;
      C.upgrade(t);
      C.upgrade(t);
      C.place(type, x, 9);
    }
    C.place("missile", 16, 3);
    C.place("artillery", 17, 10);
    for (let n = 0; n < 12; n++) {
      C.sendWave(true);
      run(C, 25);
    }
    const kinds = {};
    for (const e of events) kinds[e.type] = (kinds[e.type] || 0) + 1;
    const s = C.S;
    return { wave: s.wave, lives: s.lives, score: s.score, credits: s.credits, creeps: s.creeps.length, kinds };
  }

  it("the same seed gives the same result", () => {
    expect(play(7)).toEqual(play(7));
  });

  it("matches the recorded baseline (update deliberately if balance changes)", () => {
    expect(play(42)).toMatchSnapshot();
  });
});
