// The loading screen must stay until the fonts of the menu text are in, so the menu does not change its face
// after it is shown (FEEDBACK #18). A slow font network is simulated; a blocked one must not hold the game back.
import { test, expect, type Page } from "@playwright/test";

const FONT_DELAY = 2200; // longer than the old 1.5 s cut-off

/** Google Fonts replaced by a stylesheet and a font file that arrives late (or never) */
async function slowFonts(page: Page, { block = false }: { block?: boolean } = {}) {
  await page.route(/googleapis.*css2/, (r) =>
    r.fulfill({
      contentType: "text/css",
      body: [
        '@font-face{font-family:"Russo One";src:url(https://fonts.gstatic.com/russo.woff2) format("woff2");font-display:swap}',
        '@font-face{font-family:"PT Sans Narrow";font-weight:400;src:url(https://fonts.gstatic.com/pt4.woff2) format("woff2");font-display:swap}',
        '@font-face{font-family:"PT Sans Narrow";font-weight:700;src:url(https://fonts.gstatic.com/pt7.woff2) format("woff2");font-display:swap}',
      ].join("\n"),
    }),
  );
  await page.route(/gstatic.*woff2/, async (r) => {
    if (block) return; // never answered
    await new Promise((f) => setTimeout(f, FONT_DELAY));
    await r.abort(); // a missing file settles the load as well; what counts is when the page is revealed
  });
  await page.route(/cdnjs/, (r) => r.abort());
}

/** when (ms after the navigation started) the loading screen was lifted, and what the fonts were doing then */
async function revealTime(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __revealed?: number; __pending?: number };
    new MutationObserver(() => {
      if (w.__revealed === undefined && document.documentElement.classList.contains("ready")) {
        w.__revealed = performance.now();
        w.__pending = [...document.fonts].filter((f) => f.status === "loading" || f.status === "unloaded").length;
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
  });
}

test("the loading screen waits for the fonts of the menu text", async ({ page }) => {
  await slowFonts(page);
  await revealTime(page);
  await page.goto("/");
  await page.waitForSelector("#boot", { state: "hidden", timeout: 10000 });
  const { at, pending } = await page.evaluate(() => {
    const w = window as unknown as { __revealed: number; __pending: number };
    return { at: w.__revealed, pending: w.__pending };
  });
  expect(at).toBeGreaterThan(FONT_DELAY - 300);
  expect(pending).toBe(0); // nothing left to swap in after the reveal
});

test("a font that never comes does not hold the game back", async ({ page }) => {
  await slowFonts(page, { block: true });
  await revealTime(page);
  await page.goto("/", { waitUntil: "commit" });
  await page.waitForSelector("#boot", { state: "hidden", timeout: 5500 });
  await expect(page.locator("#mPlay")).toBeVisible();
});
