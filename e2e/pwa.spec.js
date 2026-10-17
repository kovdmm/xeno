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
