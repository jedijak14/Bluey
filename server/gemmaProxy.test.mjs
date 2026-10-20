import { expect, it, vi } from "vitest";
import { gemmaProxy, MODEL_HANDLE } from "./gemmaProxy.mjs";
const env = {
  NODE_ENV: "production",
  BLUEY_GEMMA_SERVICE_URL: "https://inference.example.com",
  BLUEY_GEMMA_SERVICE_TOKEN: "server-only-secret",
};
async function run(overrides = {}, config = env, upstream = vi.fn()) {
  const req = {
    method: "GET",
    url: "/api/gemma/status",
    headers: { host: "bluey.example.com", origin: "https://bluey.example.com" },
    ...overrides,
  };
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(text) {
      this.body = JSON.parse(text);
    },
  };
  await gemmaProxy(req, res, config, upstream);
  return res;
}
it("reports unconfigured status without fake model responses", async () => {
  expect((await run({}, {})).body.status).toBe("unavailable");
  expect(
    (await run({ method: "POST", url: "/api/gemma/generate" }, {})).statusCode,
  ).toBe(503);
});
it("keeps the service credential server-side and only returns whitelisted status", async () => {
  const upstream = vi.fn(async () => ({
    ok: true,
    text: async () =>
      JSON.stringify({
        model: MODEL_HANDLE,
        status: "ready",
        secret: "do-not-return",
      }),
  }));
  const response = await run({}, env, upstream);
  expect(response.body).toEqual({
    model: MODEL_HANDLE,
    status: "ready",
    kind: "pretrained_base",
    busy: false,
  });
  expect(upstream.mock.calls[0][1].headers.Authorization).toBe(
    "Bearer server-only-secret",
  );
  expect(JSON.stringify(response)).not.toContain("secret");
  expect(upstream.mock.calls[0][1].redirect).toBe("error");
});
it("rejects cross-origin, unsupported mobile and oversized/invalid requests", async () => {
  expect(
    (
      await run({
        headers: { host: "bluey.example.com", origin: "https://evil.example" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (await run({ headers: { "user-agent": "Mozilla iPad" } })).statusCode,
  ).toBe(403);
  for (const body of [
    { text: "a".repeat(1201) },
    { text: "  " },
    { text: "hi", max_new_tokens: 10000 },
    { text: "hi", target: "https://evil.example" },
  ])
    expect(
      (await run({ method: "POST", url: "/api/gemma/generate", body }))
        .statusCode,
    ).toBe(400);
});
it("does not use insecure production upstreams or alternate models", async () => {
  expect(
    (
      await run(
        {},
        { ...env, BLUEY_GEMMA_SERVICE_URL: "http://inference.example.com" },
      )
    ).statusCode,
  ).toBe(503);
  expect(
    (
      await run({}, env, async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({ status: "ready", model: "wrong-model" }),
      }))
    ).statusCode,
  ).toBe(503);
});
it("returns a real upstream completion and sanitizes upstream failures", async () => {
  const req = {
    method: "POST",
    url: "/api/gemma/generate",
    body: { text: "Question" },
  };
  expect(
    (
      await run(req, env, async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({ model: MODEL_HANDLE, text: "Fixture completion" }),
      }))
    ).body.text,
  ).toBe("Fixture completion");
  expect(
    (await run(req, env, async () => ({ ok: false, status: 429 }))).statusCode,
  ).toBe(429);
});
