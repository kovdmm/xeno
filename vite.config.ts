import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, transformWithOxc, type Plugin } from "vite";
import { yamlData } from "./scripts/yamlPlugin.ts";

/** The service worker is TypeScript like everything else: it is compiled to /sw.js (a separate file, not part of
 *  the app bundle) when building, and on the fly by the dev server. */
function serviceWorker(): Plugin {
  const src = resolve("src/sw.ts");
  const compile = async () => (await transformWithOxc(readFileSync(src, "utf8"), src, { lang: "ts" })).code;
  return {
    name: "service-worker",
    configureServer(server) {
      server.middlewares.use("/sw.js", async (_req, res) => {
        res.setHeader("content-type", "text/javascript");
        res.setHeader("cache-control", "no-cache");
        res.end(await compile());
      });
    },
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: "sw.js", source: await compile() });
    },
  };
}

export default defineConfig({
  // relative asset paths: the build works from any folder or sub-path
  base: "./",
  plugins: [yamlData(), serviceWorker()],
});
