import { chromium, expect } from "@playwright/test";
import packed from "@sparticuz/chromium";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.BLUEY_BROWSER || (await packed.executablePath()),
  args: packed.args.filter(
    (a) =>
      !a.includes("disable-web-security") &&
      !a.includes("allow-running-insecure-content") &&
      !a.includes("single-process"),
  ),
  headless: true,
});
const report = {
  type: "response",
  request: "research",
  title: "A researched answer",
  format: "research",
  text: "# Key findings\n\n**A clear result**, with a source you can check.\n\n- First useful detail\n- A second useful detail\n\n<script>never execute this</script>",
  sources: [
    {
      title: "Example source",
      url: "https://example.com/",
      snippet: "A bounded, untrusted search snippet.",
    },
  ],
};
const errors = [];
async function makePage() {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.addInitScript(() =>
    sessionStorage.setItem("bluey.desktop-welcome.v1", "seen"),
  );
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.windowActions = [];
    window.links = [];
    window.bluey = {
      connection: async () => ({
        endpoint: "http://127.0.0.1:8765",
        token: "fixture",
      }),
      window: (action) => window.windowActions.push(action),
      openExternal: async (url) => window.links.push(url),
      interactive: () => {},
      onPointer: () => () => {},
      onCommand: () => () => {},
    };
  });
  return page;
}
try {
  const page = await makePage();
  let pending,
    executed = 0;
  await page.routeWebSocket("**/api/ws", (socket) =>
    socket.onMessage((raw) => {
      const p = JSON.parse(raw);
      if (p.type === "auth") socket.send(JSON.stringify({ type: "ready" }));
      if (p.type === "chat") {
        expect(p.mode).toBe("research");
        socket.send(
          JSON.stringify({
            type: "token",
            request: p.request,
            text: report.text,
          }),
        );
        socket.send(JSON.stringify({ ...report, request: p.request }));
        socket.send(JSON.stringify({ type: "done", request: p.request }));
      }
      if (p.type === "action") {
        pending = p;
        socket.send(
          JSON.stringify({
            type: "approval",
            id: "action-approval",
            action: p.action,
          }),
        );
      }
      if (p.type === "approve") {
        if (p.allow) executed++;
        socket.send(
          JSON.stringify({
            type: "action_result",
            request: pending.request,
            result: p.allow
              ? pending.action.action === "list_apps"
                ? { apps: ["Calculator", "ChatGPT"] }
                : { notice: "Requested operation sent to Windows." }
              : { denied: true },
          }),
        );
        socket.send(JSON.stringify({ type: "done", request: pending.request }));
      }
    }),
  );
  await page.goto("http://127.0.0.1:5173");
  await expect(
    page.getByRole("button", { name: "Engine online" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message Bluey" })
    .fill("Find reliable information");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const card = page.getByRole("region", {
    name: "Bluey response",
    exact: true,
  });
  await expect(card).toBeVisible();
  await expect(
    card.getByRole("heading", { name: "Key findings" }),
  ).toBeVisible();
  await expect(
    card.getByText("<script>never execute this</script>"),
  ).toBeVisible();
  await card.getByRole("link", { name: "Example source" }).click();
  expect(await page.evaluate(() => window.links)).toEqual([
    "https://example.com/",
  ]);
  await fs.mkdir("artifacts", { recursive: true });
  if (process.env.BLUEY_SCREENSHOTS === "1")
    await page.screenshot({
      path: "artifacts/research-card.png",
      animations: "disabled",
    });
  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Save notes" }).click();
  expect((await download).suggestedFilename()).toBe("Bluey-notes.md");
  await card.getByRole("button", { name: "Minimize response" }).click();
  await expect(card.getByRole("heading", { name: "Sources" })).toHaveCount(0);
  await card.getByRole("button", { name: "Expand response" }).click();
  await card.getByRole("button", { name: "Close response" }).click();
  await page.getByRole("button", { name: "Open research & sources" }).click();
  await expect(card).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Desktop tools", exact: true })
    .click();
  await page.getByRole("button", { name: "Open ChatGPT", exact: true }).click();
  expect(executed).toBe(0);
  await expect(page.locator(".approval-json")).toContainText(
    "https://chatgpt.com/",
  );
  await page.getByRole("button", { name: "Allow once" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Requested operation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load installed apps" }).click();
  await page.getByRole("button", { name: "Allow once" }).click();
  await expect(
    page.getByRole("button", { name: "Calculator", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await page.getByRole("button", { name: "Not this time" }).click();
  await expect(
    page.getByText("Action declined. Nothing was run."),
  ).toBeVisible();
  expect(executed).toBe(2);
  if (process.env.BLUEY_SCREENSHOTS === "1")
    await page.screenshot({
      path: "artifacts/desktop-tools.png",
      animations: "disabled",
    });
  await page.close();

  const overlay = await makePage();
  let socket;
  await overlay.routeWebSocket("**/api/ws", (ws) => {
    socket = ws;
    ws.onMessage(() => ws.send(JSON.stringify({ type: "ready" })));
  });
  await overlay.goto("http://127.0.0.1:5173/#overlay");
  await expect(overlay.locator(".overlay-cursor")).toBeVisible();
  await expect.poll(() => Boolean(socket)).toBe(true);
  socket.send(
    JSON.stringify({
      ...report,
      text: "ChatGPT is ready in your browser.",
      format: "quick",
      sources: [],
    }),
  );
  await expect(overlay.locator(".overlay-caption")).toContainText(
    "ChatGPT is ready",
  );
  await overlay.getByRole("button", { name: "Expand answer" }).click();
  await expect(
    overlay.getByRole("region", { name: "Bluey response" }),
  ).toBeVisible();
  await overlay.getByRole("button", { name: "Close response" }).click();
  socket.send(
    JSON.stringify({ type: "click_feedback", x: 400, y: 400, typing: true }),
  );
  await expect(overlay.locator(".click-feedback")).toContainText("Typing");
  await overlay.locator(".floating-widget").hover();
  await overlay
    .getByRole("button", { name: "Ask with Windows microphone" })
    .click();
  expect(await overlay.evaluate(() => window.windowActions)).toContain(
    "microphone",
  );
  await overlay.close();
  expect(errors).toEqual([]);
  console.log(
    "Feature UI passed: safe research rendering/sources/export/history, permission-gated tools, quick bubble, click feedback, and Windows mic shortcut.",
  );
} finally {
  await browser.close();
}
