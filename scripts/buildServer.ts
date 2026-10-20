// Bundles the highscore service into dist-server/: scores.mjs (the service), replayWorker.mjs (its replay thread) and
// admin.mjs (moderation) and smoke.mjs (a smoke test of a running service). Everything but node's own modules is inside, so the server needs only node (24 or later
// for node:sqlite without warnings; 22.13+ works) and no npm packages. The simulation and the balance data come
// from this checkout, and so does SIM_BUILD: a run is accepted only if the client was built from the same sources.
import { build } from "vite";
import { simBuildDefine } from "./simBuild.ts";
import { yamlData } from "./yamlPlugin.ts";

await build({
  configFile: false,
  logLevel: "warn",
  publicDir: false,
  plugins: [yamlData()],
  define: simBuildDefine(),
  ssr: { noExternal: true },
  build: {
    ssr: true,
    outDir: "dist-server",
    emptyOutDir: true,
    target: "node22",
    minify: false,
    rollupOptions: {
      input: {
        scores: "server/scores.ts",
        replayWorker: "server/replayWorker.ts",
        admin: "server/admin.ts",
        smoke: "scripts/smokeScores.ts",
      },
      output: { format: "es", entryFileNames: "[name].mjs", chunkFileNames: "[name]-[hash].mjs" },
    },
  },
});
console.log("dist-server/ built for sim build", simBuildDefine().__SIM_BUILD__);
