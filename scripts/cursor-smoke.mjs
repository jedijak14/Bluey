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
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const listeners = [];
    window.emitMouse = (p) => listeners.forEach((fn) => fn(p));
    window.bluey = {
      connection: async () => ({ endpoint: location.origin, token: "fixture" }),
      interactive: () => {},
      window: () => {},
      onCommand: () => () => {},
      onPointer: (fn) => {
        listeners.push(fn);
        return () => {};
      },
      overlayLayout: async () => ({
        x: 0,
        y: 0,
        width: innerWidth,
        height: innerHeight - 48,
      }),
      onOverlayLayout: (fn) => {
        window.changeLayout = fn;
        return () => {};
      },
    };
  });
  let socket;
  await page.routeWebSocket("**/api/ws", (route) =>
    route.onMessage((raw) => {
      if (JSON.parse(raw).type === "auth") {
        socket = route;
        route.send(JSON.stringify({ type: "ready" }));
      }
    }),
  );
  await page.goto(
    (process.env.BLUEY_PREVIEW_URL || "http://127.0.0.1:5173") + "/#overlay",
  );
  const position = () =>
    page.locator(".overlay-cursor").evaluate((el) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return { x: Math.round(matrix.m41), y: Math.round(matrix.m42) };
    });
  await expect.poll(position).toEqual({ x: 604, y: 780 });
  await expect.poll(() => Boolean(socket)).toBe(true);
  await expect(page.locator(".overlay-cursor")).toHaveAttribute(
    "data-state",
    "docked",
  );
  await expect(page.locator(".overlay-cursor-body > svg")).toHaveCSS(
    "opacity",
    "0",
  );
  await expect(page.locator(".overlay-dock-tip")).toHaveCSS("opacity", "1");
  const tip = await page.locator(".overlay-dock-tip").boundingBox();
  expect(Math.round(tip.x + tip.width / 2)).toBe(640);
  expect(Math.round(tip.y + tip.height)).toBe(852);
  await expect(page.locator(".floating-widget .avatar")).toHaveCount(0);
  await page.mouse.move(20, 40);
  await page.evaluate(() => {
    for (let i = 0; i < 100; i++) window.emitMouse({ x: i * 10, y: i * 5 });
  });
  socket.send(
    JSON.stringify({
      type: "face",
      face: { mood: "thinking", gazeX: 1, gazeY: 1, talk: 0 },
    }),
  );
  socket.send(
    JSON.stringify({ type: "caption", text: "Still quietly at home." }),
  );
  await expect(page.locator(".overlay-caption")).toContainText(
    "Still quietly at home.",
  );
  expect(await position()).toEqual({ x: 604, y: 780 });
  socket.send(JSON.stringify({ type: "pointer", x: 200, y: 200 }));
  await expect(page.locator(".overlay-cursor")).toHaveAttribute(
    "data-state",
    "pointing",
  );
  const samples = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const frames = [];
        const sample = (time) => {
          const m = new DOMMatrixReadOnly(
            getComputedStyle(document.querySelector(".overlay-cursor"))
              .transform,
          );
          frames.push({
            x: m.m41,
            y: m.m42,
            time,
            rotated: m.b !== 0 || m.c !== 0,
          });
          if (frames.length < 70) requestAnimationFrame(sample);
          else resolve(frames);
        };
        requestAnimationFrame(sample);
      }),
  );
  expect(samples.some((p) => p.x > 220 && p.x < 604)).toBe(true);
  expect(samples.every((p) => !p.rotated)).toBe(true); // Caption never rotates with the character.
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    expect(
      Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, b.time - a.time),
    ).toBeLessThan(8);
  }
  await expect.poll(position).toEqual({ x: 220, y: 144 });
  socket.send(JSON.stringify({ type: "home" }));
  await expect.poll(position).toEqual({ x: 604, y: 780 });
  await page.evaluate(() => window.emitMouse({ x: 0, y: 0 }));
  socket.send(JSON.stringify({ type: "pointer", x: "bad", y: 30 }));
  expect(await position()).toEqual({ x: 604, y: 780 });
  // A quick action must still reach its target before the automatic return.
  socket.send(JSON.stringify({ type: "pointer", x: 200, y: 200 }));
  socket.send(JSON.stringify({ type: "home", reason: "action_complete" }));
  const visited = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let hit = false,
          frames = 0;
        const sample = () => {
          const m = new DOMMatrixReadOnly(
            getComputedStyle(document.querySelector(".overlay-cursor"))
              .transform,
          );
          hit ||= Math.abs(m.m41 - 220) < 1 && Math.abs(m.m42 - 144) < 1;
          if (++frames < 180) requestAnimationFrame(sample);
          else resolve(hit);
        };
        requestAnimationFrame(sample);
      }),
  );
  expect(visited).toBe(true);
  await expect.poll(position).toEqual({ x: 604, y: 780 });
  await page.setViewportSize({ width: 900, height: 700 });
  await page.evaluate(() =>
    window.changeLayout({ x: 0, y: 0, width: 900, height: 652 }),
  );
  await expect.poll(position).toEqual({ x: 414, y: 580 });
  await page.evaluate(() => {
    localStorage.setItem(
      "bluey.settings",
      JSON.stringify({ cursorSize: 120, trail: "string" }),
    );
    dispatchEvent(new StorageEvent("storage", { key: "bluey.settings" }));
  });
  await expect.poll(position).toEqual({ x: 390, y: 532 });
  await expect(page.locator(".overlay-trail path")).toHaveAttribute("d", "");
  await page.emulateMedia({ reducedMotion: "reduce" });
  socket.send(JSON.stringify({ type: "pointer", x: 900, y: 50 }));
  await expect.poll(position).toEqual({ x: 750, y: 0 });
  await page.getByTitle("Return cursor home").click({ force: true });
  await expect.poll(position).toEqual({ x: 390, y: 532 });
  await expect(page.locator(".overlay-cursor")).toHaveAttribute(
    "data-state",
    "docked",
  );
  // Exercise several fractional flight lengths under reduced motion. A computed
  // end timestamp used to round just short of completion and leave the body out.
  for (const [x, y] of [
    [201, 101],
    [489, 211],
    [806, 417],
    [121, 730],
  ]) {
    socket.send(JSON.stringify({ type: "pointer", x, y }));
    await expect(page.locator(".overlay-cursor")).toHaveAttribute(
      "data-state",
      "pointing",
    );
    await expect.poll(position).not.toEqual({ x: 390, y: 532 });
    await page.getByTitle("Return cursor home").click({ force: true });
    await expect(page.locator(".overlay-cursor")).toHaveAttribute(
      "data-state",
      "docked",
    );
    await expect.poll(position).toEqual({ x: 390, y: 532 });
  }
  const emit = (packet) => socket.send(JSON.stringify(packet));
  emit({ type: "research_state", request: "report-1", state: "waiting" });
  await expect(
    page.getByRole("region", { name: "Bluey research" }),
  ).toContainText("Waiting for desktop approval");
  emit({ type: "research_state", request: "report-1", state: "searching" });
  await expect(page.locator(".research-progress")).toContainText(
    "Looking up sources",
  );
  emit({ type: "research_state", request: "report-1", state: "writing" });
  await expect(page.locator(".research-progress")).toContainText(
    "Preparing your report",
  );
  const answer = {
    type: "response",
    request: "report-1",
    format: "research",
    title: "Projects quick guide",
    text: "A useful researched paragraph with clear details. ".repeat(80),
    sources: [
      {
        title: "Reference",
        url: "https://example.com/projects",
        snippet: "Source preview",
      },
    ],
  };
  emit(answer);
  const card = page.locator(".overlay-research .response-card");
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/collapsed/);
  await expect(card.locator(".response-preview > span")).toHaveCSS(
    "-webkit-line-clamp",
    "3",
  );
  const box = await card.boundingBox();
  expect(box.y).toBe(16);
  expect(Math.round(box.x + box.width)).toBe(884);
  emit({ type: "home", reason: "action_complete" });
  emit({
    type: "response",
    request: "quick",
    format: "quick",
    title: "Quick reply",
    text: "Ready.",
    sources: [],
  });
  await expect(card).toContainText("Projects quick guide");
  await page.getByTitle("Read full report").click();
  await expect(card.locator(".response-paper")).toBeVisible();
  await expect(card.getByRole("link", { name: "Reference" })).toHaveAttribute(
    "href",
    "https://example.com/projects",
  );
  await page.getByTitle("Minimize response").click();
  await expect(card.locator(".response-preview")).toBeVisible();
  await page.getByTitle("Close response").click();
  await expect(card).toHaveCount(0);
  emit(answer); // Duplicate completion cannot reopen a dismissed report.
  emit({ type: "research_state", request: "report-1", state: "complete" });
  await expect(card).toHaveCount(0);
  emit({ type: "research_state", request: "report-2", state: "waiting" });
  await expect(page.locator(".research-progress")).toBeVisible();
  emit({ type: "research_state", request: "report-2", state: "error" });
  await expect(page.locator(".research-progress")).toContainText(
    "Research unavailable",
  );
  await expect(page.locator(".research-spinner")).toHaveCount(0);
  await page.getByTitle("Close research").click();
  await expect(page.locator(".overlay-research")).toHaveCount(0);
  emit({
    type: "research_state",
    request: "report-offline",
    state: "searching",
  });
  await expect(page.locator(".research-spinner")).toBeVisible();
  await socket.close({ code: 1000, reason: "Fixture disconnect" });
  await expect(page.locator(".research-progress")).toContainText(
    "Research unavailable",
  );
  await expect(page.locator(".research-spinner")).toHaveCount(0);
  await page.getByTitle("Close research").click();
  expect(errors).toEqual([]);
  console.log(
    "Docked idle, ignored mouse motion, smooth explicit flight, upright captions, sticky Home, work area, resize, size, reduced-motion return and persistent research card checks passed.",
  );
} finally {
  await browser.close();
}
