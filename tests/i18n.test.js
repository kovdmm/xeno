import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadXT } from "./helpers/load.js";

const XT = loadXT(["i18n", "core"]);
const { I18N, t, L, setLang } = XT.i18n;
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

describe("i18n dictionaries", () => {
  it("ru and en have exactly the same keys", () => {
    const ru = Object.keys(I18N.ru).sort();
    const en = Object.keys(I18N.en).sort();
    expect(
      en.filter((k) => !ru.includes(k)),
      "only in en",
    ).toEqual([]);
    expect(
      ru.filter((k) => !en.includes(k)),
      "only in ru",
    ).toEqual([]);
  });

  it("no translation is empty and placeholders match between languages", () => {
    const ph = (s) => (typeof s === "string" ? (s.match(/\{\w+\}/g) || []).sort() : []);
    for (const k of Object.keys(I18N.ru)) {
      expect(I18N.ru[k], k).toBeTruthy();
      expect(I18N.en[k], k).toBeTruthy();
      expect(ph(I18N.en[k]), `placeholders of ${k}`).toEqual(ph(I18N.ru[k]));
    }
  });

  it("credits have the same number of rows in both languages", () => {
    expect(I18N.en.credits).toHaveLength(I18N.ru.credits.length);
  });

  it("every data-i / data-i-label key used in index.html exists", () => {
    const html = read("index.html");
    const keys = [...html.matchAll(/data-i(?:-label)?="([^"]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) expect(I18N.ru[k], k).toBeDefined();
  });

  it("every literal t('key') used by ui.js exists", () => {
    const ui = read("src/ui.js");
    const keys = new Set([...ui.matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"/g)].map((m) => m[1]));
    expect(keys.size).toBeGreaterThan(30);
    for (const k of keys) expect(I18N.ru[k], k).toBeDefined();
  });

  it("every code the core returns to the player has a message", () => {
    // the simulation lives in several modules under src/game
    const core = ["grid", "game", "abilities", "waves", "combat"].map((f) => read(`src/game/${f}.ts`)).join(" ");
    const codes = new Set([...core.matchAll(/"(pc[A-Z]\w*|pc22|noCred|pickUlt)"/g)].map((m) => m[1]));
    expect([...codes].sort()).toEqual(["noCred", "pc22", "pcBlock", "pcEdge", "pcEnemy", "pcRes", "pcTrap", "pickUlt"]);
    for (const c of codes) expect(I18N.ru[c], c).toBeDefined();
    // toast keys emitted by the core
    for (const k of ["early", "cleared", "finalToast"]) expect(I18N.ru[k], k).toBeDefined();
  });

  it("every ability/tower/difficulty ships both languages in its data", () => {
    const C = XT.core;
    for (const o of [
      ...C.TKEYS.map((k) => C.TT[k]),
      ...C.DKEYS.map((k) => C.DIFF[k]),
      ...C.AKEYS.map((k) => C.AB[k]),
    ]) {
      expect(L(o), o.name).toBeTruthy();
      expect(o.name_en).toBeTruthy();
    }
    for (const k of C.TKEYS)
      for (const u of Object.values(C.TT[k].ults)) expect(u.name_en && u.desc_en && u.name && u.desc, k).toBeTruthy();
    for (const e of Object.values(C.ET)) expect(e.name && e.name_en).toBeTruthy();
  });
});

describe("t() and L()", () => {
  it("substitutes {placeholders}, all occurrences", () => {
    expect(t("contWave", { w: 7 })).toContain("7");
    expect(t("cmdTxt", { d: "Easy" })).toContain("Easy");
  });

  it("falls back to the key itself for unknown strings", () => {
    expect(t("__nope__")).toBe("__nope__");
  });

  it("L picks the *_en field only in English", () => {
    const o = { name: "Привет", name_en: "Hello", desc: "x" };
    setLang("en");
    expect(L(o)).toBe("Hello");
    expect(L(o, "desc")).toBe("x"); // no desc_en → falls back
    setLang("ru");
    expect(L(o)).toBe("Привет");
  });

  it("ignores unsupported languages", () => {
    setLang("ru");
    setLang("xx");
    expect(XT.i18n.lang).toBe("ru");
  });
});
