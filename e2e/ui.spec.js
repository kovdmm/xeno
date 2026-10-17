// The interface as a player uses it: screens, hotkeys, building, the tower card, abilities, difficulty, the end
// of a game. These tests describe behaviour only (what is on the screen, what the game state becomes), so they
// hold while the code behind the interface is rearranged.
import { test, expect } from "@playwright/test";
import { openGame, tick, core, cellToClient } from "./harness.js";

test.use({ locale: "en-US" });

const state = (page) =>
  core(page, (C) => ({
    credits: C.S.credits,
    lives: C.S.lives,
    wave: C.S.wave,
    towers: C.S.towers.map((t) => ({ type: t.type, lvl: t.lvl, x: t.x, y: t.y })),
    over: C.S.over,
    cd: C.S.cd,
  }));
const visible = (page, id) => page.locator("#" + id).isVisible();
const clickCell = async (page, cell) => {
  const p = await cellToClient(page, cell);
  await page.mouse.click(p.x, p.y);
  await tick(page, 2);
};
const press = async (page, key) => {
  await page.keyboard.press(key);
  await tick(page, 2);
};
const rich = (page) => core(page, (C) => C.cheat("hesoyam"));

test.describe("screens and pause", () => {
  test.beforeEach(async ({ page }) => openGame(page));

  test("Escape pauses and resumes; Space does too", async ({ page }) => {
    expect(await visible(page, "pause")).toBe(false);
    await press(page, "Escape");
    expect(await visible(page, "pause")).toBe(true);
    await press(page, "Escape");
    expect(await visible(page, "pause")).toBe(false);
    await press(page, " ");
    expect(await visible(page, "pause")).toBe(true);
    await press(page, " ");
    expect(await visible(page, "pause")).toBe(false);
  });

  test("the game does not advance while a screen covers it", async ({ page }) => {
    await core(page, (C) => C.sendWave());
    await press(page, "Escape");
    const t0 = await core(page, (C) => C.S.t);
    await tick(page, 120);
    expect(await core(page, (C) => C.S.t)).toBe(t0);
    await press(page, "Escape");
    await tick(page, 60);
    expect(await core(page, (C) => C.S.t)).toBeGreaterThan(t0);
  });

  test("pause screen: resume, settings, help and back to the title", async ({ page }) => {
    await core(page, (C) => C.sendWave()); // started: the title will offer to continue
    await page.click("#pauseBtn");
    expect(await visible(page, "pause")).toBe(true);
    await page.click("#pHelp");
    expect(await visible(page, "help")).toBe(true);
    await press(page, "Escape"); // closes the top screen only
    expect(await visible(page, "help")).toBe(false);
    expect(await visible(page, "pause")).toBe(true);
    await page.click("#pSettings");
    expect(await visible(page, "settings")).toBe(true);
    await page.click("#setClose");
    await page.click("#pMenu");
    expect(await visible(page, "menu")).toBe(true);
    expect(await visible(page, "pause")).toBe(false);
    // a game is in progress: the title offers to continue it
    await expect(page.locator("#mPlay")).toContainText("Continue");
    await page.click("#mPlay");
    expect(await visible(page, "menu")).toBe(false);
  });

  test("restart from the pause screen starts a fresh game", async ({ page }) => {
    await rich(page);
    await core(page, (C) => C.place("gun", 6, 5));
    await page.click("#pauseBtn");
    await page.click("#pRestart");
    const s = await state(page);
    expect(s.towers).toEqual([]);
    expect(s.wave).toBe(0);
    expect(await visible(page, "pause")).toBe(false);
  });

  test("the help screen opens and closes, and its backdrop closes it", async ({ page }) => {
    await page.click("#pauseBtn");
    await page.click("#pHelp");
    await expect(page.locator("#help")).toBeVisible();
    await page.click("#helpClose");
    await expect(page.locator("#help")).toBeHidden();
    await page.click("#pHelp");
    await page.locator("#help").click({ position: { x: 3, y: 3 } });
    await expect(page.locator("#help")).toBeHidden();
  });
});

