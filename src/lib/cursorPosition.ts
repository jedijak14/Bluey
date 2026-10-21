import type { Point } from "./motion";

export type CursorArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export const CURSOR_DOCK_GAP = 0;
export function cursorSize(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(48, Math.min(120, value))
    : 72;
}
export function clampCursor(
  point: Point,
  width: number,
  height: number,
  size: number,
): Point {
  return {
    x: Math.max(0, Math.min(Math.max(0, width - size), point.x)),
    y: Math.max(0, Math.min(Math.max(0, height - size), point.y)),
  };
}
export function cursorDock(
  width: number,
  height: number,
  size: number,
  area?: CursorArea | null,
): Point {
  const usable =
    area &&
    Object.values(area).every(Number.isFinite) &&
    area.width > 0 &&
    area.height > 0
      ? area
      : { x: 0, y: 0, width, height };
  return clampCursor(
    {
      x: usable.x + (usable.width - size) / 2,
      y: usable.y + usable.height - size - CURSOR_DOCK_GAP,
    },
    width,
    height,
    size,
  );
}
/** Only explicit, finite engine coordinates can move the character off its dock. */
export function cursorDestination(
  x: unknown,
  y: unknown,
  width: number,
  height: number,
  size: number,
): Point | null {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    return null;
  return clampCursor(
    { x: (x * width) / 1000 - size / 2, y: (y * height) / 1000 - size / 2 },
    width,
    height,
    size,
  );
}
