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

  test("opens on the table of everything, and the icon buttons filter it by map and difficulty", async ({ page }) => {
    const asked: string[] = [];
    await fakeServer(page);
    await page.route(/\/api\/scores\?/, (route) => {
      asked.push(new URL(route.request().url()).search);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) });
    });
    await openGame(page);
    await page.evaluate(() => window.XT.ui.openMenu());
    await page.click("#mRecords");
    await expect.poll(() => asked.length).toBe(1);
    expect(asked[0]).toBe("?limit=20"); // no map, no difficulty: all of them
    await expect(page.locator("#recWhat")).toHaveText("All maps · All difficulties");
    await page.click('#recDiffs [data-v="hard"]');
    await expect.poll(() => asked.at(-1)).toBe("?diff=hard&limit=20");
    await expect(page.locator('#recDiffs [data-v="hard"]')).toHaveAttribute("aria-pressed", "true");
    await page.click('#recLevels [data-v="crossroads"]');
    await expect.poll(() => asked.at(-1)).toBe("?level=crossroads&diff=hard&limit=20");
    await expect(page.locator("#recWhat")).toHaveText("Crossroads · Hard");
    await page.click('#recDiffs [data-v="hard"]'); // the chosen one again: back to all
    await expect.poll(() => asked.at(-1)).toBe("?level=crossroads&limit=20");
    await page.click("#recLevels .all");
    await expect.poll(() => asked.at(-1)).toBe("?limit=20");
  });

  test("the overall table shows the map and difficulty of every row as pictures", async ({ page }) => {
    const row = (rank: number, nick: string, level: string, diff: string) => ({
      rank,
      nick,
      level,
      diff,
      won: false,
      wave: 9,
      cleared: 7,
      score: 1,
      seconds: 2,
      date: "2026-10-21",
    });
    await fakeServer(page, { rows: [row(1, "Ann", "crossroads", "hard"), row(2, "Bob", "switchback", "insane")] });
    await openGame(page);
    await page.evaluate(() => window.XT.ui.openMenu());
    await page.click("#mRecords");
    const first = page.locator("#recBody tr").nth(0).locator("td.wh");
    await expect(first.locator("svg.map")).toHaveCount(1);
    await expect(first.locator("svg.skull")).toHaveCount(1);
    await expect(first).toHaveAttribute("title", "Crossroads · Hard");
    await page.click('#recDiffs [data-v="hard"]'); // the difficulty is chosen: its picture is not repeated in the rows
    await expect(page.locator("#recBody tr").nth(0).locator("td.wh svg.skull")).toHaveCount(0);
  });

  test("the table is read again every time the screen opens", async ({ page }) => {
    let n = 0;
    await fakeServer(page);
    await page.route(/\/api\/scores\?/, (route) => {
      n++;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) });
    });
    await openGame(page);
    await page.evaluate(() => window.XT.ui.openMenu());
    await page.click("#mRecords");
    await expect.poll(() => n).toBe(1);
    await page.click("#recClose");
    await page.click("#mRecords");
    await expect.poll(() => n).toBe(2);
  });

  test("from the end screen it opens on that game's map and difficulty", async ({ page }) => {
    const asked: string[] = [];
    await fakeServer(page);
    await page.route(/\/api\/scores\?/, (route) => {
      asked.push(new URL(route.request().url()).search);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) });
    });
    await openSeeded(page);
    await loseTheGame(page);
    await page.click("#overRecords");
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    expect(asked[0]).toMatch(/^\?level=\w+&diff=\w+&limit=20$/);
  });
});

