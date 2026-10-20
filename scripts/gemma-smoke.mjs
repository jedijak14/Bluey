import { chromium, expect } from "@playwright/test";
import packed from "@sparticuz/chromium";
import fs from "node:fs/promises";
const base = process.env.BLUEY_PREVIEW_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  executablePath: process.env.BLUEY_BROWSER || (await packed.executablePath()),
  args: packed.args.filter(
    (a) =>
      !a.includes("disable-web-security") &&
      !a.includes("allow-running-insecure-content") &&
      !a.includes("single-process"),
  ),
  headless: true,
});
const model = "keras/gemma3/keras/gemma3_1b";
try {
  const page = await browser.newPage({
    viewport: { width: 1365, height: 980 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/#gemma`);
  await expect(
    page.getByText("Desktop browser detected", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Model not available", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ask Gemma", exact: true }),
  ).toBeDisabled();
  await page.route("**/api/gemma/status", (route) =>
    route.fulfill({ json: { status: "ready", model } }),
  );
  await page.route("**/api/gemma/generate", (route) => {
    expect(route.request().postDataJSON().text).toBe("Test question");
    return route.fulfill({
      json: { model, text: "Fixture answer, not a real Gemma inference test." },
    });
  });
  await page.getByRole("button", { name: "Recheck connection" }).click();
  await expect(
    page.getByText("Gemma weights loaded", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Question for Gemma" })
    .fill("Test question");
  await page.getByRole("button", { name: "Ask Gemma", exact: true }).click();
  await expect(
    page.getByText("Fixture answer, not a real Gemma inference test."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear conversation" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByText("Desktop browser detected", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const icon = await page.request.get(`${base}/favicon.svg`);
  expect(icon.ok()).toBe(true);
  expect((await page.request.get(`${base}/bluey-icon.png`)).ok()).toBe(true);
  await page.getByRole("link", { name: "Workspace", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Big ideas. Little companion." }),
  ).toBeVisible();
  await page.close();
  for (const device of [
    {
      name: "phone",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      width: 390,
      height: 844,
    },
    {
      name: "iPad",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
      width: 1024,
      height: 768,
    },
    {
      name: "tablet",
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; SM-X700) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
      platform: "Linux armv8l",
      width: 1024,
      height: 768,
    },
  ]) {
    const p = await browser.newPage({
      userAgent: device.userAgent,
      viewport: { width: device.width, height: device.height },
      hasTouch: true,
    });
    await p.addInitScript((platform) => {
      Object.defineProperty(navigator, "platform", { get: () => platform });
      Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
    }, device.platform);
    const requests = [];
    p.on("request", (r) => requests.push(r.url()));
    await p.goto(`${base}/#gemma`);
    await expect(
      p.getByRole("heading", { name: "A little more room for Bluey." }),
    ).toBeVisible();
    await expect(p.locator(".device-description")).toContainText(device.name);
    await expect(p.locator(".device-illustration")).toBeVisible();
    expect(
      await p
        .locator(".device-illustration")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    ).toBe(true);
    expect(requests.some((url) => url.includes("/api/gemma"))).toBe(false);
    if (process.env.BLUEY_SCREENSHOTS === "1") {
      await fs.mkdir("artifacts", { recursive: true });
      await p.screenshot({ path: `artifacts/unsupported-${device.name}.png` });
    }
    await p.close();
  }
  expect(errors).toEqual([]);
  console.log(
    "Gemma UI/device checks passed: honest unavailable state, fixture-only transport, phone/iPad-desktop-mode/tablet blocks, narrow desktop allowed, and Bluey icons.",
  );
} finally {
  await browser.close();
}
