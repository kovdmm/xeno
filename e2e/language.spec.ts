// The language selector and the five languages in the real browser.
import { test, expect } from "@playwright/test";
import { cellToClient } from "./harness";

const LANGS = [
  { code: "en", name: "English", html: "en", play: "Play", tower: "Machine Gun" },
  { code: "ru", name: "Русский", html: "ru", play: "Играть", tower: "Пулемёт" },
  { code: "de", name: "Deutsch", html: "de", play: "Spielen", tower: "Maschinengewehr" },
  { code: "ua", name: "Українська", html: "uk", play: "Грати", tower: "Кулемет" },
  { code: "sv", name: "Svenska", html: "sv", play: "Spela", tower: "Kulspruta" },
];

async function open(page) {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  await page.goto("/");
  await page.waitForFunction(() => window.XT?.i18n);
}
const choose = async (page, code) => {
  await page.click("#mSettings");
  await page.selectOption("#langSel", code);
};

test.describe("default language", () => {
  test.use({ locale: "en-US" });

  test("is English, and the title screen says so", async ({ page }) => {
    await open(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#mPlay")).toHaveText("Play");
    await expect(page.locator("h1.logo")).toHaveText("Xeno-Tactics");
    expect(await page.title()).toBe("Xeno-Tactics");
  });

  test("a language the game does not know falls back to English", async ({ browser }) => {
    const ctx = await browser.newContext({ locale: "fr-FR" });
    const page = await ctx.newPage();
    await open(page);
    await expect(page.locator("#mPlay")).toHaveText("Play");
    await ctx.close();
  });
});

test.describe("the selector", () => {
  test.beforeEach(async ({ page }) => open(page));

  test("lists every language by its own name", async ({ page }) => {
    await page.click("#mSettings");
    const opts = await page.locator("#langSel option").allTextContents();
    expect(opts).toEqual(LANGS.map((l) => l.name));
    expect(await page.locator("#langSel").inputValue()).toBe("en");
    // a real <select>, not a row of buttons
    expect(await page.locator("#langSel").evaluate((e) => e.tagName)).toBe("SELECT");
    expect(await page.locator("#langs").count()).toBe(0);
  });

  for (const l of LANGS) {
    test(`switching to ${l.name} translates the page at once`, async ({ page }) => {
      await choose(page, l.code);
      await expect(page.locator("html")).toHaveAttribute("lang", l.html);
      await page.click("#setClose");
      await expect(page.locator("#mPlay")).toHaveText(l.play);
      // the tower palette (game data texts) follows too
      await expect(page.locator("#towers .tb").first()).toHaveAttribute("aria-label", l.tower);
      expect(await page.evaluate(() => document.title)).not.toBe("");
    });
  }

  test("the choice is remembered after a reload", async ({ page }) => {
    await choose(page, "sv");
    await page.reload();
    await page.waitForFunction(() => window.XT?.i18n);
    await expect(page.locator("html")).toHaveAttribute("lang", "sv");
    await expect(page.locator("#mPlay")).toHaveText("Spela");
    await page.click("#mSettings");
    expect(await page.locator("#langSel").inputValue()).toBe("sv");
  });

  test("changing language leaves a running game untouched", async ({ page }) => {
    await page.click("#mPlay");
    await page.evaluate(() => {
      XT.core.cheat("hesoyam");
      XT.core.place("gun", 6, 5);
      XT.core.sendWave();
    });
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => ({ t: XT.core.S.towers.length, w: XT.core.S.wave, c: XT.core.S.credits }));
    await page.click("#pauseBtn");
    await page.click("#pSettings");
    await page.selectOption("#langSel", "de");
    const after = await page.evaluate(() => ({ t: XT.core.S.towers.length, w: XT.core.S.wave, c: XT.core.S.credits }));
    expect(after).toEqual(before);
  });

  test("the keyboard works on the selector", async ({ page }) => {
    await page.click("#mSettings");
    await page.focus("#langSel");
    await page.keyboard.press("ArrowDown"); // en -> ru
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  });

  test("the Ukrainian keyboard layout drives the hotkeys (і is the S key: sell)", async ({ page }) => {
    await page.click("#mPlay");
    await page.evaluate(() => {
      XT.core.cheat("hesoyam");
      XT.core.place("gun", 6, 5);
    });
    const p = await cellToClient(page, [6.5, 5.5]);
    await page.mouse.click(p.x, p.y); // select the tower
    // Playwright cannot type Cyrillic by name, so send the event a Ukrainian layout produces for the S key
    await page.evaluate(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "і", code: "KeyS", bubbles: true })),
    );
    expect(await page.evaluate(() => XT.core.S.towers.length)).toBe(0);
  });
});

