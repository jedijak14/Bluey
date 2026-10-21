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
let stage = "startup";
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
    stage = "read empty encrypted vault";
    expect(await page.evaluate(() => window.blueyFamily.vaultRead())).toEqual({
      token: "",
    });
    const fixtureToken = "A".repeat(43);
    try {
      stage = "write encrypted fixture";
      await page.evaluate(
        (token) => window.blueyFamily.vaultWrite({ token }),
        fixtureToken,
      );
      expect(await page.evaluate(() => window.blueyFamily.vaultRead())).toEqual(
        { token: fixtureToken },
      );
      stage = "verify encrypted file";
      // Read the test file from Node, not a dynamic import in Electron's
      // evaluation VM (which has no dynamic-import callback).
      const userData = await app.evaluate(({ app }) => app.getPath("userData"));
      const ciphertext = await fs.readFile(
        path.join(userData, "kid-enrollment.bin"),
      );
      expect(ciphertext.includes(Buffer.from(fixtureToken))).toBe(false);
      expect(
        await app.evaluate(({ safeStorage }) =>
          safeStorage.isEncryptionAvailable(),
        ),
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
} catch (error) {
  const message = `Packaged ${variant} smoke failed at ${stage}: ${error instanceof Error ? error.message : String(error)}`;
  // Action annotations remain readable when runner log storage is unavailable.
  console.log(
    "::error::" +
      message
        .slice(0, 5000)
        .replaceAll("%", "%25")
        .replaceAll("\r", "%0D")
        .replaceAll("\n", "%0A"),
  );
  throw error;
} finally {
  await app.close();
}
