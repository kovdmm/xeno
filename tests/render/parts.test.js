import { describe, it, expect } from "vitest";
import { Projection } from "../../src/render/projection";
import { QualityGovernor, QUALITY_LEVELS } from "../../src/render/quality";
import { Fx } from "../../src/render/fx";
import { SpriteCache } from "../../src/render/sprites";
import { Glows } from "../../src/render/glow";
import { tierColor, TIER, ULT_HUE } from "../../src/render/tiers";
import { fitted, lum, hsl, rgb, mix, shade, alpha } from "../../src/render/color";

/** A canvas that accepts everything and remembers nothing but its size. */
const fakeCanvas = () => {
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => ({ addColorStop() {} })), set: (t, p, v) => ((t[p] = v), true) });
  return { width: 0, height: 0, getContext: () => ctx };
};
const rgb01 = (hex) => rgb(hex).map((v) => v / 255);
const emptyWorld = { S: { towers: [], proj: [], creeps: [], zones: [] }, pos: () => [0, 0] };

describe("Projection", () => {
  it("is a plain scale in landscape and turns the board 90° in portrait", () => {
    const p = new Projection(22, 15);
    p.cs = 10;
    const m = [];
    const c = { setTransform: (...a) => m.push(a) };
    p.apply(c, 3, 4);
    expect(m.pop()).toEqual([10, 0, 0, 10, 3, 4]);
    expect(p.toScreen(2, 5)).toEqual([20, 50]);
    expect([p.cols, p.rows]).toEqual([22, 15]);
    p.rot = true;
    p.apply(c);
    expect(m.pop()).toEqual([0, 10, -10, 0, 150, 0]);
    // board x runs down the screen, board y runs right to left
    expect(p.toScreen(2, 5)).toEqual([100, 20]);
    expect([p.cols, p.rows]).toEqual([15, 22]);
  });
});

describe("QualityGovernor", () => {
  const feed = (g, ms, n) => {
    let now = 1000,
      changed = 0;
    g.tick(now);
    for (let i = 0; i < n; i++) changed += g.tick((now += ms)) ? 1 : 0;
    return changed;
  };

  it("starts at the top and steps down when frames are slow", () => {
    const g = new QualityGovernor();
    expect(g.level).toBe(2);
    expect(feed(g, 40, 100)).toBe(1);
    expect(g.level).toBe(1);
    expect(g.settings).toBe(QUALITY_LEVELS[1]);
  });

  it("never goes below 0, and climbs back only after four good rounds", () => {
    const g = new QualityGovernor();
    feed(g, 40, 500);
    expect(g.level).toBe(0);
    expect(feed(g, 8, 90 * 3)).toBe(0);
    expect(feed(g, 8, 90 * 2)).toBeGreaterThan(0);
    expect(g.level).toBeGreaterThan(0);
  });

  it("ignores long pauses (a hidden tab) instead of counting them as slow frames", () => {
    const g = new QualityGovernor();
    expect(feed(g, 1000, 200)).toBe(0);
    expect(g.level).toBe(2);
  });
});

describe("Fx", () => {
  const seeded = (a = 1) => () => (a = (a * 16807) % 2147483647) / 2147483647;
  const fx = (q = QUALITY_LEVELS[0]) => new Fx(() => q, seeded(), false);
  const spark = { k: "spark", x: 0, y: 0, vx: 0, vy: 0, life: 1, max: 1, col: "#fff", s: 0.05 };

  it("drops cosmetic particles before the field is full of everything else", () => {
    const f = fx({ ...QUALITY_LEVELS[0], fx: 10, cos: 4 });
    for (let i = 0; i < 20; i++) f.add({ ...spark });
    expect(f.particles.length).toBe(4);
    for (let i = 0; i < 20; i++) f.add({ k: "blast", x: 0, y: 0, r: 1, col: "#fff", life: 1, max: 1 });
    expect(f.particles.length).toBe(10);
  });

  it("ages particles and removes them when their time is up", () => {
    const f = fx();
    f.add({ k: "ring", x: 0, y: 0, r: 1, col: "#fff", w: 0.1, life: 0.3, max: 0.3 });
    f.add({ k: "smoke", x: 0, y: 0, vx: 1, vy: 0, life: 1, max: 1, r: 0.1 });
    f.step(0.2, emptyWorld, false);
    expect(f.particles.length).toBe(2);
    expect(f.particles[1].x).toBeCloseTo(0.2);
    f.step(0.2, emptyWorld, false);
    expect(f.particles.map((p) => p.k)).toEqual(["smoke"]);
  });

  it("flash, red flash and shake fade out; shake is capped, and off with reduced motion", () => {
    const f = fx();
    f.flash = f.redFlash = 1;
    f.addShake(5);
    expect(f.shake).toBe(0.6);
    f.step(10, emptyWorld, false);
    expect([f.flash, f.redFlash, f.shake]).toEqual([0, 0, 0]);
    const calm = new Fx(() => QUALITY_LEVELS[0], seeded(), true);
    calm.addShake(1);
    expect(calm.shake).toBe(0);
  });

  it("floating texts drift along the screen's up, whichever way the board is turned", () => {
    const f = fx();
    f.texts.push({ x: 5, y: 5, v: "+1", life: 1, max: 1 });
    f.step(0.5, emptyWorld, false);
    expect([f.texts[0].x, f.texts[0].y]).toEqual([5, 5 - 0.45]);
    f.step(0.1, emptyWorld, true);
    expect(f.texts[0].x).toBeCloseTo(5 - 0.09);
  });

  it("uses only the random stream it was given", () => {
    const run = () => {
      const f = fx();
      f.sparks(1, 1, 5, "#fff", 1, 2, 1);
      f.smoke(1, 1, 3, 1);
      return JSON.stringify(f.particles);
    };
    expect(run()).toBe(run());
  });
});

