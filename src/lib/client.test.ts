import { afterEach, describe, expect, it, vi } from "vitest";
import { BlueyClient } from "./client";
import { load, save } from "./storage";

class FakeSocket {
  static OPEN = 1;
  static latest: FakeSocket;
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.latest = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("local engine client", () => {
  it("sends credentials in the first frame, never in the URL", () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const client = new BlueyClient();
    client.connect("http://192.168.1.2:8765", "private-token");
    expect(FakeSocket.latest.url).toBe("ws://192.168.1.2:8765/api/ws");
    FakeSocket.latest.onopen?.();
    expect(JSON.parse(FakeSocket.latest.sent[0])).toEqual({
      type: "auth",
      token: "private-token",
    });
    client.disconnect();
  });
  it("only announces connection after authentication succeeds", () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const client = new BlueyClient();
    client.onStatus = vi.fn();
    client.connect("http://127.0.0.1:8765", "test");
    FakeSocket.latest.onopen?.();
    expect(client.onStatus).not.toHaveBeenCalledWith("connected");
    FakeSocket.latest.onmessage?.({ data: '{"type":"ready"}' });
    expect(client.onStatus).toHaveBeenCalledWith("connected");
    client.disconnect();
  });
  it("never retries a revoked or invalid token", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    const client = new BlueyClient();
    client.connect("http://127.0.0.1:8765", "bad");
    FakeSocket.latest.onclose?.({ code: 4001 });
    expect(vi.getTimerCount()).toBe(0);
    client.disconnect();
  });
  it("reports unavailable connections instead of inventing responses", () => {
    expect(() => new BlueyClient().send({ type: "chat" })).toThrow("Connect");
  });
  it("keeps storage failures nonfatal", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => "{bad json",
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(load("x", [])).toEqual([]);
    expect(() => save("x", { test: true })).not.toThrow();
  });
});

it("explains a frontend HTML response instead of showing a JSON parse error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("<!doctype html>", { status: 200 })),
  );
  await expect(new BlueyClient().request("/api/devices")).rejects.toThrow(
    "not the engine",
  );
});
it("preserves actionable engine errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Enable LAN mode first." }), {
        status: 409,
      }),
    ),
  );
  await expect(
    new BlueyClient().request("/api/pair/create", {}),
  ).rejects.toThrow("Enable LAN mode first.");
});
it("polls without caching and propagates cancellation", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("[]"));
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  await new BlueyClient().request(
    "/api/devices",
    undefined,
    undefined,
    controller.signal,
  );
  const options = fetchMock.mock.calls[0][1];
  expect(options.cache).toBe("no-store");
  expect(options.signal.aborted).toBe(false);
  controller.abort();
  expect(options.signal.aborted).toBe(true);
});

it("waits for ready rather than treating HTTP success or an open socket as connected", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  const client = new BlueyClient();
  const done = vi.fn();
  const pending = client
    .ensureConnected("http://127.0.0.1:8765", "token")
    .then(done);
  FakeSocket.latest.onopen?.();
  expect(client.connected).toBe(false);
  expect(() => client.send({ type: "chat" })).toThrow("Connect");
  expect(done).not.toHaveBeenCalled();
  FakeSocket.latest.onmessage?.({ data: '{"type":"ready"}' });
  await pending;
  expect(client.connected).toBe(true);
  const healthy = FakeSocket.latest;
  await client.ensureConnected("http://127.0.0.1:8765/", "token");
  expect(FakeSocket.latest).toBe(healthy);
  client.disconnect();
  expect(vi.getTimerCount()).toBe(0);
});
it("recovers from a hung handshake and ignores callbacks from the discarded socket", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  const client = new BlueyClient();
  const pending = client.ensureConnected("http://127.0.0.1:8765", "token");
  const stale = FakeSocket.latest.onmessage;
  const first = FakeSocket.latest;
  await vi.advanceTimersByTimeAsync(9000);
  expect(FakeSocket.latest).not.toBe(first);
  stale?.({ data: '{"type":"ready"}' });
  expect(client.connected).toBe(false);
  FakeSocket.latest.onmessage?.({ data: '{"type":"ready"}' });
  await pending;
  expect(client.connected).toBe(true);
  client.disconnect();
});
it("retries construction failures instead of remaining offline forever", async () => {
  vi.useFakeTimers();
  let calls = 0;
  class BrokenOnce extends FakeSocket {
    constructor(url: string) {
      if (++calls === 1) throw new Error("temporarily unavailable");
      super(url);
    }
  }
  vi.stubGlobal("WebSocket", BrokenOnce);
  const client = new BlueyClient();
  const pending = client.ensureConnected("http://127.0.0.1:8765", "token");
  await vi.advanceTimersByTimeAsync(1000);
  FakeSocket.latest.onmessage?.({ data: '{"type":"ready"}' });
  await pending;
  expect(calls).toBe(2);
  client.disconnect();
});
it("rejects invalid credentials without pretending connection or retrying them", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  const client = new BlueyClient();
  const pending = expect(
    client.ensureConnected("http://127.0.0.1:8765", "wrong"),
  ).rejects.toThrow("rejected its credentials");
  FakeSocket.latest.onclose?.({ code: 4001 });
  await pending;
  expect(client.connected).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  client.disconnect();
});
it("bounds waiting for an unavailable channel and preserves an actionable error", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  const client = new BlueyClient();
  const pending = expect(
    client.ensureConnected("http://127.0.0.1:8765", "token", 500),
  ).rejects.toThrow("chat channel did not answer");
  await vi.advanceTimersByTimeAsync(500);
  await pending;
  expect(client.connected).toBe(false);
  client.disconnect();
  expect(vi.getTimerCount()).toBe(0);
});
