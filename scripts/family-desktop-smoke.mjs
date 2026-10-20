import { _electron, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
const variant = process.argv[2];
const name = variant === "kids" ? "Bluey for Kids" : "Bluey Home";
const executablePath = path.resolve(
  `release/${variant}/win-unpacked/${name}.exe`,
);
await fs.access(
  path.join(
    path.dirname(executablePath),
    "resources",
    "guardian",
    "Setup-Instructions.txt",
  ),
);
const app = await _electron.launch({ executablePath, timeout: 30000 });
try {
  const page = await app.firstWindow();
  await expect(
    page.locator(variant === "kids" ? ".bluey-kids" : ".account-gate"),
  ).toBeVisible();
  if (variant === "kids") {
    await expect(
      page.getByText("Admin Permissions is needed", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    const denied = await page.evaluate(async () => {
      try {
        await window.blueyFamily.request("dashboard", "", undefined, "GET");
        return false;
      } catch {
        return true;
      }
    });
    expect(denied).toBe(true);
    await expect(page.locator(".kids-welcome .avatar")).toBeVisible();
  }
  expect(await page.evaluate(() => typeof window.require)).toBe("undefined");
  console.log(
    `${name}: packaged UI, isolated bridge and startup gate passed. No OS enforcement is claimed by this smoke test.`,
  );
} finally {
  await app.close();
}
