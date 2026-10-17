import { describe, it, expect } from "vitest";
import { DEFAULT_LAYERS, withLayers, runLayers } from "../../src/render/pipeline";
import type { FrameContext, Layer } from "../../src/render/types";

const layer = (id: string, draw: () => void = () => {}): Layer => ({ id, draw });
const ids = (l: readonly Layer[]) => l.map((x) => x.id);

describe("the default composition", () => {
  it("has unique ids, the floor at the bottom and the screen effects on top", () => {
    const all = ids(DEFAULT_LAYERS);
    expect(new Set(all).size).toBe(all.length);
    expect(all[0]).toBe("floor");
    expect(all.slice(-4)).toEqual(["stasisTint", "flicker", "leakVignette", "whiteFlash"]);
  });

  it("keeps the order that gives the picture: towers over routes, shots over ground units, flyers over shots", () => {
    const at = (id: string) => ids(DEFAULT_LAYERS).indexOf(id);
    expect(at("routes")).toBeLessThan(at("towers"));
    expect(at("towers")).toBeLessThan(at("groundCreeps"));
    expect(at("groundCreeps")).toBeLessThan(at("beams"));
    expect(at("projectiles")).toBeLessThan(at("airCreeps"));
    expect(at("airCreeps")).toBeLessThan(at("particles"));
    expect(at("particles")).toBeLessThan(at("placementPreview"));
  });
});

describe("withLayers", () => {
  const base = [layer("a"), layer("b"), layer("c")];

  it("replaces a layer in place", () => {
    const b2 = layer("b");
    const out = withLayers(base, { replace: { b: b2 } });
    expect(ids(out)).toEqual(["a", "b", "c"]);
    expect(out[1]).toBe(b2);
    expect(base[1]).not.toBe(b2); // the original list is untouched
  });

  it("removes, and inserts before or after a layer", () => {
    expect(ids(withLayers(base, { remove: ["b"] }))).toEqual(["a", "c"]);
    const out = withLayers(base, { after: { a: [layer("x")] }, before: { c: [layer("y")] } });
    expect(ids(out)).toEqual(["a", "x", "b", "y", "c"]);
  });

  it("refuses an unknown id or a duplicate, so a typo cannot silently do nothing", () => {
    expect(() => withLayers(base, { remove: ["nope"] })).toThrow(/no layer "nope"/);
    expect(() => withLayers(base, { after: { a: [layer("b")] } })).toThrow(/used twice/);
  });

  it("can rebuild the real composition", () => {
    const out = withLayers(DEFAULT_LAYERS, { remove: ["flicker"], after: { towers: [layer("rings")] } });
    expect(ids(out)).toContain("rings");
    expect(ids(out)).not.toContain("flicker");
    expect(ids(out).indexOf("rings")).toBe(ids(out).indexOf("towers") + 1);
  });
});

describe("runLayers", () => {
  it("draws bottom to top, each layer in board space and inside its own save/restore", () => {
    const log: string[] = [];
    const ctx = { save: () => log.push("save"), restore: () => log.push("restore"), lineCap: "", lineJoin: "" };
    const proj = { ox: 1, oy: 2, apply: (_c: unknown, dx: number, dy: number) => log.push(`apply ${dx},${dy}`) };
    runLayers([layer("a", () => void log.push("A")), layer("b", () => void log.push("B"))], { ctx, proj } as unknown as FrameContext);
    expect(log).toEqual(["save", "apply 1,2", "A", "restore", "save", "apply 1,2", "B", "restore"]);
    // the house pen
    expect([ctx.lineCap, ctx.lineJoin]).toEqual(["round", "round"]);
  });
});
