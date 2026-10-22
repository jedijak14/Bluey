// Actual packaged Electron -> bundled engine -> deterministic local provider.
// Complements (does not replace) the separate real Ollama inference gate.
import { _electron, expect as baseExpect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
const expect = baseExpect.configure({ timeout: 60000 });
const folder = await fs.mkdtemp(
  path.join(os.tmpdir(), "bluey-native-connection-"),
);
const token = crypto.randomBytes(32).toString("hex");
const server = http.createServer((req, res) => {
  if (req.url === "/api/tags") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ models: [{ name: "native-transport-fixture" }] }));
    return;
  }
  if (req.url === "/v1/chat/completions") {
    req.resume();
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(
      "data: " +
        JSON.stringify({
          choices: [
            { delta: { content: "Native engine chat channel works." } },
          ],
        }) +
        "\n\ndata: [DONE]\n\n",
    );
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const provider = `http://127.0.0.1:${server.address().port}`;
let app;
let logs = "";
try {
  const launch = async () => {
    app = await _electron.launch({
      executablePath: path.resolve("release/win-unpacked/Bluey.exe"),
      args: [`--user-data-dir=${path.join(folder, "profile")}`],
      env: {
        ...process.env,
        BLUEY_EXTERNAL_BACKEND: "0",
        BLUEY_TOKEN: token,
        BLUEY_MODEL_CONFIG: path.join(folder, "model.json"),
        BLUEY_PRIVACY_PATH: path.join(folder, "privacy.json"),
      },
      timeout: 60000,
    });
    app.process().stdout?.on("data", (chunk) => {
      logs = (logs + chunk).slice(-12000);
    });
    app.process().stderr?.on("data", (chunk) => {
      logs = (logs + chunk).slice(-12000);
    });
    await expect
      .poll(() =>
        app
          .windows()
          .some(
            (p) => p.url().startsWith("file:") && !p.url().includes("#overlay"),
          ),
      )
      .toBe(true);
    return app
      .windows()
      .find(
        (p) => p.url().startsWith("file:") && !p.url().includes("#overlay"),
      );
  };
  let page = await launch();
  await expect(
    page.getByText("Engine connected", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Settings & preferences", exact: true })
    .click();
  await page.getByLabel("Model base URL", { exact: true }).fill(provider);
  await page.getByRole("button", { name: "Find models", exact: true }).click();
  await page
    .getByLabel("Model", { exact: true })
    .selectOption("native-transport-fixture");
  await page.getByRole("button", { name: "Save model", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Settings and preferences" }),
  ).toHaveCount(0);
  await expect(page.locator(".model-picker")).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Message Bluey" })
    .fill("Check native transport.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page
      .locator(".message-text")
      .filter({ hasText: "Native engine chat channel works." }),
  ).toBeVisible();
  await app.close();
  app = undefined;
  page = await launch();
  await expect(
    page.getByRole("button", { name: "Settings & preferences", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".model-picker")).toBeDisabled();
  await page
    .getByRole("button", { name: "New conversation", exact: false })
    .click();
  await expect(
    page.getByText("Engine connected", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message Bluey" })
    .fill("Check saved connection after restart.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page
      .locator(".message-text")
      .filter({ hasText: "Native engine chat channel works." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Privacy & data", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Model settings", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("What Bluey is allowed to do", { exact: true }),
  ).toBeVisible();
  console.log(
    "PASS: packaged Electron authenticates with real bundled engine; catalog/save/chat succeeds; process restart reconnects with saved model and locked setup. Provider response is a fixture; separate Ollama gate covers real inference.",
  );
} catch (error) {
  console.error(
    "::error::" +
      (String(error) + "\n" + logs)
        .replaceAll(token, "[redacted]")
        .replaceAll("%", "%25")
        .replaceAll("\r", "%0D")
        .replaceAll("\n", "%0A"),
  );
  throw error;
} finally {
  if (app) await app.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(folder, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 500,
  });
}
