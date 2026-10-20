import { describe, it, expect } from "vitest";
import { BALANCE } from "../../src/game/balance";
import { TOWER_MARK, ULT_MARK, leftMark, rightMark } from "../../src/render/marks";
import { drawTowerMarks } from "../../src/render/layers/towers";
import { Projection } from "../../src/render/projection";
import { SpriteCache } from "../../src/render/sprites";
import type { FrameContext } from "../../src/render/types";
import { stubCanvas, stubContext } from "../helpers/canvas";

const ults = Object.entries(BALANCE.towers).flatMap(([t, d]) => Object.keys(d.ults).map((u) => [t, u] as const));

describe("turret letter marks", () => {
  it("has a letter for every tower and every ultimate of the balance, and nothing else", () => {
    expect(Object.keys(TOWER_MARK).sort()).toEqual(Object.keys(BALANCE.towers).sort());
    expect(Object.keys(ULT_MARK).sort()).toEqual(ults.map(([, u]) => u).sort());
  });

  it("uses a different single capital letter for each", () => {
    const all = [...Object.values(TOWER_MARK), ...Object.values(ULT_MARK)];
    for (const l of all) expect(l).toMatch(/^[A-Z]$/);
    expect(new Set(all).size).toBe(all.length);
  });

  it("marks the specialisation from the ultimate on, the type before", () => {
    expect(leftMark("gun", undefined, 0)).toBe("G");
    expect(leftMark("gun", "sniper", 3)).toBe("G");
    expect(leftMark("gun", "sniper", 4)).toBe("S");
    expect(leftMark("gun", "mini", 4)).toBe("M");
    expect(leftMark("gun", "", 4)).toBe("G");
  });

  it("counts the upgrades above the first level", () => {
    expect([0, 1, 2, 3, 4].map(rightMark)).toEqual(["", "+1", "+2", "+3", "+4"]);
  });

  describe.each([false, true])("drawing (rotated=%s)", (rot) => {
    const frame = (make: () => HTMLCanvasElement = () => stubCanvas()) => {
      const proj = new Projection(22, 15);
      proj.cs = 20;
      proj.rot = rot;
      const ctx = stubContext();
      const sprites = new SpriteCache(proj, make);
      const towers = [
        { type: "gun", x: 3, y: 3, lvl: 0, size: 1, ult: "" },
        { type: "gun", x: 5, y: 3, lvl: 4, size: 1, ult: "sniper" },
        { type: "artillery", x: 8, y: 6, lvl: 2, size: 2, ult: "" },
      ];
      const TT = Object.fromEntries(Object.entries(BALANCE.towers).map(([k, d]) => [k, { ults: d.ults }]));
      return { ctx, sprites, proj, world: { S: { towers }, TT } } as unknown as FrameContext;
    };

    it("draws on the context without leaking state", () => {
      const f = frame();
      const before = { ...(f.ctx as unknown as Record<string, unknown>) };
      expect(() => drawTowerMarks(f)).not.toThrow();
      const ctx = f.ctx as unknown as { depth: number; lineDash: number[] };
      expect(ctx.depth).toBe(0);
      expect(ctx.lineDash).toEqual([]);
      expect(f.ctx.globalAlpha).toBe(1);
      expect(f.ctx.globalCompositeOperation).toBe(before.globalCompositeOperation);
    });

    it("paints each text into a cached sprite and blits it", () => {
      const texts: string[] = [];
      const draws: number[][] = [];
      const f = frame(() => {
        const cv = stubCanvas();
        (cv.ctx as unknown as Record<string, unknown>).fillText = (t: string) => texts.push(t);
        return cv;
      });
      (f.ctx as unknown as Record<string, unknown>).drawImage = (...a: number[]) => draws.push(a);
      drawTowerMarks(f);
      // gun L1: G; gun ultimate: S and +4; artillery L3: D and +2
      expect(texts.sort()).toEqual(["+2", "+4", "D", "G", "S"]);
      expect(draws).toHaveLength(5);
      drawTowerMarks(f);
      expect(texts).toHaveLength(5); // cached: not painted again
      expect(draws).toHaveLength(10);
    });
  });
});
