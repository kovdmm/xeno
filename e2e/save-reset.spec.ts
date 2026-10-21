// A browser that kept the saves of an older release: they are reset once, the name stays, the player is told once.
import { test, expect } from "@playwright/test";
import { openGame } from "./harness";

test.use({ locale: "en-US" });

const OLD = {
  "xt-best-crossroads-easy": "70",
  "xt-won-crossroads-easy": "1",
  "xt-level": "fronts",
  "xt-diff": "hard",
  "xt-allmaps": "1",
  "xt-lang": "ru",
  "xt-vol": "0.3",
  "xt-nick": "Dmitry",
};
const ls = (page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));

test("old saves are reset once, the name stays and the notice is shown once", async ({ page }) => {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  // the old release's browser: the keys, no version (and no tutorial: it did not exist)
  await page.addInitScript((old) => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      for (const [k, v] of Object.entries(old)) localStorage.setItem(k, v as string);
    }
  }, OLD);
  await page.goto("/");
  await page.waitForFunction(() => window.XT?.i18n);
  const kept = await ls(page);
  expect(kept["xt-nick"]).toBe("Dmitry");
  expect(Object.keys(kept).filter((k) => /^xt-(best|won)-|^xt-(level|diff|allmaps|vol)$/.test(k))).toEqual([]);
  expect(kept["xt-lang"]).toBeUndefined(); // the settings went too: English again
  expect(kept["xt-schema"]).toBe("1");
  // the notice, in the language of the page, and closing it
  await expect(page.locator("#resetNotice")).toBeVisible();
  await expect(page.locator("#noticeTxt")).toContainText("reset");
  await page.click("#noticeOk");
  await expect(page.locator("#resetNotice")).toBeHidden();
  // a reload: nothing more to reset and nothing to say; what is played now stays
  await page.evaluate(() => localStorage.setItem("xt-best-switchback-easy", "12"));
  await page.reload();
  await page.waitForFunction(() => window.XT?.i18n);
  await expect(page.locator("#resetNotice")).toBeHidden();
  expect((await ls(page))["xt-best-switchback-easy"]).toBe("12");
  expect((await ls(page))["xt-nick"]).toBe("Dmitry");
});

test("a new player is not told anything", async ({ page }) => {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  await page.goto("/");
  await page.waitForFunction(() => window.XT?.i18n);
  await expect(page.locator("#resetNotice")).toBeHidden();
  expect((await ls(page))["xt-schema"]).toBe("1");
});

test("a browser with a newer version than the code is left as it is", async ({ page }) => {
  await openGame(page, { schema: 99, storage: { "xt-best-crossroads-easy": "70" } });
  const s = await ls(page);
  expect(s["xt-schema"]).toBe("99");
  expect(s["xt-best-crossroads-easy"]).toBe("70");
  await expect(page.locator("#resetNotice")).toBeHidden();
});