test.describe("building", () => {
  test.beforeEach(async ({ page }) => {
    await openGame(page);
    await rich(page);
  });

  test("a hotkey picks a tower, a click puts it on the field and takes its price", async ({ page }) => {
    const before = (await state(page)).credits;
    await press(page, "1");
    await expect(page.locator('.tb[data-t="gun"]')).toHaveClass(/\bon\b/);
    await clickCell(page, [6.5, 5.5]);
    const s = await state(page);
    expect(s.towers.map((t) => t.type)).toEqual(["gun"]);
    expect(before - s.credits).toBe(15);
  });

  test("the palette buttons pick towers too; picking again cancels", async ({ page }) => {
    await page.click('.tb[data-t="cannon"]');
    await expect(page.locator('.tb[data-t="cannon"]')).toHaveClass(/\bon\b/);
    await page.click('.tb[data-t="cannon"]');
    await expect(page.locator('.tb[data-t="cannon"]')).not.toHaveClass(/\bon\b/);
  });

  test("Escape cancels the pick before it pauses", async ({ page }) => {
    await press(page, "2");
    await press(page, "Escape");
    await expect(page.locator('.tb[data-t="cannon"]')).not.toHaveClass(/\bon\b/);
    expect(await visible(page, "pause")).toBe(false);
    await press(page, "Escape");
    expect(await visible(page, "pause")).toBe(true);
  });

  test("a right click cancels the pick", async ({ page }) => {
    await press(page, "1");
    const p = await cellToClient(page, [8.5, 5.5]);
    await page.mouse.click(p.x, p.y, { button: "right" });
    await tick(page, 2);
    await expect(page.locator('.tb[data-t="gun"]')).not.toHaveClass(/\bon\b/);
    await page.mouse.click(p.x, p.y);
    await tick(page, 2);
    expect((await state(page)).towers).toEqual([]);
  });

  test("a blocked cell gives a message and spends nothing", async ({ page }) => {
    await press(page, "1");
    const before = (await state(page)).credits;
    await clickCell(page, [0.5, 7.5]); // right next to the spawn
    expect((await state(page)).credits).toBe(before);
    expect((await state(page)).towers).toEqual([]);
    await expect(page.locator("#toast")).not.toHaveText("");
  });

  test("a tower too expensive is marked, and cannot be afforded", async ({ page }) => {
    await core(page, (C) => (C.S.credits = 20));
    await tick(page, 10);
    await expect(page.locator('.tb[data-t="artillery"]')).toHaveClass(/\bpoor\b/);
    await expect(page.locator('.tb[data-t="gun"]')).not.toHaveClass(/\bpoor\b/);
  });

  test("an artillery piece takes 2x2 and the click chooses its centre", async ({ page }) => {
    await press(page, "8");
    await clickCell(page, [14, 9]);
    const s = await state(page);
    expect(s.towers.length).toBe(1);
    expect(s.towers[0].type).toBe("artillery");
  });
});

test.describe("the tower card", () => {
  test.beforeEach(async ({ page }) => {
    await openGame(page);
    await rich(page);
    await core(page, (C) => C.place("gun", 6, 5));
    await tick(page, 2);
    await clickCell(page, [6.5, 5.5]);
  });

  test("clicking a tower selects it and shows its card; clicking it again, or empty ground, deselects", async ({ page }) => {
    await expect(page.locator("#info")).toContainText("Machine Gun");
    await expect(page.locator("#info")).toContainText("lvl 1/5");
    await clickCell(page, [6.5, 5.5]);
    await expect(page.locator("#info")).not.toContainText("lvl 1/5");
    await clickCell(page, [6.5, 5.5]);
    await clickCell(page, [9.5, 9.5]);
    await expect(page.locator("#info")).not.toContainText("lvl 1/5");
  });

  test("U upgrades, the card follows, S sells and refunds", async ({ page }) => {
    const c0 = (await state(page)).credits;
    await press(page, "u");
    let s = await state(page);
    expect(s.towers[0].lvl).toBe(1);
    expect(s.credits).toBeLessThan(c0);
    await expect(page.locator("#info")).toContainText("lvl 2/5");
    const c1 = s.credits;
    await press(page, "s");
    s = await state(page);
    expect(s.towers).toEqual([]);
    expect(s.credits).toBeGreaterThan(c1);
    await expect(page.locator("#info")).not.toContainText("lvl");
  });

  test("the upgrade button works like the hotkey", async ({ page }) => {
    await page.click('#info [data-act="up"]');
    expect((await state(page)).towers[0].lvl).toBe(1);
  });

  test("the sell button sells", async ({ page }) => {
    await page.click('#info [data-act="sell"]');
    expect((await state(page)).towers).toEqual([]);
  });

  test("the close button deselects without selling", async ({ page }) => {
    await page.click('#info [data-act="cancel"]');
    expect((await state(page)).towers.length).toBe(1);
    await expect(page.locator("#info")).not.toContainText("lvl 1/5");
  });

  test("at level 4 the card offers the two specialisations, and picking one makes level 5", async ({ page }) => {
    await core(page, (C) => {
      const t = C.S.towers[0];
      C.upgrade(t);
      C.upgrade(t);
      C.upgrade(t);
    });
    await tick(page, 12);
    const ults = page.locator("#info .ults button");
    await expect(ults).toHaveCount(2);
    await press(page, "u"); // the hotkey does not choose for the player
    expect((await state(page)).towers[0].lvl).toBe(3);
    await ults.first().click();
    expect((await state(page)).towers[0].lvl).toBe(4);
    await expect(page.locator("#info")).toContainText("lvl 5");
    // after that, upgrades are overclocks
    await page.click('#info [data-act="up"]');
    await expect(page.locator("#info")).toContainText("overclock 1");
  });

  test("a tower is deselected when it is sold from outside the card", async ({ page }) => {
    await core(page, (C) => C.sell(C.S.towers[0]));
    await tick(page, 12);
    await expect(page.locator("#info")).not.toContainText("lvl");
  });
});

