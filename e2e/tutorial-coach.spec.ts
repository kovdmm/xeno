// The tutorial's coach: the box, the marks, Next and Skip, Escape, the flags and the replay button. A new player (no flags)
// starts on the first map and gets the steps; every other test of the suite has the flag set to "done" by the harness.
import { expect, test, type Page } from "@playwright/test";
import { core, openGame, tick } from "./harness";

const flag = (page: Page) => page.evaluate(() => localStorage.getItem("xt-tutorial"));

/** puts a tower of the given type on the first free cell the game allows */
const build = (page: Page, type: string, from = 0) =>
  core(
    page,
    (C, a) => {
      let n = 0;
      for (let y = 1; y < C.H - 1; y++)
        for (let x = 1; x < C.W - 1; x++)
          if (C.placeCheck(x, y, 1) === "" && n++ >= a.from && C.place(a.type as "gun", x, y).ok) return true;
      return false;
    },
    { type, from },
  );

test.describe("the coach, for a new player", () => {
  test.beforeEach(async ({ page }) => {
    await openGame(page, { newPlayer: true });
    await tick(page, 40);
  });

  test("the first step names the goal and marks the gates; Next goes on to building", async ({ page }) => {
    await expect(page.locator("#coach")).toBeVisible();
    await expect(page.locator("#coachTxt")).toContainText("Aliens crawl out of the cave");
    await expect(page.locator("#coachStep")).toHaveText("1 / 9");
    await expect(page.locator(".coachRing").first()).toBeVisible();
    expect(await page.locator(".coachRing").count()).toBeGreaterThanOrEqual(2); // the entrance and the exit
    await page.click("#coachNext");
    await tick(page, 2);
    await expect(page.locator("#coachTxt")).toContainText("Machine Gun");
    await expect(page.locator("#coachNext")).toBeHidden();
    // the marked thing is the gun button, dimmed around
    const ring = (await page.locator(".coachRing.dim").boundingBox())!;
    const gun = (await page.locator('.tb[data-t="gun"]').boundingBox())!;
    expect(Math.abs(ring.x + ring.width / 2 - (gun.x + gun.width / 2))).toBeLessThan(3);
    expect(Math.abs(ring.y + ring.height / 2 - (gun.y + gun.height / 2))).toBeLessThan(3);
  });

  test("the steps follow the game: a tower, four towers, the waves called early", async ({ page }) => {
    await page.click("#coachNext");
    await build(page, "gun");
    await tick(page, 2);
    await expect(page.locator("#coachTxt")).toContainText("longer"); // the maze
    for (let i = 1; i < 4; i++) await build(page, "gun", i * 6);
    await tick(page, 2);
    await expect(page.locator("#coachTxt")).toContainText("Start"); // call the wave early
    await page.click("#go"); // wave 1 (the timer was not running: not an early call)
    await tick(page, 2);
    await page.click("#go"); // wave 2 with the timer far from out: early
    await tick(page, 2);
    await expect(page.locator("#coachStep")).toHaveText("5 / 9");
    await expect(page.locator("#coachTxt")).toContainText("Again");
  });

  test("Skip ends the steps for good: the flag is saved and the next game has none", async ({ page }) => {
    await page.click("#coachSkip");
    await tick(page, 2);
    await expect(page.locator("#coach")).toBeHidden();
    expect(await flag(page)).toBe("skipped");
    await page.evaluate(() => window.XT.ui.newGame());
    await tick(page, 3);
    await expect(page.locator("#coach")).toBeHidden();
  });

  test("Escape skips the tutorial when there is nothing else to close, and does not pause the game", async ({
    page,
  }) => {
    await page.keyboard.press("Escape");
    await tick(page, 2);
    await expect(page.locator("#coach")).toBeHidden();
    await expect(page.locator("#pause")).toBeHidden();
    expect(await flag(page)).toBe("skipped");
  });

  test("a screen on top hides the coach; it is back when the screen closes", async ({ page }) => {
    await page.click("#pauseBtn");
    await tick(page, 2);
    await expect(page.locator("#coach")).toBeHidden();
    await page.click("#pResume");
    await tick(page, 2);
    await expect(page.locator("#coach")).toBeVisible();
  });

  test("the last step finishes it: the flag is 'done'", async ({ page }) => {
    for (let i = 0; i < 20 && (await flag(page)) === null; i++) {
      // the steps that wait for the game are played through the game, the others by Next
      await page.evaluate(() => 0);
      if (await page.locator("#coachNext").isVisible()) await page.click("#coachNext");
      else
        await core(page, (C) => {
          const S = C.S;
          const cap = S.towers.length + 4; // fresh towers each time: one on level 3 takes no plain upgrade
          C.cheat("lxgiwyl");
          for (let y = 1; y < C.H - 1 && S.towers.length < cap; y++)
            for (let x = 1; x < C.W - 1 && S.towers.length < cap; x++)
              if (C.placeCheck(x, y, 1) === "") C.place("gun", x, y);
          C.sendWave(true);
          for (const t of S.towers) C.upgrade(t);
        });
      await tick(page, 2);
    }
    expect(["done", "skipped"]).toContain(await flag(page));
  });
});

