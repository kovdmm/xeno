// Test harness for the browser game: seeded random streams (XT.rng), a manual clock and requestAnimationFrame,
// no network (fonts and howler are blocked, so the game is silent and looks the same everywhere).

export async function openGame(page, { seed = 1 } = {}) {
  await page.route(/googleapis|gstatic|cdnjs/, (r) => r.abort());
  await page.addInitScript((seed) => {
    const mulberry32 = (seed) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    // one stream per subsystem: effects never shift the simulation
    window.XT = { rng: { core: mulberry32(seed), fx: mulberry32(seed + 1), audio: mulberry32(seed + 2) } };
    let now = 0,
      id = 0,
      queue = [];
    performance.now = () => now;
    window.requestAnimationFrame = (cb) => (queue.push(cb), ++id);
    window.cancelAnimationFrame = () => {};
    // advance the game by n frames of 1/60 s
    window.__tick = (n = 1) => {
      for (let i = 0; i < n; i++) {
        now += 1000 / 60;
        const cbs = queue;
        queue = [];
        for (const cb of cbs) cb(now);
      }
    };
  }, seed);
  await page.goto("/");
  await page.waitForSelector("#boot", { state: "hidden" }); // the loading screen
  await page.addStyleTag({ content: ".banner,.toast{visibility:hidden!important}" });
  await tick(page, 3);
  await page.click("#mPlay");
  await tick(page, 3);
}

export const tick = (page, n = 1) => page.evaluate((n) => window.__tick(n), n);

/** Run code against XT.core inside the page: `await core(page, (C, arg) => {...}, arg)`. */
export const core = (page, fn, arg) =>
  page.evaluate(
    ([src, arg]) => new Function("C", "arg", "return (" + src + ")(C, arg)")(window.XT.core, arg),
    [
      // object-method shorthand `name(C) {…}` is not an expression: turn it into `function name(C) {…}`
      /^(function|async|\(|[\w$]+\s*=>)/.test(fn.toString()) ? fn.toString() : "function " + fn.toString(),
      arg,
    ],
  );

/** Client coordinates of a board point (cell units, may be fractional), whatever the board orientation. */
export async function cellToClient(page, [x, y]) {
  const b = await page.locator("#field").boundingBox();
  const { W, H } = await core(page, (C) => ({ W: C.W, H: C.H }));
  const rotated = b.height > b.width;
  const [u, v] = rotated ? [(H - y) / H, x / W] : [x / W, y / H];
  return { x: b.x + u * b.width, y: b.y + v * b.height };
}

export const field = (page) => page.locator("#field");
