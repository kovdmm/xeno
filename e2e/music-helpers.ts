// Regression: changing the music volume must never stack a second copy of the loop.
// These tests use the real howler.js (served from node_modules, same version as the CDN one), because
// the failure depends on Howler's asynchronous loading and its autoplay unlock queue, which fakes hide.
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/** the parts of howler.js's internals the checks read */
interface HowlInternals {
  _loop: boolean;
  _duration: number;
  _sounds: { _paused: boolean; _ended: boolean }[];
}
declare const Howler: { _howls: HowlInternals[] };

const howler = readFileSync("node_modules/howler/dist/howler.min.js", "utf8"); /* cwd = project root */

export async function open(page: Page, { storage = {} }: { storage?: Record<string, string> } = {}) {
  await page.route(/googleapis|gstatic/, (r) => r.abort());
  await page.route(/cdnjs.*howler/, (r) => r.fulfill({ contentType: "text/javascript", body: howler }));
  await page.addInitScript((st) => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v);
  }, storage);
  await page.goto("/");
  // a cold dev server may still be transforming modules: wait until the game has installed its audio
  await page.waitForFunction(() => window.XT?.audio?.ok === true, null, { timeout: 30000 });
}

/** Music = looping Howl longer than 30 s. Returns how many copies are playing and how many exist at all. */
export const copies = (page: Page) =>
  page.evaluate(() => {
    const music = Howler._howls.filter((h) => h._loop && h._duration > 30);
    return {
      howls: music.length,
      sounds: music.reduce((n, h) => n + h._sounds.length, 0),
      live: music.reduce((n, h) => n + h._sounds.filter((s) => !s._paused && !s._ended).length, 0),
    };
  });
export const slider = (page: Page, v: number) =>
  page.evaluate((v) => {
    const e = document.getElementById("musVol") as HTMLInputElement;
    e.value = String(v);
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
export const sweep = async (page: Page, values: number[]) => {
  for (const v of values) {
    await slider(page, v);
    await page.waitForTimeout(40);
  }
};
export const musicReady = (page: Page) =>
  page.waitForFunction(() => window.XT?.audio?.musicPlaying?.(), null, { timeout: 20000 });
export const single = { howls: 1, sounds: 1, live: 1 };
