import { describe, it, expect } from "vitest";
import { atan2, cos, exp, hypot, log, pow, sin } from "../src/game/dmath";
import { mathDigest } from "../src/game/dmathCheck";
import { MATH_DIGEST } from "../src/game/digests";
import { mulberry32 } from "../src/game/rng";

/** relative error, with an absolute floor so values near zero do not blow it up */
const err = (a: number, b: number) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b), 1e-9);

function worst(
  n: number,
  input: (r: () => number) => number[],
  ours: (...a: number[]) => number,
  ref: (...a: number[]) => number,
) {
  const r = mulberry32(12345);
  let w = 0;
  for (let i = 0; i < n; i++) {
    const a = input(r);
    w = Math.max(w, err(ours(...a), ref(...a)));
  }
  return w;
}

describe("dmath: close to Math (a few ulp)", () => {
  it("sin and cos on the angles the game produces (and far beyond)", () => {
    for (const range of [7, 100, 20000]) {
      expect(worst(50000, (r) => [(r() - 0.5) * 2 * range], sin, Math.sin)).toBeLessThan(5e-14);
      expect(worst(50000, (r) => [(r() - 0.5) * 2 * range], cos, Math.cos)).toBeLessThan(5e-14);
    }
  });

  it("atan2 in every quadrant, tiny and huge ratios", () => {
    expect(worst(100000, (r) => [(r() - 0.5) * 40, (r() - 0.5) * 40], atan2, Math.atan2)).toBeLessThan(5e-15);
    expect(worst(20000, (r) => [(r() - 0.5) * 1e-6, (r() - 0.5) * 40], atan2, Math.atan2)).toBeLessThan(5e-15);
    expect(worst(20000, (r) => [(r() - 0.5) * 40, (r() - 0.5) * 1e-6], atan2, Math.atan2)).toBeLessThan(5e-15);
  });

  it("atan2 keeps the signs of zero like Math.atan2", () => {
    for (const y of [0, -0])
      for (const x of [0, -0, 1, -1]) expect(Object.is(atan2(y, x), Math.atan2(y, x)), `${y},${x}`).toBe(true);
    for (const y of [1, -1]) {
      expect(atan2(y, 0)).toBeCloseTo(Math.atan2(y, 0), 15);
      expect(atan2(y, -0)).toBeCloseTo(Math.atan2(y, -0), 15);
    }
  });

  it("hypot", () => {
    expect(worst(50000, (r) => [(r() - 0.5) * 200, (r() - 0.5) * 200], hypot, Math.hypot)).toBeLessThan(1e-15);
  });

  it("exp and log", () => {
    expect(worst(50000, (r) => [(r() - 0.5) * 40], exp, Math.exp)).toBeLessThan(5e-15);
    expect(worst(50000, (r) => [r() * 1000 + 1e-6], log, Math.log)).toBeLessThan(5e-14);
    expect(log(1)).toBe(0);
    expect(err(log(1e-310), Math.log(1e-310))).toBeLessThan(1e-14); // subnormal
  });

  it("pow: integer exponents (multiplications) and fractional ones", () => {
    expect(worst(30000, (r) => [1 + r() * 0.5, Math.floor(r() * 300)], pow, Math.pow)).toBeLessThan(1e-13);
    expect(worst(30000, (r) => [1 + r() * 0.5, -Math.floor(r() * 50)], pow, Math.pow)).toBeLessThan(1e-13);
    expect(worst(30000, (r) => [0.1 + r() * 300, r() * 3], pow, Math.pow)).toBeLessThan(1e-13);
    expect(pow(7, 0)).toBe(1);
  });
});

describe("dmath: the same bits everywhere", () => {
  it("the digest over a fixed input set is the recorded one (the browsers must give it too: e2e/determinism.spec.ts)", () => {
    expect(mathDigest()).toBe(MATH_DIGEST);
  });
});
