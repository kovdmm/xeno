import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["js/**"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
