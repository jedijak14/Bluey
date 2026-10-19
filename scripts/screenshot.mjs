import { chromium } from "@playwright/test";
import packed from "@sparticuz/chromium";
const browser = await chromium.launch({
  executablePath: await packed.executablePath(),
  args: packed.args,
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (e) => console.error("PAGE ERROR", e.message));
await page.goto("http://127.0.0.1:5173");
await page.screenshot({ path: "artifacts/workspace.png", fullPage: true });
await browser.close();
