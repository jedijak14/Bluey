import { afterEach, describe, expect, it, vi } from "vitest";
import { FamilyError, familyRequest } from "./family";

afterEach(() => vi.unstubAllGlobals());
describe("family request boundary", () => {
  it("does not turn a 200 HTML fallback into a successful saved rule", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>offline</html>", { status: 200 }),
        ),
    );
    await expect(
      familyRequest("children", "parent", { name: "child" }),
    ).rejects.toMatchObject({ status: 502 });
  });
  it("rejects null and primitive successful responses", async () => {
    for (const value of [null, "ok", true, 123]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(value)));
      await expect(familyRequest("dashboard", "parent")).rejects.toBeInstanceOf(
        FamilyError,
      );
    }
  });
  it("normalizes an offline error without exposing request secrets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private-token request failed")),
    );
    try {
      await familyRequest("kid", "private-token");
      expect.fail("must reject");
    } catch (error) {
      expect(error).toMatchObject({ status: 503 });
      expect(String(error)).not.toContain("private-token");
      expect(String(error)).toContain("saved rules have not been removed");
    }
  });
  it("keeps authorization failures distinguishable from outages", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ detail: "Sign in again." }, { status: 401 }),
        ),
    );
    await expect(familyRequest("dashboard", "expired")).rejects.toMatchObject({
      status: 401,
      message: "Sign in again.",
    });
  });
  it("does not convert validation objects into [object Object]", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ detail: [{ message: "invalid" }] }, { status: 422 }),
        ),
    );
    await expect(familyRequest("children", "parent", {})).rejects.toMatchObject(
      {
        status: 422,
        message: expect.stringContaining("Check the supplied fields"),
      },
    );
  });
  it("retains no-store, omitted cookies and redirect refusal", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetch);
    expect(await familyRequest("alerts", "parent")).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/family/alerts",
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        headers: expect.objectContaining({ Authorization: "Bearer parent" }),
      }),
    );
  });
  it("applies the same invalid-response guard to the desktop bridge", async () => {
    vi.stubGlobal("window", {
      blueyFamily: {
        request: vi.fn().mockResolvedValue({ status: 200, data: null }),
      },
    });
    await expect(familyRequest("kid", "kid")).rejects.toMatchObject({
      status: 502,
    });
  });
});
