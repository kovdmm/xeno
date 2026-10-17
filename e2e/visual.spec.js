import { test, expect } from "@playwright/test";
import { openGame, tick, core, field, cellToClient } from "./harness.js";
import { SCENES } from "./scenes.js";

async function scene(page, name, frames = 0) {
  await core(page, SCENES[name]);
  await tick(page, frames);
}
const shot = (page, name) => expect(field(page)).toHaveScreenshot(name + ".png");

test.describe("desktop", () => {
  test.beforeEach(async ({ page }) => openGame(page));

  test("empty field", async ({ page }) => {
    await core(page, (C) => C.newGame("easy"));
    await tick(page, 5);
    await shot(page, "empty");
  });

  test("tower gallery", async ({ page }) => {
    await scene(page, "towers", 10);
    await shot(page, "towers");
  });

  test("tower levels: five tiers of every type", async ({ page }) => {
    await scene(page, "levels", 10);
    await shot(page, "tower-levels");
  });

  test("ground battle", async ({ page }) => {
    await scene(page, "groundBattle", 420);
    await shot(page, "ground-battle");
  });

  test("air battle", async ({ page }) => {
    await scene(page, "airBattle", 360);
    await shot(page, "air-battle");
  });

  test("boss wave", async ({ page }) => {
    await scene(page, "bossBattle", 480);
    await shot(page, "boss-battle");
  });

  test("abilities: meteors, napalm, carpet bombing", async ({ page }) => {
    await scene(page, "groundBattle", 240);
    await core(page, (C) => {
      C.cast("meteor", [8, 6]);
      C.cast("napalm", [12, 10]);
      C.cast("carpet", [4, 8]);
    });
    await tick(page, 70);
    await shot(page, "abilities");
  });

  test("nuke: marker, then blast", async ({ page }) => {
    await scene(page, "groundBattle", 240);
    await core(page, (C) => C.cast("nuke", [9, 7]));
    await tick(page, 45);
    await shot(page, "nuke-marker");
    await tick(page, 60);
    await shot(page, "nuke-blast");
  });

  test("stasis tints the field", async ({ page }) => {
    await scene(page, "groundBattle", 240);
    await core(page, (C) => C.cast("stasis"));
    await tick(page, 30);
    await shot(page, "stasis");
  });

  test("selected tower shows its range", async ({ page }) => {
    await scene(page, "groundBattle", 60);
    const p = await cellToClient(page, [13.5, 5.5]);
    await page.mouse.click(p.x, p.y);
    await tick(page, 10);
    await shot(page, "selected");
  });

  test("placement preview: allowed and blocked", async ({ page }) => {
    await scene(page, "groundBattle", 60);
    await page.keyboard.press("8"); // howitzer, 2x2
    const ok = await cellToClient(page, [17, 3]);
    await page.mouse.move(ok.x, ok.y);
    await tick(page, 5);
    await shot(page, "preview-ok");
    const bad = await cellToClient(page, [1.5, 7.5]); // next to the spawn: reserved cells
    await page.mouse.move(bad.x, bad.y);
    await tick(page, 5);
    await shot(page, "preview-blocked");
  });

  test("aiming an ability", async ({ page }) => {
    await scene(page, "groundBattle", 60);
    await page.keyboard.press("w"); // meteors: a circle
    const p = await cellToClient(page, [10, 7]);
    await page.mouse.move(p.x, p.y);
    await tick(page, 5);
    await shot(page, "aim-circle");
    await page.keyboard.press("r"); // carpet bombing: a row
    await tick(page, 3);
    await shot(page, "aim-row");
  });

  test("game over leaves the canvas intact", async ({ page }) => {
    await core(page, (C) => {
      C.newGame("easy");
      C.S.lives = 1;
      C.sendWave();
    });
    await tick(page, 60 * 70);
    expect(await core(page, (C) => C.S.over)).toBe(true);
    await shot(page, "game-over");
  });
});

test.describe("portrait (board turned 90°)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => openGame(page));

  test("ground battle", async ({ page }) => {
    await scene(page, "groundBattle", 420);
    await shot(page, "portrait-ground-battle");
  });

  test("tower gallery", async ({ page }) => {
    await scene(page, "towers", 10);
    await shot(page, "portrait-towers");
  });

  test("placement preview", async ({ page }) => {
    await scene(page, "groundBattle", 60);
    await page.keyboard.press("2");
    const p = await cellToClient(page, [17, 3]);
    await page.mouse.move(p.x, p.y);
    await tick(page, 5);
    await shot(page, "portrait-preview");
  });
});

test("the run is reproducible: two sessions render identical frames", async ({ browser }) => {
  const frame = async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await openGame(page, { seed: 5 });
    await scene(page, "groundBattle", 300);
    const png = await field(page).screenshot();
    await page.close();
    return png;
  };
  expect((await frame()).equals(await frame())).toBe(true);
});
