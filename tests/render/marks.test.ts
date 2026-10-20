import { describe, it, expect } from "vitest";
import { BALANCE } from "../../src/game/balance";
import de from "../../src/i18n/texts.de.json";
import en from "../../src/i18n/texts.en.json";
import ru from "../../src/i18n/texts.ru.json";
import sv from "../../src/i18n/texts.sv.json";
import ua from "../../src/i18n/texts.ua.json";
import { leftMark, rightMark, ultMarks } from "../../src/render/marks";
import { drawTowerMarks } from "../../src/render/layers/towers";
import { Projection } from "../../src/render/projection";
import { SpriteCache } from "../../src/render/sprites";
import type { FrameContext } from "../../src/render/types";
import { stubCanvas, stubContext } from "../helpers/canvas";

const TEXTS = { en, ru, de, sv, ua } as unknown as Record<
  string,
  { game: { towers: Record<string, { ults: Record<string, { name: string }> }> } }
>;
const names = (lang: string, tower: string) => Object.values(TEXTS[lang].game.towers[tower].ults).map((u) => u.name);

describe("turret marks: the specialisation letter", () => {
  it("is the capital first letter of the translated name", () => {
    expect(ultMarks(["Minigun", "Sniper"])).toEqual(["M", "S"]);
    expect(ultMarks(["Миниган", "Снайпер"])).toEqual(["М", "С"]);
    expect(ultMarks(["Überhitzung", "Prisma"])).toEqual(["Ü", "P"]);
    expect(ultMarks(["ärger", "Bö"])).toEqual(["Ä", "B"]);
  });

  it("gets more letters when the two names of a tower would give the same mark", () => {
    expect(ultMarks(["Cluster", "Concussion"])).toEqual(["Cl", "Co"]);
    expect(ultMarks(["Призма", "Перегрев"])).toEqual(["Пр", "Пе"]);
    expect(ultMarks(["Cluster", "Clutch"])).toEqual(["Clus", "Clut"]);
  });

  it("skips what is no letter at the start of a name", () => {
    expect(ultMarks(["«Gauss»", "1-Auto"])).toEqual(["G", "A"]);
  });

  it("tells the two specialisations of every tower apart in every language", () => {
    for (const lang of Object.keys(TEXTS))
      for (const tower of Object.keys(BALANCE.towers)) {
        const ids = Object.keys(BALANCE.towers[tower as keyof typeof BALANCE.towers].ults);
        expect(Object.keys(TEXTS[lang].game.towers[tower].ults), `${lang} ${tower}`).toEqual(ids);
        const marks = ultMarks(names(lang, tower));
        expect(new Set(marks).size, `${lang} ${tower}: ${marks}`).toBe(marks.length);
        for (const m of marks) expect(m, `${lang} ${tower}`).toMatch(/^\p{Lu}\p{Ll}*$/u);
      }
  });

  it("shows a mark from level 5 on only, for the chosen specialisation", () => {
    const ids = ["mini", "sniper"],
      nm = ["Minigun", "Sniper"];
    expect(leftMark(ids, nm, undefined, 0)).toBe("");
    expect(leftMark(ids, nm, "sniper", 3)).toBe("");
    expect(leftMark(ids, nm, "sniper", 4)).toBe("S");
    expect(leftMark(ids, nm, "mini", 4)).toBe("M");
    expect(leftMark(ids, nm, "", 4)).toBe("");
    expect(leftMark(ids, nm, "nope", 4)).toBe("");
  });
});

describe("turret marks: the overclock count", () => {
  it("is +n, nothing without an overclock", () => {
    expect([0, 1, 2, 7].map(rightMark)).toEqual(["", "+1", "+2", "+7"]);
  });
});

describe.each([false, true])("drawing the marks (rotated=%s)", (rot) => {
  const TT = Object.fromEntries(
    Object.entries(BALANCE.towers).map(([k, d]) => [
      k,
      { ults: Object.fromEntries(Object.keys(d.ults).map((u) => [u, { name: TEXTS.en.game.towers[k].ults[u].name }])) },
    ]),
  );
  const frame = (make: () => HTMLCanvasElement = () => stubCanvas(), world: Record<string, unknown> = {}) => {
    const proj = new Projection(22, 15);
    proj.cs = 20;
    proj.rot = rot;
    const ctx = stubContext();
    const sprites = new SpriteCache(proj, make);
    const towers = [
      { type: "gun", x: 3, y: 3, lvl: 0, size: 1, ult: "", oc: 0 },
      { type: "gun", x: 5, y: 3, lvl: 4, size: 1, ult: "sniper", oc: 2 },
      { type: "artillery", x: 8, y: 6, lvl: 2, size: 2, ult: "", oc: 0 },
    ];
    return { ctx, sprites, proj, world: { S: { towers }, TT, ...world } } as unknown as FrameContext;
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

  it("paints the specialisation letter and the overclock count, each into a cached sprite", () => {
    const texts: string[] = [];
    const draws: number[][] = [];
    const f = frame(() => {
      const cv = stubCanvas();
      (cv.ctx as unknown as Record<string, unknown>).fillText = (t: string) => texts.push(t);
      return cv;
    });
    (f.ctx as unknown as Record<string, unknown>).drawImage = (...a: number[]) => draws.push(a);
    drawTowerMarks(f);
    // only the second gun has a mark: S (sniper) on the left and +2 (overclocks) on the right; no type letter, no level
    expect(texts.sort()).toEqual(["+2", "S"]);
    expect(draws).toHaveLength(2);
    drawTowerMarks(f);
    expect(texts).toHaveLength(2); // cached: not painted again
    expect(draws).toHaveLength(4);
  });

  it("paints a new letter when the language changes (the sprite key holds the letter)", () => {
    const texts: string[] = [];
    const make = () => {
      const cv = stubCanvas();
      (cv.ctx as unknown as Record<string, unknown>).fillText = (t: string) => texts.push(t);
      return cv;
    };
    const f = frame(make);
    drawTowerMarks(f);
    expect(texts).toContain("S"); // Sniper
    const ru = { ...TT, gun: { ults: { mini: { name: "Миниган" }, sniper: { name: "Снайпер" } } } };
    (f.world as unknown as { TT: unknown }).TT = ru;
    drawTowerMarks(f);
    expect(texts).toContain("С"); // Снайпер, Cyrillic
  });
});
