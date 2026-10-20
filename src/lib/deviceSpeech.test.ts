import { expect, it, vi } from "vitest";
import {
  DEFAULT_SPEAK_REPLIES,
  DeviceReplySpeaker,
  requestServerVoice,
} from "./deviceSpeech";

it("is silent by default and never asks Windows for Android speech", () => {
  expect(DEFAULT_SPEAK_REPLIES).toBe(false);
  expect(requestServerVoice(true, false)).toBe(false);
  expect(requestServerVoice(true, true)).toBe(false);
  expect(requestServerVoice(false, false)).toBe(false);
  expect(requestServerVoice(false, true)).toBe(true);
});
it("does not initialize output just by constructing a speaker", () => {
  const device = { speak: vi.fn(), stopSpeaking: vi.fn() };
  new DeviceReplySpeaker(device);
  expect(device.speak).not.toHaveBeenCalled();
  expect(device.stopSpeaking).not.toHaveBeenCalled();
});
it("splits an explicitly requested reply below Android's per-call limit", async () => {
  const device = {
    speak: vi.fn().mockResolvedValue(undefined),
    stopSpeaking: vi.fn().mockResolvedValue(undefined),
  };
  const error = vi.fn(),
    active = vi.fn();
  await new DeviceReplySpeaker(device).speak(
    "Hello. ".repeat(900),
    error,
    active,
  );
  expect(device.speak.mock.calls.length).toBeGreaterThan(1);
  for (const [options] of device.speak.mock.calls)
    expect(options.text.length).toBeLessThanOrEqual(3000);
  expect(active.mock.calls).toEqual([[true], [false]]);
  expect(error).not.toHaveBeenCalled();
});
it("mute cancels remaining queued sentences without a cancellation error", async () => {
  let finish!: () => void;
  const device = {
    speak: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    ),
    stopSpeaking: vi.fn().mockResolvedValue(undefined),
  };
  const error = vi.fn();
  const speaker = new DeviceReplySpeaker(device);
  const result = speaker.speak("x".repeat(6000), error, vi.fn());
  await vi.waitFor(() => expect(device.speak).toHaveBeenCalledTimes(1));
  await speaker.stop();
  finish();
  await result;
  expect(device.speak).toHaveBeenCalledTimes(1);
  expect(error).not.toHaveBeenCalled();
});
it("does not start a reply cancelled while waiting for the native stop acknowledgement", async () => {
  let finish!: () => void;
  const device = {
    speak: vi.fn(),
    stopSpeaking: vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(undefined),
  };
  const speaker = new DeviceReplySpeaker(device);
  const result = speaker.speak("Never play this", vi.fn(), vi.fn());
  await speaker.stop();
  finish();
  await result;
  expect(device.speak).not.toHaveBeenCalled();
});
it("reports a missing device voice without calling the PC", async () => {
  const device = {
    speak: vi.fn().mockRejectedValue(new Error("Install a device voice")),
    stopSpeaking: vi.fn().mockResolvedValue(undefined),
  };
  const error = vi.fn(),
    active = vi.fn();
  await new DeviceReplySpeaker(device).speak("Reply", error, active);
  expect(error).toHaveBeenCalledWith("Install a device voice");
  expect(active).toHaveBeenLastCalledWith(false);
});

it("treats an Android lifecycle cancellation as quiet cancellation, not a speech failure", async () => {
  const device = {
    speak: vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("Speech cancelled"), { code: "CANCELLED" }),
      ),
    stopSpeaking: vi.fn().mockResolvedValue(undefined),
  };
  const error = vi.fn();
  await new DeviceReplySpeaker(device).speak("Reply", error, vi.fn());
  expect(error).not.toHaveBeenCalled();
});
