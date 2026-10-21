import { expect, it } from "vitest";
import { cursorDestination, cursorDock, cursorSize } from "./cursorPosition";
it("centers the whole cursor above the bottom edge, not its left corner", () => {
  expect(cursorDock(1280, 900, 72)).toEqual({ x: 604, y: 812 });
  expect(cursorDock(1280, 900, 120)).toEqual({ x: 580, y: 764 });
});
it("respects bottom and side taskbars in native work-area coordinates", () => {
  expect(
    cursorDock(1280, 900, 72, { x: 0, y: 0, width: 1280, height: 852 }),
  ).toEqual({ x: 604, y: 764 });
  expect(
    cursorDock(1280, 900, 72, { x: 80, y: 0, width: 1200, height: 900 }),
  ).toEqual({ x: 644, y: 812 });
});
it("clamps explicit targets and rejects invalid packets", () => {
  expect(cursorDestination(500, 500, 1280, 900, 72)).toEqual({
    x: 604,
    y: 414,
  });
  expect(cursorDestination(1000, 1000, 1280, 900, 72)).toEqual({
    x: 1208,
    y: 828,
  });
  for (const x of [NaN, Infinity, undefined, null, "500"])
    expect(cursorDestination(x, 20, 1280, 900, 72)).toBeNull();
});
it("keeps corrupted settings and tiny viewports finite", () => {
  expect(cursorSize(NaN)).toBe(72);
  expect(cursorSize(-1)).toBe(48);
  expect(cursorSize(500)).toBe(120);
  expect(cursorDock(20, 20, 72)).toEqual({ x: 0, y: 0 });
  expect(
    cursorDock(1280, 900, 72, { x: NaN, y: 0, width: 1, height: 1 }),
  ).toEqual({ x: 604, y: 812 });
});