test.describe("language detection from the browser", () => {
  for (const [locale, html, play] of [
    ["de-DE", "de", "Spielen"],
    ["uk-UA", "uk", "Грати"],
    ["sv-SE", "sv", "Spela"],
    ["ru-RU", "ru", "Играть"],
  ]) {
    test.describe(locale, () => {
      test.use({ locale });
      test(`starts in the browser's language`, async ({ page }) => {
        await open(page);
        await expect(page.locator("html")).toHaveAttribute("lang", html);
        await expect(page.locator("#mPlay")).toHaveText(play);
      });
    });
  }
});

test.describe("layout in every language", () => {
  for (const vp of [
    { width: 1280, height: 800, name: "desktop" },
    { width: 390, height: 844, name: "phone" },
  ]) {
    test.describe(vp.name, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      for (const l of LANGS) {
        test(`${l.name}: nothing is cut off or pushed off the screen`, async ({ page }) => {
          await open(page);
          await choose(page, l.code);
          await page.click("#setClose");
          await page.click("#mPlay");
          await page.waitForTimeout(150);
          const problems = await page.evaluate(() => {
            const bad: string[] = [];
            // names in the palette and ability bar fit their boxes (they shrink to fit)
            for (const el of document.querySelectorAll<HTMLElement>(".tb .nm, .ab .sn"))
              if (el.offsetParent && el.scrollWidth > el.clientWidth + 1) bad.push("cut off: " + el.textContent);
            // no horizontal scrolling of the page
            const de = document.documentElement;
            if (de.scrollWidth > de.clientWidth + 1) bad.push("page scrolls sideways");
            // every button's text stays inside the button
            for (const b of document.querySelectorAll<HTMLButtonElement>("button"))
              if (b.offsetParent && b.scrollWidth > b.clientWidth + 2 && getComputedStyle(b).overflow !== "visible")
                bad.push("button text cut: " + b.textContent.trim().slice(0, 30));
            return bad;
          });
          expect(problems).toEqual([]);
        });
      }
    });
  }
});

test.describe("the name of the game is never translated", () => {
  for (const vp of [
    { width: 1280, height: 800, name: "desktop" },
    { width: 390, height: 844, name: "phone" },
  ])
    for (const l of LANGS)
      test(`${vp.name} ${l.name}: the logo and the tab title read Xeno-Tactics and the logo fits`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await open(page);
        await choose(page, l.code);
        await page.click("#setClose");
        await expect(page.locator("h1.logo")).toHaveText("Xeno-Tactics");
        expect(await page.title()).toBe("Xeno-Tactics");
        const fit = await page.locator("h1.logo").evaluate((e: HTMLElement) => ({
          cut: e.scrollWidth > e.clientWidth + 1,
          right: e.getBoundingClientRect().right,
          width: document.documentElement.clientWidth,
        }));
        expect(fit.cut).toBe(false);
        expect(fit.right).toBeLessThanOrEqual(fit.width);
      });
});

test.describe("texts follow the board's orientation", () => {
  const TXT = (page) =>
    page.evaluate(() => ({
      h: XT.i18n.t("dirRight"),
      hRot: XT.i18n.t("dirDown"),
      desc: XT.i18n.gameText("abilities.carpet.desc"),
      descRot: XT.i18n.gameText("abilities.carpet.descRotated"),
    }));
  const next = (page) => page.locator("#next").innerText();
  const carpetTitle = (page) => page.locator('#abil .ab[data-a="carpet"]').getAttribute("title");
  const start = async (page, lang) => {
    await open(page);
    await choose(page, lang);
    await page.click("#setClose");
    await page.click("#mPlay");
    await page.waitForTimeout(150);
  };

  for (const l of LANGS) {
    test(`${l.name}: landscape reads left → right and "row", portrait top → bottom and "column"`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await start(page, l.code);
      const t = await TXT(page);
      expect(await next(page)).toContain(t.h);
      expect(await next(page)).not.toContain(t.hRot === t.h ? "\u0000" : t.hRot);
      expect(await carpetTitle(page)).toContain(t.desc);
      // turn the device: the same page now describes the turned board, without a reload
      await page.setViewportSize({ width: 390, height: 844 });
      await expect.poll(() => next(page)).toContain(t.hRot);
      expect(await next(page)).not.toContain(t.h);
      expect(await carpetTitle(page)).toContain(t.descRot);
      expect(await carpetTitle(page)).not.toContain(t.desc);
      // and back
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect.poll(() => next(page)).toContain(t.h);
      expect(await carpetTitle(page)).toContain(t.desc);
    });
  }

  test("the layout is right straight away, whether the page opens turned or is turned later", async ({ browser }) => {
    const size = (page) => page.locator("#fw").boundingBox();
    const settled = async (page) => {
      // what the layout converges to once everything has been measured again
      await page.setViewportSize({ width: 391, height: 844 });
      await page.waitForTimeout(100);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(200);
      return size(page);
    };
    const same = (a, b) => {
      expect(a.width).toBeCloseTo(b.width, 0);
      expect(a.height).toBeCloseTo(b.height, 0);
    };

    // opened turned: the first measurement must already be the settled one
    const fresh = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await open(fresh);
    await fresh.click("#mPlay");
    await fresh.waitForTimeout(300);
    const first = await size(fresh);
    same(first, await settled(fresh));
    await fresh.close();

    // turned later: the same size, and every rebuilt ability button shows its price at once
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await open(page);
    await page.click("#mPlay");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    same(await size(page), first);
    const empty = await page.evaluate(
      () => [...document.querySelectorAll("#abil .ab .c")].filter((c) => !c.textContent).length,
    );
    expect(empty).toBe(0);
    await page.close();
  });

  test("the labels agree with what is on the screen (the geometry decides, not a guess)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await page.click("#mPlay");
    await page.waitForTimeout(150);
    const at = (x, y) => cellToClient(page, [x, y]);
    // board route h: from the left board edge to the right one; route v: from the top edge to the bottom one
    const hFrom = await at(0.5, 7.5),
      hTo = await at(21.5, 7.5);
    const vFrom = await at(11.5, 0.5),
      vTo = await at(11.5, 14.5);
    // turned: h runs down the screen, v runs from the right to the left
    expect(hTo.y).toBeGreaterThan(hFrom.y + 100);
    expect(Math.abs(hTo.x - hFrom.x)).toBeLessThan(5);
    expect(vTo.x).toBeLessThan(vFrom.x - 100);
    expect(Math.abs(vTo.y - vFrom.y)).toBeLessThan(5);
    expect(await page.evaluate(() => XT.i18n.t("dirDown"))).toBe("top → bottom");
    expect(await page.evaluate(() => XT.i18n.t("dirLeft"))).toBe("right → left");
    // the carpet bomber follows a board row; on the turned board that is a vertical line on the screen
    const rowA = await at(2.5, 5.5),
      rowB = await at(18.5, 5.5);
    expect(Math.abs(rowB.x - rowA.x)).toBeLessThan(5);
    expect(Math.abs(rowB.y - rowA.y)).toBeGreaterThan(100);
  });
});

