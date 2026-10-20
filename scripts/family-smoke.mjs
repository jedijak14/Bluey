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
    page.getByRole("heading", {
      name: "A little guidance. A lot of growing room.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Explore a demo family" }).click();
  await expect(page.getByText("DEMO FAMILY", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save rules" })).toBeDisabled();
  await page.getByRole("button", { name: /Sam Not protected/ }).click();
  await expect(
    page.getByRole("heading", { name: "Sam’s rules" }),
  ).toBeVisible();
  await fs.mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/home-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Time requests" }).click();
  await expect(
    page.getByRole("heading", { name: "Nothing waiting for you." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Setup & safety" }).click();
  await expect(
    page.getByText("A fullscreen window alone is not protection.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "My family" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: "artifacts/home-mobile.png", fullPage: true });
  await page.goto(base + "/#kids");
  await expect(
    page.getByRole("heading", { name: "Let’s get you connected." }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: "artifacts/kids-mobile.png", fullPage: true });
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
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(
    page.getByText(
      "Rules saved. Windows and browser enforcement are not connected.",
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
  expect(errors).toEqual([]);
  console.log(
    "Family desktop/mobile, enrollment, rules, time requests and honest preview UI passed.",
  );
} finally {
  await browser.close();
}
