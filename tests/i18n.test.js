import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  LANG_CODES,
  detectLanguage,
  htmlLang,
  isLang,
  languageFromTag,
} from "../src/i18n/languages.ts";
import { TEXTS } from "../src/i18n/texts.ts";
import { createTranslator } from "../src/i18n/translator.ts";
import { BALANCE } from "../src/game/balance.ts";
import { loadXT } from "./helpers/load.js";
import { memoryStore } from "./helpers/audio.js";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const CODES = ["en", "ru", "de", "ua", "sv"];
const OTHERS = CODES.filter((c) => c !== "en");

/** all leaf paths of an object, e.g. "towers.gun.ults.mini.name"; the credits list counts as one leaf */
const paths = (o, p = "") =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? paths(v, p + k + ".") : [p + k],
  );
const get = (o, path) => path.split(".").reduce((a, k) => a && a[k], o);
const placeholders = (s) => (typeof s === "string" ? (s.match(/\{\w+\}/g) || []).sort() : []);
const tags = (s) => (typeof s === "string" ? (s.match(/<\/?\w+>/g) || []).join("") : "");
const CYRILLIC = /[Ѐ-ӿ]/;
const everyString = (T) => [...paths(T.ui, "ui."), ...paths(T.game, "game.")].map((p) => [p, get(T, p)]);

describe("languages", () => {
  it("English is the default; ru, de, ua and sv are supported, each by its own name", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(LANG_CODES).toEqual(CODES);
    expect(LANGUAGES.map((l) => l.name)).toEqual(["English", "Русский", "Deutsch", "Українська", "Svenska"]);
  });

  it("every language has its texts.<code>.json file, and there are no others", () => {
    const files = readdirSync(new URL("../src/i18n/", import.meta.url)).filter((f) => f.endsWith(".json"));
    expect(files.sort()).toEqual(CODES.map((c) => `texts.${c}.json`).sort());
    for (const c of CODES) expect(TEXTS[c], c).toBeDefined();
  });

  it("Ukrainian is `ua` in the game and `uk` for the browser", () => {
    expect(htmlLang("ua")).toBe("uk");
    expect(htmlLang("sv")).toBe("sv");
    expect(languageFromTag("uk-UA")).toBe("ua");
    expect(isLang("uk")).toBe(false);
    expect(isLang("ua")).toBe(true);
  });
});

describe("every language is complete", () => {
  const base = everyString(TEXTS.en);

  it("English is the reference and has plenty of text", () => {
    expect(base.length).toBeGreaterThan(200);
  });

  it.each(OTHERS)("%s has exactly the same keys as English", (c) => {
    const mine = new Set(everyString(TEXTS[c]).map(([p]) => p));
    const ref = new Set(base.map(([p]) => p));
    expect(
      [...ref].filter((p) => !mine.has(p)),
      "missing",
    ).toEqual([]);
    expect(
      [...mine].filter((p) => !ref.has(p)),
      "extra",
    ).toEqual([]);
  });

  it.each(CODES)("%s: nothing is empty", (c) => {
    for (const [p, v] of everyString(TEXTS[c])) {
      if (p === "ui.credits") continue;
      expect(typeof v, p).toBe("string");
      expect(v.trim(), p).not.toBe("");
    }
  });

  it.each(OTHERS)("%s keeps the {placeholders} and HTML tags of every English string", (c) => {
    for (const [p, en] of base) {
      const v = get(TEXTS[c], p);
      expect(placeholders(v), `placeholders of ${p}`).toEqual(placeholders(en));
      expect(tags(v), `tags of ${p}`).toBe(tags(en));
    }
  });

  it.each(OTHERS)("%s has the same credits rows, with proper names left alone", (c) => {
    const en = TEXTS.en.ui.credits,
      mine = TEXTS[c].ui.credits;
    expect(mine).toHaveLength(en.length);
    en.forEach(([, name], i) => {
      expect(mine[i]).toHaveLength(2);
      if (["Dmitry Kovalev", "Claude Code", "Xeno Tactic"].includes(name)) expect(mine[i][1]).toBe(name);
    });
  });

  it.each(OTHERS)("%s is really translated, not a copy of English", (c) => {
    const same = base.filter(([p, en]) => typeof en === "string" && en.length > 12 && get(TEXTS[c], p) === en);
    expect(same.map(([p]) => p)).toEqual([]);
  });

  it("each file is written in its own script: Cyrillic for ru and ua, Latin for the rest", () => {
    for (const c of CODES) {
      const cyr = everyString(TEXTS[c]).filter(([, v]) => typeof v === "string" && CYRILLIC.test(v)).length;
      if (c === "ru" || c === "ua") expect(cyr, c).toBeGreaterThan(150);
      else expect(cyr, c).toBe(0);
    }
  });

  it("the letters that distinguish the languages are really used", () => {
    const all = (c) => JSON.stringify(TEXTS[c]);
    expect(all("de")).toMatch(/[äöüß]/);
    expect(all("sv")).toMatch(/[åäö]/);
    expect(all("ua")).toMatch(/[іїєґ]/);
    expect(all("ru")).not.toMatch(/[іїєґ]/);
    expect(all("ru")).toMatch(/ы/);
    expect(all("ua")).not.toMatch(/ы/);
  });
});

