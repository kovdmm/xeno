import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { parse } from "yaml";

/** `import data from "./x.yaml"` gives the parsed document (for the build, the dev server and the tests alike):
 *  the game's numbers are YAML so that every one of them can carry a comment. */
export function yamlData(): Plugin {
  return {
    name: "yaml-data",
    enforce: "pre",
    load(id) {
      const file = id.split("?")[0];
      if (!file.endsWith(".yaml")) return null;
      this.addWatchFile(file);
      return `export default ${JSON.stringify(parse(readFileSync(file, "utf8")))};`;
    },
  };
}
