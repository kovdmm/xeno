// Renders public/icon.svg into the PNG sizes the manifest and iOS need. Run: yarn icons
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/icon.svg", "utf8");
const sizes = { "icon-192": 192, "icon-512": 512, "maskable-512": 512, "apple-touch-icon": 180 };
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, px] of Object.entries(sizes)) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(
    `<style>html,body{margin:0}svg{display:block;width:${px}px;height:${px}px}</style>${svg}`,
  );
  const out = name === "apple-touch-icon" ? "public/apple-touch-icon.png" : `public/icons/${name}.png`;
  await page.screenshot({ path: out, omitBackground: false });
  console.log("wrote", out);
}
await browser.close();
