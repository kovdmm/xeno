import { defineConfig } from "vitest/config";
import { yamlData } from "./scripts/yamlPlugin.ts";

// The balance simulator (sim/): not part of `yarn test`.
export default defineConfig({
  plugins: [yamlData()],
  test: { include: ["sim/**/*.sim.ts"], environment: "node" },
});
