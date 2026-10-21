import { afterEach, expect, it, vi } from "vitest";
import {
  motionEnabled,
  parseMotionPreference,
  readMotionPreference,
} from "./motionPreference";
afterEach(() => vi.unstubAllGlobals());
it.each([
  ["system", true, false],
  ["system", false, true],
  ["on", true, true],
  ["on", false, true],
  ["off", true, false],
  ["off", false, false],
] as const)(
  "%s with system-reduced=%s resolves to %s",
  (preference, reduced, enabled) => {
    expect(motionEnabled(preference, reduced)).toBe(enabled);
  },
);
it("rejects invalid stored choices and uses the device default", () => {
  for (const value of [null, undefined, true, "ON", "", "bogus", {}]) {
    expect(parseMotionPreference(value)).toBe("system");
  }
  expect(parseMotionPreference("on")).toBe("on");
  expect(parseMotionPreference("off")).toBe("off");
});
it("reads a saved explicit override", () => {
  vi.stubGlobal("localStorage", { getItem: () => "on" });
  expect(readMotionPreference()).toBe("on");
});
it("survives unavailable browser storage", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("Denied");
    },
  });
  expect(readMotionPreference()).toBe("system");
});
