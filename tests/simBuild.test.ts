import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NOT_THE_GAME, simBuild } from "../scripts/simBuild";

describe("the fingerprint of the simulation", () => {
  const dir = mkdtempSync(join(tmpdir(), "simbuild-"));
  const file = (name: string, text: string) => writeFileSync(join(dir, name), text);
  const hash = () => simBuild(dir);
  file("game.ts", "export const a = 1;\n");

  it("changes with any file of the game, including ones whose name merely ends like a check", () => {
    const before = hash();
    file("placeCheck.ts", "export const x = 1;\n"); // sim logic, named like a check: must count
    const withIt = hash();
    expect(withIt).not.toBe(before);
    file("placeCheck.ts", "export const x = 2;\n");
    expect(hash()).not.toBe(withIt);
    file("levelCheck.ts", "export const y = 1;\n");
    expect(hash()).not.toBe(withIt);
  });

  it("does not change with the determinism fingerprints, which are not the game", () => {
    const before = hash();
    for (const name of NOT_THE_GAME) file(name, "export const changed = Math.random();\n");
    expect(hash()).toBe(before);
  });

  it("does not depend on the line endings of the checkout", () => {
    file("game.ts", "export const a = 1;\nexport const b = 2;\n");
    const lf = hash();
    file("game.ts", "export const a = 1;\r\nexport const b = 2;\r\n");
    expect(hash()).toBe(lf);
  });

  it("the real simulation has a fingerprint", () => {
    expect(simBuild()).toMatch(/^[0-9a-f]{12}$/);
    rmSync(dir, { recursive: true });
  });
});
