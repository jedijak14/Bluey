/** Resolve a user's PC address without sending any model keys to the phone. */
export function pairingEndpoint(address: string): string {
  const value = address.trim();
  if (!value)
    throw new Error(
      "Enter your Windows PC’s Wi-Fi IP address or secure HTTPS address.",
    );
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`);
  } catch {
    throw new Error(
      "Enter a valid PC address, such as 192.168.1.10:8765 or https://your-pc.private-network.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "Use a PC address such as 192.168.1.10:8765, without a path or credentials.",
    );
  }
  if (!url.port && url.protocol === "http:") url.port = "8765";
  return url.origin;
}

export function assertPairingTransport(
  endpoint: string,
  pageProtocol: string,
  native = false,
) {
  const url = new URL(endpoint);
  if (native && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Use your PC’s Wi-Fi IP address, not localhost.");
  if (!native && pageProtocol === "https:" && url.protocol !== "https:")
    throw new Error(
      "This HTTPS website cannot pair over plain HTTP. Use a trusted HTTPS/WSS address for your PC, or use the Android APK for private Wi-Fi pairing. Do not expose port 8765 to the internet.",
    );
}

export function connectionEndpoint(
  address: string,
  page: Pick<Location, "protocol" | "hostname">,
  native = false,
  development = false,
) {
  if (!address.trim()) {
    if (development && page.protocol === "http:") return "";
    throw new Error(
      "Enter your Windows backend address. This website hosts the interface, not the pairing engine.",
    );
  }
  const endpoint = pairingEndpoint(address);
  // Desktop Electron legitimately uses its own loopback endpoint.
  if (!native) assertPairingTransport(endpoint, page.protocol);
  return endpoint;
}

export function pairingNetworkError(pageProtocol: string, native = false) {
  return !native && pageProtocol === "https:"
    ? "Could not reach your PC. Check its trusted HTTPS certificate, HTTPS/WSS endpoint, private-network access, and BLUEY_ALLOWED_ORIGINS for this website. Do not disable browser security."
    : "Could not reach your PC. Check the Wi-Fi IP, LAN mode, and Windows Firewall (private network, port 8765).";
}
