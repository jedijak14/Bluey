import { expect, it, vi } from "vitest";
import { familyProxy } from "./familyProxy.mjs";
const env = {
  NODE_ENV: "production",
  BLUEY_FAMILY_SERVICE_URL: "https://family.example.com",
  BLUEY_FAMILY_GATEWAY_TOKEN: "server-secret",
};
async function run(overrides = {}, config = env, fetcher = vi.fn()) {
  const req = {
    method: "GET",
    url: "/api/family/status",
    headers: { host: "bluey.example.com", origin: "https://bluey.example.com" },
    ...overrides,
  };
  const res = {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(text) {
      this.body = text ? JSON.parse(text) : null;
    },
  };
  await familyProxy(req, res, config, fetcher);
  return res;
}
it("fails honestly when remote service is not configured", async () => {
  expect((await run({}, {})).body).toMatchObject({
    status: "unavailable",
    enforcement_available: false,
  });
  expect(
    (await run({ method: "POST", url: "/api/family/enroll" }, {})).statusCode,
  ).toBe(503);
});
it("rejects cross-origin and unexpected routes", async () => {
  expect(
    (
      await run({
        headers: { host: "bluey.example.com", origin: "https://evil.example" },
      })
    ).statusCode,
  ).toBe(403);
  expect((await run({ url: "/api/family/secrets" })).statusCode).toBe(404);
  expect((await run({ method: "DELETE" })).statusCode).toBe(405);
  expect(
    (
      await run({
        method: "OPTIONS",
        headers: { host: "bluey.example.com", origin: "https://localhost" },
      })
    ).statusCode,
  ).toBe(204);
});
it("only forwards the scoped authorization plus server gateway secret", async () => {
  const fetcher = vi.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ children: [] }),
  }));
  const r = await run(
    {
      url: "/api/family/dashboard",
      headers: {
        host: "bluey.example.com",
        authorization: "Bearer parent-token",
        "x-bluey-gateway": "evil",
      },
    },
    env,
    fetcher,
  );
  expect(fetcher.mock.calls[0][1].headers).toEqual({
    "Content-Type": "application/json",
    "X-Bluey-Gateway": "server-secret",
    Authorization: "Bearer parent-token",
  });
  expect(JSON.stringify(r)).not.toContain("server-secret");
  expect(r.headers["Cache-Control"]).toBe("no-store");
});
it("requires HTTPS in production and forbids redirects", async () => {
  expect(
    (
      await run(
        {},
        { ...env, BLUEY_FAMILY_SERVICE_URL: "http://family.example.com" },
      )
    ).statusCode,
  ).toBe(503);
  const fetcher = vi.fn(async () => {
    throw Error("backend details secret");
  });
  const r = await run({}, env, fetcher);
  expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  expect(r.statusCode).toBe(503);
  expect(JSON.stringify(r)).not.toContain("details secret");
});
it("bounds bodies and hides validation internals", async () => {
  expect(
    (
      await run({
        method: "POST",
        url: "/api/family/enroll",
        body: { code: "x".repeat(21000) },
      })
    ).statusCode,
  ).toBe(400);
  const fetcher = vi.fn(async () => ({
    ok: false,
    status: 422,
    text: async () =>
      JSON.stringify({ detail: [{ input: "password secret" }] }),
  }));
  const r = await run(
    { method: "POST", url: "/api/family/enroll", body: { code: "some-code" } },
    env,
    fetcher,
  );
  expect(r.statusCode).toBe(422);
  expect(JSON.stringify(r)).not.toContain("password secret");
});
