import { defineConfig } from "@playwright/test";

// Visual regression of the game canvas. Time and Math.random are fully controlled by e2e/harness.js, so
// frames are reproducible. Baselines are per platform/browser (see e2e/*.spec.js-snapshots); regenerate them
// deliberately with `yarn test:visual:update` after an intended visual change.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled" } },
  use: { baseURL: "http://127.0.0.1:4173", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
});