test.describe("the campaign grid and the title in every language", () => {
  for (const vp of [
    { width: 1280, height: 800, name: "desktop" },
    { width: 390, height: 844, name: "phone" },
  ])
    for (const l of LANGS)
      test(`${vp.name} ${l.name}: the grid and the rules of its closed cells fit, the title buttons are not cut`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await open(page);
        await choose(page, l.code);
        // the grid has its own screen now: leave the settings and open it from the title
        await page.click("#setClose");
        await page.click("#mLevel");
        const problems = await page.evaluate(() => {
          const bad: string[] = [];
          const parts =
            "#campaign .cMap, #campaign .cMap b, #campaign .cMap small, #campaign .cc, #campaign .cc small, #campaign .cDiff, #campaign .cDiff span";
          for (const el of document.querySelectorAll<HTMLElement>(parts))
            if (el.scrollWidth > el.clientWidth + 1) bad.push("cut: " + el.textContent!.slice(0, 30));
          return bad;
        });
        expect(problems).toEqual([]);
        // a new player has one open cell and fifteen closed ones, each saying in this language what opens it
        const grid = await page.evaluate(() => ({
          open: document.querySelectorAll("#campaign .cc:not(.lock)").length,
          rules: [...document.querySelectorAll("#campaign .cc.lock small")].map((s) => s.textContent!),
          maps: Object.values(XT.core.LEVELS).map((m: any) => [m.name, m.desc]),
        }));
        expect(grid.open).toBe(1);
        expect(grid.rules).toHaveLength(15);
        for (const r of grid.rules) {
          expect(r).toMatch(/\d/); // the wave to reach
          expect(r).not.toMatch(/[{}]|lock(Diff|Map)/); // never a placeholder or a key
        }
        // every map has a name and a description in this language (never the key path)
        expect(grid.maps).toHaveLength(4);
        for (const [name, desc] of grid.maps) {
          expect(name).not.toMatch(/\./);
          expect(desc.length).toBeGreaterThan(20);
        }
        // the title button names the chosen map: pick each map with the title open (all maps open, as after bagowpw)
        await page.evaluate(() => localStorage.setItem("xt-allmaps", "1"));
        await page.click("#campClose");
        await page.evaluate(() => XT.ui.openMenu());
        for (const id of ["corner", "fronts", "switchback", "crossroads"]) {
          await page.click("#mLevel");
          await page.click(`#campaign [data-l="${id}"][data-d="easy"]`);
          const cut = await page.evaluate(() => {
            const b = document.getElementById("mLevel")!;
            return b.scrollWidth > b.clientWidth + 2 ? b.textContent : "";
          });
          expect(cut, id).toBe("");
          await expect(page.locator("#mLevel")).toContainText(await page.evaluate((id) => XT.core.LEVELS[id].name, id));
        }
      });
});
