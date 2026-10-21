// Random play: many random inputs in a row (keys, clicks, turning the device, languages, screens), with the
// game's invariants and the page's errors checked all along. A seed makes a failing run reproducible.
import { test, expect, type Page } from "@playwright/test";
import { openGame, tick, core, cellToClient } from "./harness";

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const KEYS = [..."12345678", "q", "w", "e", "r", "t", "u", "s", "n", "f", "Escape", " ", "m", "a", "x"];
const VIEWPORTS = [
  [1280, 800],
  [390, 844],
  [844, 390],
  [1000, 1000],
  [700, 1100],
];

/** What must always hold; returns a description of the first violation, or null. */
const invariants = (page: Page) =>
  core(page, (C) => {
    const S = C.S;
    const bad = (m) => m;
    if (!Number.isFinite(S.credits) || S.credits < 0) return bad("credits " + S.credits);
    if (!Number.isFinite(S.lives) || S.lives < 0) return bad("lives " + S.lives);
    if (!Number.isFinite(S.score) || S.score < 0) return bad("score " + S.score);
    for (const c of S.creeps) {
      if (!Number.isFinite(c.x + c.y + c.hp)) return bad("creep NaN " + c.type);
      if (c.hp > c.max + 1e-6) return bad("creep hp above max");
    }
    for (const p of S.proj) if (!Number.isFinite(p.x + p.y)) return bad("projectile NaN " + p.k);
    for (const t of S.towers) {
      if (t.gx < 0 || t.gy < 0 || t.gx + t.size > C.W || t.gy + t.size > C.H) return bad("tower off the board");
      if (S.grid[t.gy * C.W + t.gx] !== t) return bad("tower not in the grid at its cell");
    }
    const inGrid = new Set(S.grid.filter((t): t is NonNullable<typeof t> => !!t));
    for (const t of inGrid) if (!S.towers.includes(t)) return bad("grid has a tower the list does not");
    if (S.wave < 0 || S.wave > C.FINAL) return bad("wave " + S.wave);
    return null;
  });

/** What the layout must always satisfy, in the page itself. */
const layoutProblems = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) out.push("page scrolls sideways");
    if (de.scrollHeight > de.clientHeight + 1) out.push("page scrolls down");
    const fw = document.getElementById("fw")!.getBoundingClientRect();
    if (fw.width < 100 || fw.height < 60) out.push("field too small " + fw.width + "x" + fw.height);
    if (fw.left < -1 || fw.top < -1 || fw.right > innerWidth + 1 || fw.bottom > innerHeight + 1) out.push("field outside the window");
    const cv = document.getElementById("field") as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    const ratio = cv.width / cv.height, shown = r.width / r.height;
    if (Math.abs(ratio - shown) > 0.02) out.push("canvas is stretched: " + ratio.toFixed(3) + " vs " + shown.toFixed(3));
    return out;
  });

for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
  test(`random play, seed ${seed}`, async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text()) && errors.push("console: " + m.text()));
    await openGame(page, { seed });
    const rnd = mulberry32(seed * 7919);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const log: string[] = [];
    await core(page, (C) => C.cheat("hesoyam"));

    for (let i = 0; i < 400; i++) {
      const r = rnd();
      let what;
      try {
        if (r < 0.35) {
          what = "key " + (what = pick(KEYS));
          await page.keyboard.press(what.slice(4));
        } else if (r < 0.65) {
          const cell: [number, number] = [rnd() * 22, rnd() * 15];
          what = `click ${cell.map((v) => v.toFixed(1))}${rnd() < 0.15 ? " right" : ""}`;
          const p = await cellToClient(page, cell);
          await page.mouse.click(p.x, p.y, { button: what.endsWith("right") ? "right" : "left" });
        } else if (r < 0.72) {
          const [w, h] = pick(VIEWPORTS);
          what = `viewport ${w}x${h}`;
          await page.setViewportSize({ width: w, height: h }).catch(() => {}); // a real fullscreen window cannot be resized
        } else if (r < 0.78) {
          what = "language";
          await page.evaluate((l) => {
            const s = document.getElementById("langSel") as HTMLSelectElement | null;
            if (s) {
              s.value = l;
              s.dispatchEvent(new Event("change"));
            }
          }, pick(["en", "ru", "de", "ua", "sv"]));
        } else if (r < 0.85) {
          what = "click a button";
          const sel = pick(["#pauseBtn", "#pResume", "#pSettings", "#pCampaign", "#campClose", "#setClose", "#pHelp", "#helpClose", "#go", "#speedBtn", "#mPlay", "#pMenu", "#restart", "#overMenu", '#info [data-act="up"]', '#info [data-act="sell"]', '.tb', '.ab', '#campaign .cc', '#confirmYes', '#confirmNo', '#mLevel']);
          const all = await page.locator(sel).all();
          const el = all.length ? pick(all) : page.locator(sel).first(); // any of the matches: any level, any tower
          if (await el.isVisible()) await el.click({ timeout: 500, force: true }).catch(() => {});
        } else if (r < 0.9) {
          what = "cheat";
          await core(page, (C) => C.cheat("hesoyam"));
        } else {
          what = "tick";
        }
        log.push(what);
        await tick(page, 1 + Math.floor(rnd() * 40));
      } catch (e) {
        throw new Error(`step ${i} (${what}) threw: ${(e as Error).message}\nlast steps: ${log.slice(-8).join(" | ")}`);
      }
      if (i % 10 === 0) {
        const v = await invariants(page);
        if (v) throw new Error(`invariant broken after step ${i}: ${v}\nlast steps: ${log.slice(-12).join(" | ")}`);
      }
      if (i % 10 === 5) {
        await tick(page, 3);
        const lp = await layoutProblems(page);
        if (lp.length) throw new Error(`layout broken after step ${i}: ${lp.join("; ")}
last steps: ${log.slice(-8).join(" | ")}`);
      }
      expect(errors, `errors after step ${i}: ${log.slice(-6).join(" | ")}`).toEqual([]);
    }
    const v = await invariants(page);
    expect(v).toBeNull();
  });
}
