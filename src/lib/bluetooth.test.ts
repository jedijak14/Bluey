import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  send: vi.fn(async (_value: unknown) => {}),
  addListener: vi.fn(),
  remove: vi.fn(async () => {}),
  callback: ((_frame: unknown) => {}) as (frame: unknown) => void,
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android" },
  registerPlugin: () => native,
}));
import { bluetooth } from "./bluetooth";
beforeEach(async () => {
  vi.clearAllMocks();
  native.addListener.mockImplementation(async (_event, callback) => {
    native.callback = callback;
    return { remove: native.remove };
  });
  await bluetooth.connect("AA:BB:CC:DD:EE:FF");
});
afterEach(async () => {
  await bluetooth.disconnect();
});
describe("Bluetooth protocol lifecycle", () => {
  it("correlates replies and never places a phone credential in a URL", async () => {
    const result = bluetooth.request<{ ok: boolean }>({
      kind: "open",
      token: "private-phone-token",
    });
    const frame = JSON.parse(
      (native.send.mock.calls.at(-1)![0] as { frame: string }).frame,
    );
    expect(frame.kind).toBe("open");
    expect(frame.id).toBeTruthy();
    native.callback({ kind: "reply", id: frame.id, data: { ok: true } });
    await expect(result).resolves.toEqual({ ok: true });
    expect(native.connect).toHaveBeenCalledWith({
      address: "AA:BB:CC:DD:EE:FF",
    });
  });
  it("rejects pending work on disconnect and removes listeners", async () => {
    const result = bluetooth.request({ kind: "pair", code: "123456" });
    const rejected = expect(result).rejects.toThrow("disconnected");
    await bluetooth.disconnect();
    await rejected;
    expect(native.remove).toHaveBeenCalled();
  });
  it("honors cancellation before sending", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      bluetooth.request({ kind: "pair" }, controller.signal),
    ).rejects.toThrow("cancelled");
    expect(native.send).not.toHaveBeenCalled();
  });
  it("delivers packets separately from RPC replies", () => {
    const listener = vi.fn();
    bluetooth.onPacket = listener;
    native.callback({
      kind: "event",
      packet: { type: "ready", role: "phone" },
    });
    expect(listener).toHaveBeenCalledWith({ type: "ready", role: "phone" });
  });
});
