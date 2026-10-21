import { chromium, expect } from "@playwright/test";
import packed from "@sparticuz/chromium";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.BLUEY_BROWSER || (await packed.executablePath()),
  args: packed.args.filter(
    (a) =>
      !a.includes("disable-web-security") &&
      !a.includes("allow-running-insecure-content"),
  ),
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
await page.addInitScript(() =>
  sessionStorage.setItem("bluey.desktop-welcome.v1", "seen"),
);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await fs.mkdir("artifacts", { recursive: true });
await page.goto("http://127.0.0.1:5173");
await expect(
  page.getByRole("heading", { name: "Big ideas. Little companion." }),
).toBeVisible();
await page.getByRole("button", { name: "Make room for ideas" }).click();
await expect(page.getByRole("textbox", { name: "Message Bluey" })).toHaveValue(
  /Help me brainstorm/,
);
await page.getByRole("button", { name: "Send message", exact: true }).click();
await expect(
  page.getByRole("dialog", { name: "Settings and preferences" }),
).toBeVisible();
await expect(
  page.getByText("Nothing has been sent.", { exact: false }),
).toBeVisible();
// A deterministic transport fixture tests actual UI streaming and persistence,
// not a fake runtime model bundled into the application.
await page.route("**/api/config/test", (route) =>
  route.fulfill({ json: { inference_checked: true } }),
);
await page.route("**/api/config", (route) =>
  route.fulfill({ json: { saved: true } }),
);
await page.routeWebSocket("**/api/ws", (ws) =>
  ws.onMessage((raw) => {
    const packet = JSON.parse(String(raw));
    if (packet.type === "auth")
      ws.send(JSON.stringify({ type: "ready", role: "desktop" }));
    if (packet.type === "chat") {
      ws.send(
        JSON.stringify({
          type: "token",
          request: packet.request,
          text: "A streamed ",
        }),
      );
      ws.send(
        JSON.stringify({
          type: "token",
          request: packet.request,
          text: "test response.",
        }),
      );
      ws.send(JSON.stringify({ type: "done", request: packet.request }));
    }
  }),
);
await page.getByLabel("Backend token").fill("test-session-only");
await page.getByRole("button", { name: "Save model" }).click();
await expect(
  page.getByRole("dialog", { name: "Settings and preferences" }),
).toHaveCount(0);
await expect(page.locator(".engine-status")).toHaveCount(0);
await page
  .getByRole("textbox", { name: "Message Bluey" })
  .fill("Test the stream");
await page.getByRole("button", { name: "Send message", exact: true }).click();
await expect(
  page
    .locator(".message-text")
    .filter({ hasText: "A streamed test response." }),
).toBeVisible();
const stored = await page.evaluate(() =>
  localStorage.getItem("bluey.settings"),
);
if (stored.includes("test-session-only"))
  throw new Error("Session token persisted to disk");
await page.getByRole("button", { name: "New conversation" }).click();
await page.getByRole("button", { name: "Code", exact: true }).click();
await expect(page.getByText("LOCAL SCRATCHPAD", { exact: true })).toBeVisible();
await page.getByRole("button", { name: "companion.ts", exact: true }).click();
await expect(page.locator(".cm-content")).toContainText("export const bluey");
await page.getByRole("button", { name: "Save file", exact: true }).click();
await expect(
  page.getByText("Scratchpad saved on this device.", { exact: true }),
).toBeVisible();
await page.screenshot({ path: "artifacts/code.png" });
await page.getByRole("button", { name: "My companion", exact: true }).click();
await page.getByRole("button", { name: "Happy", exact: true }).click();
await expect(
  page.locator(".face-preview").getByRole("img", { name: "Bluey is happy" }),
).toBeVisible();
await page.getByRole("button", { name: "⌁ String", exact: true }).click();
await page.locator(".cursor-stage").click({ position: { x: 50, y: 45 } });
await expect(page.locator(".pointer-string path")).toHaveAttribute("d", /M50/);
await page.screenshot({ path: "artifacts/companion.png" });
await page
  .getByRole("button", { name: "Connected devices", exact: true })
  .click();
await expect(
  page.getByRole("heading", { name: "A little closer, on every screen." }),
).toBeVisible();
await page.screenshot({ path: "artifacts/devices.png" });
await page.getByRole("button", { name: "Pair this device" }).click();
await expect(
  page.getByRole("heading", { name: "Wake me up from your Windows PC." }),
).toBeVisible();
await page.getByRole("button", { name: "Play without a PC" }).click();
await page.getByRole("button", { name: "Companion options" }).click();
await page.getByRole("combobox").selectOption("happy");
await page.getByRole("button", { name: "Close options" }).click();
await page.setViewportSize({ width: 844, height: 390 });
await expect(page.getByRole("img", { name: "Bluey is happy" })).toBeVisible();
await page.screenshot({ path: "artifacts/phone.png" });
await page.goto("http://127.0.0.1:5173");
await page.setViewportSize({ width: 390, height: 844 });
await expect(
  page.getByRole("heading", { name: "Big ideas. Little companion." }),
).toBeVisible();
await page.screenshot({ path: "artifacts/mobile-workspace.png" });
await page.getByRole("button", { name: "Toggle sidebar" }).click();
await page.getByRole("button", { name: "Settings & preferences" }).click();
await expect(page.getByRole("dialog")).toBeVisible();
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  "UI smoke passed: chat setup, quick actions, IDE, save, expressions, pointer, devices, Android face, mobile settings.",
);
await browser.close();
