/** Resolve a user's PC address without sending any model keys to the phone. */
export function pairingEndpoint(address: string): string {
  const value = address.trim();
  if (!value) throw new Error("Enter your Windows PC’s Wi-Fi IP address.");
  const url = new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`);
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
