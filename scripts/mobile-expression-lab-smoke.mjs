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
const userAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1";
try {
  const context = await browser.newContext({
    userAgent,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const errors = [],
    forbidden = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      /chat\/completions|\/api\/gemma|11434|\/api\/screen/.test(request.url())
    )
      forbidden.push(request.url());
  });
  await page.addInitScript(() => {
    localStorage.setItem("bluey.motion-preference.v1", "off");
    window.Audio = function () {
      throw new Error("Expression lab must not play audio");
    };
    speechSynthesis.speak = () => {
      throw new Error("Expression lab must not speak");
    };
    navigator.mediaDevices.getUserMedia = async () => {
      throw new Error("Expression lab must not access devices");
    };
  });
  await page.goto(base);
  await page.getByRole("link", { name: "Try the Expression Lab" }).click();
  const stage = page.locator(".lab-stage");
  const lab = page.locator("#expression-lab");
  const selector = page.getByRole("combobox", {
    name: "Choose a Bluey expression",
  });
  await expect(selector.locator("option")).toHaveCount(29);
  await expect(lab.locator("button[aria-pressed=true]")).toHaveCount(1); // selected preset only; no motion settings
  await expect(stage).not.toHaveClass(/lab-paused/);
  await expect(stage).toHaveAttribute("data-preset", "computer");
  const samples = [
    ["computer", ".lab-powered-key"],
    ["idea", ".lab-idea-rays"],
    ["super", ".lab-actor"],
    ["curious", ".brow-1"],
    ["determined", ".brow-0"],
    ["love", ".heart-eye"],
    ["celebrate", ".lab-confetti"],
    ["listening", ".berry-body"],
    ["thinking", ".thinking-dots circle"],
    ["talking", ".talk-mouth"],
    ["pointing", ".berry-body"],
    ["happy", ".berry-body"],
    ["sleepy", ".eye"],
    ["resting", ".sleep-z"],
    ["wink", ".berry-body"],
    ["sad", ".berry-body"],
    ["surprised", ".berry-body"],
  ];
  const sample = (locator) =>
    locator.evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.transform}|${style.opacity}`;
    });
  for (const [id, part] of samples) {
    await selector.selectOption(id);
    await stage.scrollIntoViewIfNeeded();
    await expect(stage).toHaveAttribute("data-preset", id);
    await expect(stage).not.toHaveClass(/lab-paused/);
    const animated = stage.locator(part).first();
    const before = await sample(animated);
    await expect
      .poll(() => sample(animated), { timeout: 3000 })
      .not.toBe(before);
  }
  await selector.selectOption("computer");
  await page.getByRole("button", { name: "Pause scene", exact: true }).click();
  await expect(stage).toHaveClass(/lab-paused/);
  expect(
    await stage.evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .every((a) => a.playState === "paused"),
    ),
  ).toBe(true);
  const poweredKey = stage.locator(".lab-powered-key").first();
  const frozen = await sample(poweredKey);
  await page.waitForTimeout(350);
  expect(await sample(poweredKey)).toBe(frozen);
  await page.getByRole("button", { name: "Resume scene" }).click();
  await expect.poll(() => sample(poweredKey)).not.toBe(frozen);
  const previousScene = await stage.locator(".lab-scene").elementHandle();
  await page.getByRole("button", { name: "Replay scene" }).click();
  expect(await previousScene.evaluate((el) => el.isConnected)).toBe(false);
  await page.getByRole("button", { name: "Play tour" }).click();
  await stage.scrollIntoViewIfNeeded();
  await expect(stage).toHaveAttribute("data-preset", "idea", { timeout: 6500 });
  await page.getByRole("button", { name: "Pause scene", exact: true }).click();
  await page.waitForTimeout(4700);
  await expect(stage).toHaveAttribute("data-preset", "idea");
  await page.getByRole("button", { name: "Resume scene" }).click();
  await selector.selectOption("happy");
  await expect(page.getByRole("button", { name: "Play tour" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.waitForTimeout(4700);
  await expect(stage).toHaveAttribute("data-preset", "happy");

  // The upcoming paid plan is an honest, free visual preview with no checkout.
  await expect(
    page.getByRole("complementary", { name: "Super Bluey paid plan preview" }),
  ).toContainText("the new paid plan isn’t available yet");
  await page
    .getByRole("button", { name: "Preview Super Bluey", exact: true })
    .click();
  await expect(stage).toHaveAttribute("data-preset", "super");
  await expect(stage).toBeInViewport({ ratio: 0.9 });
  const cape = stage.locator(".lab-super-cape");
  const opacity = () =>
    cape.evaluate((el) => Number(getComputedStyle(el).opacity));
  await expect.poll(opacity, { timeout: 5000 }).toBeGreaterThan(0.9);
  await expect(lab.locator(".lab-caption")).toContainText(
    "PAID PLAN PREVIEW · COMING SOON",
  );
  await page.getByRole("button", { name: "Pause scene", exact: true }).click();
  const superFrame = await sample(cape);
  await page.waitForTimeout(250);
  expect(await sample(cape)).toBe(superFrame);
  expect(
    await stage.evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .every((a) => a.playState === "paused"),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Replay scene", exact: true }).click();
  await expect.poll(opacity).toBeLessThan(0.05);
  await expect(
    lab.locator('a[href*="checkout"], a[href*="stripe"]'),
  ).toHaveCount(0);

  // Mobile motion is automatic even with a stored Off preference and OS reduction.
  await expect(
    page.getByRole("combobox", { name: "Motion", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Turn motion/ })).toHaveCount(
    0,
  );
  await expect(
    page.locator(
      '.mobile-site a[href="#account"], .mobile-site a[href="#home"]',
    ),
  ).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  await expect(page.getByRole("button", { name: "Play tour" })).toBeEnabled();
  await selector.selectOption("computer");
  await stage.scrollIntoViewIfNeeded();
  const power = stage.locator(".lab-power-spark");
  const still = await sample(power);
  await expect.poll(() => sample(power)).not.toBe(still);
  const flow = () =>
    stage
      .locator(".lab-power-flow")
      .evaluate((el) => getComputedStyle(el).strokeDashoffset);
  const beforeFlow = await flow();
  await expect.poll(flow).not.toBe(beforeFlow);
  await expect(stage.locator(".lab-paw")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bluey.motion-preference.v1"),
    ),
  ).toBe("off");
  // Leaving the mobile site restores the saved preference; no forced motion leaks into Home.
  await page.evaluate(() => {
    location.hash = "account";
  });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await page.evaluate(() => {
    location.hash = "expression-lab";
  });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  await stage.scrollIntoViewIfNeeded();

  // Visibility gates pause CSS and tour work, without losing the selected scene.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(stage).toHaveClass(/lab-paused/);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(stage).not.toHaveClass(/lab-paused/);
  await page.locator("footer").scrollIntoViewIfNeeded();
  await expect(stage).toHaveClass(/lab-paused/);
  await stage.scrollIntoViewIfNeeded();
  await expect(stage).not.toHaveClass(/lab-paused/);
  await page.getByRole("button", { name: "Test AI", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "iPads, Phones, and other tablets are not supported. You are now viewing the mobile version of the website.",
  );
  await expect(stage).toHaveClass(/lab-paused/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Touch selection reveals the stage; keyboard selection retains focus.
  await lab.getByRole("button", { name: "A little blue", exact: true }).click();
  await expect(stage).toHaveAttribute("data-preset", "sad");
  await expect(stage).toBeInViewport({ ratio: 0.9 });
  const wink = lab.getByRole("button", { name: "Wink", exact: true });
  await wink.focus();
  await page.keyboard.press("Enter");
  await expect(wink).toBeFocused();
  await expect(wink).toHaveAttribute("aria-pressed", "true");

  await fs.mkdir("artifacts/mobile-lab", { recursive: true });
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: width >= 768 ? 1100 : 844 });
    await selector.selectOption("computer");
    await stage.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const box of await lab
      .locator("button, select")
      .evaluateAll((elements) =>
        elements.map((el) => {
          const r = el.getBoundingClientRect();
          return { width: r.width, height: r.height };
        }),
      )) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await lab.screenshot({ path: `artifacts/mobile-lab/lab-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of [
    "idea",
    "celebrate",
    "super",
    "curious",
    "determined",
    "love",
  ]) {
    await selector.selectOption(id);
    await stage.scrollIntoViewIfNeeded();
    if (id === "super") await page.waitForTimeout(3400);
    await stage.screenshot({ path: `artifacts/mobile-lab/${id}.png` });
  }
  expect(errors).toEqual([]);
  expect(forbidden).toEqual([]);
  await context.close();
  console.log(
    "Mobile Expression Lab passed: 29 presets, pause/replay/tour, automatic mobile motion, unchanged saved desktop preference, power-driven typing, Super Bluey paid-plan preview, three new facial expressions, no account link, visibility gates, touch/keyboard controls, 320–1024px layouts, silent/no device access, AI restriction.",
  );
} finally {
  await browser.close();
}