test.describe("abilities", () => {
  test.beforeEach(async ({ page }) => {
    await openGame(page);
    await rich(page);
  });

  test("an instant ability is cast by its key and goes on cooldown", async ({ page }) => {
    await press(page, "q");
    const s = await state(page);
    expect(s.cd.stasis).toBeGreaterThan(0);
    await expect(page.locator('.ab[data-a="stasis"] .c')).toContainText("s");
  });

  test("an aimed ability: key, click on the field, then it is cast and the aim is gone", async ({ page }) => {
    await press(page, "w");
    await expect(page.locator('.ab[data-a="meteor"]')).toHaveClass(/\bon\b/);
    await clickCell(page, [11.5, 7.5]);
    expect((await state(page)).cd.meteor).toBeGreaterThan(0);
    await expect(page.locator('.ab[data-a="meteor"]')).not.toHaveClass(/\bon\b/);
  });

  test("Escape and a right click drop the aim", async ({ page }) => {
    await press(page, "w");
    await press(page, "Escape");
    await expect(page.locator('.ab[data-a="meteor"]')).not.toHaveClass(/\bon\b/);
    await press(page, "e");
    const p = await cellToClient(page, [8.5, 5.5]);
    await page.mouse.click(p.x, p.y, { button: "right" });
    await tick(page, 2);
    await expect(page.locator('.ab[data-a="napalm"]')).not.toHaveClass(/\bon\b/);
  });

  test("an ability button works by click", async ({ page }) => {
    await page.click('.ab[data-a="stasis"]');
    expect((await state(page)).cd.stasis).toBeGreaterThan(0);
  });

  test("a cast ability on cooldown says so", async ({ page }) => {
    await press(page, "q");
    await press(page, "q");
    await expect(page.locator("#toast")).not.toHaveText("");
  });
});

test.describe("waves and speed", () => {
  test.beforeEach(async ({ page }) => openGame(page));

  test("N sends the next wave, the button too; the label counts the wave", async ({ page }) => {
    await expect(page.locator("#sWave")).toHaveText("0/200");
    await press(page, "n");
    expect((await state(page)).wave).toBe(1);
    await tick(page, 12);
    await expect(page.locator("#sWave")).toHaveText("1/200");
    await page.click("#go");
    expect((await state(page)).wave).toBe(2);
  });

  test("F (and the button) cycles the game speed", async ({ page }) => {
    const label = () => page.locator("#speedBtn").innerText();
    expect(await label()).toBe("×1");
    await press(page, "f");
    expect(await label()).toBe("×2");
    await page.click("#speedBtn");
    expect(await label()).toBe("×3");
    await press(page, "f");
    await press(page, "f");
    expect(await label()).toBe("×1");
  });

  test("a faster speed advances the game faster", async ({ page }) => {
    await core(page, (C) => C.sendWave());
    const t0 = await core(page, (C) => C.S.t);
    await tick(page, 60);
    const slow = (await core(page, (C) => C.S.t)) - t0;
    await press(page, "f");
    const t1 = await core(page, (C) => C.S.t);
    await tick(page, 60);
    const fast = (await core(page, (C) => C.S.t)) - t1;
    expect(fast).toBeGreaterThan(slow * 1.6);
  });

  test("the HUD shows credits, lives, wave and score", async ({ page }) => {
    const s = await state(page);
    await expect(page.locator("#sCred")).toHaveText(String(Math.floor(s.credits)));
    await expect(page.locator("#sLives")).toHaveText(String(s.lives));
  });
});

