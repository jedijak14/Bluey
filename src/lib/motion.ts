export interface Point {
  x: number;
  y: number;
}
export interface Flight {
  from: Point;
  to: Point;
  c1: Point;
  c2: Point;
  start: number;
  duration: number;
}
export function planFlight(from: Point, to: Point, start: number): Flight {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    distance = Math.hypot(dx, dy),
    bend = Math.min(140, distance * 0.2);
  const nx = distance ? -dy / distance : 0,
    ny = distance ? dx / distance : 0;
  return {
    from: { ...from },
    to: { ...to },
    c1: {
      x: from.x + dx * 0.25 + nx * bend,
      y: from.y + dy * 0.25 + ny * bend,
    },
    c2: {
      x: from.x + dx * 0.75 + nx * bend * 0.5,
      y: from.y + dy * 0.75 + ny * bend * 0.5,
    },
    start,
    duration: Math.min(1400, Math.max(450, distance * 0.75)),
  };
}
export function sampleFlight(
  f: Flight,
  now: number,
): Point & { angle: number; done: boolean } {
  const time = Math.max(0, Math.min(1, (now - f.start) / f.duration));
  const t = time * time * (3 - 2 * time),
    u = 1 - t;
  const x =
    u * u * u * f.from.x +
    3 * u * u * t * f.c1.x +
    3 * u * t * t * f.c2.x +
    t * t * t * f.to.x;
  const y =
    u * u * u * f.from.y +
    3 * u * u * t * f.c1.y +
    3 * u * t * t * f.c2.y +
    t * t * t * f.to.y;
  const dx =
    3 * u * u * (f.c1.x - f.from.x) +
    6 * u * t * (f.c2.x - f.c1.x) +
    3 * t * t * (f.to.x - f.c2.x);
  const dy =
    3 * u * u * (f.c1.y - f.from.y) +
    6 * u * t * (f.c2.y - f.c1.y) +
    3 * t * t * (f.to.y - f.c2.y);
  return {
    x,
    y,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI + 135,
    done: time >= 1,
  };
}