test("the tutorial's game is never offered for the records, nothing is asked on leaving it", async ({ page }) => {
  await page.route(/\/api\/run(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ seed: 77, token: "a.b", build: "x", expires: Date.now() + 6 * 3600_000 }),
    }),
  );
  const got = page.waitForResponse((r) => r.url().includes("/api/run?level"));
  await openGame(page, { newPlayer: true });
  await got;
  await tick(page, 5);
  await page.click("#coachSkip"); // skipped or not, it is the tutorial's game
  await core(page, (C) => {
    let g = 0;
    while (!C.S.over && g++ < 4000) {
      C.sendWave(true);
      for (let i = 0; i < 60 && !C.S.over; i++) C.step(1 / 60);
    }
  });
  await tick(page, 3);
  await expect(page.locator("#over")).toBeVisible();
  await expect(page.locator("#saveBox")).toBeHidden();
  await page.click("#restart");
  await expect(page.locator("#saveAsk")).toBeHidden();
  expect(await core(page, (C) => C.S.over)).toBe(false);
});

test("the settings replay the tutorial: the flag is cleared and the steps start on their map", async ({ page }) => {
  await openGame(page); // an old player: flag done, another map
  await page.evaluate(() => window.XT.ui.openMenu());
  await page.click("#mSettings");
  await page.click("#tutReplay");
  await tick(page, 3);
  await expect(page.locator("#settings")).toBeHidden();
  await expect(page.locator("#coachStep")).toHaveText("1 / 9");
  expect(await core(page, (C) => C.LEVEL)).toBe("switchback");
  expect(await flag(page)).toBe("");
});

test("the tips are switched on and off in the settings, and the choice is kept", async ({ page }) => {
  await openGame(page, { newPlayer: true }); // a new player has the tips on
  await page.evaluate(() => window.XT.ui.openMenu());
  await page.click("#mSettings");
  await expect(page.locator("#tipsBtn")).toHaveText("Tips: on");
  await page.click("#tipsBtn");
  await expect(page.locator("#tipsBtn")).toHaveText("Tips: off");
  expect(await page.evaluate(() => localStorage.getItem("xt-tips-off"))).toBe("1");
  await page.click("#tipsBtn");
  await expect(page.locator("#tipsBtn")).toHaveText("Tips: on");
  expect(await page.evaluate(() => localStorage.getItem("xt-tips-off"))).toBe("");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the box and the marks fit the screen", async ({ page }) => {
    await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
    await page.goto("/");
    await page.waitForFunction(() => window.XT?.i18n);
    if (await page.locator("#fsAsk").isVisible()) await page.click("#fsNo");
    await page.click("#mPlay");
    await expect(page.locator("#coachBox")).toBeVisible();
    const b = (await page.locator("#coachBox").boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    expect(b.y + b.height).toBeLessThanOrEqual(844);
    const skip = (await page.locator("#coachSkip").boundingBox())!;
    expect(skip.height).toBeGreaterThanOrEqual(43.9);
    await page.click("#coachNext");
    await expect(page.locator(".coachRing.dim")).toBeVisible();
  });
});
