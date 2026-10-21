import { chromium, expect } from "@playwright/test";
import packed from "@sparticuz/chromium";
import fs from "node:fs/promises";
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
const base = process.env.BLUEY_PREVIEW_URL || "http://127.0.0.1:5173";
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "no-preference",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    sessionStorage.setItem("bluey.desktop-welcome.v1", "seen"),
  );
  await page.goto(base);
  await page.getByRole("button", { name: "My companion", exact: true }).click();
  const face = page.locator(".face-preview > .avatar");
  await expect(face).toHaveClass(/mood-listening/);
  await expect(face).toHaveClass(/mood-thinking/, { timeout: 6500 });
  const moods = [
    ["All ears", "listening", ".berry-body"],
    ["Thinking", "thinking", ".thinking-dots circle"],
    ["Speaking", "talking", ".talk-mouth"],
    ["On it", "pointing", ".berry-body"],
    ["Happy", "happy", ".berry-body"],
    ["Sleepy", "sleepy", ".eye"],
    ["Resting", "resting", ".sleep-z"],
  ];
  for (const [label, mood, part] of moods) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(face).toHaveClass(new RegExp(`mood-${mood}`));
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    // Prove rendered properties change over real frames, not just a CSS class.
    const animated = face.locator(part).first();
    const sample = () =>
      animated.evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.transform}|${s.opacity}`;
      });
    const before = await sample();
    await expect.poll(sample, { timeout: 2500 }).not.toBe(before);
  }
  // Selecting a mood stops the tour, not the selected expression's animation.
  await page.waitForTimeout(4200);
  await expect(face).toHaveClass(/mood-resting/);
  await page.getByRole("button", { name: "Replay expression" }).click();
  await expect(face).toHaveClass(/mood-resting/);
  await page.getByRole("button", { name: "Play expressions" }).click();
  await expect(face).toHaveClass(/mood-listening/, { timeout: 6500 });
  await page.getByRole("button", { name: "Pause expressions" }).click();
  const pointer = page.locator(".moving-cursor");
  const parked = await pointer.boundingBox();
  await page.mouse.move(60, 90);
  await page.waitForTimeout(300);
  expect(await pointer.boundingBox()).toEqual(parked);
  await page.locator(".cursor-stage").click({ position: { x: 90, y: 55 } });
  await expect(page.locator(".cursor-stage .cursor-avatar")).toHaveClass(
    /mood-pointing/,
  );
  await expect.poll(() => pointer.boundingBox()).not.toEqual(parked);
  await page.getByRole("button", { name: "Happy", exact: true }).click();
  await fs.mkdir("artifacts/expressions", { recursive: true });
  await page.screenshot({
    path: "artifacts/expressions/desktop.png",
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.getByText("Reduced motion is on. Choose an expression below."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play expressions" }),
  ).toBeDisabled();
  expect(
    await face.evaluate((el) => el.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.getByRole("button", { name: "Sleepy", exact: true }).click();
  await expect(face).toHaveClass(/mood-sleepy/);
  await page.waitForTimeout(4200);
  await expect(face).toHaveClass(/mood-sleepy/);
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "no-preference",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  });
  await phone.goto(base);
  const sad = phone.locator(".mobile-sad-bluey");
  await expect(sad).toHaveClass(/expression-sad/);
  expect(
    await sad
      .locator(".eye")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("blink");
  await phone.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await sad.evaluate((el) => el.getAnimations({ subtree: true }).length),
  ).toBe(0);
  expect(errors).toEqual([]);
  console.log(
    "PASS: all seven moods change rendered frames; autoplay, manual selection, replay, parked pointer, mobile blink and live reduced-motion preferences.",
  );
} finally {
  await browser.close();
}
