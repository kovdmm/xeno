import { describe, it, expect } from "vitest";
import { loadXT } from "./helpers/load.js";

/** A 2D context that accepts everything and records how often each method was called. */
function stubContext(calls) {
  const target = { globalAlpha: 1, globalCompositeOperation: "source-over", lineDash: [], depth: 0 };
  const stack = [];
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === "createLinearGradient" || p === "createRadialGradient") return () => ({ addColorStop() {} });
      return (...a) => {
        calls[p] = (calls[p] || 0) + 1;
        if (p === "save") {
          stack.push({ ...t });
          t.depth++;
        }
        if (p === "restore") {
          Object.assign(t, stack.pop());
        }
        if (p === "setLineDash") t.lineDash = a[0];
      };
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
  });
}

function setup({ seed = 3 } = {}) {
  const calls = {};
  const canvases = [];
  const makeCanvas = () => {
    const ctx = stubContext(calls);
    const cv = {
      width: 300,
      height: 150,
      getContext: () => ctx,
      getBoundingClientRect: () => ({ width: 880, height: 600 }),
      ctx,
    };
    canvases.push(cv);
    return cv;
  };
  const XT = loadXT(["core", "render"], { seed, globals: { document: { createElement: makeCanvas } } });
  const main = makeCanvas();
  const R = XT.createRenderer(main);
  R.resize();
  return { XT, C: XT.core, R, main, calls, canvases };
}

const view = (t, extra = {}) => ({ t, sel: null, preview: null, aim: null, building: false, ...extra });

