// Regression: changing the music volume must never stack a second copy of the loop.
// These tests use the real howler.js (served from node_modules, same version as the CDN one), because
// the failure depends on Howler's asynchronous loading and its autoplay unlock queue, which fakes hide.
import { readFileSync } from "node:fs";

const howler = readFileSync("node_modules/howler/dist/howler.min.js", "utf8"); /* cwd = project root */

export async function open(page, { storage = {} } = {}) {
  await page.route(/googleapis|gstatic/, (r) => r.abort());
  await page.route(/cdnjs.*howler/, (r) => r.fulfill({ contentType: "text/javascript", body: howler }));
  await page.addInitScript((st) => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v);
  }, storage);
  await page.goto("/");
}

/** Music = looping Howl longer than 30 s. Returns how many copies are playing and how many exist at all. */
export const copies = (page) =>
  page.evaluate(() => {
    const music = Howler._howls.filter((h) => h._loop && h._duration > 30);
    return {
      howls: music.length,
      sounds: music.reduce((n, h) => n + h._sounds.length, 0),
      live: music.reduce((n, h) => n + h._sounds.filter((s) => !s._paused && !s._ended).length, 0),
    };
  });
export const slider = (page, v) =>
  page.evaluate((v) => {
    const e = document.getElementById("musVol");
    e.value = v;
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
export const sweep = async (page, values) => {
  for (const v of values) {
    await slider(page, v);
    await page.waitForTimeout(40);
  }
};
export const musicReady = (page) =>
  page.waitForFunction(() => window.XT?.audio?.musicPlaying?.(), null, { timeout: 20000 });
export const single = { howls: 1, sounds: 1, live: 1 };
