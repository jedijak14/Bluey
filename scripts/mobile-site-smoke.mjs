import { chromium, expect } from "@playwright/test";
import packed from "@sparticuz/chromium";
import fs from "node:fs/promises";
const base = process.env.BLUEY_PREVIEW_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  executablePath: process.env.BLUEY_BROWSER || (await packed.executablePath()),
  args: [
    ...packed.args.filter(
      (a) =>
        !a.includes("disable-web-security") &&
        !a.includes("allow-running-insecure-content") &&
        !a.includes("single-process"),
    ),
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
  headless: true,
});
try {
  const desktop = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  desktop.on("pageerror", (e) => errors.push(e.message));
  await desktop.goto(base);
  await expect(
    desktop.getByRole("main", { name: "Welcome to Bluey" }),
  ).toBeVisible();
  await expect(
    desktop.getByRole("img", { name: "Bluey is winking" }),
  ).toBeVisible();
  await expect(
    desktop.getByRole("button", { name: "Enter Bluey" }),
  ).toBeEnabled();
  await desktop.getByRole("button", { name: "Enter Bluey" }).click();
  await expect(
    desktop.getByRole("heading", { name: "Big ideas. Little companion." }),
  ).toBeVisible();
  await desktop.reload();
  await expect(
    desktop.getByRole("main", { name: "Welcome to Bluey" }),
  ).toHaveCount(0);
  await desktop
    .getByRole("button", { name: "My companion", exact: true })
    .click();
  await desktop.locator(".classic-expressions summary").click();
  await desktop.getByRole("button", { name: "On it", exact: false }).click();
  await expect(
    desktop.locator(".avatar.mood-pointing .confident-smile").first(),
  ).toBeVisible();
  await desktop.getByRole("button", { name: "Thinking", exact: false }).click();
  const thought = desktop
    .locator(".avatar.mood-thinking .thinking-dots")
    .first();
  expect(
    await thought.evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(
    await thought
      .locator("circle")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("thought-pulse");
  expect(
    await thought.evaluate(
      (el) => getComputedStyle(el.closest(".berry-body")).animationName,
    ),
  ).toBe("none");
  await desktop.getByRole("button", { name: "Test AI", exact: true }).click();
  await expect(
    desktop.getByText("Desktop browser detected", { exact: true }),
  ).toBeVisible();
  await desktop.close();
  const reduced = await browser.newPage({ reducedMotion: "reduce" });
  await reduced.goto(base);
  await expect(
    reduced.getByRole("button", { name: "Enter Bluey" }),
  ).toBeEnabled();
  expect(
    await reduced
      .locator(".welcome-berry")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await reduced.getByRole("button", { name: "Skip intro" }).click();
  await expect(reduced.locator(".app-shell")).toBeVisible();
  await reduced.close();
  for (const device of [
    {
      name: "iPad",
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
      width: 1024,
      height: 1366,
    },
    {
      name: "phone",
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      width: 390,
      height: 844,
    },
    {
      name: "tablet",
      ua: "UnnamedBrowser",
      platform: "",
      width: 820,
      height: 1180,
    },
  ]) {
    const page = await browser.newPage({
      userAgent: device.ua,
      hasTouch: true,
      viewport: { width: device.width, height: device.height },
    });
    await page.addInitScript((platform) => {
      Object.defineProperty(navigator, "platform", { get: () => platform });
      Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
    }, device.platform);
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto(base);
    await expect(
      page.getByRole("heading", { name: "Big ideas. A smaller screen." }),
    ).toBeVisible();
    await expect(page.getByRole("img", { name: "Bluey is sad" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText(
        "iPads, Phones, and other tablets are not supported. You are now viewing the mobile version of the website.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole("link", { name: "Try the Expression Lab" }).click();
    await expect(
      page.getByRole("heading", {
        name: "More personality. Less getting in your way.",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Test AI", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(
      `appears to be on ${device.name === "iPad" ? "an" : "a"} ${device.name}`,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Test AI", exact: true }),
    ).toBeFocused();
    expect(
      requests.some(
        (url) => url.includes("/api/gemma") || url.includes("/api/ws"),
      ),
    ).toBe(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".listening-edge")).toHaveCount(0);
    if (process.env.BLUEY_SCREENSHOTS === "1") {
      await fs.mkdir("artifacts", { recursive: true });
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `artifacts/mobile-site-${device.name}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
    await page.goto(`${base}/#gemma`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Keep exploring" }).click();
    await expect(page.locator(".mobile-story")).toBeVisible();
    await page.close();
  }
  const mic = await browser.newPage({ permissions: ["microphone"] });
  await mic.addInitScript(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await getUserMedia(options);
      window.testTracks = stream.getTracks();
      return stream;
    };
    window.bluey = {
      connection: async () => ({
        endpoint: "http://127.0.0.1:8765",
        token: "fixture",
      }),
      window: () => {},
      onCommand: () => () => {},
    };
  });
  await mic.routeWebSocket("**/api/ws", (ws) =>
    ws.onMessage((raw) => {
      if (JSON.parse(raw).type === "auth")
        ws.send(JSON.stringify({ type: "ready" }));
    }),
  );
  await mic.goto(base);
  await expect(
    mic.getByRole("button", { name: "Engine online" }),
  ).toBeVisible();
  await expect(mic.locator(".listening-edge")).toHaveCount(0);
  await mic
    .getByRole("button", { name: "Record your voice", exact: true })
    .click();
  await expect(mic.locator(".listening-edge")).toBeVisible();
  expect(
    await mic
      .locator(".listening-edge")
      .evaluate((el) => getComputedStyle(el).pointerEvents),
  ).toBe("none");
  await mic
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(mic.locator(".listening-edge")).toHaveCount(0);
  await mic
    .getByRole("button", { name: "Record your voice", exact: true })
    .click();
  await expect(mic.locator(".listening-edge")).toBeVisible();
  await mic.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(mic.locator(".listening-edge")).toHaveCount(0);
  expect(
    await mic.evaluate(() =>
      window.testTracks.every((track) => track.readyState === "ended"),
    ),
  ).toBe(true);
  await mic.close();
  expect(errors).toEqual([]);
  console.log(
    "Mobile site passed: readable mobile/iPad/generic tablet guide, AI-only restriction, desktop wink intro/skip/session/reduced motion, stationary thoughts and active-recording-only border.",
  );
} finally {
  await browser.close();
}
