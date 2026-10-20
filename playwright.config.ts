import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Every working copy (worktree) gets its own port, derived from the absolute path of this folder, so parallel
// sessions never test each other's dev server. Override with PW_PORT. The server is never reused: if the port is
// taken, the run fails instead of silently testing foreign code.
function portFor(dir: string): number {
  if (process.env.PW_PORT) return Number(process.env.PW_PORT);
  let h = 0;
  for (const ch of dir.toLowerCase().replace(/\\/g, "/")) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return 4200 + (h % 700);
}
const port = portFor(path.resolve(path.dirname(fileURLToPath(import.meta.url))));
const origin = `http://127.0.0.1:${port}`;

// Visual regression of the game canvas. Time and Math.random are fully controlled by e2e/harness.ts, so
// frames are reproducible. Baselines are per platform/browser (see e2e/*.spec.ts-snapshots); regenerate them
// deliberately with `yarn test:visual:update` after an intended visual change.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // at most 2 workers: the suites of several sessions run at the same time, and with more workers the machine is
  // overloaded and the tests time out
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  // no tolerance: baselines are per machine, and a small recolouring must not slip through
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0, threshold: 0.02, animations: "disabled" } },
  use: { baseURL: origin, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: false,
  },
});
