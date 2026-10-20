import { expect, it } from "vitest";
import { classifyDevice, type DeviceSignals } from "./deviceSupport";
const desktop: DeviceSignals = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  platform: "Win32",
  maxTouchPoints: 0,
  coarsePointer: false,
};
it("allows desktop browsers independently of window size", () => {
  expect(classifyDevice(desktop)).toBe("desktop");
  expect(
    classifyDevice({
      ...desktop,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
    }),
  ).toBe("desktop");
  expect(
    classifyDevice({
      ...desktop,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
      platform: "MacIntel",
    }),
  ).toBe("desktop");
});
it("detects iPads including desktop-mode Safari", () => {
  expect(
    classifyDevice({
      ...desktop,
      userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0)",
    }),
  ).toBe("ipad");
  expect(
    classifyDevice({
      ...desktop,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    }),
  ).toBe("ipad");
});
it("distinguishes phones and tablets", () => {
  for (const ua of [
    "iPhone OS 17_0",
    "Android 14; Pixel Mobile",
    "Windows Phone",
  ])
    expect(classifyDevice({ ...desktop, userAgent: ua })).toBe("phone");
  for (const ua of ["Android 14; SM-X700", "Kindle Silk", "Tablet"])
    expect(classifyDevice({ ...desktop, userAgent: ua })).toBe("tablet");
  expect(
    classifyDevice({ ...desktop, maxTouchPoints: 10, coarsePointer: true }),
  ).toBe("tablet");
  expect(classifyDevice({ ...desktop, mobileHint: true })).toBe("phone");
});
it("does not silently approve unknown devices", () => {
  expect(classifyDevice({ ...desktop, userAgent: "", platform: "" })).toBe(
    "unknown",
  );
});
