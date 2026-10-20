// The extra cheat codes: bagowpw (all maps), aspirine (immortal base), lxgiwyl (free turrets), crazytown (grumbling enemies).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadXT } from "./helpers/load";
import { Fx } from "../src/render/fx";
import { bubbles } from "../src/render/layers/bubbles";
import { CheatTyper } from "../src/ui/keys";
import { createProgress } from "../src/ui/progress";
import { createSession } from "../src/ui/session";
import { grumbles } from "../src/ui/cheats";
import { TEXTS } from "../src/i18n/texts";
import { memoryStore } from "./helpers/audio";

let C, events;
function fresh() {
  C = loadXT(["core"], { seed: 1 }).core;
  events = [];
  C.on((e) => events.push(e));
  C.newGame("easy");
  return C;
}
const typed = (codes: string[], word: string) => {
  const got: string[] = [];
  const ty = new CheatTyper(codes, (c) => got.push(c));
  for (const ch of word) ty.feed(ch);
  return got;
};

describe("typing the codes", () => {
  const CODES = ["hesoyam", "bagowpw", "aspirine", "lxgiwyl", "crazytown"];
  it.each(CODES)("%s is recognised letter by letter", (code) => {
    expect(typed(CODES, code)).toEqual([code]);
  });
});

describe("the codes", () => {
  it("none starts with a hotkey letter (its first letter is swallowed by the code typer)", () => {
    for (const code of ["hesoyam", "bagowpw", "aspirine", "lxgiwyl", "crazytown"])
      expect("qwertusnfm").not.toContain(code[0]);
  });
});

describe("every flag cheat flags the game as cheated and does nothing before it is typed", () => {
  beforeEach(() => fresh());
  it.each(["bagowpw", "aspirine", "lxgiwyl", "crazytown"])("%s", (code) => {
    expect(C.S.cheated).toBeFalsy();
    expect(C.S.immortal || C.S.freeTowers || C.S.grumble).toBeFalsy();
    expect(C.cheat(" " + code.toUpperCase() + " ")).not.toBeNull();
    expect(C.S.cheated).toBe(true);
    expect(events.filter((e) => e.type === "cheat").map((e) => e.code)).toEqual([code]);
    C.newGame("easy"); // a new game is clean again
    expect(C.S.cheated).toBeFalsy();
    expect(C.S.immortal || C.S.freeTowers || C.S.grumble).toBeFalsy();
  });
  it("a code is not a prefix match", () => {
    expect(C.cheat("god")).toBeNull();
    expect(C.S.cheated).toBeFalsy();
  });
});

describe("aspirine", () => {
  const leakAll = () => {
    C.sendWave();
    for (let i = 0; i < 4000 && (C.S.creeps.length > 0 || C.S.spawners.length > 0); i++) C.step(0.05);
  };
  it("without the code enemies take lives", () => {
    fresh();
    const lives = C.S.lives;
    leakAll();
    expect(C.S.lives).toBeLessThan(lives);
  });
  it("with the code the base keeps all its lives", () => {
    fresh();
    const lives = C.S.lives;
    C.cheat("aspirine");
    leakAll();
    expect(events.some((e) => e.type === "leak")).toBe(true);
    expect(C.S.lives).toBe(lives);
    expect(C.S.over).toBe(false);
  });
});

describe("lxgiwyl", () => {
  it("towers cost credits before the code", () => {
    fresh();
    C.S.credits = 1000;
    const r = C.place("gun", 5, 5);
    expect(r.ok).toBe(true);
    expect(C.S.credits).toBeLessThan(1000);
    expect(C.upCost(r.tower)).toBeGreaterThan(0);
  });
  it("building and upgrading cost nothing with no credits at all", () => {
    fresh();
    C.cheat("lxgiwyl");
    C.S.credits = 0;
    const r = C.place("gun", 5, 5);
    expect(r.ok).toBe(true);
    expect(C.upgrade(r.tower).ok).toBe(true);
    expect(r.tower.lvl).toBe(1);
    expect(C.S.credits).toBe(0);
    expect(C.sell(r.tower)).toBe(0); // nothing was paid, so nothing is refunded
    expect(C.S.credits).toBe(0);
  });
  it("without the code a poor player cannot build", () => {
    fresh();
    C.S.credits = 0;
    expect(C.place("gun", 5, 5)).toEqual({ ok: false, code: "noCred" });
  });
});

