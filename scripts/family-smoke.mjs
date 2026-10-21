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
const base = process.env.BLUEY_PREVIEW_URL || "http://127.0.0.1:5173";
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base + "/#home");
  await expect(
    page.getByRole("heading", { name: "Sign in to your Bluey Account." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "My family" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Explore a demo family" }),
  ).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await fs.mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/account-gate.png", fullPage: true });
  await page.goto(base + "/#kids");
  await page
    .getByRole("button", { name: "Preview safety message (not enforcement)" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "A little safety pause." }),
  ).toBeVisible();
  await expect(
    page.getByText("No website was blocked and no notification was sent.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/kids-safety.png", fullPage: true });
  await page
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  // Isolated browser fixtures exercise parent and kid UX; backend authorization is tested separately.
  const policy = {
    version: 0,
    daily_minutes: 120,
    bedtime_start: "21:00",
    bedtime_end: "07:00",
    timezone: "America/Los_Angeles",
    blocked_domains: [],
  };
  let child = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      name: "Test child",
      policy,
      extra_minutes_today: 0,
      used_minutes: null,
      protected: false,
      last_seen: null,
    },
    requests = [],
    children = [];
  await page.route("**/api/family/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/family/",
      "",
    );
    let result = {};
    if (path === "status") result = { status: "ready" };
    else if (path === "auth/login") result = { token: "parent-test" };
    else if (path === "alerts") result = [];
    else if (path === "dashboard") result = { children, requests };
    else if (path === "children") {
      children = [child];
      result = child;
    } else if (path.endsWith("/enrollment"))
      result = { code: "test-one-use-code" };
    else if (path.endsWith("/policy")) {
      child = {
        ...child,
        policy: { ...route.request().postDataJSON(), version: 1 },
      };
      children = [child];
      result = child;
    } else if (path === "enroll") result = { token: "kid-test" };
    else if (path === "kid") result = { ...child, requests };
    else if (path === "kid/requests") {
      requests = [
        {
          id: "request-1",
          child: child.id,
          name: child.name,
          minutes: 15,
          reason: "Finish homework",
          status: "pending",
          created: Date.now() / 1000,
        },
      ];
      result = requests[0];
    } else if (path.endsWith("/decision")) {
      requests[0].status = "approved";
      child.extra_minutes_today = 15;
      result = { status: "approved" };
    }
    await route.fulfill({ json: result });
  });
  await page.goto(base + "/#home");
  await page.getByLabel("Parent username").fill("test-parent");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-parent-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Child nickname").fill("Test child");
  await page.getByRole("button", { name: "Add child" }).click();
  await expect(
    page.getByRole("heading", { name: "Test child’s rules" }),
  ).toBeVisible();
  await page.getByLabel("Daily computer allowance").fill("60");
  await page.getByLabel("Parent allowlist exceptions").fill("x.com");
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(
    page.getByText(
      "Rules saved. Check the Windows agent’s applied policy version before relying on them.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enroll Kids app" }).click();
  await expect(
    page.getByText("test-one-use-code", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto(base + "/#kids");
  await page.getByLabel("Code from your parent").fill("test-one-use-code");
  await page.getByRole("button", { name: "Connect my space" }).click();
  await expect(
    page.getByRole("heading", { name: "Hey, Test child." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Preview the time-up screen/ })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  await page.getByLabel("A note for your parent").fill("Finish homework");
  await page.getByRole("button", { name: "Ask my parent" }).click();
  await expect(page.getByText("Request sent.", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ask my parent" }),
  ).toBeDisabled();
  await page.goto(base + "/#home");
  await page.getByLabel("Parent username").fill("test-parent");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-parent-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Time requests" }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByText("Approved in Home.", { exact: false }),
  ).toBeVisible();
  expect(child.policy.allowed_domains).toEqual(["x.com"]);
  await page.addInitScript(() => {
    window.blueyFamily = {
      guardianStatus: async () => ({ state: "admin_needed" }),
      openSetupGuide: async () => "",
      vaultRead: async () => ({ token: "" }),
      vaultWrite: async () => {},
      vaultClear: async () => {},
      request: async () => ({ status: 503, data: { error: "Not configured" } }),
    };
  });
  await page.goto(base + "/#kids");
  await page.reload();
  await expect(
    page.getByText("Admin Permissions is needed", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".kids-welcome .avatar")).toBeVisible();
  await page.goto(base + "/downloads.html");
  await expect(
    page.getByRole("heading", {
      name: "A little company. A space for everyone.",
    }),
  ).toBeVisible();
  for (const name of [
    "bluey-kids-logo.png",
    "bluey-home-logo.png",
    "bluey-logo.png",
  ]) {
    const logo = page.locator(`.product img[src="./${name}"]`);
    await expect(logo).toBeVisible();
    await expect
      .poll(() => logo.evaluate((img) => img.complete && img.naturalWidth > 0))
      .toBe(true);
  }
  const downloads = page.locator('a[href$=".exe"], a[href$=".apk"]');
  await expect(downloads).toHaveCount(7);
  for (const href of await downloads.evaluateAll((nodes) =>
    nodes.map((node) => node.href),
  )) {
    expect(href).toMatch(
      /^https:\/\/github\.com\/jedijak14\/Bluey\/releases\/download\/v0\.5\.(3|5)-preview\.1\//,
    );
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/downloads-${width}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
  console.log(
    "Account gate, mobile safety preview, enrollment, rules and time requests passed.",
  );
} finally {
  await browser.close();
}
