// Same regression with autoplay blocked, as for real visitors: playback waits for the first gesture.
import { test, expect } from "@playwright/test";
import { open, copies, sweep, single } from "./music-helpers";

declare const Howler: { _howls: { _loop: boolean; _duration: number }[] };

test.use({ launchOptions: { args: ["--autoplay-policy=document-user-activation-required"] } });

test("sliding before the first click, then clicking", async ({ page }) => {
  await open(page);
  await page.waitForFunction(() => Howler._howls.some((h) => h._loop && h._duration > 30), null, { timeout: 20000 });
  await sweep(page, [30, 0, 0, 40, 80, 0, 20]);
  await page.mouse.click(640, 400); // the first gesture unlocks audio
  await page.waitForTimeout(800);
  expect(await copies(page)).toEqual(single);
  await sweep(page, [50, 0, 70]);
  await page.waitForTimeout(400);
  expect(await copies(page)).toEqual(single);
});
