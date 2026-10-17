// Installability in the real browser: the manifest is served and valid, the service worker takes over,
// and the game starts with the network gone.
import { test, expect } from "@playwright/test";

test.use({ locale: "en-US", serviceWorkers: "allow" });

test("the manifest is linked and its icons load", async ({ page, request }) => {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const res = await request.get(new URL(href, page.url()).href);
  expect(res.ok()).toBe(true);
  const m = await res.json();
  for (const i of m.icons) {
    const r = await request.get(new URL(i.src, page.url()).href);
    expect(r.ok(), i.src).toBe(true);
    expect(r.headers()["content-type"]).toMatch(/image\//);
  }
});

test("the settings offer installing; without a browser offer the button says so", async ({ page }) => {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  await page.goto("/");
  await page.waitForFunction(() => window.XT?.i18n);
  await page.click("#mSettings");
  await expect(page.locator("#installBtn")).toBeDisabled();
  await expect(page.locator("#installBtn")).toHaveText("Installing is not available in this browser");
  // the browser announces that installing is possible
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = async () => (window.__prompted = true);
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
  await expect(page.locator("#installBtn")).toBeEnabled();
  await expect(page.locator("#installBtn")).toHaveText("Install the app");
  await page.click("#installBtn");
  expect(await page.evaluate(() => window.__prompted)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.locator("#installBtn")).toHaveText("Installed as an app");
});

test("the service worker caches the game, which then opens offline", async ({ page, context }) => {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  await page.goto("/?sw");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the worker, every file passes through it
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.waitForFunction(() => window.XT?.i18n);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.XT?.i18n);
  await expect(page.locator("#mPlay")).toHaveText("Play");
});

test.describe("installed app", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  const asApp = (page) =>
    page.addInitScript(() => {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => (/display-mode/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q));
    });

  test("no fullscreen question and no fullscreen button: the app already has the whole screen", async ({ page }) => {
    await asApp(page);
    await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
    await page.goto("/");
    await page.waitForFunction(() => window.XT?.i18n);
    await page.click("#mPlay");
    await page.waitForTimeout(300);
    await expect(page.locator("#fsAsk")).toBeHidden();
    await page.click("#pauseBtn");
    await page.click("#pSettings");
    await expect(page.locator("#fsBtn")).toBeHidden();
    await expect(page.locator("#installBtn")).toHaveText("Installed as an app");
  });

  test("in a normal browser tab on a phone the question is still asked", async ({ page }) => {
    await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
    await page.addInitScript(() => {
      Object.defineProperty(document, "fullscreenEnabled", { value: true });
      Element.prototype.requestFullscreen ||= () => Promise.resolve();
    });
    await page.goto("/");
    await page.waitForFunction(() => window.XT?.i18n);
    await expect(page.locator("#fsAsk")).toBeVisible();
  });
});

test.describe("system bar on Android (the window gets shorter for a moment)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  const open = async (page, installed) => {
    if (installed)
      await page.addInitScript(() => {
        const mm = window.matchMedia.bind(window);
        window.matchMedia = (q) =>
          /display-mode/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q);
      });
    await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
    await page.goto("/");
    await page.waitForFunction(() => window.XT?.i18n);
    if (await page.locator("#fsAsk").isVisible()) await page.click("#fsNo"); // the browser tab asks about fullscreen
    await page.click("#mPlay");
    await page.waitForTimeout(300);
  };
  const box = (page) => page.locator("#fw").boundingBox();

  test("installed app: the field and the layout stay put while the bar is out", async ({ page }) => {
    await open(page, true);
    const before = await box(page);
    const appH = await page.evaluate(() => document.getElementById("app").getBoundingClientRect().height);
    await page.setViewportSize({ width: 390, height: 744 }); // the bar covers 100 px
    await page.waitForTimeout(200);
    expect(await box(page)).toEqual(before);
    expect(await page.evaluate(() => document.getElementById("app").getBoundingClientRect().height)).toBe(appH);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    expect(await box(page)).toEqual(before);
  });

  test("installed app: turning the device still re-fits everything", async ({ page }) => {
    await open(page, true);
    const portrait = await box(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    const landscape = await box(page);
    expect(landscape.width).toBeGreaterThan(portrait.width);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    expect(await box(page)).toEqual(portrait);
  });

  test("a normal browser tab keeps following its window (the browser's bars must be able to shrink the page)", async ({ page }) => {
    await open(page, false);
    const before = await box(page);
    await page.setViewportSize({ width: 390, height: 600 });
    await page.waitForTimeout(300);
    expect((await box(page)).height).toBeLessThan(before.height);
    expect(await page.evaluate(() => document.getElementById("app").style.height)).toBe("");
  });
});
