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
const samples = [
  ["Excited", "excited", ".emotion-star"],
  ["Proud", "proud", ".expression-features"],
  ["Skeptical", "skeptical", ".emotion-brow-0"],
  ["Embarrassed", "embarrassed", ".emotion-cheeks"],
  ["Worried", "worried", ".emotion-brows"],
  ["Relieved", "relieved", ".emotion-sigh"],
  ["Mischievous", "mischievous", ".emotion-pupil"],
  ["Amazed", "amazed", ".emotion-glints"],
  ["Confused", "confused", ".emotion-question"],
  ["Disappointed", "disappointed", ".emotion-tear"],
  ["Laughing", "laughing", ".emotion-mouth"],
  ["Zen", "zen", ".emotion-breath"],
];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "no-preference",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    sessionStorage.setItem("bluey.desktop-welcome.v1", "seen"),
  );
  await page.goto(base);
  await page.getByRole("button", { name: "My companion", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "New expressions" }).getByRole("button"),
  ).toHaveCount(12);
  const blob = page.locator(".face-preview > .avatar");
  const pointer = page.locator(".expression-view-grid .cursor-avatar");
  const phone = page.locator(".expression-view-grid .face-screen");
  const animate = async (view, part) => {
    const element = view.locator(part).first();
    // The subject itself (not just its container) must be in the viewport.
    // Offscreen compositor-only opacity effects may be deliberately culled.
    await element.evaluate((el) =>
      el.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "instant",
      }),
    );
    const sample = async () => {
      // Opacity-only SVG effects can run entirely on the compositor. Request a
      // painted frame before reading styles: headless Chromium may otherwise
      // keep returning its last main-thread opacity while the effect advances.
      // Do not fast-forward, disable, or alter the animation under test.
      if (part === ".emotion-cheeks") {
        const clip = await element.boundingBox();
        if (!clip) throw new Error("Animated cheeks must be rendered");
        await view.page().screenshot({ animations: "allow", clip });
      }
      return element.evaluate((el) => {
        const s = getComputedStyle(el);
        return s.transform + "|" + s.opacity;
      });
    };
    const initial = await sample();
    await expect.poll(sample, { timeout: 10000 }).not.toBe(initial);
  };
  await fs.mkdir("artifacts/overhaul", { recursive: true });
  for (const [label, id, part] of samples) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    for (const view of [blob, pointer, phone]) {
      await expect(view.locator(".expression-features")).toHaveAttribute(
        "data-expression",
        id,
      );
      await animate(view, part);
    }
    await blob.screenshot({ path: `artifacts/overhaul/${id}.png` });
  }
  await page
    .getByRole("button", { name: "Preview Super Bluey", exact: true })
    .click();
  await expect(page.locator(".app-super-preview .lab-super-cape")).toHaveCount(
    1,
  );
  await expect(page.locator(".app-super-preview")).toContainText(
    "Paid plan preview",
  );
  await page
    .getByRole("combobox", { name: "Motion", exact: true })
    .selectOption("off");
  for (const view of [blob, pointer, phone])
    expect(
      await view.evaluate((el) => el.getAnimations({ subtree: true }).length),
    ).toBe(0);
  await page
    .getByRole("combobox", { name: "Motion", exact: true })
    .selectOption("on");

  // The actual phone screen, not only a desktop thumbnail.
  await page.goto(base + "/#phone");
  await page.getByRole("button", { name: "Play without a PC" }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  for (const [label, id, part] of samples) {
    await page.getByRole("button", { name: "Companion options" }).click();
    await page
      .getByRole("combobox", { name: "Expression", exact: true })
      .selectOption(id);
    await page.getByRole("button", { name: "Close options" }).click();
    const screen = page.locator(".phone-face > .face-screen");
    await expect(screen.locator(".expression-features")).toHaveAttribute(
      "data-expression",
      id,
    );
    await animate(screen, part);
    if (["excited", "worried", "laughing"].includes(id))
      await screen.screenshot({ path: `artifacts/overhaul/phone-${id}.png` });
  }
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(base);
  await mobile.bringToFront();
  for (const [, id, part] of samples) {
    await mobile
      .getByRole("combobox", { name: "Choose a Bluey expression" })
      .selectOption(id);
    const stage = mobile.locator(".lab-stage");
    await stage.scrollIntoViewIfNeeded();
    await expect(stage).not.toHaveClass(/lab-paused/);
    try {
      await animate(stage, part);
    } catch (error) {
      console.error(
        id,
        await stage.evaluate((el) => ({
          className: el.className,
          hidden: document.hidden,
          top: el.getBoundingClientRect().top,
          motion: document.documentElement.dataset.motion,
          states: el
            .getAnimations({ subtree: true })
            .map((a) => [a.animationName, a.playState]),
        })),
      );
      throw error;
    }
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS: 12 distinct expressions animate in the desktop blob, pointer, Android face and mobile lab; phone picker, desktop motion controls and original Super Bluey preview work.",
  );
} finally {
  await browser.close();
}
