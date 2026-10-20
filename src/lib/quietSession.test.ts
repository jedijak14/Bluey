import { expect, it } from "vitest";
import {
  MeetingDetector,
  SessionMemory,
  meetingDocument,
} from "./quietSession";
it("keeps ambient speech as bounded context, never an implicit question", () => {
  const memory = new SessionMemory();
  memory.add("We agreed to launch on Friday.");
  expect(memory.messages("What did we decide?").at(-1)?.content).toBe(
    "What did we decide?",
  );
  expect(memory.messages("Question")[0].content).toContain("UNTRUSTED CONTEXT");
  for (let i = 0; i < 10; i++) memory.add("x".repeat(8000));
  expect(
    memory.context.reduce((n, s) => n + s.text.length, 0),
  ).toBeLessThanOrEqual(24000);
  expect(memory.contextTrimmed).toBe(true);
  memory.clear();
  expect(memory.context).toEqual([]);
});
it("meeting transcript stays independent from the bounded conversational context", () => {
  const memory = new SessionMemory();
  memory.beginMeeting();
  for (let i = 0; i < 10; i++)
    memory.add("entry " + i + " " + "x".repeat(7990));
  const draft = memory.endMeeting("Window no longer detected")!;
  expect(draft.transcript).toHaveLength(10);
  expect(memory.meeting).toBeNull();
  expect(meetingDocument(draft, "Review these notes")).toContain(
    "## Microphone transcript",
  );
  expect(memory.endMeeting("again")).toBeNull();
});
it("bounds meeting drafts without silently claiming complete transcription", () => {
  const memory = new SessionMemory();
  memory.beginMeeting();
  for (let i = 0; i < 20; i++) expect(memory.add("x".repeat(8000))).toBe(false);
  expect(memory.add("overflow")).toBe(true);
});
it("requires sustained meeting signals; unknown is not end-of-call evidence", () => {
  const d = new MeetingDetector();
  expect(d.observe(true, 0)).toBeNull();
  expect(d.observe(true, 10000)).toBe("start");
  expect(d.observe(false, 12000)).toBeNull();
  expect(d.observe(null, 45000)).toBeNull();
  expect(d.active).toBe(true);
  expect(d.observe(false, 46000)).toBeNull();
  expect(d.observe(false, 76000)).toBe("end");
  expect(d.observe(false, 80000)).toBeNull();
});
