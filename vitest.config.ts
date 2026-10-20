import { defineConfig } from "vitest/config";
import { simBuildDefine } from "./scripts/simBuild.ts";
import { yamlData } from "./scripts/yamlPlugin.ts";

export default defineConfig({
  plugins: [yamlData()],
  define: simBuildDefine(),
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
