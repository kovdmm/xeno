// Random mazes and waves: whatever the player builds, every enemy ends up killed or through the gate, the
// books stay balanced and nothing becomes NaN.
import { describe, expect, it } from "vitest";
import { loadXT, mulberry32 } from "./helpers/load";

function randomGame(seed) {
  const C = loadXT(["core"], { seed }).core;
  C.newGame("hard");
  C.cheat("hesoyam");
  const rnd = mulberry32(seed * 31);
  const types = C.TKEYS;
  for (let i = 0; i < 60; i++) {
    const type = types[Math.floor(rnd() * types.length)];
    const r = C.place(type, Math.floor(rnd() * C.W), Math.floor(rnd() * C.H));
    if (r.ok) for (let u = 0; u < Math.floor(rnd() * 4); u++) C.upgrade(r.tower);
  }
  return { C, rnd };
}

const finite = (c) => Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.hp);

describe("random mazes", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`seed ${seed}: waves end, nothing breaks`, () => {
      const { C } = randomGame(seed);
      expect(C.S.towers.length).toBeGreaterThan(5);
      let stuck: { wave: number; creeps: unknown[][] } | null = null;
      for (let wave = 1; wave <= 25 && !C.S.over; wave++) {
        C.sendWave();
        let t = 0;
        // run until this wave is gone: its enemies have a generous time limit to cross the board
        while (!C.S.over && (C.S.creeps.length || C.S.spawners.length) && t < 240) {
          C.step(0.05);
          t += 0.05;
          for (const c of C.S.creeps) if (!finite(c)) throw new Error("NaN creep " + c.type);
        }
        if (C.S.creeps.length && !C.S.over) stuck = { wave, creeps: C.S.creeps.map((c) => [c.type, c.x, c.y, c.hp]) };
        if (stuck) break;
        expect(C.S.credits).toBeGreaterThanOrEqual(0);
        expect(C.S.lives).toBeGreaterThanOrEqual(0);
      }
      expect(stuck).toBeNull();
      // the books: what is left of each wave equals the creeps alive plus those still to be spawned
      for (const [w, n] of Object.entries(C.S.left)) {
        const alive = C.S.creeps.filter((c) => c.wave === +w && !c.dead).length;
        const pending = C.S.spawners.filter((s) => s.wave === +w).reduce((a, s) => a + s.list.length, 0);
        expect(n, `wave ${w}`).toBe(alive + pending);
      }
    });
  }
});

describe("random play", () => {
  it(
    "builds, upgrades, sells, casts and calls waves at random on every difficulty: the numbers stay sane",
    { timeout: 120000 },
    () => {
      const problems: string[] = [];
      for (let seed = 1; seed <= 24; seed++) {
        const C = loadXT(["core"], { seed }).core;
        C.newGame(["easy", "normal", "hard", "insane"][seed % 4]);
        C.cheat("hesoyam");
        const rnd = mulberry32(seed * 977);
        for (let step = 0; step < 6000 && !C.S.over; step++) {
          const r = rnd();
          if (r < 0.01) {
            const type = C.TKEYS[Math.floor(rnd() * C.TKEYS.length)];
            const p = C.place(type, Math.floor(rnd() * C.W), Math.floor(rnd() * C.H));
            if (p.ok && rnd() < 0.6)
              for (let u = 0; u < 5; u++)
                C.upgrade(p.tower, rnd() < 0.5 ? Object.keys(C.TT[type].ults)[0] : Object.keys(C.TT[type].ults)[1]);
          } else if (r < 0.013 && C.S.towers.length) C.sell(C.S.towers[Math.floor(rnd() * C.S.towers.length)]);
          else if (r < 0.016) C.cast(C.AKEYS[Math.floor(rnd() * 5)], [rnd() * C.W, rnd() * C.H]);
          else if (r < 0.02) C.sendWave(true);
          C.step(0.05);
          const S = C.S;
          const bad = !Number.isFinite(S.credits)
            ? "credits"
            : S.credits < 0
              ? "negative credits"
              : S.creeps.some((c) => !Number.isFinite(c.x + c.y + c.hp))
                ? "NaN creep"
                : S.proj.some((p) => !Number.isFinite(p.x + p.y))
                  ? "NaN proj"
                  : S.towers.some((t) => S.grid[t.gy * C.W + t.gx] !== t)
                    ? "grid mismatch"
                    : null;
          if (bad) {
            problems.push(`seed ${seed} step ${step}: ${bad}`);
            break;
          }
        }
      }
      expect(problems).toEqual([]);
    },
  );
});
