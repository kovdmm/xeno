// Installability in the real browser: the manifest is served and valid, the service worker takes over,
// and the game starts with the network gone.
import { test, expect, type Page } from "@playwright/test";

test.use({ locale: "en-US", serviceWorkers: "allow" });

test("the manifest is linked and its icons load", async ({ page, request }) => {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const res = await request.get(new URL(href!, page.url()).href);
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
  // nothing to show yet: the button waits, and the note points to the browser menu
  await expect(page.locator("#installBtn")).toBeDisabled();
  await expect(page.locator("#installNote")).toBeVisible();
  await expect(page.locator("#installNote")).toContainText("browser menu");
  // the browser announces that installing is possible
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt(): Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    e.prompt = async () => void ((window as unknown as { __prompted: boolean }).__prompted = true);
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
  await expect(page.locator("#installBtn")).toBeEnabled();
  await expect(page.locator("#installNote")).toBeHidden();
  await expect(page.locator("#installBtn")).toHaveText("Install the app");
  await page.click("#installBtn");
  expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.locator("#installBtn")).toHaveText("Installed as an app");
});

test("an install offer that arrived while the game was loading is not lost", async ({ page }) => {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  // what index.html keeps for the app when the browser's offer comes early
  await page.addInitScript(() => {
    const e = new Event("beforeinstallprompt") as Event & { prompt(): Promise<void>; userChoice: Promise<unknown> };
    e.prompt = async () => {};
    e.userChoice = Promise.resolve({ outcome: "dismissed" });
    (window as unknown as { __xtInstall: Event }).__xtInstall = e;
  });
  await page.goto("/");
  await page.waitForFunction(() => window.XT?.i18n);
  await page.click("#mSettings");
  await expect(page.locator("#installBtn")).toBeEnabled();
  await expect(page.locator("#installNote")).toBeHidden();
});

test("the service worker never caches the highscore service: the table must be fresh", async ({ page }) => {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  await page.goto("/?sw");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.evaluate(() => fetch("api/scores?limit=5").catch(() => null));
  await page.evaluate(() => fetch("api/run?level=crossroads&diff=easy").catch(() => null));
  const urls = await page.evaluate(async () =>
    (
      await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).map((r) => r.url)))
    ).flat(),
  );
  expect(urls.length).toBeGreaterThan(0); // the game itself is cached
  expect(urls.filter((u) => u.includes("/api/"))).toEqual([]);
  expect(await page.evaluate(() => caches.keys())).toEqual(["xeno-v3"]);
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

  const asApp = (page: Page) =>
    page.addInitScript(() => {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) =>
        /display-mode/.test(q)
          ? ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)
          : mm(q);
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

test("the screen is kept awake while a game runs and let go on the pause", async ({ page }) => {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  await page.addInitScript(() => {
    const w = window as unknown as { __wake: { requests: number; active: number } };
    w.__wake = { requests: 0, active: 0 };
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: async () => {
          w.__wake.requests++;
          w.__wake.active++;
          let released = false;
          const s = {
            get released() {
              return released;
            },
            release: async () => {
              if (!released) w.__wake.active--;
              released = true;
            },
            addEventListener() {},
          };
          return s;
        },
      },
    });
  });
  const wake = () => page.evaluate(() => (window as unknown as { __wake: { active: number } }).__wake.active);
  await page.goto("/");
  await page.waitForFunction(() => window.XT?.i18n);
  expect(await wake()).toBe(0); // the menu is no game
  await page.click("#mPlay");
  await expect.poll(wake, { timeout: 4000 }).toBe(1);
  await page.click("#pauseBtn");
  await expect.poll(wake, { timeout: 4000 }).toBe(0);
  await page.click("#pResume");
  await expect.poll(wake, { timeout: 4000 }).toBe(1);
});
