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
    expect(
      await page.evaluate(async () => {
        try {
          await window.blueyFamily.openGuardianSetup();
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);

    // Exercise the packaged vault with real Electron/Windows encryption. Never
    // overwrite enrollment on a developer's already-enrolled machine.
    expect(await page.evaluate(() => window.blueyFamily.vaultRead())).toEqual({
      token: "",
    });
    const fixtureToken = "A".repeat(43);
    try {
      await page.evaluate(
        (token) => window.blueyFamily.vaultWrite({ token }),
        fixtureToken,
      );
      expect(await page.evaluate(() => window.blueyFamily.vaultRead())).toEqual(
        { token: fixtureToken },
      );
      expect(
        await app.evaluate(async ({ app, safeStorage }, token) => {
          const fs = await import("node:fs/promises");
          const path = await import("node:path");
          const ciphertext = await fs.readFile(
            path.join(app.getPath("userData"), "kid-enrollment.bin"),
          );
          return (
            safeStorage.isEncryptionAvailable() &&
            !ciphertext.includes(Buffer.from(token)) &&
            safeStorage.decryptString(ciphertext) === token
          );
        }, fixtureToken),
      ).toBe(true);
    } finally {
      await page.evaluate(() => window.blueyFamily.vaultClear());
    }
    expect(await page.evaluate(() => window.blueyFamily.vaultRead())).toEqual({
      token: "",
    });

    await expect(page.locator(".kids-welcome .avatar")).toBeVisible();
  }
  if (variant === "home") {
    await expect(
      page.getByRole("button", { name: "Install or recover Windows Guardian" }),
    ).toBeVisible();
    await fs.access(
      path.join(
        path.dirname(executablePath),
        "resources",
        "guardian",
        "Setup-Guardian.ps1",
      ),
    );
    // Never click UAC in unattended CI. A parent must approve on the real PC.
  }
  expect(await page.evaluate(() => typeof window.require)).toBe("undefined");
  console.log(
    `${name}: packaged UI, isolated bridge and startup gate passed. No OS enforcement is claimed by this smoke test.`,
  );
} finally {
  await app.close();
}
