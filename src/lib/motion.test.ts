import { expect, it } from "vitest";
import { planFlight, sampleFlight } from "./motion";
it("flies between exact endpoints on a curved trajectory", () => {
  const flight = planFlight({ x: 10, y: 20 }, { x: 810, y: 20 }, 100);
  expect(sampleFlight(flight, 100)).toMatchObject({
    x: 10,
    y: 20,
    done: false,
  });
  expect(sampleFlight(flight, 100 + flight.duration / 2).y).toBeGreaterThan(20);
  expect(sampleFlight(flight, 100 + flight.duration)).toMatchObject({
    x: 810,
    y: 20,
    done: true,
  });
});
it("handles a stationary cursor without NaN or infinity", () => {
  const point = sampleFlight(
    planFlight({ x: 5, y: 5 }, { x: 5, y: 5 }, 0),
    500,
  );
  expect(point).toMatchObject({ x: 5, y: 5, done: true });
  expect(Number.isFinite(point.angle)).toBe(true);
});