describe("the texts of the game data cover the balance", () => {
  const ids = {
    towers: Object.keys(BALANCE.towers),
    enemies: Object.keys(BALANCE.enemies),
    difficulties: Object.keys(BALANCE.difficulty),
    abilities: Object.keys(BALANCE.abilities),
    levels: Object.keys(BALANCE.levels),
  };

  it.each(CODES)("%s has a text for every tower, ultimate, enemy, difficulty, ability and level", (c) => {
    const g = TEXTS[c].game;
    for (const [section, list] of Object.entries(ids))
      expect(Object.keys(g[section]).sort(), `${c}.${section}`).toEqual([...list].sort());
    for (const t of ids.towers) {
      expect(g.towers[t].name && g.towers[t].desc, t).toBeTruthy();
      expect(Object.keys(g.towers[t].ults).sort(), `${t} ultimates`).toEqual(
        Object.keys(BALANCE.towers[t].ults).sort(),
      );
      for (const u of Object.values(g.towers[t].ults)) expect(u.name && u.desc).toBeTruthy();
    }
    for (const l of ids.levels) expect(g.levels[l].name && g.levels[l].desc, l).toBeTruthy();
    for (const e of ids.enemies) expect(g.enemies[e].name, e).toBeTruthy();
    for (const d of ids.difficulties) expect(g.difficulties[d].name && g.difficulties[d].desc, d).toBeTruthy();
    for (const a of ids.abilities)
      expect(g.abilities[a].name && g.abilities[a].short && g.abilities[a].desc, a).toBeTruthy();
  });
});

