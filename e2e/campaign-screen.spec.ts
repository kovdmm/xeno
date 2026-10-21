// The maps and difficulties have a screen of their own; the settings hold only settings.
import { test, expect, type Page } from "@playwright/test";
import { core, openGame } from "./harness";

const menu = (page: Page) => page.evaluate(() => XT.ui.openMenu());
const visible = (page: Page, id: string) => page.locator("#" + id).isVisible();

test.describe("the campaign screen", () => {
  test.beforeEach(async ({ page }) => {
    await openGame(page);
    await menu(page);
  });

  test("the settings hold no grid, and the campaign screen is closed until it is asked for", async ({ page }) => {
    expect(await visible(page, "campaignPage")).toBe(false);
    await page.click("#mSettings");
    await expect(page.locator("#settings")).toBeVisible();
    await expect(page.locator("#settings #campaign")).toHaveCount(0);
    await expect(page.locator("#settings #confirm")).toHaveCount(0);
    expect(await visible(page, "campaignPage")).toBe(false);
    for (const id of ["langSel", "fsBtn", "installBtn", "sndToggle", "sndVol", "musVol"])
      await expect(page.locator(`#settings #${id}`), id).toHaveCount(1);
  });

  test("the title's Map and Difficulty buttons open it, and not the settings", async ({ page }) => {
    for (const button of ["#mLevel", "#mDiff"]) {
      await page.click(button);
      await expect(page.locator("#campaignPage")).toBeVisible();
      await expect(page.locator("#settings")).toBeHidden();
      await expect(page.locator("#campaign .cc")).toHaveCount(16);
      await page.click("#campClose");
      await expect(page.locator("#campaignPage")).toBeHidden();
      await expect(page.locator("#menu")).toBeVisible(); // back on the title
    }
  });

  test("Escape and a tap beside the window close it, and only it", async ({ page }) => {
    await page.click("#mLevel");
    await page.keyboard.press("Escape");
    await expect(page.locator("#campaignPage")).toBeHidden();
    await expect(page.locator("#menu")).toBeVisible();
    await page.click("#mLevel");
    await page.mouse.click(4, 4); // the dark edge of the page, outside the window
    await expect(page.locator("#campaignPage")).toBeHidden();
  });

  test("from the pause screen: its own button opens it, Escape comes back to the pause", async ({ page }) => {
    await page.click("#mPlay");
    await page.click("#pauseBtn");
    await expect(page.locator("#pause")).toBeVisible();
    await page.click("#pCampaign");
    await expect(page.locator("#campaignPage")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#campaignPage")).toBeHidden();
    await expect(page.locator("#pause")).toBeVisible(); // Escape closed the top screen only
    await page.click("#pSettings");
    await expect(page.locator("#settings")).toBeVisible();
    await expect(page.locator("#campaignPage")).toBeHidden();
  });

  test("from the end screen: Map and difficulty opens it", async ({ page }) => {
    await page.click("#mPlay");
    await core(page, (C) => {
      let g = 0;
      while (!C.S.over && g++ < 4000) {
        C.sendWave(true);
        for (let i = 0; i < 60 && !C.S.over; i++) C.step(1 / 60);
      }
    });
    await expect(page.locator("#over")).toBeVisible();
    await expect(page.locator("#overDiff")).toHaveText("Map and difficulty");
    await page.click("#overDiff");
    await expect(page.locator("#campaignPage")).toBeVisible();
    await expect(page.locator("#settings")).toBeHidden();
  });

  test("choosing an open cell starts that game and closes the screen", async ({ page }) => {
    await page.click("#mDiff");
    await page.click('#campaign [data-l="crossroads"][data-d="hard"]');
    await expect(page.locator("#campaignPage")).toBeHidden();
    expect(await core(page, (C) => C.difficulty())).toBe("hard");
    await expect(page.locator("#mDiff")).toContainText("Hard");
  });

  test("a closed cell does nothing and the screen stays", async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.click("#mLevel");
    const locked = page.locator("#campaign .cc.lock").first();
    await expect(locked).toBeDisabled();
    await locked.click({ force: true });
    await expect(page.locator("#campaignPage")).toBeVisible();
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the campaign screen is a full-screen page with a back arrow on the left, the grid fits", async ({ page }) => {
    await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
    await page.goto("/");
    await page.waitForFunction(() => window.XT?.i18n);
    if (await page.locator("#fsAsk").isVisible()) await page.click("#fsNo"); // a phone is asked about fullscreen first
    await menu(page);
    await page.click("#mLevel");
    const dialog = page.locator("#campaignPage .in");
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.width).toBe(390);
    const back = (await page.locator("#campClose").boundingBox())!;
    expect(back.x).toBeLessThan(100);
    expect(back.width).toBeGreaterThan(43.9);
    // the grid is not wider than the screen
    const wide = await page.evaluate(
      () => document.getElementById("campaignPage")!.scrollWidth > window.innerWidth + 1,
    );
    expect(wide).toBe(false);
    await page.click("#campClose");
    await expect(page.locator("#campaignPage")).toBeHidden();
  });
});
