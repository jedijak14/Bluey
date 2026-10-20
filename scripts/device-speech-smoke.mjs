// Native API fixture, not proof of a physical Android recognizer's accuracy.
import { chromium, expect } from "@playwright/test";
import packed from "@sparticuz/chromium";
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
try {
  const page = await browser.newPage({
      viewport: { width: 1000, height: 650 },
    }),
    packets = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.androidBridge = {};
    window.speechCalls = [];
    window.recognitionActive = false;
    window.recognitionText = "Background context";
    window.recognitionFailure = false;
    window.Capacitor = {
      PluginHeaders: [
        {
          name: "DeviceSpeech",
          methods: [
            "startRecognition",
            "stopRecognition",
            "cancelRecognition",
            "speak",
            "stopSpeaking",
            "getStatus",
            "chirp",
            "saveNotes",
          ].map((name) => ({ name, rtype: "promise" })),
        },
      ],
      nativePromise: async (_, method, args) => {
        window.speechCalls.push({ method, args });
        if (method === "startRecognition") {
          if (window.recognitionFailure)
            throw new Error("Microphone permission was denied.");
          window.recognitionActive = true;
          return { id: crypto.randomUUID() };
        }
        if (method === "getStatus")
          return { listening: window.recognitionActive };
        if (method === "stopRecognition") {
          window.recognitionActive = false;
          return { text: window.recognitionText };
        }
        if (method === "cancelRecognition") window.recognitionActive = false;
        if (method === "saveNotes") return { saved: true };
        if (method === "speak") throw new Error("Spoken output is forbidden");
        return {};
      },
    };
    window.Audio = class {
      constructor() {
        throw new Error("PC audio is forbidden");
      }
    };
  });
  await page.route("**/api/pair", (r) =>
    r.fulfill({ json: { token: "fixture" } }),
  );
  await page.route("**/api/companion/meeting", (r) =>
    r.fulfill({ json: { active: null, supported: false } }),
  );
  await page.route("**/api/companion/notes", (r) =>
    r.fulfill({
      json: { notes: "Decision: ship on Friday. Owner not identified." },
    }),
  );
  let peer;
  await page.routeWebSocket("**/api/ws", (ws) => {
    peer = ws;
    ws.onMessage((raw) => {
      const p = JSON.parse(raw);
      packets.push(p);
      if (p.type === "auth")
        ws.send(JSON.stringify({ type: "ready", role: "phone" }));
      if (p.type === "chat") {
        const text = `Reply to ${p.messages.at(-1).content}`;
        ws.send(JSON.stringify({ type: "token", request: p.request, text }));
        ws.send(
          JSON.stringify({
            type: "response",
            request: p.request,
            text,
            title: "Answer",
            format: "quick",
            sources: [],
          }),
        );
        ws.send(JSON.stringify({ type: "audio", audio: "MUST-NOT-PLAY" }));
        ws.send(JSON.stringify({ type: "done", request: p.request }));
      }
    });
  });
  await page.goto(process.env.BLUEY_PREVIEW_URL || "http://127.0.0.1:5173");
  await page
    .getByLabel("PC address", { exact: true })
    .fill("192.168.1.10:8765");
  await page.getByLabel("Pairing code", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "Pair with Windows", exact: true })
    .click();
  await expect(
    page.getByText("Connected to Windows", { exact: true }),
  ).toBeVisible();
  const calls = (method) =>
    page.evaluate(
      (method) => window.speechCalls.filter((c) => c.method === method),
      method,
    );
  expect(await calls("startRecognition")).toHaveLength(0);
  await page.mouse.dblclick(450, 280);
  await expect(
    page.getByRole("region", { name: "Microphone session consent" }),
  ).toBeVisible();
  expect(await calls("startRecognition")).toHaveLength(0);
  await page
    .getByLabel("I have permission from everyone being recorded.")
    .check();
  await page
    .getByRole("button", { name: "Allow & start session", exact: true })
    .click();
  await expect(page.locator(".phone-instruction")).toContainText(
    "Keeping context",
  );
  await expect(page.locator(".listening-edge")).toBeVisible();
  await page.evaluate(() => {
    window.recognitionText = "The team agreed to ship Friday";
    window.recognitionActive = false;
  });
  await expect
    .poll(async () => (await calls("startRecognition")).length)
    .toBeGreaterThan(1);
  expect(packets.filter((p) => p.type === "chat")).toHaveLength(0);
  await page.mouse.move(450, 280);
  await page.mouse.down();
  await expect(page.locator(".phone-instruction")).toHaveText("Release to ask");
  await page.evaluate(() => {
    window.recognitionText = "What's this?";
  });
  await page.mouse.up();
  await expect(page.locator(".phone-caption")).toContainText(
    "Reply to What's this?",
  );
  const question = packets.find((p) => p.type === "chat");
  expect(question.voice).toBe(false);
  expect(question.messages[0].content).toContain("ship Friday");
  expect(question.messages.at(-1).content).toBe("What's this?");
  expect(packets.some((p) => p.type === "point_at_mouse")).toBe(true);
  await expect.poll(async () => (await calls("chirp")).length).toBe(1);
  expect(await calls("speak")).toHaveLength(0);
  expect(packets.some((p) => p.type === "transcribe")).toBe(false);
  await expect(page.locator(".listening-edge")).toBeVisible();
  await page
    .getByRole("button", { name: "Take meeting notes", exact: true })
    .click();
  await expect(
    page.getByText("Meeting notes recording", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.recognitionText = "Decision: ship on Friday";
    window.recognitionActive = false;
  });
  await page.getByRole("button", { name: "End meeting", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Save meeting notes" }),
  ).toBeVisible();
  await expect(page.getByLabel("Meeting notes", { exact: true })).toHaveValue(
    "Decision: ship on Friday. Owner not identified.",
  );
  await page
    .getByRole("button", { name: "Save notes & transcription", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Save meeting notes" }),
  ).toHaveCount(0);
  expect((await calls("saveNotes"))[0].args.text).toContain(
    "## Microphone transcript",
  );
  await page.mouse.dblclick(450, 280);
  await expect(page.locator(".phone-instruction")).toContainText("Follow mode");
  await expect(page.locator(".listening-edge")).toHaveCount(0);
  // Windows shortcut command can start the already-consented paired phone, not TTS.
  peer.send(JSON.stringify({ type: "session_toggle" }));
  await expect(page.locator(".listening-edge")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".listening-edge")).toHaveCount(0);
  expect(await page.evaluate(() => window.recognitionActive)).toBe(false);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    window.recognitionFailure = true;
  });
  peer.send(JSON.stringify({ type: "session_toggle" }));
  await expect(page.locator(".session-error")).toContainText(
    "Microphone permission was denied",
  );
  await expect(page.locator(".listening-edge")).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(
    "Quiet session fixture passed: explicit consent, ambient context without replies, hold/release, mouse target, text/chirp only, continued listening, meeting review/save, double-tap stop, remote toggle, permission failure and background cancellation.",
  );
} finally {
  await browser.close();
}
