import { chromium, expect } from "@playwright/test";
import packed from "@sparticuz/chromium";
const browser = await chromium.launch({
  executablePath: process.env.BLUEY_BROWSER || (await packed.executablePath()),
  args: packed.args.filter(
    (a) =>
      !a.includes("disable-web-security") &&
      !a.includes("allow-running-insecure-content"),
  ),
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    sessionStorage.setItem("bluey.desktop-welcome.v1", "seen");
    window.bluey = {
      connection: async () => ({
        endpoint: location.origin,
        token: "native-engine-fixture",
      }),
      window: () => {},
      onCommand: () => () => {},
    };
  });
  let config = {
    provider: "ollama",
    model: "llama3.2",
    base_url: "http://127.0.0.1:11434",
    key_configured: false,
    key_storage: "windows_encrypted",
  };
  let savedKey = "",
    fail = false;
  const probes = [];
  await page.route("**/api/config/test", (route) => {
    expect(route.request().headers().authorization).toBe(
      "Bearer native-engine-fixture",
    );
    probes.push(route.request().postDataJSON());
    return route.fulfill({
      status: fail ? 424 : 200,
      json: fail
        ? {
            detail:
              "The model provider is temporarily unavailable. Your saved key has not been cleared.",
          }
        : { inference_checked: true },
    });
  });
  await page.route("**/api/config", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (body.api_key !== undefined) savedKey = body.api_key;
      const { api_key, ...rest } = body;
      config = { ...config, ...rest, key_configured: Boolean(savedKey) };
    }
    return route.fulfill({ json: config });
  });
  await page.routeWebSocket("**/api/ws", (socket) =>
    socket.onMessage((raw) => {
      if (JSON.parse(raw).type === "auth")
        socket.send(JSON.stringify({ type: "ready" }));
    }),
  );
  await page.goto(
    (process.env.BLUEY_PREVIEW_URL || "http://127.0.0.1:5173") + "/",
  );
  const open = () =>
    page
      .getByRole("button", { name: "Settings & preferences", exact: true })
      .click();
  const modal = page.getByRole("dialog", { name: "Settings and preferences" });
  await expect(
    page.getByRole("button", { name: "Engine online" }),
  ).toBeVisible();
  await open();
  await expect(modal.getByLabel("Backend token")).toHaveCount(0);
  await modal.getByRole("button", { name: "Save & connect" }).click();
  await expect(modal).toHaveCount(0);
  expect(probes[0].api_key).toBeUndefined();
  await open();
  await modal.getByLabel("Model provider").selectOption("ollama-cloud");
  await modal.getByLabel("Model", { exact: true }).fill("cloud-fixture");
  await modal
    .getByLabel("Provider API key", { exact: false })
    .fill("provider-fixture-key");
  await modal.getByRole("button", { name: "Save & connect" }).click();
  await expect(modal).toHaveCount(0);
  expect(probes.at(-1)).toMatchObject({
    provider: "ollama",
    base_url: "https://ollama.com",
    api_key: "provider-fixture-key",
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Engine online" }),
  ).toBeVisible();
  await open();
  await expect(modal.getByLabel("Model provider")).toHaveValue("ollama-cloud");
  await expect(
    modal.getByText("(already configured — leave blank to keep it)"),
  ).toBeVisible();
  await expect(
    modal.getByLabel("Provider API key", { exact: false }),
  ).toHaveValue("");
  fail = true;
  await modal.getByRole("button", { name: "Save & connect" }).click();
  await expect(modal.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Engine online" }),
  ).toBeVisible();
  expect(savedKey).toBe("provider-fixture-key");
  fail = false;
  await modal.getByRole("button", { name: "Save & connect" }).click();
  await expect(modal).toHaveCount(0);
  expect(probes.at(-1).api_key).toBeUndefined();
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain("provider-fixture-key");
  expect(stored).not.toContain("native-engine-fixture");
  expect(errors).toEqual([]);
  console.log(
    "Windows bridge fixture: automatic engine token, keyless local Ollama, cloud key entry, restart hydration, blank-key reuse, failure recovery and no browser credential persistence passed.",
  );
} finally {
  await browser.close();
}
