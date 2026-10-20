// The install suggestion on a phone: a sheet over the menu, offered once, remembered when declined.
import { test, expect, type Page } from "@playwright/test";

test.use({ locale: "en-US", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** the browser announces that installing is possible */
const offer = (page: Page) =>
  page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt(): Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    e.prompt = async () => void ((window as unknown as { __prompted: boolean }).__prompted = true);
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });

async function open(page: Page) {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  await page.goto("/");
  await page.waitForFunction(() => window.XT?.i18n);
  // the fullscreen question comes first when the browser can do fullscreen: answer it
  if (await page.locator("#fsAsk").isVisible()) await page.click("#fsNo");
}

test("is shown once, and the browser's dialog opens from it", async ({ page }) => {
  await open(page);
  await expect(page.locator("#installAsk")).toBeHidden(); // nothing to offer yet
  await offer(page);
  await expect(page.locator("#installAsk")).toBeVisible();
  await page.click("#installYes");
  await expect(page.locator("#installAsk")).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true);
});

test('does not come back after "Not now"', async ({ page }) => {
  await open(page);
  await offer(page);
  await page.click("#installNo");
  await expect(page.locator("#installAsk")).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => window.XT?.i18n);
  if (await page.locator("#fsAsk").isVisible()) await page.click("#fsNo");
  await offer(page);
  await page.waitForTimeout(300);
  await expect(page.locator("#installAsk")).toBeHidden();
});
