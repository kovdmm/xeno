// Regression: changing the music volume must never stack a second copy of the loop (real howler.js,
// autoplay allowed). See music-helpers.js.
import { test, expect } from "@playwright/test";
import { open, copies, sweep, musicReady, single } from "./music-helpers";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test("volume sweeps while playing", async ({ page }) => {
  await open(page);
  await musicReady(page);
  expect(await copies(page)).toEqual(single);
  await sweep(page, [90, 70, 50, 30, 10, 60, 100, 40]);
  expect(await copies(page)).toEqual(single);
});

test("down to zero and back, repeatedly", async ({ page }) => {
  await open(page);
  await musicReady(page);
  for (let i = 0; i < 4; i++) {
    await sweep(page, [20, 0, 0, 35]);
    expect((await copies(page)).live).toBe(1);
  }
  expect(await copies(page)).toEqual(single);
});

test("volume changed while the loop is still being composed and decoded", async ({ page }) => {
  await open(page);
  await sweep(
    page,
    Array.from({ length: 60 }, (_, i) => 10 + ((i * 7) % 90)),
  );
  await musicReady(page);
  await page.waitForTimeout(500);
  expect(await copies(page)).toEqual(single);
});

test("saved volume 0, raised later", async ({ page }) => {
  await open(page, { storage: { "xt-mvol": "0" } });
  await page.waitForTimeout(4000);
  expect((await copies(page)).live).toBe(0);
  await sweep(page, [10, 0, 20, 0, 30]);
  await page.waitForTimeout(500);
  expect(await copies(page)).toEqual(single);
});

test("real settings dialog: keyboard on the slider and mute toggling", async ({ page }) => {
  await open(page);
  await musicReady(page);
  await page.click("#mSettings");
  await page.focus("#musVol");
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowLeft");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await page.click("#sndToggle");
  await page.click("#sndToggle");
  await page.focus("#musVol");
  await page.keyboard.press("Home");
  await page.keyboard.press("End");
  await page.waitForTimeout(500);
  expect(await copies(page)).toEqual(single);
});
