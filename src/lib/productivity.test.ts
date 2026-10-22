import { describe, expect, it } from "vitest";
import {
  emptyProductivity,
  exportProductivity,
  idleTimer,
  MAX_NOTE,
  parseProductivity,
  pauseTimer,
  reconcileTimer,
  resumeTimer,
  startTimer,
  timeLeft,
} from "./productivity";
describe("offline workspace", () => {
  it("uses wall time rather than interval ticks, including sleep", () => {
    const timer = startTimer(25, "focus", 1000);
    expect(timeLeft(timer, 61000)).toBe(24 * 60000);
    expect(reconcileTimer(timer, 2000000)).toMatchObject({
      status: "finished",
      remaining: 0,
      deadline: null,
    });
  });
  it("pauses and resumes only the remaining time", () => {
    const paused = pauseTimer(startTimer(1, "focus", 1000), 11000);
    expect(timeLeft(paused, 90000)).toBe(50000);
    expect(resumeTimer(paused, 90000).deadline).toBe(140000);
    expect(pauseTimer(startTimer(1, "focus", 1000), 61000).status).toBe(
      "finished",
    );
    expect(resumeTimer(idleTimer(), 1000).status).toBe("idle");
  });
  it("reconciles an expired persisted session once on restart", () => {
    const value = {
      ...emptyProductivity(),
      timer: startTimer(1, "break", 1000),
    };
    const parsed = parseProductivity(JSON.stringify(value), 90000);
    expect(parsed.timer.status).toBe("finished");
    expect(reconcileTimer(parsed.timer, 100000)).toBe(parsed.timer);
  });
  it("validates malformed data, bounds lists/text and deduplicates task IDs", () => {
    for (const raw of [null, "bad", "null", "[]", "42"])
      expect(parseProductivity(raw, 1000)).toEqual(emptyProductivity());
    const parsed = parseProductivity(
      JSON.stringify({
        notes: "a".repeat(MAX_NOTE + 10),
        tasks: [
          null,
          { id: "x", text: " hello ", done: "false" },
          { id: "x", text: "duplicate" },
          { id: "empty", text: "  " },
        ],
        timer: { ...idleTimer(), status: "running", deadline: "never" },
      }),
      1000,
    );
    expect(parsed.notes.length).toBe(MAX_NOTE);
    expect(parsed.tasks).toEqual([{ id: "x", text: "hello", done: false }]);
    expect(parsed.timer).toEqual(idleTimer());
    expect(
      parseProductivity(
        JSON.stringify({
          tasks: Array.from({ length: 110 }, (_, i) => ({
            id: String(i),
            text: "x",
          })),
        }),
        1000,
      ).tasks.length,
    ).toBe(100);
  });
  it("rejects impossible timer durations and far-future deadlines", () => {
    for (const timer of [
      { ...idleTimer(), duration: -1 },
      { ...idleTimer(), remaining: Infinity },
      { ...startTimer(1, "focus", 1000), deadline: 1e20 },
    ]) {
      expect(parseProductivity(JSON.stringify({ timer }), 1000).timer).toEqual(
        idleTimer(),
      );
    }
    expect(startTimer(NaN, "focus", 0).duration).toBe(25 * 60000);
    expect(startTimer(999, "focus", 0).duration).toBe(180 * 60000);
    expect(timeLeft(startTimer(1, "focus", 1000), 0)).toBe(60000);
  });
  it("exports literal text and completion state without interpreting HTML", () => {
    const data = {
      ...emptyProductivity(),
      notes: "<script>hello</script>",
      tasks: [{ id: "a", text: "Plan", done: true }],
    };
    expect(exportProductivity(data)).toContain("[x] Plan");
    expect(exportProductivity(data)).toContain("<script>hello</script>");
  });
});
