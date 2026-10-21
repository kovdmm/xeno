// The Xenopedia screen: it opens from the title and from a tower's card, has four tabs, shows the game's own numbers,
// and fits a phone in every language.
import { test, expect, type Page } from "@playwright/test";
import { openGame, core } from "./harness";

test.use({ locale: "en-US" });

const toMenu = async (page: Page) => {
  await page.click("#pauseBtn");
  await page.click("#pMenu");
};
const tab = (page: Page, id: string) => page.locator(`#pediaTabs [data-tab="${id}"]`);
const rowOf = (card: ReturnType<Page["locator"]>, label: string) =>
  card.locator("tr", { has: card.page().locator(`th:text-is("${label}")`) });

test.describe("the Xenopedia", () => {
  test.beforeEach(async ({ page }) => openGame(page));

  test("opens from the title, shows the four tabs and closes with Escape", async ({ page }) => {
    await toMenu(page);
    await page.click("#mPedia");
    await expect(page.locator("#pedia")).toBeVisible();
    await expect(page.locator("#pedia h2")).toHaveText("Xenopedia");
    await expect(page.locator("#pediaTabs [data-tab]")).toHaveText(["Towers", "Ultimates", "Enemies", "Abilities"]);
    await expect(tab(page, "towers")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator("#pedia")).toBeHidden();
    await expect(page.locator("#menu")).toBeVisible(); // back to the title, not to the game
    await page.click("#mPedia");
    await page.click("#pediaClose");
    await expect(page.locator("#pedia")).toBeHidden();
  });

  test("every tab has a card for everything in the data", async ({ page }) => {
    const ids = await core(page, (C) => ({
      towers: C.TKEYS.length,
      enemies: C.pedia().enemies.length,
      abilities: C.AKEYS.length,
    }));
    await toMenu(page);
    await page.click("#mPedia");
    const cards = page.locator("#pediaBody .pedCard");
    await expect(cards).toHaveCount(ids.towers);
    await tab(page, "ults").click();
    await expect(cards).toHaveCount(ids.towers);
    await expect(page.locator("#pediaBody .pedUlt")).toHaveCount(ids.towers * 2);
    await tab(page, "enemies").click();
    await expect(cards).toHaveCount(ids.enemies);
    await tab(page, "abilities").click();
    await expect(cards).toHaveCount(ids.abilities);
  });

  test("the numbers on the screen are the game's own", async ({ page }) => {
    const model = await core(page, (C) => {
      const P = C.pedia();
      const gun = P.towers.find((t) => t.id === "gun")!;
      const armored = P.enemies.find((e) => e.id === "armored")!;
      const nuke = P.abilities.find((a) => a.id === "nuke")!;
      return {
        gunPrice: gun.levels.map((l) => l.cost),
        gunDmg: gun.levels.map((l) => l.stats.dmg),
        armor: armored.rows.map((r) => [r.armor.easy, r.armor.insane]),
        reward: armored.rows.map((r) => r.reward.easy),
        nuke: nuke.costs.map((c) => c.cost.easy),
        diff: C.S.diff ?? "easy",
      };
    });
    await toMenu(page);
    await page.click("#mPedia");
    const gun = page.locator('.pedCard[data-tower="gun"]');
    expect(await rowOf(gun, "Cost").locator("td").allTextContents()).toEqual(model.gunPrice.map(String));
    expect(await rowOf(gun, "Damage").locator("td").allTextContents()).toEqual(model.gunDmg.map(String));
    await tab(page, "enemies").click();
    const armored = page.locator('.pedCard[data-enemy="armored"] tbody tr');
    expect(await armored.locator("td:nth-child(3)").allTextContents()).toEqual(model.armor.map(([e]) => String(e)));
    expect(await armored.locator("td:nth-child(4)").allTextContents()).toEqual(model.reward.map(String));
    // another difficulty, another armour
    await page.click('#pediaBody [data-d="insane"]');
    expect(await armored.locator("td:nth-child(3)").allTextContents()).toEqual(model.armor.map(([, i]) => String(i)));
    await tab(page, "abilities").click();
    const nuke = page.locator('.pedCard[data-ability="nuke"]');
    await page.click('#pediaBody [data-d="easy"]');
    expect(await nuke.locator("tbody td").allTextContents()).toEqual(model.nuke.map(String));
  });

  test("the card of a tower in the game leads to its page", async ({ page }) => {
    await page.keyboard.press("2"); // the second tower is picked for building: its card is on the screen
    const link = page.locator("#info .pedLink");
    await expect(link).toBeVisible();
    const tower = await core(page, (C) => C.TKEYS[1]);
    await link.click();
    await expect(page.locator("#pedia")).toBeVisible();
    await expect(tab(page, "towers")).toHaveAttribute("aria-selected", "true");
    const card = page.locator(`.pedCard[data-tower="${tower}"]`);
    await expect(card).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(page.locator("#pedia")).toBeHidden();
  });
});

const LANGS = [
  { code: "en", name: "English" },
  { code: "ru", name: "Русский" },
  { code: "de", name: "Deutsch" },
  { code: "ua", name: "Українська" },
  { code: "sv", name: "Svenska" },
];

test.describe("the Xenopedia in every language", () => {
  for (const vp of [
    { width: 1280, height: 800, name: "desktop" },
    { width: 390, height: 844, name: "phone" },
  ])
    for (const l of LANGS)
      test(`${vp.name} ${l.name}: every tab fits, nothing is cut, no text is missing`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await openGame(page);
        await page.click("#pauseBtn");
        await page.click("#pSettings");
        await page.selectOption("#langSel", l.code);
        await page.click("#setClose");
        await page.click("#pMenu");
        await page.click("#mPedia");
        for (const id of ["towers", "ults", "enemies", "abilities"]) {
          await tab(page, id).click();
          const problems = await page.evaluate(() => {
            const bad: string[] = [];
            const de = document.documentElement;
            if (de.scrollWidth > de.clientWidth + 1) bad.push("page scrolls sideways");
            const body = document.getElementById("pediaBody")!;
            for (const el of body.querySelectorAll<HTMLElement>(".pedT, .pedCard, .kv"))
              if (el.scrollWidth > el.clientWidth + 1)
                bad.push("cut: " + el.className + " " + el.textContent!.slice(0, 30));
            const text = document.getElementById("pedia")!.textContent!;
            if (/\b(towers|enemies|abilities)\.\w+|pedia[A-Z]|\{\w+\}|undefined|NaN/.test(text))
              bad.push("a key or a hole in the text");
            return bad;
          });
          expect(problems, `${l.name} ${id}`).toEqual([]);
        }
      });
});
