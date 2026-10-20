// Deterministic version of the "autoplay blocked" regression (music-blocked.spec.ts depends on whether the
// browser really blocks autoplay, which varies with the load of the machine): the audio context is forced to
// stay suspended until the test lets the first gesture resume it.
import { test, expect } from "@playwright/test";
import { open, copies, sweep, musicReady, single } from "./music-helpers";

declare const Howler: { _howls: { _loop: boolean; _duration: number }[]; ctx: { state: string } };

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __allowResume: boolean };
    w.__allowResume = false;
    const Native = window.AudioContext;
    // a context that starts suspended and resumes only once the test says the first gesture has happened
    window.AudioContext = class extends Native {
      constructor(...a: ConstructorParameters<typeof Native>) {
        super(...a);
        void super.suspend();
      }
      resume() {
        // a blocked browser leaves the promise pending: howler must not take the context for running
        return w.__allowResume ? super.resume() : new Promise<void>(() => {});
      }
    };
  });
});

for (const [name, values] of [
  ["slider swept through 0 before the first gesture", [30, 0, 0, 40, 80, 0, 20]],
  ["slider left at 0 and raised before the first gesture", [0, 0, 60]],
  ["slider untouched", []],
] as const) {
  test(`music starts after the first gesture: ${name}`, async ({ page }) => {
    await open(page);
    await page.waitForFunction(() => Howler._howls.some((h) => h._loop && h._duration > 30), null, { timeout: 60000 });
    expect(await page.evaluate(() => Howler.ctx.state)).toBe("suspended");
    await sweep(page, [...values]);
    await page.evaluate(() => ((window as unknown as { __allowResume: boolean }).__allowResume = true));
    await page.mouse.click(640, 400); // the first gesture
    await musicReady(page);
    await expect.poll(() => copies(page), { timeout: 10000 }).toEqual(single);
  });
}
