import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const read = (f) => readFileSync(new URL("../src/" + f, import.meta.url), "utf8");
const files = readdirSync(new URL("../src/", import.meta.url)).filter((f) => /\.(js|ts)$/.test(f));

describe("source hygiene", () => {
  it("only the three simulation/fx/audio modules may fall back to Math.random, exactly once each", () => {
    for (const f of files) {
      const n = (read(f).match(/Math\.random/g) || []).length;
      expect(n, f).toBe(["core", "render", "audio"].some((m) => f.startsWith(m + ".")) ? 1 : 0);
    }
  });

  it("no module writes to window.XT any more: wiring happens in main only", () => {
    for (const f of files) if (!f.startsWith("main.")) expect(read(f), f).not.toMatch(/window\.XT/);
  });

  it("no leftover IIFE wrappers or 'use strict' (modules are strict already)", () => {
    for (const f of files) {
      expect(read(f), f).not.toMatch(/\(function \(XT\)/);
      expect(read(f), f).not.toMatch(/^\s*"use strict";/m);
    }
  });
});
