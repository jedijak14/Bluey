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
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    sessionStorage.setItem("bluey.desktop-welcome.v1", "seen");
    window.Audio = function () {
      throw Error("No audio allowed");
    };
    speechSynthesis.speak = () => {
      throw Error("No voice allowed");
    };
  });
  await page.goto(base);
  await page
    .getByRole("button", { name: "Desktop tools", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Offline workspace" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "New task" }).fill("Plan my day");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByRole("checkbox", { name: "Plan my day" }).check();
  await page
    .getByRole("textbox", { name: "Quick notes" })
    .fill("Private idea: <script>never run me</script>");
  await page.reload();
  await page
    .getByRole("button", { name: "Desktop tools", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Plan my day" }),
  ).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Quick notes" })).toHaveValue(
    "Private idea: <script>never run me</script>",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export notes & checklist" }).click();
  const file = await download;
  expect(await fs.readFile(await file.path(), "utf8")).toContain(
    "[x] Plan my day",
  );
  await page.getByRole("button", { name: "Clear completed (1)" }).click();
  await expect(page.getByRole("checkbox", { name: "Plan my day" })).toHaveCount(
    0,
  );
  await page.getByRole("spinbutton", { name: "Focus minutes" }).fill("1");
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await expect(page.getByLabel("Time remaining")).toHaveText(/00:5[0-9]|01:00/);
  await page.getByRole("button", { name: "Pause timer", exact: true }).click();
  const paused = await page.getByLabel("Time remaining").textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByLabel("Time remaining")).toHaveText(paused);
  await page.getByRole("button", { name: "Resume timer", exact: true }).click();
  // Advance wall-clock time without relying on a real minute of CI runtime.
  await page.clock.setFixedTime(Date.now() + 120000);
  await expect(page.locator(".kit-reminder")).toContainText(
    "focus session is complete",
    { timeout: 5000 },
  );
  await page.getByRole("button", { name: "Dismiss timer reminder" }).click();
  await expect(page.locator(".kit-reminder")).toHaveCount(0);
  await page
    .getByRole("button", { name: "5-minute break", exact: true })
    .click();
  await page.getByRole("button", { name: "My companion", exact: true }).click();
  await page.clock.setFixedTime(Date.now() + 600000);
  await expect(page.locator(".kit-reminder")).toContainText(
    "break is finished",
    { timeout: 5000 },
  );
  await page
    .getByRole("button", { name: "Open workspace", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Offline workspace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset timer", exact: true }).click();
  await page.screenshot({ path: "artifacts/productivity-workspace.png" });
  // Blocked browser storage must remain usable and never claim to save.
  const blocked = await browser.newPage();
  await blocked.addInitScript(() => {
    sessionStorage.setItem("bluey.desktop-welcome.v1", "seen");
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });
  });
  await blocked.goto(base);
  await blocked
    .getByRole("button", { name: "Desktop tools", exact: true })
    .click();
  await expect(
    blocked.getByText(
      "Storage unavailable — changes are only in memory. Export before closing Bluey.",
    ),
  ).toBeVisible();
  await blocked
    .getByRole("textbox", { name: "Quick notes" })
    .fill("Still usable offline");
  expect(errors).toEqual([]);
  console.log(
    "PASS: offline checklist/notes persist, export is literal text, focus pause/resume/expiry and break reminder survive navigation; blocked storage is honest and no sound plays.",
  );
} finally {
  await browser.close();
}
