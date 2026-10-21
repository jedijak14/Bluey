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
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.bluey = {
      connection: async () => ({
        endpoint: location.origin,
        token: "native-fixture",
      }),
      window: () => {},
      onCommand: () => () => {},
    };
  });
  let config = {
    provider: "ollama",
    model: "llama3.2",
    base_url: "http://localhost:11434",
    key_configured: false,
    key_storage: "windows_encrypted",
    setup_complete: false,
  };
  let key = "",
    fail = false,
    empty = false,
    offline = false,
    authenticated = 0,
    probes = 0;
  const discoveries = [],
    saves = [];
  await page.route("**/api/config/test", (route) => {
    probes++;
    return route.fulfill({
      status: 500,
      json: { detail: "Must not generate a test prompt" },
    });
  });
  await page.route("**/api/config", (route) => {
    if (offline) return route.abort();
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      saves.push(body);
      if (body.api_key !== undefined) key = body.api_key;
      const { api_key, ...rest } = body;
      config = {
        ...config,
        ...rest,
        key_configured: Boolean(key),
        setup_complete: true,
      };
    }
    return route.fulfill({ json: config });
  });
  await page.route("**/api/models", (route) => {
    expect(route.request().headers().authorization).toBe(
      "Bearer native-fixture",
    );
    const body = route.request().postDataJSON();
    discoveries.push(body);
    expect(body.model).toBeUndefined();
    return route.fulfill({
      status: fail ? 424 : 200,
      json: fail
        ? {
            detail:
              "Cannot fetch the model list. Your saved key has not been changed.",
          }
        : {
            models: empty
              ? []
              : body.base_url.includes("ollama.com")
                ? ["cloud-one", "cloud-two"]
                : ["gemma3:1b", "local-two"],
          },
    });
  });
  await page.routeWebSocket("**/api/ws", (socket) =>
    socket.onMessage((raw) => {
      if (JSON.parse(raw).type === "auth") {
        if (offline) socket.close({ code: 1001 });
        else {
          authenticated++;
          socket.send(JSON.stringify({ type: "ready" }));
        }
      }
    }),
  );
  const url = (process.env.BLUEY_PREVIEW_URL || "http://127.0.0.1:5173") + "/";
  await page.goto(url);
  const open = () =>
    page
      .getByRole("button", { name: "Settings & preferences", exact: true })
      .click();
  const dialog = page.getByRole("dialog", { name: "Settings and preferences" });
  await expect.poll(() => authenticated).toBe(1);
  await open();
  await expect(dialog.getByLabel("Backend token")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Find models", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("2 models found");
  await dialog.getByLabel("Model", { exact: true }).selectOption("gemma3:1b");
  await dialog.getByRole("button", { name: "Save model" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".engine-status")).toHaveCount(0);
  await expect(page.locator(".local-card")).toHaveCount(0);
  expect(saves[0].api_key).toBeUndefined();
  await open();
  await dialog.getByLabel("Model provider").selectOption("ollama-cloud");
  await dialog
    .getByLabel("Provider API key", { exact: false })
    .fill("provider-fixture");
  await dialog
    .getByRole("button", { name: "Find models", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("2 models found");
  await dialog.getByLabel("Model", { exact: true }).selectOption("cloud-two");
  await dialog.getByRole("button", { name: "Save model" }).click();
  await expect(dialog).toHaveCount(0);
  expect(key).toBe("provider-fixture");
  const before = authenticated;
  await page.reload();
  await expect.poll(() => authenticated).toBeGreaterThan(before);
  await expect(page.locator(".engine-status")).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  await open();
  await expect(dialog.getByLabel("Model", { exact: true })).toHaveValue(
    "cloud-two",
  );
  await dialog
    .getByRole("button", { name: "Find models", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("2 models found");
  expect(discoveries.at(-1).api_key).toBeUndefined();
  fail = true;
  await dialog
    .getByRole("button", { name: "Find models", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "saved key has not been changed",
  );
  expect(key).toBe("provider-fixture");
  fail = false;
  empty = true;
  await dialog
    .getByRole("button", { name: "Find models", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("No models found");
  await expect(
    dialog.getByRole("button", { name: "Save model" }),
  ).toBeDisabled();
  await dialog.getByTitle("Close settings").click();
  offline = true;
  await page.reload();
  await page
    .getByRole("textbox", { name: "Message Bluey" })
    .fill("Keep my draft");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".engine-status")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Message Bluey" }),
  ).toHaveValue("Keep my draft");
  await expect(page.getByRole("status")).toContainText(
    "reconnecting automatically",
  );
  expect(probes).toBe(0);
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain("provider-fixture");
  expect(stored).not.toContain("native-fixture");
  expect(errors).toEqual([]);
  console.log(
    "Catalog discovery, explicit model selection, no test prompt, saved-key reuse, empty/error recovery, automatic reconnect and permanently removed setup UI passed.",
  );
} finally {
  await browser.close();
}
