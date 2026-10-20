// On a phone settings and help are full-screen pages with a back arrow on the left, not windows with a cross;
// the desktop layout keeps its windows.
import { test, expect, type Page } from "@playwright/test";

test.use({ locale: "en-US" });

async function open(page: Page) {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  await page.goto("/");
  await page.waitForFunction(() => window.XT?.i18n);
  if (await page.locator("#fsAsk").isVisible()) await page.click("#fsNo");
}

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const [id, opener, closer] of [
    ["settings", "#mSettings", "#setClose"],
    ["help", "#mHelp", "#helpClose"],
  ] as const) {
    test(`${id} is a full-screen page with a back arrow`, async ({ page }) => {
      await open(page);
      await page.click(opener);
      const dialog = page.locator(`#${id} .in`);
      await expect(dialog).toBeVisible();
      const vp = page.viewportSize()!;
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBe(0);
      expect(box.width).toBe(vp.width);
      const back = page.locator(closer);
      const b = (await back.boundingBox())!;
      expect(b.x).toBeLessThan(vp.width / 4); // on the left, where the thumb expects "back"
      expect(b.width).toBeGreaterThan(43.9);
      expect(b.height).toBeGreaterThan(43.9);
      await expect(back).toHaveAttribute("aria-label", "Close");
      await page.screenshot({ path: test.info().outputPath(`${id}-phone.png`) });
      await back.click();
      await expect(page.locator(`#${id}`)).toBeHidden();
    });
  }
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("settings stay a window with the cross on the right", async ({ page }) => {
    await open(page);
    await page.click("#mSettings");
    const box = (await page.locator("#settings .in").boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(620);
    const b = (await page.locator("#setClose").boundingBox())!;
    expect(b.x).toBeGreaterThan(box.x + box.width / 2);
  });
});
