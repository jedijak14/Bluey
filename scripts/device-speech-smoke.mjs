// Frontend contract fixture; native OS services are tested separately on Android.
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
  });
  const errors = [],
    packets = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.androidBridge = {};
    window.speechCalls = [];
    window.recognitionFailure = false;
    window.holdSpeech = false;
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
          ].map((name) => ({ name, rtype: "promise" })),
        },
      ],
      nativePromise: async (_, method, args) => {
        window.speechCalls.push({ method, args });
        if (method === "startRecognition") {
          if (window.recognitionFailure)
            throw new Error("Microphone permission was denied.");
          return { id: "speech-session" };
        }
        if (method === "stopRecognition")
          return { text: "Recognized on the device" };
        if (method === "speak" && window.holdSpeech)
          return new Promise((resolve) => {
            window.finishSpeech = resolve;
          });
        if (method === "stopSpeaking") window.finishSpeech?.();
        return {};
      },
    };
    window.Audio = class {
      constructor() {
        throw new Error("Android must never play PC WAV audio");
      }
    };
  });
  await page.route("**/api/pair", (route) =>
    route.fulfill({ json: { token: "fixture-phone-token" } }),
  );
  await page.routeWebSocket("**/api/ws", (socket) =>
    socket.onMessage((raw) => {
      const packet = JSON.parse(raw);
      packets.push(packet);
      if (packet.type === "auth")
        socket.send(JSON.stringify({ type: "ready", role: "phone" }));
      if (packet.type === "chat") {
        socket.send(
          JSON.stringify({
            type: "token",
            request: packet.request,
            text: `Reply to ${packet.messages.at(-1).content}`,
          }),
        );
        socket.send(
          JSON.stringify({ type: "audio", audio: "unwanted-PC-WAV" }),
        );
        socket.send(JSON.stringify({ type: "done", request: packet.request }));
      }
    }),
  );
  await page.goto("http://127.0.0.1:5173");
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
      (method) => window.speechCalls.filter((call) => call.method === method),
      method,
    );
  const question = async (text) => {
    await page.getByRole("button", { name: "Companion options" }).click();
    await page.getByLabel("Ask Bluey", { exact: true }).fill(text);
    await page
      .getByRole("button", { name: "Send to my PC", exact: true })
      .click();
    await expect(page.locator(".phone-caption")).toContainText(
      `Reply to ${text}`,
    );
  };
  await expect(
    page.getByRole("button", { name: "Enable spoken replies" }),
  ).toHaveAttribute("aria-pressed", "false");
  await question("quiet by default");
  expect(await calls("speak")).toHaveLength(0);
  expect(packets.filter((p) => p.type === "chat").at(-1).voice).toBe(false);
  // Require informed recognition opt-in before the first recording.
  await page.mouse.move(450, 340);
  await page.mouse.down();
  await expect(page.locator(".phone-error")).toContainText(
    "Enable device speech recognition",
  );
  await page.mouse.up();
  expect(await calls("startRecognition")).toHaveLength(0);
  await expect(
    page.getByLabel("Use device speech recognition"),
  ).not.toBeChecked();
  await page.getByLabel("Use device speech recognition").check();
  await expect(
    page.getByLabel(/Speak replies using Android/),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Close options" }).click();
  const hold = async () => {
    await page.mouse.move(450, 340);
    await page.mouse.down();
    await expect(page.locator(".phone-instruction")).toContainText(
      "Listening — release",
    );
    await page.mouse.up();
  };
  await hold();
  await expect(page.locator(".phone-caption")).toContainText(
    "Reply to Recognized on the device",
  );
  expect(await calls("startRecognition")).toHaveLength(1);
  expect(await calls("stopRecognition")).toHaveLength(1);
  expect(await calls("speak")).toHaveLength(0);
  expect(packets.some((p) => p.type === "transcribe")).toBe(false);
  await page.getByRole("button", { name: "Enable spoken replies" }).click();
  await question("opted-in device output");
  await expect.poll(async () => (await calls("speak")).length).toBe(1);
  expect((await calls("speak"))[0].args.text).toBe(
    "Reply to opted-in device output",
  );
  expect(
    packets.filter((p) => p.type === "chat").every((p) => p.voice === false),
  ).toBe(true);
  await page.evaluate(() => {
    window.holdSpeech = true;
  });
  await question("cancel this speech");
  await expect.poll(async () => (await calls("speak")).length).toBe(2);
  const beforeMute = (await calls("stopSpeaking")).length;
  await page.getByRole("button", { name: "Mute spoken replies" }).click();
  await expect
    .poll(async () => (await calls("stopSpeaking")).length)
    .toBeGreaterThan(beforeMute);
  await question("silent again");
  expect(await calls("speak")).toHaveLength(2);
  await page.evaluate(() => {
    window.recognitionFailure = true;
  });
  await page.mouse.move(450, 340);
  await page.mouse.down();
  await expect(page.locator(".phone-error")).toContainText(
    "Microphone permission was denied",
  );
  await page.mouse.up();
  const previousCancel = (await calls("cancelRecognition")).length;
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(async () => (await calls("cancelRecognition")).length)
    .toBeGreaterThan(previousCancel);
  expect(errors).toEqual([]);
  console.log(
    "Device speech UI passed: silent defaults, device text input, no PC audio, explicit TTS, mute/cancellation, permission error and background cleanup.",
  );
} finally {
  await browser.close();
}
