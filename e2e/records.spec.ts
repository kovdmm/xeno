// The highscore table in the interface, against a stand-in for the service: a seed arrives after the game was made,
// the game is played to its end, the name is sent with the run, the table is read. Nothing here needs the real server.
import { test, expect, type Page, type Route } from "@playwright/test";
import { core, openGame } from "./harness";

const GRANT = { seed: 12345, token: "grant.signature", build: "x", expires: Date.now() + 6 * 3600_000 };

type Posted = { run: { seed: number; level: string; diff: string; actions: unknown[] }; nick: string; token: string };

/** a stand-in for /api/run and /api/scores; `posts` gets what the page sent */
async function fakeServer(
  page: Page,
  o: { post?: (n: number) => { status: number; body: unknown }; rows?: unknown[]; seeds?: boolean } = {},
) {
  const posts: Posted[] = [];
  await page.route(/\/api\/run(\?|$)/, async (route: Route) => {
    const req = route.request();
    if (req.method() === "POST") {
      posts.push(req.postDataJSON());
      const r = (o.post ?? (() => ({ status: 200, body: { ok: true, nick: "Ann", rank: 2, improved: true } })))(
        posts.length,
      );
      return route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
    }
    if (o.seeds === false) return route.abort();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GRANT) });
  });
  await page.route(/\/api\/scores\?/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: o.rows ?? [] }) }),
  );
  return posts;
}

/**
 * Opens the game and waits until the server's seed has come and been taken: the untouched game is started over on it
 * as soon as it arrives, and a test that plays before that would play a game that cannot be entered.
 */
async function openSeeded(page: Page) {
  const got = page.waitForResponse((r) => r.url().includes("/api/run?level"));
  await openGame(page);
  await got;
  await page.evaluate(() => 0); // what the page does with the answer is done in the microtasks that run before this returns
}

/** plays the game on to the end: waves called at once, no defence */
const loseTheGame = (page: Page) =>
  core(page, (C) => {
    let guard = 0;
    while (!C.S.over && guard++ < 4000) {
      C.sendWave(true);
      for (let i = 0; i < 60 && !C.S.over; i++) C.step(1 / 60);
    }
  });

test.describe("saving a finished game", () => {
  test("a game that started from the server's seed can be entered: the name and the run go to the server", async ({
    page,
  }) => {
    const posts = await fakeServer(page);
    await openSeeded(page);
    await loseTheGame(page);
    await expect(page.locator("#over")).toBeVisible();
    await expect(page.locator("#saveBox")).toBeVisible();
    await page.fill("#saveNick", "Ann");
    await page.click("#saveBtn");
    await expect(page.locator("#saveMsg")).toContainText("Saved!");
    await expect(page.locator("#saveMsg")).toContainText("Place 2");
    await expect(page.locator("#saveBtn")).toBeHidden(); // it is in: no second try
    expect(posts).toHaveLength(1);
    expect(posts[0].nick).toBe("Ann");
    expect(posts[0].token).toBe(GRANT.token);
    expect(posts[0].run.seed).toBe(GRANT.seed);
    expect(posts[0].run.actions.length).toBeGreaterThan(0);
    // the name is remembered for the next game
    expect(await page.evaluate(() => localStorage.getItem("xt-nick"))).toBe("Ann");
  });

  test("a busy server: the player is told, and can try again", async ({ page }) => {
    const posts = await fakeServer(page, {
      post: (n) =>
        n === 1
          ? { status: 503, body: { error: "busy" } }
          : { status: 200, body: { ok: true, nick: "Ann", rank: 1, improved: true } },
    });
    await openSeeded(page);
    await loseTheGame(page);
    await page.fill("#saveNick", "Ann");
    await page.click("#saveBtn");
    await expect(page.locator("#saveMsg")).toContainText("busy");
    await expect(page.locator("#saveBtn")).toBeEnabled();
    await page.click("#saveBtn");
    await expect(page.locator("#saveMsg")).toContainText("Saved!");
    expect(posts).toHaveLength(2);
  });

  test("a game the server does not confirm is not listed, and cannot be sent again", async ({ page }) => {
    await fakeServer(page, { post: () => ({ status: 422, body: { error: "rejected", reason: "action" } }) });
    await openSeeded(page);
    await loseTheGame(page);
    await page.click("#saveBtn");
    await expect(page.locator("#saveMsg")).toContainText("could not be confirmed");
    await expect(page.locator("#saveBtn")).toBeDisabled();
  });

  test("without the server nothing is offered, and the game plays on as always", async ({ page }) => {
    await fakeServer(page, { seeds: false });
    await openGame(page);
    await loseTheGame(page);
    await expect(page.locator("#over")).toBeVisible();
    await expect(page.locator("#saveBox")).toBeHidden();
  });

  test("a game with a cheat is not offered", async ({ page }) => {
    await fakeServer(page);
    await openSeeded(page);
    await core(page, (C) => C.cheat("hesoyam"));
    await loseTheGame(page);
    await expect(page.locator("#over")).toBeVisible();
    await expect(page.locator("#saveBox")).toBeHidden();
  });
});

test.describe("the records screen", () => {
  test("lists the table of the chosen map and difficulty; names are text, never markup", async ({ page }) => {
    await fakeServer(page, {
      rows: [
        {
          rank: 1,
          nick: "<b>Evil</b>",
          won: true,
          wave: 100,
          cleared: 100,
          score: 123456,
          seconds: 3125,
          date: "2026-10-21",
        },
        { rank: 2, nick: "Ann", won: false, wave: 20, cleared: 12, score: 999, seconds: 65, date: "2026-10-21" },
      ],
    });
    await openGame(page);
    await page.evaluate(() => window.XT.ui.openMenu());
    await page.click("#mRecords");
    await expect(page.locator("#records")).toBeVisible();
    const rows = page.locator("#recBody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator("td.nm")).toHaveText("<b>Evil</b>");
    await expect(rows.nth(0).locator("td.wv")).toHaveText("★ 100");
    await expect(rows.nth(0).locator("td.tm")).toHaveText("52:05");
    await expect(rows.nth(1).locator("td.rk")).toHaveText("2");
    expect(await page.locator("#recBody b").count()).toBe(0); // no element came out of a name
    await page.keyboard.press("Escape");
    await expect(page.locator("#records")).toBeHidden();
  });

  test("says so when the table is empty, and when it cannot be had", async ({ page }) => {
    await fakeServer(page, { rows: [] });
    await openGame(page);
    await page.evaluate(() => window.XT.ui.openMenu());
    await page.click("#mRecords");
    await expect(page.locator("#recStatus")).toHaveText("No records yet. Be the first!");
    await page.click("#recClose");
    await page.unroute(/\/api\/scores\?/);
    await page.route(/\/api\/scores\?/, (r) => r.abort());
    await page.click("#mRecords");
    await expect(page.locator("#recStatus")).toHaveText("The table is not available right now.");
  });

  test("asks for the map and difficulty that were chosen", async ({ page }) => {
    const asked: string[] = [];
    await fakeServer(page);
    await page.route(/\/api\/scores\?/, (route) => {
      asked.push(new URL(route.request().url()).search);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) });
    });
    await openGame(page);
    await page.evaluate(() => window.XT.ui.openMenu());
    await page.click("#mRecords");
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    await page.selectOption("#recDiff", "hard");
    await expect.poll(() => asked.at(-1)).toContain("diff=hard");
  });
});