describe("SpriteCache and Glows", () => {
  const setup = () => {
    const made = [];
    const create = () => (made.push(fakeCanvas()), made.at(-1));
    const p = new Projection(22, 15);
    p.cs = 20;
    return { made, sprites: new SpriteCache(p, create), glows: new Glows(create), p };
  };

  it("paints a sprite once per key, sized to the screen's pixels", () => {
    const { sprites, made } = setup();
    let n = 0;
    const a = sprites.sprite("k", 2, () => n++);
    const b = sprites.sprite("k", 2, () => n++);
    expect(a).toBe(b);
    expect(n).toBe(1);
    expect(made[0].width).toBe(40);
    sprites.clear();
    sprites.sprite("k", 2, () => n++);
    expect(n).toBe(2);
  });

  it("snaps a rotated sprite to 32 steps and renders each step once", () => {
    const { sprites } = setup();
    let n = 0;
    const paint = () => n++;
    sprites.rsprite("t", 1, 0.001, paint);
    sprites.rsprite("t", 1, 0.002, paint);
    sprites.rsprite("t", 1, Math.PI, paint);
    expect(n).toBe(2);
  });

  it("keeps text upright when the board is turned", () => {
    const { sprites, p } = setup();
    const s = sprites.sprite("x", 1, () => {});
    const log = [];
    const c = { setTransform: (...a) => log.push(["m", ...a]), drawImage: (_cv, ...a) => log.push(["d", ...a]) };
    p.rot = true;
    sprites.blitUp(c, s, 4, 2, 0, 0);
    expect(log[0]).toEqual(["m", 20, 0, 0, 20, (15 - 2) * 20, 4 * 20]);
    expect(log[1]).toEqual(["d", -0.5, -0.5, 1, 1]);
  });

  it("glows stop when the frame's budget is spent, unless forced; big ones shrink", () => {
    const { glows } = setup();
    const drawn = [];
    const c = { drawImage: (_cv, _x, _y, w) => drawn.push(w), globalAlpha: 1 };
    glows.reset(2);
    for (let i = 0; i < 5; i++) glows.add(c, "#ff0000", 0, 0, 1);
    expect(drawn.length).toBe(2);
    glows.add(c, "#ff0000", 0, 0, 10, 1, true);
    expect(drawn.at(-1)).toBeCloseTo(5.2);
  });
});

describe("tier colours", () => {
  it("levels 1-4 follow the ladder, the same for every type", () => {
    for (let l = 0; l < 4; l++) expect(tierColor(l, "gun", -1)).toBe(TIER[l]);
  });

  it("ultimates have a colour per type and per specialisation, all equally bright", () => {
    const cols = [];
    for (const type of Object.keys(ULT_HUE)) for (const s of [0, 1]) cols.push(tierColor(4, type, s));
    expect(new Set(cols).size).toBe(cols.length);
    const ls = cols.map((c) => lum(rgb01(c)));
    expect(Math.max(...ls) - Math.min(...ls)).toBeLessThan(0.01);
  });
});

describe("colour maths", () => {
  it("parses, mixes and shades", () => {
    expect(rgb("#ff8000")).toEqual([255, 128, 0]);
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(alpha("#ff0000", 2)).toBe("rgba(255,0,0,1)");
    expect(shade("#808080", -0.5)).toBe("rgb(64,64,64)");
    expect(shade("#000000", 1)).toBe("rgb(255,255,255)");
  });

  it("hsl primaries, and fitted colours hit the requested luminance at any hue", () => {
    expect(hsl(0, 1, 0.5).map(Math.round)).toEqual([1, 0, 0]);
    expect(hsl(120, 1, 0.5).map(Math.round)).toEqual([0, 1, 0]);
    for (const h of [0, 60, 200, 300]) expect(lum(rgb01(fitted(h, 0.27)))).toBeCloseTo(0.27, 1);
  });
});
