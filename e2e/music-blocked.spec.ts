// Same regression with autoplay blocked, as for real visitors: playback waits for the first gesture.
import { test, expect, type Page } from "@playwright/test";
import { open, copies, sweep, musicReady, single } from "./music-helpers";

declare const Howler: { _howls: { _loop: boolean; _duration: number }[] };

test.use({ launchOptions: { args: ["--autoplay-policy=document-user-activation-required"] } });

test("sliding before the first click, then clicking", async ({ page }) => {
  await open(page);
  await page.waitForFunction(() => Howler._howls.some((h) => h._loop && h._duration > 30), null, { timeout: 60000 });
  await sweep(page, [30, 0, 0, 40, 80, 0, 20]);
  await page.mouse.click(640, 400); // the first gesture unlocks audio
  // wait for the music to actually play (how long that takes depends on the load of the machine): then it must
  // be one copy, and stay one; a stacked copy would show up in the next samples
  await musicReady(page);
  await expect.poll(() => copies(page), { timeout: 10000 }).toEqual(single);
  await stays(page);
  await sweep(page, [50, 0, 70]);
  await expect.poll(() => copies(page), { timeout: 10000 }).toEqual(single);
  await stays(page);
});

/** the music stays a single copy over a short while */
async function stays(page: Page) {
  for (let i = 0; i < 5; i++) {
    expect(await copies(page)).toEqual(single);
    await page.waitForTimeout(100);
  }
}
