import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(mjs|js|ts)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
const files = walk(ROOT).map((f) => ({ name: relative(ROOT, f).replaceAll("\\", "/"), text: readFileSync(f, "utf8") }));
const under = (dir) => files.filter((f) => f.name.startsWith(dir + "/"));
const code = (f) => f.text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // without comments

// A whole word that is not a property access or an object/type key (`healer.window`, `window: number` are fine,
// a bare `window` is the browser's).
const word = (...names) => new RegExp("(?<![.\\w])(" + names.join("|") + ")(?![\\w])(?!\\s*:)");
const BROWSER = word("document", "window", "localStorage", "canvas", "requestAnimationFrame", "i18n");

describe("source hygiene", () => {
  it("the checks below can fail: the word matcher recognises what it is meant to", () => {
    expect(BROWSER.test("const x = window.innerWidth")).toBe(true);
    expect(BROWSER.test("document.getElementById")).toBe(true);
    expect(BROWSER.test("K.healer.window")).toBe(false);
    expect(BROWSER.test("  window: number;")).toBe(false);
    expect(BROWSER.test("windowed")).toBe(false);
    expect(word("Howl", "Howler").test("new Howl({})")).toBe(true);
  });

  it("Math.random appears only as the default random stream of the three subsystems, once each", () => {
    const allowed = { "game/game.ts": 1, "render/browser.ts": 1, "audio/browser.ts": 1 };
    for (const f of files) expect((f.text.match(/Math\.random/g) || []).length, f.name).toBe(allowed[f.name] ?? 0);
  });

  it("window.XT is only a debugging handle set in main.ts: no other module reads or writes it", () => {
    for (const f of files) if (f.name !== "main.ts") expect(f.text, f.name).not.toMatch(/window\.XT|(?<![.\w])XT\./);
  });

  it("no leftover IIFE wrappers or 'use strict' (modules are strict already)", () => {
    for (const f of files) {
      expect(f.text, f.name).not.toMatch(/\(function \(XT\)/);
      expect(f.text, f.name).not.toMatch(/^\s*"use strict";/m);
    }
  });

  it("no stray control characters in the sources (a backspace once replaced a regex escape)", () => {
    const OTHER = ["../tests/", "../e2e/", "../scripts/"].flatMap((d) => {
      const dir = join(ROOT, d);
      return walk(dir).map((f) => ({ name: relative(ROOT, f).replaceAll("\\", "/"), text: readFileSync(f, "utf8") }));
    });
    for (const f of [...files, ...OTHER]) expect(f.text, f.name).not.toMatch(/[\x00-\x08\x0b\x0c\x0e-\x1f]/);
  });

  it("the simulation (src/game) knows nothing about the browser, texts or colours", () => {
    for (const f of under("game")) {
      expect(code(f), f.name).not.toMatch(BROWSER);
      expect(code(f), f.name).not.toMatch(word("name_en", "desc_en"));
      expect(code(f), f.name).not.toMatch(/#[0-9a-fA-F]{6}(?![\w])/);
    }
  });

  it("the audio layer is separated: only howlerOut touches howler, nothing touches the DOM or game state", () => {
    for (const f of under("audio")) {
      if (f.name !== "audio/howlerOut.ts") expect(code(f), f.name).not.toMatch(word("Howl", "Howler"));
      expect(code(f), f.name).not.toMatch(word("document", "window", "localStorage", "requestAnimationFrame"));
      // game types are fine (events), game code is not
      for (const line of f.text.split("\n").filter((l) => /from "\.\.\/(\.\.\/)?game\//.test(l)))
        expect(line, f.name).toMatch(/^import type /);
    }
  });

  it("the renderer (src/render) gets the browser, time and randomness from outside, and only reads the game", () => {
    for (const f of under("render").filter((x) => x.name !== "render/browser.ts")) {
      const c = code(f);
      expect(c, f.name).not.toMatch(word("document", "window", "localStorage", "requestAnimationFrame", "matchMedia", "i18n"));
      expect(c, f.name).not.toMatch(/Math\.random|performance\.now/);
      // from the game: types, and the gate helper
      expect(f.text, f.name).not.toMatch(/import (?!type)[^;]*from "\.\.\/(\.\.\/)?game\/(?!constants")/);
    }
  });

  it("layers are independent: they never import each other (only the floor needs the tower plates)", () => {
    for (const f of under("render/layers"))
      for (const line of f.text.split("\n").filter((l) => /from "\.\/[a-zA-Z]+"/.test(l)))
        expect(f.name === "render/layers/floor.ts" && /\.\/towers"/.test(line), `${f.name}: ${line}`).toBe(true);
  });

  it("the interface (src/ui): the text and logic modules are free of the DOM, nothing but the entry point builds the parts", () => {
    const PURE = ["cards", "keys", "format", "state", "progress", "view", "difficulty", "icons", "types", "context"];
    for (const n of PURE) {
      const f = files.find((x) => x.name === `ui/${n}.ts`);
      expect(f, n).toBeDefined();
      expect(code(f), f.name).not.toMatch(word("document", "window", "localStorage", "requestAnimationFrame", "matchMedia"));
    }
    for (const f of under("ui")) {
      expect(code(f), f.name).not.toMatch(word("Howl", "Howler", "localStorage"));
      expect(code(f), f.name).not.toMatch(/Math\.random/);
      // the game is reached through `core`: from src/game only types (and the pure constants) are imported
      expect(f.text, f.name).not.toMatch(/import (?!type)[^;]*from "\.\.\/game\/(?!constants")/);
    }
  });

  it("the music composer knows no sound and the renderer no tunes", () => {
    const get = (n) => code(files.find((f) => f.name === n));
    expect(get("audio/music/composer.ts")).not.toMatch(/Math\.(sin|exp|pow)|Float32Array/);
    expect(get("audio/music/render.ts")).not.toMatch(/progression|chords/);
  });
});