describe("bagowpw", () => {
  it("is remembered by the interface, and not before the code", () => {
    const progress = createProgress(memoryStore(), ["easy"], [{ id: "a", finalWave: 10 }], () => null);
    expect(progress.mapsOpen()).toBe(false);
    let onEvent: (e: unknown) => void = () => {};
    const C2: any = { S: { cheated: false, lives: 5 }, FINAL: 10, on: (fn) => (onEvent = fn) };
    const ui: any = {
      core: C2,
      state: {},
      t: (k: string) => k,
      toast: vi.fn(),
      refresh() {},
      sound: { play() {} },
      renderer: { setPhrases: vi.fn() },
      $: () => ({}),
      screens: {},
    };
    createSession(
      ui,
      progress,
      () => {},
      () => {},
    );
    onEvent({ type: "cheat", code: "bagowpw" });
    expect(progress.mapsOpen()).toBe(true);
    expect(ui.toast).toHaveBeenCalledWith("cheatMaps");
  });
});

describe("crazytown (cosmetic speech bubbles)", () => {
  const world = (grumble: boolean, creeps: object[]) =>
    ({ S: { towers: [], proj: [], zones: [], creeps, grumble }, pos: () => [3, 4] }) as never;
  const mk = () =>
    new Fx(
      () => ({ fx: 100, cos: 100 }) as never,
      () => 0.5,
      false,
    );
  const creeps = () => [1, 2, 3].map((id) => ({ id, dead: false, r: 0.3 }));

  it("no bubbles before the code, bubbles after it, and they go away", () => {
    const fx = mk();
    fx.phrases = ["a", "b"];
    for (let i = 0; i < 40; i++) fx.step(0.1, world(false, creeps()), false);
    expect(fx.bubbles).toHaveLength(0);
    const w = world(true, creeps());
    for (let i = 0; i < 40; i++) fx.step(0.1, w, false);
    expect(fx.bubbles.length).toBeGreaterThan(0);
    expect(fx.bubbles.length).toBeLessThanOrEqual(5);
    expect(new Set(fx.bubbles.map((b) => b.creep)).size).toBe(fx.bubbles.length);
    for (const b of fx.bubbles) expect(fx.phrases).toContain(b.v);
    for (let i = 0; i < 60; i++) fx.step(0.1, world(false, creeps()), false);
    expect(fx.bubbles).toHaveLength(0);
  });

  it("uses only the fx random stream", () => {
    const rand = vi.fn(() => 0.3);
    const fx = new Fx(() => ({ fx: 100, cos: 100 }) as never, rand, false);
    fx.phrases = ["a"];
    fx.step(1, world(true, creeps()), false);
    expect(rand).toHaveBeenCalled();
  });

  it("the layer draws a sprite per bubble", () => {
    const fx = mk();
    fx.bubbles = [{ creep: creeps()[0] as never, v: "Warm", life: 1, max: 2 }];
    const blit = vi.fn();
    bubbles.draw({
      ctx: { globalAlpha: 1 },
      sprites: { sprite: vi.fn(() => ({})), blitUp: blit },
      fx,
      world: world(true, []),
    } as never);
    expect(blit).toHaveBeenCalledOnce();
  });

  it("every language has the six phrases", () => {
    for (const lang of ["en", "ru", "de", "ua", "sv"]) {
      const list = grumbles((k) => TEXTS[lang].ui[k]);
      expect(list).toHaveLength(6);
      for (const s of list) expect(typeof s === "string" && s.length > 0, lang).toBe(true);
    }
  });
});
