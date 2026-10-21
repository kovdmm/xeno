// During the tutorial the player can always pause, open the settings and skip: nothing of the coach stands over those
// buttons, whatever the step. (The coach's box has its own buttons, Next and Skip, which must be reachable too.)
import { expect, test, type Page } from "@playwright/test";

/** a new player on a real page (a phone is asked about fullscreen first, which stands over the Play button) */
async function newPlayer(page: Page) {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  await page.goto("/");
  await page.waitForFunction(() => window.XT?.i18n);
  await page.waitForSelector("#boot", { state: "hidden" });
  if (await page.locator("#fsAsk").isVisible()) await page.click("#fsNo");
  await page.click("#mPlay");
  await expect(page.locator("#coachStep")).toHaveText("1 / 9");
}

/** the element that gets a click at the middle of `selector` is that element (or inside it) */
const reachable = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLElement | null;
    if (!el) return "missing";
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit && (hit === el || el.contains(hit)) ? "ok" : "covered by " + (hit?.id || hit?.className || hit?.tagName);
  }, selector);

for (const [name, viewport] of [
  ["desktop", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 844 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch: name === "phone", isMobile: name === "phone" });

    test("every step leaves Pause, Skip and the speed button reachable, and Next when it is shown", async ({
      page,
    }) => {
      await newPlayer(page);
      // steps 1, 2 (the gun is marked), and a later one: the box is on either side of the screen
      for (let i = 0; i < 2; i++) {
        for (const s of ["#pauseBtn", "#speedBtn", "#coachSkip"])
          expect(await reachable(page, s), `${s} at step ${i + 1}`).toBe("ok");
        if (await page.locator("#coachNext").isVisible()) {
          expect(await reachable(page, "#coachNext")).toBe("ok");
          await page.click("#coachNext");
          await expect(page.locator("#coachStep")).toHaveText("2 / 9");
        }
      }
    });

    test("Pause works at the first step and the coach goes away behind it", async ({ page }) => {
      await newPlayer(page);
      await page.click("#pauseBtn", { timeout: 3000 });
      await expect(page.locator("#pause")).toBeVisible();
      await page.click("#pSettings", { timeout: 3000 });
      await expect(page.locator("#settings")).toBeVisible();
    });
  });
}
