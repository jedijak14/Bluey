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
