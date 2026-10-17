import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(js|ts)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
const files = walk(ROOT).map((f) => ({ name: relative(ROOT, f).replaceAll("\\", "/"), text: readFileSync(f, "utf8") }));

describe("source hygiene", () => {
  it("Math.random appears only as the default random stream of the three subsystems, once each", () => {
    const allowed = { "game/game.ts": 1, "render.js": 1, "audio.js": 1 };
    for (const f of files) expect((f.text.match(/Math\.random/g) || []).length, f.name).toBe(allowed[f.name] ?? 0);
  });

  it("no module writes to window.XT any more: wiring happens in main only", () => {
    for (const f of files) if (f.name !== "main.js") expect(f.text, f.name).not.toMatch(/window\.XT/);
  });

  it("no leftover IIFE wrappers or 'use strict' (modules are strict already)", () => {
    for (const f of files) {
      expect(f.text, f.name).not.toMatch(/\(function \(XT\)/);
      expect(f.text, f.name).not.toMatch(/^\s*"use strict";/m);
    }
  });

  it("the simulation (src/game) knows nothing about the browser, texts or colours", () => {
    for (const f of files.filter((f) => f.name.startsWith("game/"))) {
      expect(f.text, f.name).not.toMatch(/(document|window|localStorage|canvas|requestAnimationFrame|i18n)/);
      expect(f.text, f.name).not.toMatch(/name_en|desc_en|#[0-9a-fA-F]{6}/);
    }
  });
});
