// Real disposable API + browser + Vite gateway. No Windows API calls or production data.
// Start backend with local-integration-invite and point Vite at it (see docs/FAMILY_RELIABILITY.md).
import { chromium, expect } from "@playwright/test";
import packed from "@sparticuz/chromium";
import fs from "node:fs/promises";
const base = process.env.BLUEY_FAMILY_TEST_URL || "http://127.0.0.1:15175";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error(
    "This test creates disposable accounts; refusing a non-loopback host.",
  );
const browser = await chromium.launch({
  executablePath: process.env.BLUEY_BROWSER || (await packed.executablePath()),
  args: packed.args.filter(
    (a) =>
      !a.includes("single-process") &&
      !a.includes("disable-web-security") &&
      !a.includes("allow-running-insecure-content"),
  ),
  headless: true,
});
const parentContext = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const kidContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const home = await parentContext.newPage(),
  kids = await kidContext.newPage();
const errors = [];
for (const page of [home, kids])
  page.on("pageerror", (e) => errors.push(e.message));
const resume = (page) =>
  page.evaluate(() => window.dispatchEvent(new Event("online")));
const endpoint = (path) => `${base}/api/family/${path}`;
try {
  await home.goto(base + "/#home");
  await home
    .getByRole("button", { name: "Create a Bluey Account", exact: true })
    .click();
  await home.getByLabel("Parent username").fill(`integration-${Date.now()}`);
  await home
    .getByLabel("Password", { exact: true })
    .fill("disposable-parent-password");
  await home
    .getByLabel("Operator setup invite")
    .fill("local-integration-invite");
  const signedIn = home.waitForResponse(
    (r) => r.url().endsWith("/auth/register") && r.status() === 200,
  );
  await home
    .getByRole("button", { name: "Create parent account", exact: true })
    .click();
  const parentToken = (await (await signedIn).json()).token;
  const headers = { Authorization: `Bearer ${parentToken}` };
  await home.getByLabel("Child nickname").fill("Integration child");
  await home.getByRole("button", { name: "Add child", exact: true }).click();
  await expect(
    home.getByRole("heading", { name: "Integration child’s rules" }),
  ).toBeVisible();
  const dashboard = await (
    await parentContext.request.get(endpoint("dashboard"), { headers })
  ).json();
  const child = dashboard.children[0];

  // Concurrent parent edits must not overwrite an unsaved form on background refresh.
  await home.getByLabel("Daily computer allowance").fill("45");
  const policy = {
    ...child.policy,
    daily_minutes: 60,
    allowed_domains: ["x.com"],
  };
  expect(
    (
      await parentContext.request.put(endpoint(`children/${child.id}/policy`), {
        headers,
        data: policy,
      })
    ).status(),
  ).toBe(200);
  await home
    .getByRole("button", { name: "Refresh family", exact: true })
    .click();
  await expect(
    home.getByText("Rules changed on another device.", { exact: false }),
  ).toBeVisible();
  await expect(home.getByLabel("Daily computer allowance")).toHaveValue("45");
  await expect(
    home.getByRole("button", { name: "Save rules", exact: true }),
  ).toBeDisabled();
  await home
    .getByRole("button", { name: "Load saved rules", exact: true })
    .click();
  await expect(home.getByLabel("Daily computer allowance")).toHaveValue("60");
  await home.getByLabel("Daily computer allowance").fill("90");
  let releaseSave;
  const saveGate = new Promise((resolve) => {
    releaseSave = resolve;
  });
  await home.route("**/api/family/children/*/policy", async (route) => {
    await saveGate;
    await route.continue();
  });
  await home.getByRole("button", { name: "Save rules", exact: true }).click();
  await expect(home.getByLabel("Daily computer allowance")).toBeDisabled();
  await expect(home.getByLabel("Parent allowlist exceptions")).toBeDisabled();
  releaseSave();
  await expect(home.getByText("Rules saved.", { exact: false })).toBeVisible();
  await home.unroute("**/api/family/children/*/policy");

  // Separate enrollment authorities, actually consumed by the live API.
  await home
    .getByRole("button", { name: "Enroll Kids app", exact: true })
    .click();
  const code = await home.locator(".home-enrollment code").innerText();
  await expect(
    home.getByRole("heading", {
      name: "Bluey for Kids app enrollment · Integration child",
    }),
  ).toBeVisible();
  await kids.goto(base + "/#kids");
  await kids.getByLabel("Code from your parent").fill(code);
  await kids
    .getByRole("button", { name: "Connect my space", exact: true })
    .click();
  await expect(
    kids.getByRole("heading", { name: "Hey, Integration child." }),
  ).toBeVisible();
  expect(
    (
      await parentContext.request.post(endpoint("enroll"), { data: { code } })
    ).status(),
  ).toBe(403);

  await home
    .getByRole("button", { name: "Create Windows agent code", exact: true })
    .click();
  await expect(
    home.getByRole("heading", {
      name: "Windows Guardian enrollment · Integration child",
    }),
  ).toBeVisible();
  const agentCode = await home.locator(".home-enrollment code").innerText();
  expect(
    (
      await parentContext.request.post(endpoint("enroll"), {
        data: { code: agentCode },
      })
    ).status(),
  ).toBe(403);
  const enrolled = await parentContext.request.post(endpoint("agent/enroll"), {
    data: { code: agentCode },
  });
  expect(enrolled.status()).toBe(200);
  const agentHeaders = {
    Authorization: `Bearer ${(await enrolled.json()).token}`,
  };
  let bundle = await (
    await parentContext.request.get(endpoint("agent/policy"), {
      headers: agentHeaders,
    })
  ).json();
  expect(bundle.policy.daily_minutes).toBe(90);
  expect(bundle.website_rules.allowed).toContain("x.com");
  expect(
    (
      await parentContext.request.get(endpoint("dashboard"), {
        headers: agentHeaders,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await parentContext.request.post(endpoint("agent/report"), {
        headers: agentHeaders,
        data: {
          policy_version: bundle.policy.version,
          day: bundle.day,
          used_seconds: 125,
          time_service: true,
          edge_rules: true,
          browser_rules: { edge: true, chrome: true },
        },
      })
    ).status(),
  ).toBe(200);
  await home
    .getByRole("button", { name: "Refresh family", exact: true })
    .click();
  await expect(
    home.getByText("2 minutes used today, reported by Windows Guardian.", {
      exact: false,
    }),
  ).toBeVisible();
  await resume(kids);
  await expect(
    kids.getByText("2 minutes used today, reported by Windows Guardian.", {
      exact: false,
    }),
  ).toBeVisible();

  // Offline UI keeps enrollment/rules but never calls cached evidence current.
  await home.route("**/api/family/dashboard", (route) =>
    route.fulfill({ status: 503, json: { error: "Test outage" } }),
  );
  await home
    .getByRole("button", { name: "Refresh family", exact: true })
    .click();
  await expect(
    home.getByText("Remote service not connected", { exact: true }),
  ).toBeVisible();
  await expect(
    home.getByRole("heading", { name: "Offline · showing last received data" }),
  ).toBeVisible();
  await home.unroute("**/api/family/dashboard");
  await home
    .getByRole("button", { name: "Refresh family", exact: true })
    .click();
  await expect(
    home.getByText("Family service connected", { exact: true }),
  ).toBeVisible();
  await kids.route("**/api/family/kid", (route) =>
    route.fulfill({ status: 503, json: { error: "Test outage" } }),
  );
  await resume(kids);
  await expect(
    kids.getByText("Connection interrupted.", { exact: false }),
  ).toBeVisible();
  await expect(
    kids.getByRole("button", { name: "Ask my parent", exact: true }),
  ).toBeDisabled();
  await expect(kids.getByLabel("Code from your parent")).not.toBeVisible();
  await kids.unroute("**/api/family/kid");
  await kids
    .getByRole("button", { name: "Retry connection", exact: true })
    .click();
  await expect(
    kids.getByRole("button", { name: "Ask my parent", exact: true }),
  ).toBeEnabled();
  await expect(
    kids.getByText("Test outage", { exact: true }),
  ).not.toBeVisible();

  await kids.getByLabel("A note for your parent").fill("Finish homework");
  await kids
    .getByRole("button", { name: "Ask my parent", exact: true })
    .click();
  await expect(kids.getByText("Request sent.", { exact: false })).toBeVisible();
  await expect(
    kids.getByRole("button", { name: "Ask my parent", exact: true }),
  ).toBeDisabled();
  await home
    .getByRole("button", { name: "Refresh family", exact: true })
    .click();
  await home
    .getByRole("button", { name: "Time requests", exact: false })
    .click();
  await home.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    home.getByText("Approved in Home.", { exact: false }),
  ).toBeVisible();
  await resume(kids);
  await expect(
    kids.getByText("15 extra minutes approved today", { exact: true }),
  ).toBeVisible();
  bundle = await (
    await parentContext.request.get(endpoint("agent/policy"), {
      headers: agentHeaders,
    })
  ).json();
  expect(bundle.extra_minutes_today).toBe(15);

  // Codes stop displaying when their UI lifetime expires; logout clears identity.
  await home.getByRole("button", { name: "My family", exact: true }).click();
  await home.clock.install();
  await home.clock.fastForward(601000);
  await expect(
    home.getByText("This code has expired.", { exact: false }),
  ).toBeVisible();
  await expect(home.locator(".home-enrollment code")).toHaveCount(0);
  await fs.mkdir("artifacts", { recursive: true });
  await home.screenshot({
    path: "artifacts/family-live-home.png",
    fullPage: true,
  });
  await kids.screenshot({
    path: "artifacts/family-live-kids.png",
    fullPage: true,
  });
  expect(
    await kids.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Simulate native encrypted-vault failure AFTER successful enrollment. The
  // one-use code is consumed, so keep the session and offer a safe write retry.
  const vaultCodeResponse = await parentContext.request.post(
    endpoint(`children/${child.id}/enrollment`),
    { headers, data: {} },
  );
  const vaultCode = (await vaultCodeResponse.json()).code;
  const nativeContext = await browser.newContext({ reducedMotion: "reduce" });
  await nativeContext.addInitScript(() => {
    let writes = 0,
      clears = 0;
    window.blueyFamily = {
      guardianStatus: async () => ({ state: "admin_needed" }),
      openSetupGuide: async () => "",
      vaultRead: async () => {
        if (!window.allowTestVaultRead)
          throw Error("Simulated encrypted storage read failure");
        return { token: "" };
      },
      vaultWrite: async () => {
        if (++writes === 1) throw Error("Simulated encrypted storage failure");
      },
      vaultClear: async () => {
        if (++clears === 1) throw Error("Simulated clear failure");
      },
      request: async (path, token, body, method) => {
        const response = await fetch(`/api/family/${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: response.status, data: await response.json() };
      },
    };
  });
  const native = await nativeContext.newPage();
  native.on("pageerror", (e) => errors.push(e.message));
  await native.goto(base + "/#kids");
  await expect(
    native.getByText("Saved enrollment could not be read.", { exact: false }),
  ).toBeVisible();
  await native.evaluate(() => {
    window.allowTestVaultRead = true;
  });
  await native
    .getByRole("button", { name: "Retry saved enrollment", exact: true })
    .click();
  await expect(
    native.getByText("Saved enrollment could not be read.", { exact: false }),
  ).not.toBeVisible();
  await native.getByLabel("Code from your parent").fill(vaultCode);
  await native
    .getByRole("button", { name: "Connect my space", exact: true })
    .click();
  await expect(
    native.getByRole("heading", { name: "Hey, Integration child." }),
  ).toBeVisible();
  await expect(
    native.getByText("Connected for this session only.", { exact: false }),
  ).toBeVisible();
  await native
    .getByRole("button", { name: "Retry saving enrollment", exact: true })
    .click();
  await expect(
    native.getByText("Enrollment saved securely on this device.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    native.getByRole("button", {
      name: "Retry saving enrollment",
      exact: true,
    }),
  ).not.toBeVisible();
  await resume(kids);
  await expect(kids.getByLabel("Code from your parent")).toBeVisible();
  await expect(
    kids.getByRole("heading", { name: "Hey, Integration child." }),
  ).not.toBeVisible();
  await native
    .getByRole("button", { name: "Forget this app’s enrollment", exact: true })
    .click();
  await expect(
    native.getByText(
      "The app disconnected, but encrypted enrollment could not be removed",
      { exact: false },
    ),
  ).toBeVisible();
  await native
    .getByRole("button", { name: "Retry removing enrollment", exact: true })
    .click();
  await expect(
    native.getByText(
      "The app disconnected, but encrypted enrollment could not be removed",
      { exact: false },
    ),
  ).not.toBeVisible();
  await nativeContext.close();
  await home.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    home.getByRole("heading", { name: "Sign in to your Bluey Account." }),
  ).toBeVisible();
  expect(
    (
      await parentContext.request.get(endpoint("dashboard"), { headers })
    ).status(),
  ).toBe(401);
  expect(errors).toEqual([]);
  console.log(
    "Real API integration passed: registration, conflicting edits, both pairing scopes, agent reports, outage/recovery, extra-time approval and logout. No OS enforcement was exercised.",
  );
} finally {
  await browser.close();
}
