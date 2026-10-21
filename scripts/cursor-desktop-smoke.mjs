// Actual packaged Windows overlay; no engine, microphone or desktop automation.
import { _electron, expect } from "@playwright/test";
import path from "node:path";
const app = await _electron.launch({
  executablePath: path.resolve("release/win-unpacked/Bluey.exe"),
  env: { ...process.env, BLUEY_EXTERNAL_BACKEND: "1" },
  timeout: 30000,
});
try {
  await expect
    .poll(() => app.windows().some((p) => p.url().endsWith("#overlay")), {
      timeout: 30000,
    })
    .toBe(true);
  const page = app.windows().find((p) => p.url().endsWith("#overlay"));
  const area = await app.evaluate(({ screen }) => {
    const { bounds, workArea } = screen.getPrimaryDisplay();
    return {
      x: workArea.x - bounds.x,
      y: workArea.y - bounds.y,
      width: workArea.width,
      height: workArea.height,
    };
  });
  const home = {
    x: Math.round(area.x + (area.width - 72) / 2),
    y: Math.round(area.y + area.height - 72),
  };
  const position = () =>
    page.locator(".overlay-cursor").evaluate((el) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return { x: Math.round(m.m41), y: Math.round(m.m42) };
    });
  await expect.poll(position).toEqual(home);
  await expect(page.locator(".overlay-cursor")).toHaveAttribute(
    "data-state",
    "docked",
  );
  await expect(page.locator(".overlay-cursor-body > svg")).toHaveCSS(
    "opacity",
    "0",
  );
  await expect(page.locator(".overlay-dock-tip")).toHaveCSS("opacity", "1");
  let socket;
  await page.routeWebSocket("**/api/ws", (route) =>
    route.onMessage((raw) => {
      if (JSON.parse(raw).type === "auth") {
        socket = route;
        route.send(JSON.stringify({ type: "ready" }));
      }
    }),
  );
  await expect.poll(() => Boolean(socket), { timeout: 20000 }).toBe(true);
  socket.send(JSON.stringify({ type: "pointer", x: 200, y: 200 }));
  await expect
    .poll(async () => JSON.stringify(await position()) !== JSON.stringify(home))
    .toBe(true);
  socket.send(JSON.stringify({ type: "home" }));
  await expect.poll(position).toEqual(home);
  console.log(
    "Packaged Windows overlay: native work-area dock, explicit engine movement and sticky home passed. No desktop action executed.",
  );
} finally {
  await app.close();
}
