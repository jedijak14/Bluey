import { expect, it } from "vitest";
import { pairingEndpoint } from "./pairing";
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
