import { useEffect, useState } from "react";
import { client } from "../lib/client";
type Status = {
  enabled: boolean;
  port: string;
  error: string;
  ports: { port: string; name: string }[];
};
export function BluetoothSetup({ connected }: { connected: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [port, setPort] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const value = await client.request<Status>("/api/bluetooth");
      setStatus(value);
      setPort(value.port);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    if (connected && window.bluey) void refresh();
  }, [connected]);
  if (!window.bluey) return null;
  return (
    <section className="pair-card bluetooth-setup" aria-label="Bluetooth setup">
      <span className="eyebrow-label">ANDROID ↔ WINDOWS · BLUETOOTH</span>
      <h2>No Wi-Fi address needed.</h2>
      <p>
        Pair the devices in system Bluetooth settings. On Windows, open More
        Bluetooth settings → COM Ports → Add → Incoming. Select that Bluetooth
        port below, then generate a Bluey pairing code above.
      </p>
      <p>
        Uses Bluetooth Serial Port Profile, not tethering. One foreground
        Android companion at a time. Physical adapter compatibility is not yet
        verified; keep Wi-Fi as a fallback.
      </p>
      <label>
        Incoming Bluetooth port
        <select
          aria-label="Incoming Bluetooth port"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          disabled={busy || !connected}
        >
          <option value="">Choose a port</option>
          {status?.ports.map((p) => (
            <option key={p.port} value={p.port}>
              {p.port} · {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="desktop-quick-actions">
        <button
          className="outline-button"
          disabled={!connected || busy}
          onClick={() => void refresh()}
        >
          Refresh ports
        </button>
        <button
          className="primary-button"
          disabled={!connected || busy || !port}
          onClick={async () => {
            setBusy(true);
            try {
              setStatus(
                await client.request<Status>("/api/bluetooth", { port }),
              );
              setError("");
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Enable Bluetooth bridge
        </button>
        {status?.enabled && (
          <button
            className="outline-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setStatus(
                  await client.request<Status>("/api/bluetooth", { port: "" }),
                );
                setPort("");
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Disable Bluetooth
          </button>
        )}
      </div>
      <p role="status">
        {status?.enabled
          ? `Listening on ${status.port} · this is not confirmation of a phone connection.`
          : "Bluetooth bridge is off."}
      </p>
      {(error || status?.error) && <p role="alert">{error || status?.error}</p>}
    </section>
  );
}
