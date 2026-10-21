import { chromium, expect } from "@playwright/test";
import packed from "@sparticuz/chromium";
import fs from "node:fs/promises";
const base = process.env.BLUEY_PREVIEW_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  executablePath: process.env.BLUEY_BROWSER || (await packed.executablePath()),
  args: packed.args.filter(
    (a) =>
      !/disable-web-security|allow-running-insecure-content|single-process/.test(
        a,
      ),
  ),
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await page.addInitScript(() =>
    sessionStorage.setItem("bluey.desktop-welcome.v1", "seen"),
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  const button = page.getByRole("button", {
    name: "Open companion",
    exact: true,
  });
  for (const width of [1440, 1280, 1181, 1024, 800, 700, 390]) {
    if (
      width <= 700 &&
      (await page
        .getByRole("button", { name: "Toggle sidebar" })
        .getAttribute("aria-expanded")) === "true"
    ) {
      await page.getByRole("button", { name: "Toggle sidebar" }).click();
    }
    await page.setViewportSize({ width, height: 900 });
    await expect(button).toBeVisible();
    const layout = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      const items = [...el.children]
        .filter((child) => getComputedStyle(child).display !== "none")
        .map((child) => {
          const r = child.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            center: r.top + r.height / 2,
          };
        });
      return {
        display: css.display,
        whiteSpace: css.whiteSpace,
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        items,
      };
    });
    expect(["flex", "inline-flex"]).toContain(layout.display);
    expect(layout.whiteSpace).toBe("nowrap");
    expect(layout.width).toBeGreaterThan(110);
    expect(layout.height).toBeGreaterThanOrEqual(36);
    expect(layout.right).toBeLessThanOrEqual(width);
    for (const item of layout.items) {
      expect(item.left).toBeGreaterThanOrEqual(layout.left);
      expect(item.right).toBeLessThanOrEqual(layout.right);
      expect(item.top).toBeGreaterThanOrEqual(layout.top);
      expect(item.bottom).toBeLessThanOrEqual(layout.bottom);
      expect(
        Math.abs(item.center - (layout.top + layout.height / 2)),
      ).toBeLessThan(2);
    }
    // Wrapped toolbar rows must not overlap each other.
    const boxes = await page
      .locator(".mode-switch, .subbar-right, .pair-shortcut")
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }),
      );
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        expect(
          a.right <= b.left ||
            b.right <= a.left ||
            a.bottom <= b.top ||
            b.bottom <= a.top,
        ).toBe(true);
      }
  }
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Your new favorite desk mate." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await fs.mkdir("artifacts/launcher", { recursive: true });
  await page
    .locator(".subbar")
    .screenshot({ path: "artifacts/launcher/toolbar.png" });
  await button.screenshot({ path: "artifacts/launcher/button.png" });
  expect(errors).toEqual([]);

  const native = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  await native.addInitScript(() => {
    window.launcherCommands = [];
    window.bluey = {
      connection: async () => ({ endpoint: location.origin, token: "fixture" }),
      window: (command) => window.launcherCommands.push(command),
      interactive: () => {},
      onCommand: () => () => {},
    };
  });
  await native.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        provider: "ollama",
        model: "fixture",
        base_url: "http://127.0.0.1:11434",
        setup_complete: true,
      },
    }),
  );
  await native.route("**/api/privacy", (route) =>
    route.fulfill({
      json: {
        computer_use: false,
        screen_recording: false,
        live_viewing: false,
      },
    }),
  );
  await native.routeWebSocket("**/api/ws", (ws) =>
    ws.onMessage((raw) => {
      if (JSON.parse(String(raw)).type === "auth")
        ws.send(JSON.stringify({ type: "ready" }));
    }),
  );
  await native.goto(base);
  await native
    .getByRole("button", { name: "Open companion", exact: true })
    .click();
  expect(await native.evaluate(() => window.launcherCommands)).toContain(
    "overlay",
  );
  await native.goto(base + "/#overlay");
  const toggle = native.getByRole("button", {
    name: "Bluey controls",
    exact: true,
  });
  await expect(toggle).toBeVisible();
  const size = await toggle.boundingBox();
  expect(size.width).toBe(30);
  expect(size.height).toBe(30);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  console.log(
    "PASS: horizontal contained launcher at 390–1440px, non-overlapping toolbar, keyboard web navigation, native overlay dispatch and unchanged circular overlay controls.",
  );
} finally {
  await browser.close();
}