test.describe("difficulty", () => {
  test.beforeEach(async ({ page }) => openGame(page));

  test("the difficulty is chosen in the settings, applied at once while nothing has been played", async ({ page }) => {
    await page.click("#pauseBtn");
    await page.click("#pSettings");
    await expect(page.locator("#diffs .dcard")).toHaveCount(4);
    await expect(page.locator('#diffs [data-d="easy"]')).toHaveClass(/\bon\b/);
    await page.click('#diffs [data-d="hard"]');
    expect(await core(page, (C) => C.difficulty())).toBe("hard");
    expect(await page.evaluate(() => localStorage.getItem("xt-diff"))).toBe("hard");
    await expect(page.locator("#settings")).toBeHidden();
  });

  test("with a game in progress the change is confirmed first, and can be declined", async ({ page }) => {
    await core(page, (C) => {
      C.cheat("hesoyam");
      C.sendWave();
    });
    await core(page, (C) => C.step(0.1));
    await page.click("#pauseBtn");
    await page.click("#pSettings");
    await page.click('#diffs [data-d="hard"]');
    await expect(page.locator("#confirm")).toBeVisible();
    await page.click("#confirmNo");
    await expect(page.locator("#confirm")).toBeHidden();
    expect(await core(page, (C) => C.difficulty())).toBe("easy");
    await page.click('#diffs [data-d="hard"]');
    await page.click("#confirmYes");
    expect(await core(page, (C) => C.difficulty())).toBe("hard");
    expect((await state(page)).wave).toBe(0); // a new game
  });

  test("the choice is remembered after a reload", async ({ page }) => {
    await page.click("#pauseBtn");
    await page.click("#pSettings");
    await page.click('#diffs [data-d="insane"]');
    await page.reload();
    await page.waitForFunction(() => window.XT?.core);
    expect(await page.evaluate(() => localStorage.getItem("xt-diff"))).toBe("insane");
    expect(await core(page, (C) => C.difficulty())).toBe("insane");
  });
});

test.describe("the end of a game", () => {
  test("losing shows the result; restart begins again; the best wave is remembered", async ({ page }) => {
    await openGame(page);
    await core(page, (C) => {
      C.sendWave();
      for (let i = 0; i < 4000 && !C.S.over; i++) C.step(0.05);
    });
    await tick(page, 6);
    await expect(page.locator("#over")).toBeVisible();
    await expect(page.locator("#overTtl")).toHaveText("Base destroyed");
    expect(await page.evaluate(() => localStorage.getItem("xt-best-easy"))).not.toBeNull();
    await page.click("#restart");
    await expect(page.locator("#over")).toBeHidden();
    const s = await state(page);
    expect(s.over).toBe(false);
    expect(s.lives).toBeGreaterThan(0);
  });

  test("back to the title from the end screen", async ({ page }) => {
    await openGame(page);
    await core(page, (C) => {
      C.sendWave();
      for (let i = 0; i < 4000 && !C.S.over; i++) C.step(0.05);
    });
    await tick(page, 6);
    await page.click("#overMenu");
    await expect(page.locator("#menu")).toBeVisible();
    await expect(page.locator("#over")).toBeHidden();
    await expect(page.locator("#mPlay")).toHaveText("Play");
  });
});

