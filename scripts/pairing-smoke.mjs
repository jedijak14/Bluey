// Requires Vite on 5173 and an isolated engine with BLUEY_LAN=1 and
// BLUEY_TOKEN=pairing-browser-smoke on 8765. Never use a real user's engine.
import { chromium, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 15000 });
import packed from "@sparticuz/chromium";
import fs from "node:fs/promises";
import path from "node:path";
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
const errors = [];
let pageNumber = 0;
const makePage = async (options = {}) => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    ...options,
  });
  const id = ++pageNumber;
  if (process.env.BLUEY_DEBUG_SMOKE) {
    for (const event of ["request", "requestfinished", "requestfailed"])
      page.on(event, (request) => {
        if (request.url().includes("/api/"))
          console.log(id, Date.now(), event, request.url());
      });
    page.on("console", (message) =>
      console.log(id, message.type(), message.text()),
    );
  }
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
};
const base = "http://127.0.0.1:5173";
async function connect(page) {
  await page.goto(base);
  await page
    .getByRole("button", { name: "Settings & preferences", exact: true })
    .click();
  await page.getByLabel("Backend token").fill("pairing-browser-smoke");
  await page.getByRole("button", { name: "Save & connect" }).click();
  await expect(
    page.getByRole("button", { name: "Engine online" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Connected devices", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Generate pairing code", exact: true }),
  ).toBeEnabled();
}
try {
  // Real HTTP redemption + authenticated WebSocket, not mocked pairing.
  const desktop = await makePage();
  const testHeaders = { Authorization: "Bearer pairing-browser-smoke" };
  const previous = await desktop.request.get(
    "http://127.0.0.1:8765/api/devices",
    { headers: testHeaders },
  );
  expect(previous.status()).toBe(200);
  for (const device of await previous.json())
    await desktop.request.delete(
      `http://127.0.0.1:8765/api/devices/${device.id}`,
      { headers: testHeaders },
    );
  await connect(desktop);
  await desktop
    .getByRole("button", { name: "Generate pairing code", exact: true })
    .click();
  const code = desktop.getByTestId("pair-code");
  await expect(code).toHaveText(/^\d{6}$/);
  const value = await code.textContent();
  await expect(desktop.getByRole("timer")).toContainText(/Expires in [12]:/);
  const phone = await makePage();
  await phone.goto(base);
  await phone
    .getByRole("button", { name: "Enter pairing code", exact: true })
    .click();
  await phone.getByLabel("PC address", { exact: true }).fill("127.0.0.1:8765");
  await phone.getByLabel("Pairing code", { exact: true }).fill(value);
  await phone
    .getByRole("button", { name: "Pair with Windows", exact: true })
    .click();
  await expect(
    phone.getByText("Connected to Windows", { exact: true }),
  ).toBeVisible();
  await expect(
    desktop.getByText("Browser companion", { exact: true }),
  ).toBeVisible({ timeout: 8000 });
  await expect(
    desktop.getByText("Paired successfully.", { exact: false }),
  ).toBeVisible();
  await expect(code).toHaveCount(0);
  const replay = await phone.request.post("http://127.0.0.1:8765/api/pair", {
    data: { code: value },
  });
  expect(replay.status()).toBe(403);
  const stored = await phone.evaluate(() =>
    JSON.stringify({ ...localStorage }),
  );
  expect(stored).not.toContain("token");
  await desktop
    .getByRole("button", { name: "Disconnect", exact: true })
    .click();
  await phone.bringToFront();
  await expect(phone.getByRole("alert")).toContainText(
    "disconnected on Windows",
  );
  await expect(
    desktop.getByText("Browser companion", { exact: true }),
  ).toHaveCount(0);
  await desktop.close();
  await phone.close();

  // Short-lived deterministic codes exercise renewal, busy protection,
  // persistent server errors, and timer cleanup without waiting two minutes.
  const timed = await makePage();
  await timed.clock.install({ time: new Date("2026-10-19T12:00:00Z") });
  await timed.clock.pauseAt(new Date("2026-10-19T12:00:01Z"));
  let generations = 0,
    reads = 0,
    fail = false;
  await timed.route("**/api/config", (r) =>
    r.fulfill({ json: { saved: true } }),
  );
  await timed.routeWebSocket("**/api/ws", (ws) =>
    ws.onMessage(() => ws.send(JSON.stringify({ type: "ready" }))),
  );
  await timed.route("**/api/devices", (r) => {
    reads++;
    return r.fulfill({ json: [] });
  });
  await timed.route("**/api/pair/create", (r) => {
    generations++;
    return r.fulfill(
      fail
        ? { status: 409, json: { detail: "Enable LAN mode first." } }
        : {
            json: {
              code: String(generations).padStart(6, "0"),
              expires_in: 20,
              addresses: ["192.168.1.8:8765"],
            },
          },
    );
  });
  await connect(timed);
  await timed
    .getByRole("button", { name: "Generate pairing code", exact: true })
    .click();
  await expect(timed.getByTestId("pair-code")).toHaveText("000001");
  await timed.clock.runFor(1000);
  await expect(timed.getByRole("timer")).toContainText("0:19");
  await timed.clock.fastForward(21000);
  await expect(timed.getByTestId("pair-code")).toHaveText("000002", {
    timeout: 8000,
  });
  fail = true;
  await timed.clock.fastForward(21000);
  await expect(timed.getByRole("alert")).toHaveText("Enable LAN mode first.", {
    timeout: 8000,
  });
  await expect(timed.getByTestId("pair-code")).toHaveCount(0);
  const readsBeforeRetry = reads;
  await timed.clock.fastForward(10000);
  await expect.poll(() => reads).toBeGreaterThan(readsBeforeRetry);
  await expect(timed.getByRole("alert")).toHaveText("Enable LAN mode first.");
  expect(generations).toBe(3); // No repeated automatic failing creation requests.
  fail = false;
  await timed
    .getByRole("button", { name: "Generate pairing code", exact: true })
    .click();
  await expect(timed.getByTestId("pair-code")).toHaveText("000004");
  await timed
    .getByRole("button", { name: "Conversations", exact: false })
    .first()
    .click();
  const readsAtExit = reads;
  await timed.clock.fastForward(125000);
  expect(generations).toBe(4);
  expect(reads).toBe(readsAtExit);
  await timed.close();

  // Serve the built production bundle at an HTTPS test origin. Browser security
  // stays enabled; assert unsafe HTTP pairing never makes a network request.
  const hosted = await makePage({ viewport: { width: 390, height: 844 } });
  await hosted.route("https://bluey.test/**", async (route) => {
    const file = new URL(route.request().url()).pathname;
    const relative = file === "/" ? "index.html" : file.slice(1);
    const mime = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".woff2": "font/woff2",
      ".png": "image/png",
    };
    await route.fulfill({
      body: await fs.readFile(path.join("dist", relative)),
      contentType: mime[path.extname(relative)] || "application/octet-stream",
    });
  });
  await hosted.goto("https://bluey.test/");
  const toggle = hosted.getByRole("button", {
    name: "Toggle sidebar",
    exact: true,
  });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await hosted
    .getByRole("button", { name: "Close sidebar", exact: true })
    .click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
  await toggle.click();
  await hosted.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await hosted
    .getByRole("button", { name: "Dismiss sidebar", exact: true })
    .click({ position: { x: 350, y: 400 } });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await hosted
    .getByRole("button", { name: "Connected devices", exact: true })
    .click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    hosted.getByRole("button", { name: "Generate pairing code", exact: true }),
  ).toBeDisabled();
  await hosted
    .getByRole("button", { name: "Connect Windows engine", exact: true })
    .click();
  await hosted
    .getByLabel("Backend token", { exact: true })
    .fill("not-sent-anywhere");
  await hosted
    .getByRole("button", { name: "Save & connect", exact: true })
    .click();
  await expect(
    hosted.getByText("Enter your Windows backend address.", { exact: false }),
  ).toBeVisible();
  await hosted.keyboard.press("Escape");
  await hosted
    .getByRole("button", { name: "Pair this device", exact: true })
    .click();
  let sent = 0;
  hosted.on("request", (r) => {
    if (r.url().includes("/api/pair")) sent++;
  });
  await hosted
    .getByLabel("PC address", { exact: true })
    .fill("192.168.1.10:8765");
  await hosted.getByLabel("Pairing code", { exact: true }).fill("123456");
  await hosted
    .getByRole("button", { name: "Pair with Windows", exact: true })
    .click();
  await expect(hosted.getByRole("alert")).toContainText(
    "HTTPS website cannot pair over plain HTTP",
  );
  expect(sent).toBe(0);
  await fs.mkdir("artifacts", { recursive: true });
  await hosted.screenshot({
    path: "artifacts/pairing-mobile.png",
    fullPage: true,
  });
  await hosted.route("https://pc.test/api/pair", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      code: "123456",
      name: "Browser companion",
    });
    await route.fulfill({ json: { token: "browser-only-fixture" } });
  });
  await hosted.routeWebSocket("wss://pc.test/api/ws", (socket) =>
    socket.onMessage((raw) => {
      expect(JSON.parse(String(raw))).toEqual({
        type: "auth",
        token: "browser-only-fixture",
      });
      socket.send(JSON.stringify({ type: "ready", role: "phone" }));
    }),
  );
  await hosted
    .getByLabel("PC address", { exact: true })
    .fill("https://pc.test");
  await hosted
    .getByRole("button", { name: "Pair with Windows", exact: true })
    .click();
  await expect(
    hosted.getByText("Connected to Windows", { exact: true }),
  ).toBeVisible();
  expect(
    await hosted.evaluate(() => JSON.stringify({ ...localStorage })),
  ).not.toContain("browser-only-fixture");
  await hosted.close();
  expect(errors).toEqual([]);
  console.log(
    "Pairing smoke passed: real code redemption, live device updates, one-use enforcement, revocation, timed renewal, error recovery, cleanup, mobile sidebar, and hosted HTTPS guards.",
  );
} finally {
  await browser.close();
}
