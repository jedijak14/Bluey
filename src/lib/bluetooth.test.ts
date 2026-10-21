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
let key: CryptoKey;
const clientAAD = new TextEncoder().encode("bluey-bt-v1:client");
const serverAAD = new TextEncoder().encode("bluey-bt-v1:server");
const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64 = (a: Uint8Array) => btoa(String.fromCharCode(...a));
async function encrypted(frame: unknown, active = key) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  return {
    kind: "sealed",
    nonce: b64(nonce),
    ciphertext: b64(
      new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: nonce, additionalData: serverAAD },
          active,
          new TextEncoder().encode(JSON.stringify(frame)),
        ),
      ),
    ),
  };
}
async function sentFrame() {
  await vi.waitFor(() => expect(native.send).toHaveBeenCalled());
  const wire = JSON.parse(
    (native.send.mock.calls.at(-1)![0] as { frame: string }).frame,
  );
  expect(wire.kind).toBe("sealed");
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes(wire.nonce), additionalData: clientAAD },
        key,
        bytes(wire.ciphertext),
      ),
    ),
  );
}
beforeEach(async () => {
  vi.clearAllMocks();
  native.addListener.mockImplementation(async (event, callback) => {
    if (event === "frame") native.callback = callback;
    return { remove: native.remove };
  });
  await bluetooth.connect("AA:BB:CC:DD:EE:FF");
  const hello = JSON.parse(
    (native.send.mock.calls.at(-1)![0] as { frame: string }).frame,
  );
  key = await crypto.subtle.importKey(
    "raw",
    bytes(hello.key),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  native.send.mockClear();
});
afterEach(async () => {
  await bluetooth.disconnect();
});
describe("Bluetooth encrypted protocol lifecycle", () => {
  it("encrypts credentials and correlates authenticated replies", async () => {
    const result = bluetooth.request<{ ok: boolean }>({
      kind: "open",
      token: "private-phone-token",
    });
    const frame = await sentFrame();
    expect(frame.kind).toBe("open");
    expect(frame.sequence).toBe(0);
    expect(JSON.stringify(native.send.mock.calls)).not.toContain(
      "private-phone-token",
    );
    native.callback(
      await encrypted({
        kind: "reply",
        id: frame.id,
        data: { ok: true },
        sequence: 0,
      }),
    );
    await expect(result).resolves.toEqual({ ok: true });
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
  it("ignores plaintext, foreign ciphertext and replayed events", async () => {
    const listener = vi.fn();
    bluetooth.onPacket = listener;
    native.callback({ kind: "event", packet: { type: "ready" } });
    const other = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    native.callback(
      await encrypted(
        { kind: "event", packet: { type: "stolen" }, sequence: 0 },
        other,
      ),
    );
    const valid = await encrypted({
      kind: "event",
      packet: { type: "ready", role: "phone" },
      sequence: 0,
    });
    native.callback(valid);
    native.callback(valid);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(listener).toHaveBeenCalledWith({ type: "ready", role: "phone" });
  });
  it("includes the phone token on each encrypted application packet", async () => {
    await bluetooth.send({ type: "chat" }, "phone-only");
    expect(await sentFrame()).toMatchObject({
      kind: "packet",
      packet: { type: "chat" },
      token: "phone-only",
      sequence: 0,
    });
  });
});
