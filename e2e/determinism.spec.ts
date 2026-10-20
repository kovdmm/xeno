// The simulation must give the same bits in every engine (a run is replayed on the server to check a score), and
// the interface must still run the game at the speed the player chose, now in whole ticks.
import { existsSync } from "node:fs";
import { chromium, firefox, test, expect, webkit } from "@playwright/test";
import { core, openGame, tick } from "./harness";
import { GAME_DIGEST, MATH_DIGEST, RUN_DIGEST } from "../src/game/digests";

const ENGINES = { chromium, firefox, webkit } as const;

for (const [name, type] of Object.entries(ENGINES)) {
  test(`${name}: dmath and a scripted game give the same digests as node`, async ({ baseURL }) => {
    test.skip(!existsSync(type.executablePath()), `${name} is not installed on this machine`);
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
      await page.goto(baseURL!);
      // the modules are served by the dev server, so this runs the very code the game runs
      const math = await page.evaluate(`import("/src/game/dmathCheck.ts").then((m) => m.mathDigest())`);
      const game = await page.evaluate(`import("/src/game/selfCheck.ts").then((m) => m.gameDigest())`);
      expect(math).toBe(MATH_DIGEST);
      expect(game).toBe(GAME_DIGEST);
      expect(await page.evaluate(`import("/src/game/selfCheck.ts").then((m) => m.runDigest())`)).toBe(RUN_DIGEST);
    } finally {
      await browser.close();
    }
  });
}

// the whole point: a run recorded in one engine is replayed in another (here: Chromium, as the server's node is
// V8 too) and comes to the very same end
for (const [name, type] of Object.entries(ENGINES)) {
  test(`a run recorded in ${name} replays to the same end in chromium`, async ({ baseURL }) => {
    test.skip(!existsSync(type.executablePath()), `${name} is not installed on this machine`);
    const open = async (t: typeof chromium) => {
      const browser = await t.launch();
      const page = await browser.newPage();
      await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
      await page.goto(baseURL!);
      return { browser, page };
    };
    const a = await open(type);
    const b = await open(chromium);
    try {
      const rec = (await a.page.evaluate(`import("/src/game/selfCheck.ts").then((m) => m.recordedGame())`)) as {
        run: unknown;
        ended: unknown;
      };
      const replayed = await b.page.evaluate(([src, run]) => new Function("run", "return " + src)(run), [
        `import("/src/game/selfCheck.ts").then((m) => m.replay(run))`,
        rec.run,
      ] as const);
      expect(replayed).toEqual({ ok: true, outcome: rec.ended });
    } finally {
      await a.browser.close();
      await b.browser.close();
    }
  });
}

test("the game runs at the chosen speed: 60 frames are 1, 2, 3 and 5 seconds of game time", async ({ page }) => {
  await openGame(page);
  const t = () => core(page, (C) => C.S.t);
  for (const speed of [1, 2, 3, 5]) {
    const before = await t();
    await tick(page, 60);
    expect(((await t()) - before) / speed, `x${speed}`).toBeCloseTo(1, 4);
    await page.click("#speedBtn"); // next speed
  }
});

test("the game advances in whole ticks only", async ({ page }) => {
  await openGame(page);
  const before = await core(page, (C) => C.S.t);
  await tick(page, 7);
  const ticks = ((await core(page, (C) => C.S.t)) - before) * 60;
  expect(Math.abs(ticks - Math.round(ticks))).toBeLessThan(1e-6);
});