test.describe("keyboard extras", () => {
  test.beforeEach(async ({ page }) => openGame(page));

  test("the cheat code works on any layout and its letters do not trigger hotkeys", async ({ page }) => {
    const before = await state(page);
    // physical keys H E S O Y A M; the letters S (sell), A, M (sound) and E (ability) must stay silent
    for (const code of ["KeyH", "KeyE", "KeyS", "KeyO", "KeyY", "KeyA", "KeyM"])
      await page.evaluate(
        (c) => document.dispatchEvent(new KeyboardEvent("keydown", { key: "я", code: c, bubbles: true })),
        code,
      );
    await tick(page, 4);
    const s = await state(page);
    expect(s.credits).toBeGreaterThan(before.credits + 100000);
    expect(s.cd.napalm).toBe(0); // E was not an ability
  });

  test("the Russian layout drives the hotkeys (щ → the tower hotkeys are digits, ы → sell, а → speed)", async ({ page }) => {
    await rich(page);
    await core(page, (C) => C.place("gun", 6, 5));
    await tick(page, 2);
    await clickCell(page, [6.5, 5.5]);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "а", code: "KeyF", bubbles: true })));
    await tick(page, 2);
    await expect(page.locator("#speedBtn")).toHaveText("×2");
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "ы", code: "KeyS", bubbles: true })));
    await tick(page, 2);
    expect((await state(page)).towers).toEqual([]);
  });

  test("the tower digits work on a layout whose number row types symbols (AZERTY)", async ({ page }) => {
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "&", code: "Digit1", bubbles: true })));
    await tick(page, 2);
    await expect(page.locator('.tb[data-t="gun"]')).toHaveClass(/\bon\b/);
  });

  test("ten quick clicks on the logo roll the credits", async ({ page }) => {
    await page.click("#pauseBtn");
    await page.click("#pMenu");
    const logo = page.locator(".menu .logo").first();
    for (let i = 0; i < 10; i++) await logo.click();
    await expect(page.locator("#credits")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#credits")).toBeHidden();
  });

  test("typing in an input field does not trigger hotkeys", async ({ page }) => {
    await page.click("#pauseBtn");
    await page.click("#pSettings");
    await page.focus("#sndVol");
    await page.keyboard.press("n"); // N would send a wave
    expect((await state(page)).wave).toBe(0);
  });
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("selecting a tower swaps the palette for the card; closing brings the palette back", async ({ page }) => {
    // no fullscreen question in the way
    await page.addInitScript(() => {
      for (const k of ["fullscreenEnabled", "webkitFullscreenEnabled"]) Object.defineProperty(document, k, { value: false });
    });
    await openGame(page);
    await rich(page);
    await core(page, (C) => C.place("gun", 6, 5));
    await tick(page, 4);
    await expect(page.locator("#pal")).toBeVisible();
    await expect(page.locator("#info")).toBeHidden();
    await clickCell(page, [6.5, 5.5]);
    await expect(page.locator("#info")).toBeVisible();
    await expect(page.locator("#pal")).toBeHidden();
    await page.click('#info [data-act="cancel"]');
    await expect(page.locator("#pal")).toBeVisible();
    await expect(page.locator("#info")).toBeHidden();
  });
});

test.describe("keys that are not for the game", () => {
  test.beforeEach(async ({ page }) => {
    await openGame(page);
    await rich(page);
    await core(page, (C) => C.place("gun", 6, 5));
    await tick(page, 2);
    await clickCell(page, [6.5, 5.5]);
  });

  test("browser shortcuts (Ctrl+S, Ctrl+R, Alt+F...) do not sell, aim or call waves", async ({ page }) => {
    for (const k of ["Control+s", "Control+r", "Control+n", "Alt+f", "Meta+u", "Control+q"]) await press(page, k);
    const s = await state(page);
    expect(s.towers.length).toBe(1);
    expect(s.towers[0].lvl).toBe(0);
    expect(s.wave).toBe(0);
    expect(s.cd.stasis).toBe(0);
    await expect(page.locator("#speedBtn")).toHaveText("×1");
  });

  test("typing a letter to pick a language in the selector does not drive the game", async ({ page }) => {
    await page.keyboard.press("Escape"); // drop the selection first: the card is not the point here
    await page.click("#pauseBtn");
    await page.click("#pSettings");
    await page.focus("#langSel");
    for (const k of ["s", "n", "r", "f", "u"]) await page.keyboard.press(k);
    const s = await state(page);
    expect(s.towers.length).toBe(1);
    expect(s.wave).toBe(0);
    expect(s.cd.carpet).toBe(0);
  });

  test("a held key does not repeat its action (Escape would flicker the pause screen)", async ({ page }) => {
    await page.keyboard.press("Escape");
    await tick(page, 2);
    expect(await visible(page, "pause")).toBe(false); // selection dropped first
    await page.keyboard.down("Escape");
    await page.keyboard.down("Escape");
    await page.keyboard.down("Escape");
    await page.keyboard.up("Escape");
    await tick(page, 2);
    expect(await visible(page, "pause")).toBe(true);
  });

  test("a key event without a key (autofill, some IMEs) does not break the keyboard", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.evaluate(() => document.dispatchEvent(new Event("keydown")));
    await press(page, "u");
    expect(errors).toEqual([]);
    expect((await state(page)).towers[0].lvl).toBe(1);
  });
});
