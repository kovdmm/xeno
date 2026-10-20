import { defineConfig } from "vitest/config";
import { yamlData } from "./scripts/yamlPlugin.ts";

export default defineConfig({
  plugins: [yamlData()],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
