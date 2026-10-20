// Generate offline native icon artwork from our local SVG, never a remote service.
import { chromium } from "@playwright/test";
import packed from "@sparticuz/chromium";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: await packed.executablePath(),
  args: packed.args,
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 512, height: 512 },
  deviceScaleFactor: 1,
});
await page.setContent(
  `<style>html,body{margin:0;background:transparent}svg{width:512px;height:512px}</style>${await fs.readFile("public/favicon.svg", "utf8")}`,
);
await page.screenshot({ path: "artifacts/icon.png", omitBackground: true });
await browser.close();
