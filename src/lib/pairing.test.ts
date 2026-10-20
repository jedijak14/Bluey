import { expect, it } from "vitest";
import {
  pairingEndpoint,
  assertPairingTransport,
  connectionEndpoint,
} from "./pairing";
it("uses the companion port for a bare LAN address", () =>
  expect(pairingEndpoint(" 192.168.1.10 ")).toBe("http://192.168.1.10:8765"));
it("preserves a chosen port", () =>
  expect(pairingEndpoint("http://192.168.1.10:8000/")).toBe(
    "http://192.168.1.10:8000",
  ));
it("does not replace HTTPS default port with HTTP companion port", () =>
  expect(pairingEndpoint("https://bluey.example/")).toBe(
    "https://bluey.example",
  ));
it("rejects credentials and path components", () => {
  for (const value of [
    "https://user:pass@host",
    "http://host/api",
    "http://host?secret=1",
    "",
  ])
    expect(() => pairingEndpoint(value)).toThrow();
});

it("rejects HTTP from an HTTPS browser before sending a code", () => {
  expect(() =>
    assertPairingTransport("http://192.168.1.10:8765", "https:"),
  ).toThrow("HTTPS website");
  expect(() =>
    assertPairingTransport("https://pc.private", "https:"),
  ).not.toThrow();
});
it("allows native LAN pairing but rejects phone loopback", () => {
  expect(() =>
    assertPairingTransport("http://192.168.1.10:8765", "https:", true),
  ).not.toThrow();
  for (const host of ["localhost", "127.0.0.1", "[::1]"])
    expect(() =>
      assertPairingTransport(`http://${host}:8765`, "https:", true),
    ).toThrow("not localhost");
});
it("never treats a hosted frontend as the pairing engine", () => {
  const page = { protocol: "https:", hostname: "bluey-plum.vercel.app" };
  expect(() => connectionEndpoint("", page)).toThrow("backend address");
  expect(() => connectionEndpoint("192.168.1.10", page)).toThrow(
    "HTTPS website",
  );
  expect(connectionEndpoint("https://pc.private/", page)).toBe(
    "https://pc.private",
  );
});
it("allows the same-origin development proxy only in HTTP development", () => {
  const page = { protocol: "http:", hostname: "localhost" };
  expect(connectionEndpoint("", page, false, true)).toBe("");
  expect(() => connectionEndpoint("", page)).toThrow("backend address");
  expect(() =>
    connectionEndpoint("", { ...page, protocol: "https:" }, false, true),
  ).toThrow();
});
it("keeps Electron's loopback engine supported", () => {
  expect(
    connectionEndpoint(
      "127.0.0.1:8765",
      { protocol: "file:", hostname: "" },
      true,
    ),
  ).toBe("http://127.0.0.1:8765");
});