describe("renderer smoke test", () => {
  it("exposes the interface the UI relies on", () => {
    const { R, XT } = setup();
    for (const k of ["resize", "draw", "towerIcon", "setRotated", "theme", "quality"]) expect(R[k], k).toBeDefined();
    expect(XT.THEME).toBe(R.theme);
    expect([0, 1, 2]).toContain(R.quality());
  });

  it("theme has a colour for every tower and enemy type", () => {
    const { XT, C, R } = setup();
    for (const k of C.TKEYS) expect(R.theme.tower[k], k).toMatch(/^#/);
    for (const k of Object.keys(C.ET)) expect(R.theme.enemy[k], k).toMatch(/^#/);
  });

  it("every tower type has its own ultimate colour, all equally bright", () => {
    const { C, R } = setup();
    const ult0 = (k) => Object.keys(C.TT[k].ults)[0];
    const cols = C.TKEYS.map((k) => R.tierColor(4, k, ult0(k)));
    expect(new Set(cols).size).toBe(C.TKEYS.length);
    const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const lum = (h) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ls = cols.map(lum);
    expect(Math.max(...ls) - Math.min(...ls)).toBeLessThan(0.01);
    // the two specialisations of a type differ a little, and equally bright
    for (const k of C.TKEYS) {
      const [u1, u2] = Object.keys(C.TT[k].ults).map((u) => R.tierColor(4, k, u));
      expect(u1, k).not.toBe(u2);
      expect(Math.abs(lum(u1) - lum(u2)), k).toBeLessThan(0.01);
    }
    // lower levels do not depend on the type
    for (const l of [0, 1, 2, 3]) expect(new Set(C.TKEYS.map((k) => R.tierColor(l, k))).size).toBe(1);
  });

  it("sets the canvas backing store from its CSS size", () => {
    const { main } = setup();
    expect(main.width).toBeGreaterThan(300);
    expect(main.width / main.height).toBeCloseTo(22 / 15, 1);
  });

  it("draws an empty field", () => {
    const { C, R, main } = setup();
    C.newGame("easy");
    expect(() => R.draw(view(0), 0.016)).not.toThrow();
    expect(main.ctx).toBeDefined();
  });

  it("towerIcon renders every tower type", () => {
    const { C, R, main } = setup();
    for (const k of C.TKEYS) expect(() => R.towerIcon(main.ctx, k), k).not.toThrow();
  });

  it.each([false, true])(
    "plays a long game with everything on screen (rotated=%s)",
    (rot) => {
      const { C, R, main, calls } = setup();
      R.setRotated(rot);
      R.resize();
      C.newGame("hard");
      C.cheat("hesoyam");

      // every tower at every stage: levels 0–3, both ultimates of each, overclocked
      let x = 1;
      for (const type of C.TKEYS) {
        const z = C.TT[type].size || 1;
        let row = 0;
        for (const ult of [null, ...Object.keys(C.TT[type].ults)]) {
          for (let lvl = 0; lvl <= 3; lvl += ult ? 3 : 1) {
            const y = 1 + (row++ % 3) * (z + 1) + (row > 2 ? 6 : 0);
            const r = C.place(type, x, y);
            if (!r.ok) continue;
            for (let i = 0; i < lvl; i++) C.upgrade(r.tower);
            if (ult) {
              C.upgrade(r.tower, ult);
              C.upgrade(r.tower);
            }
          }
        }
        x += z === 2 ? 2 : 1;
      }
      expect(C.S.towers.length).toBeGreaterThan(20);

      const w = { sel: C.S.towers[0], t: 0 };
      let t = 0,
        frames = 0;
      const seen = new Set(),
        kinds = new Set(),
        projs = new Set();
      C.on((e) => e.type === "explode" && kinds.add(e.kind));
      const checkState = () => {
        // a frame must leave the context clean for the next one
        expect(main.ctx.globalAlpha).toBe(1);
        expect(main.ctx.globalCompositeOperation).toBe("source-over");
        expect(main.ctx.lineDash).toEqual([]);
        expect(main.ctx.depth).toBe(0); // save/restore balanced
      };
      for (let n = 1; n <= 45; n++) {
        C.S.lives = 1e6; // keep the run going: the point is to draw 45 waves
        C.sendWave(true);
        if (n === 8) {
          for (const a of C.AKEYS) C.cast(a, [8, 7]);
        }
        for (let s = 0; s < 240; s++) {
          C.step(0.025);
          t += 0.025;
          if (s % 4) continue;
          const v = view(t, {
            sel: w.sel,
            preview: n % 2 ? { type: "artillery", x: 3, y: 3, size: 2, ok: n % 3 > 0, range: 5, minR: 1.2 } : null,
            aim: n % 3 === 0 ? { shape: n % 2 ? "row" : "circle", x: 8, y: 7, r: 3 } : null,
          });
          R.draw(v, 0.1);
          for (const c of C.S.creeps) seen.add(c.type);
          for (const p of C.S.proj) projs.add(p.k);
          frames++;
          checkState();
        }
      }
      // the run actually exercised the interesting paths
      for (const type of ["crawler", "runner", "swarm", "armored", "flyer", "healer", "blinker", "boss"])
        expect(seen.has(type), `enemy ${type} was drawn`).toBe(true);
      for (const k of ["b", "s", "m", "pl", "a"]) expect(projs.has(k), `projectile ${k} was drawn`).toBe(true);
      for (const k of ["shell", "missile", "plasma", "artillery", "meteor", "bomb", "nuke"])
        expect(kinds.has(k), `explosion ${k} happened`).toBe(true);
      expect(frames).toBeGreaterThan(2000);
      expect(calls.fill + calls.stroke + calls.drawImage).toBeGreaterThan(50000);
      expect(C.S.over).toBe(false);
      expect(C.S.wave).toBe(45);
    },
    60000,
  );

  it("draws bosses, flyers, healers and the final queen without throwing", () => {
    const { C, R } = setup();
    C.newGame("insane");
    C.cheat("hesoyam");
    for (const n of [10, 20, 31, 45, 200]) {
      C.S.lives = 1e6;
      C.S.wave = n - 1;
      C.sendWave();
      for (let s = 0; s < 400; s++) {
        C.step(0.025);
        if (s % 5 === 0) expect(() => R.draw(view(s * 0.025), 0.1)).not.toThrow();
      }
    }
    expect(new Set(C.S.creeps.map((c) => c.type)).size).toBeGreaterThan(1);
  });

  it("a new game clears effects and decals", () => {
    const { C, R } = setup();
    C.newGame("easy");
    C.cheat("hesoyam");
    C.cast("nuke", [8, 8]);
    for (let i = 0; i < 80; i++) {
      C.step(0.025);
      R.draw(view(i * 0.025), 0.025);
    }
    expect(() => {
      C.newGame("easy");
      R.draw(view(0), 0.016);
    }).not.toThrow();
  });

  it("drawing never changes the simulation (separate random streams)", () => {
    const sim = (withRenderer) => {
      const { C, R } = setup({ seed: 11 });
      C.newGame("normal");
      C.cheat("hesoyam");
      for (const [type, x, y] of [
        ["gun", 4, 5],
        ["cannon", 7, 5],
        ["plasma", 10, 5],
        ["artillery", 13, 9],
      ])
        C.place(type, x, y);
      C.cast("meteor", [8, 6]);
      C.sendWave();
      for (let s = 0; s < 900; s++) {
        C.step(0.025);
        if (withRenderer && s % 2 === 0) R.draw(view(s * 0.025), 0.05);
      }
      const snap = (c) => [c.type, +c.x.toFixed(6), +c.y.toFixed(6), +c.hp.toFixed(6), +c.ox.toFixed(6)];
      return JSON.stringify({
        t: C.S.t,
        score: C.S.score,
        credits: C.S.credits,
        lives: C.S.lives,
        creeps: C.S.creeps.map(snap),
      });
    };
    expect(sim(true)).toBe(sim(false));
  });
});