test.describe("the name and the best result", () => {
  /** the second game of a session: its result is the same as the first's, unless the saved bests are forgotten */
  const playAgain = async (page: Page) => {
    await page.click("#restart");
    await page.evaluate(() => 0);
    await loseTheGame(page);
    await expect(page.locator("#over")).toBeVisible();
  };

  test("the name is asked once; the next game uses it without asking", async ({ page }) => {
    const posts = await fakeServer(page);
    await openSeeded(page);
    await loseTheGame(page);
    await expect(page.locator("#saveNickLbl")).toBeVisible();
    await page.fill("#saveNick", "Ann");
    await page.click("#saveBtn");
    await expect(page.locator("#saveMsg")).toContainText("Saved!");
    await page.evaluate(() => localStorage.removeItem("xt-saved-best")); // so that the next game is offered again
    await playAgain(page);
    await expect(page.locator("#saveNickLbl")).toBeHidden();
    await expect(page.locator("#saveMsg")).toHaveText("Saving as Ann.");
    await page.click("#saveBtn");
    await expect(page.locator("#saveMsg")).toContainText("Saved!");
    expect(posts.map((p) => p.nick)).toEqual(["Ann", "Ann"]);
  });

  test("a game that cannot beat the player's best is not offered", async ({ page }) => {
    const posts = await fakeServer(page);
    await openSeeded(page);
    await loseTheGame(page);
    await page.fill("#saveNick", "Ann");
    await page.click("#saveBtn");
    await expect(page.locator("#saveMsg")).toContainText("Saved!");
    // what was entered is remembered per name, map and difficulty; make it a result that nothing here can beat
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("xt-saved-best")!));
    expect(Object.keys(kept)).toHaveLength(1);
    expect(Object.keys(kept)[0]).toMatch(/^ann|w+|w+$/);
    await page.evaluate(
      (key) =>
        localStorage.setItem(
          "xt-saved-best",
          JSON.stringify({ [key]: { won: true, cleared: 99, score: 9, seconds: 1 } }),
        ),
      Object.keys(kept)[0],
    );
    await playAgain(page);
    await expect(page.locator("#saveBtn")).toBeHidden();
    await expect(page.locator("#saveMsg")).toContainText("Not better than your best");
    await page.click("#overMenu"); // and nothing is asked on leaving
    await expect(page.locator("#saveAsk")).toBeHidden();
    await expect(page.locator("#menu")).toBeVisible();
    expect(posts).toHaveLength(1);
  });

  test("the name is changed in the settings; Escape still closes them", async ({ page }) => {
    await fakeServer(page);
    await openGame(page);
    await page.evaluate(() => window.XT.ui.openMenu());
    await page.click("#mSettings");
    await page.fill("#setNick", "  Bob <b> ");
    await page.press("#setNick", "Enter");
    expect(await page.evaluate(() => localStorage.getItem("xt-nick"))).toBe("Bob b");
    await expect(page.locator("#setNick")).toHaveValue("Bob b");
    await page.press("#setNick", "Escape");
    await expect(page.locator("#settings")).toBeHidden();
  });

  test('leaving a finished game that was not saved asks; "don\'t save" goes on', async ({ page }) => {
    const posts = await fakeServer(page);
    await openSeeded(page);
    await loseTheGame(page);
    await page.click("#restart");
    await expect(page.locator("#saveAsk")).toBeVisible();
    await expect(page.locator("#saveAsk h2")).toHaveText("Save to the records table?");
    await page.click("#askNo");
    await expect(page.locator("#saveAsk")).toBeHidden();
    await expect(page.locator("#over")).toBeHidden(); // the new game started
    expect(await core(page, (C) => C.S.over)).toBe(false);
    expect(posts).toHaveLength(0);
  });

  test('Escape on the question stays on the end screen; after "don\'t save" it is not asked again', async ({
    page,
  }) => {
    await fakeServer(page);
    await openSeeded(page);
    await loseTheGame(page);
    await page.click("#overMenu");
    await expect(page.locator("#saveAsk")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#saveAsk")).toBeHidden();
    await expect(page.locator("#over")).toBeVisible(); // nothing was left
    await page.click("#overMenu");
    await page.click("#askNo");
    await expect(page.locator("#menu")).toBeVisible();
    await page.click("#mPlay"); // the same finished game is left again: not asked a second time
    await expect(page.locator("#saveAsk")).toBeHidden();
  });

  test('"save" on the question sends the game under the typed name (the first time), then goes on', async ({
    page,
  }) => {
    const posts = await fakeServer(page);
    await openSeeded(page);
    await loseTheGame(page);
    await page.click("#restart");
    await expect(page.locator("#askNickLbl")).toBeVisible();
    await page.fill("#askNick", "Cy");
    await page.click("#askYes");
    await expect(page.locator("#saveAsk")).toBeHidden();
    await expect(page.locator("#over")).toBeHidden();
    expect(posts.map((p) => p.nick)).toEqual(["Cy"]);
    expect(await page.evaluate(() => localStorage.getItem("xt-nick"))).toBe("Cy");
  });

  test('a failed save on the question keeps it open, and the game can still be left with "don\'t save"', async ({
    page,
  }) => {
    await fakeServer(page, { post: () => ({ status: 503, body: { error: "busy" } }) });
    await openSeeded(page);
    await loseTheGame(page);
    await page.click("#restart");
    await page.click("#askYes");
    await expect(page.locator("#askMsg")).toContainText("busy");
    await expect(page.locator("#askYes")).toBeEnabled();
    await page.click("#askNo");
    await expect(page.locator("#over")).toBeHidden();
  });
});