describe("the code only asks for strings that exist", () => {
  const en = TEXTS.en.ui;

  it("every data-i / data-i-label key used in index.html", () => {
    const keys = [...read("index.html").matchAll(/data-i(?:-label)?="([^"]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) expect(en[k], k).toBeDefined();
  });

  it("every literal t('key') used by the interface (src/ui)", () => {
    const ui = readdirSync(new URL("../src/ui/", import.meta.url)).map((f) => read("src/ui/" + f)).join(" ");
    const keys = new Set([...ui.matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"/g)].map((m) => m[1]));
    expect(keys.size).toBeGreaterThan(30);
    for (const k of keys) expect(en[k], k).toBeDefined();
  });

  it("every code the simulation returns to the player, and the toasts it emits", () => {
    // the simulation lives in several modules under src/game
    const core = ["grid", "game", "abilities", "waves", "combat"].map((f) => read(`src/game/${f}.ts`)).join(" ");
    const codes = new Set([...core.matchAll(/"(pc[A-Z]\w*|pc22|noCred|pickUlt)"/g)].map((m) => m[1]));
    expect([...codes].sort()).toEqual(["noCred", "pc22", "pcBlock", "pcEdge", "pcEnemy", "pcRes", "pcTrap", "pickUlt"]);
    for (const c of [...codes, "early", "cleared", "finalToast"]) expect(en[c], c).toBeDefined();
  });

  it("index.html is English by default and has a language selector instead of buttons", () => {
    const html = read("index.html");
    expect(html.replace(/<!--[\s\S]*?-->/g, "")).not.toMatch(CYRILLIC);
    expect(html).toMatch(/<select[^>]*id="langSel"/);
    expect(html).not.toMatch(/id="langs"/);
  });
});

describe("translator", () => {
  const make = (saved = null, browser = [], texts) =>
    createTranslator({ storage: memoryStore(saved ? { "xt-lang": saved } : {}), browserLanguages: browser, texts });

  it("starts in English when nothing is saved and the browser language is unknown", () => {
    expect(make().lang).toBe("en");
    expect(make(null, ["fr-FR", "ja"]).lang).toBe("en");
    expect(make(null, [""]).lang).toBe("en");
  });

  it("detects the language from the browser's list: the first one we know", () => {
    expect(make(null, ["de-AT", "en"]).lang).toBe("de");
    expect(make(null, ["fr", "sv-SE", "de"]).lang).toBe("sv");
    expect(make(null, ["uk-UA"]).lang).toBe("ua");
    expect(make(null, ["ru-RU"]).lang).toBe("ru");
    expect(make(null, ["EN-us"]).lang).toBe("en");
  });

  it("a saved choice wins over the browser, and garbage is ignored", () => {
    expect(make("sv", ["de"]).lang).toBe("sv");
    expect(make("klingon", ["de"]).lang).toBe("de");
    expect(make("uk", []).lang).toBe("en"); // "uk" is a browser tag, the saved code is "ua"
  });

  it("setLang switches and persists; an unknown code changes nothing", () => {
    const store = memoryStore();
    const t = createTranslator({ storage: store, browserLanguages: [] });
    expect(t.setLang("ua")).toBe(true);
    expect(t.lang).toBe("ua");
    expect(t.htmlLang).toBe("uk");
    expect(store.data["xt-lang"]).toBe("ua");
    expect(t.setLang("xx")).toBe(false);
    expect(t.lang).toBe("ua");
    expect(createTranslator({ storage: store, browserLanguages: [] }).lang).toBe("ua"); // remembered
  });

  it("translates, fills placeholders everywhere they occur, and follows the language", () => {
    const t = make();
    expect(t.t("play")).toBe("Play");
    t.setLang("de");
    expect(t.t("play")).toBe("Spielen");
    expect(t.t("cleared", { n: 7, b: 11 })).toBe("Welle 7 abgewehrt: +11 Kr.");
    const two = make(null, [], { en: { ui: { x: "{a} and {a}" }, game: {} } });
    expect(two.t("x", { a: "Z" })).toBe("Z and Z");
  });

  it("falls back to English for a string a language lacks, and to the key as a last resort", () => {
    const texts = {
      en: { ui: { a: "English A", b: "English B" }, game: { towers: { gun: { name: "Gun" } } } },
      de: { ui: { a: "Deutsch A" }, game: { towers: {} } },
    };
    const t = createTranslator({ storage: memoryStore({ "xt-lang": "de" }), browserLanguages: [], texts });
    expect(t.t("a")).toBe("Deutsch A");
    expect(t.t("b")).toBe("English B");
    expect(t.t("nope")).toBe("nope");
    expect(t.gameText("towers.gun.name")).toBe("Gun");
    expect(t.gameText("towers.gun.nothing")).toBe("towers.gun.nothing");
  });

  it("returns the credits list as it is, and game texts by path", () => {
    const t = make();
    expect(Array.isArray(t.t("credits"))).toBe(true);
    expect(t.gameText("towers.gun.ults.mini.name")).toBe("Minigun");
    t.setLang("sv");
    expect(t.gameText("towers.gun.name")).toBe("Kulspruta");
    expect(t.gameFields("towers.gun")).toEqual(["name", "desc"]);
    expect(t.gameFields("abilities.stasis").sort()).toEqual(["desc", "name", "short"]);
    expect(t.gameFields("towers.nope")).toEqual([]);
  });
});

describe("language detection", () => {
  it("is a pure function", () => {
    expect(detectLanguage(null, ["de"])).toBe("de");
    expect(detectLanguage("ru", ["de"])).toBe("ru");
    expect(detectLanguage("zz", [])).toBe("en");
  });
});

describe("the app facade (XT.i18n and the texts on XT.core data)", () => {
  const setup = () => loadXT(["i18n", "core"], { globals: {} });

  it("exposes the languages for the selector", () => {
    const { i18n } = setup();
    expect(i18n.LANGUAGES.map((l) => l.code)).toEqual(CODES);
    expect(i18n.LANGUAGES.map((l) => l.name)).toContain("Українська");
    expect(i18n.lang).toBe("en");
    expect(i18n.htmlLang).toBe("en");
  });

  it("the data objects carry names and descriptions that follow the language live", () => {
    const XT = setup();
    const { core, i18n } = XT;
    expect(core.TT.gun.name).toBe("Machine Gun");
    expect(i18n.L(core.TT.gun)).toBe("Machine Gun");
    i18n.setLang("de");
    expect(core.TT.gun.name).toBe("Maschinengewehr");
    expect(i18n.L(core.TT.gun, "desc")).toMatch(/Panzerung/);
    expect(core.TT.gun.ults.mini.name).toBe("Minigun");
    expect(core.TT.gun.ults.sniper.name).toBe("Scharfschütze");
    expect(core.ET.queen.name).toBe("Schwarmkönigin");
    expect(core.DIFF.insane.name).toBe("Unmöglich");
    expect(core.AB.carpet.short).toBe("Bomben");
    i18n.setLang("ua");
    expect(core.TT.gun.name).toBe("Кулемет");
    expect(core.ET.queen.name).toBe("Королева рою");
    i18n.setLang("en");
    expect(core.TT.gun.name).toBe("Machine Gun");
  });

  it("the numbers are untouched: only texts were added to the data", () => {
    const { core } = setup();
    expect(core.TT.gun.cost).toEqual(BALANCE.towers.gun.cost);
    expect(Object.keys(core.TT.gun).sort()).toEqual([...Object.keys(BALANCE.towers.gun), "desc", "name"].sort());
  });

  it.each(CODES)("%s: every tower, enemy, difficulty and ability reads a real text (not its path)", (c) => {
    const { core, i18n } = setup();
    i18n.setLang(c);
    const all = [
      ...core.TKEYS.map((k) => core.TT[k]),
      ...core.TKEYS.flatMap((k) => Object.values(core.TT[k].ults)),
      ...Object.values(core.ET),
      ...core.DKEYS.map((k) => core.DIFF[k]),
      ...core.AKEYS.map((k) => core.AB[k]),
    ];
    expect(all.length).toBe(8 + 16 + 9 + 4 + 5);
    for (const o of all) {
      expect(o.name, c).toBeTruthy();
      expect(o.name).not.toMatch(/\./);
    }
  });
});

describe("level texts", () => {
  // The board turns in portrait, so a description must not say where on the screen anything is.
  const DIRECTION =
    /(?<![a-z])(left|right|top|bottom|above|below|north|south|east|west)(?![a-z])|слева|справа|сверху|снизу|links|rechts|oben|unten|зліва|праворуч|згори|знизу|vänster|höger|uppifrån|nedifrån/i;
  it.each(CODES)("%s: names are short and descriptions mention no screen directions", (c) => {
    for (const [id, l] of Object.entries(TEXTS[c].game.levels)) {
      expect(l.name.length, id).toBeLessThan(24);
      expect(l.desc, `${c}.${id}`).not.toMatch(DIRECTION);
    }
  });

  it("the matcher knows what it is looking for", () => {
    expect("enemies from the left").toMatch(DIRECTION);
    expect("Feinde von links").toMatch(DIRECTION);
    expect("three lanes to hold").not.toMatch(DIRECTION);
  });
});

describe("texts that depend on how the board is turned", () => {
  // The board is turned 90° in portrait: board x runs top → bottom on screen, board y runs right → left.
  it("only the carpet-bombing description has a rotated form (route labels come from the geometry)", () => {
    const rotated = paths(TEXTS.en.game, "game.").filter((p) => p.endsWith("Rotated"));
    expect(rotated).toEqual(["game.abilities.carpet.descRotated"]);
    for (const c of CODES) expect(TEXTS[c].game.routes, c).toBeUndefined();
  });

  it.each(CODES)("%s: the four directions read differently, and the carpet text changes with the board", (c) => {
    const ui = TEXTS[c].ui;
    const dirs = [ui.dirRight, ui.dirLeft, ui.dirDown, ui.dirUp];
    expect(new Set(dirs).size).toBe(4);
    for (const d of dirs) expect(d, c).toMatch(/→/);
    expect(TEXTS[c].game.abilities.carpet.descRotated).not.toBe(TEXTS[c].game.abilities.carpet.desc);
  });

  it("the rotated carpet text is a live property of the core data, in every language", () => {
    const { core, i18n } = loadXT(["i18n", "core"], { globals: {} });
    expect(core.AB.carpet.descRotated).toMatch(/column/);
    i18n.setLang("de");
    expect(core.AB.carpet.descRotated).toMatch(/Spalte/);
    expect(core.AB.carpet.desc).toMatch(/Reihe/);
    expect(core.TT.gun.labelRotated).toBeUndefined(); // nothing else has one
  });
});
