import {
  ArrowRight,
  Monitor,
  ShieldCheck,
  Smartphone,
  Wifi,
} from "lucide-react";
import { Avatar, CursorAvatar } from "./FloatingWidget/Avatar";
import { BluetoothSetup } from "./BluetoothSetup";
import { usePairing } from "../lib/usePairing";

export function openPairing() {
  location.hash = "#phone";
  location.reload();
}

export function ConnectedDevices({
  status,
  endpoint,
  onConnect,
}: {
  status: "offline" | "connecting" | "connected";
  endpoint: string;
  onConnect: () => void;
}) {
  const connected = status === "connected";
  const { pair, devices, busy, error, message, remaining, generate, revoke } =
    usePairing(connected, endpoint);
  return (
    <div className="page-scroll">
      <div className="page-heading">
        <span className="eyebrow-label">BETTER TOGETHER</span>
        <h1>A little closer, on every screen.</h1>
        <p>
          Connect this browser to Windows, or invite your Android. Your PC stays
          in control.
        </p>
      </div>
      <section className="pair-entry-card" aria-labelledby="enter-code-heading">
        <div className="card-icon">
          <Smartphone size={22} />
        </div>
        <div>
          <h2 id="enter-code-heading">Already have a pairing code?</h2>
          <p>
            Enter your PC address and six-digit code to use this browser as a
            companion.
          </p>
        </div>
        <button className="primary-button" onClick={openPairing}>
          Pair this device <ArrowRight size={16} />
        </button>
      </section>
      <div className="device-layout">
        <div className="device-illustration">
          <div className="illustration-monitor">
            <CursorAvatar />
            <span>WINDOWS</span>
          </div>
          <div className="pair-dots">
            <i />
            <i />
            <i />
          </div>
          <div className="illustration-phone">
            <Avatar mood={pair ? "listening" : "resting"} />
          </div>
          <span className="connection-caption">
            <Wifi size={14} /> Your PC. Your companion.
          </span>
        </div>
        <section className="pair-card" aria-labelledby="generate-code-heading">
          <div className="card-icon">
            <Monitor size={22} />
          </div>
          <h2 id="generate-code-heading">Pair my Android</h2>
          <p>
            Generate a one-time code here, then enter it in the Android app or
            another browser.
          </p>
          <div className="pair-live-status" role="status">
            <span className={`status-dot ${connected ? "green" : ""}`} />
            {connected
              ? "PC connected · device list updates every 2 seconds"
              : status === "connecting"
                ? "Connecting to your PC…"
                : "Windows backend not connected"}
          </div>
          {!connected && (
            <div className="pair-connection-help">
              <p>
                Connect your Windows engine in Settings first. The hosted
                website cannot generate a valid code on its own.
              </p>
              <button className="outline-button" onClick={onConnect}>
                Connect Windows engine
              </button>
            </div>
          )}
          <ol>
            <li>
              <span>1</span>Start the Windows engine with LAN mode enabled.
            </li>
            <li>
              <span>2</span>Keep both devices on your trusted private network.
            </li>
            <li>
              <span>3</span>Enter the code below on the device you want to pair.
            </li>
          </ol>
          {connected && pair && (
            <div className="pair-code">
              <span>ONE-TIME PAIRING CODE</span>
              {remaining > 0 ? (
                <strong data-testid="pair-code">{pair.code}</strong>
              ) : (
                <strong className="pair-refreshing">Refreshing code…</strong>
              )}
              <span role="timer" aria-label="Pairing code expiry">
                {remaining > 0
                  ? `Expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
                  : "Expired — requesting a new code"}
              </span>
              <small>{pair.addresses.join(" or ")}</small>
              <small>
                A fresh code appears after expiry while this screen stays open.
              </small>
            </div>
          )}
          {message && (
            <p className="pair-success" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button"
            onClick={() => void generate()}
            disabled={!connected || busy}
          >
            <Wifi size={16} />
            {busy
              ? "Checking your PC…"
              : pair
                ? "Generate a new code"
                : "Generate pairing code"}
            <ArrowRight size={16} />
          </button>
          <p className="tiny muted">
            Codes last two minutes and work once. Refresh stops after pairing,
            on a connection error, or when you leave this screen.
          </p>
        </section>
      </div>
      <BluetoothSetup connected={connected} />
      <section className="connected-list" aria-label="Paired devices">
        <h3>
          Paired devices <span>{devices.length}</span>
        </h3>
        {devices.length ? (
          devices.map((device) => (
            <div className="device-row" key={device.id}>
              <Smartphone size={20} />
              <div>
                <strong>{device.name}</strong>
                <span>Paired for this backend session</span>
              </div>
              <button
                className="outline-button"
                disabled={busy}
                onClick={() => void revoke(device.id)}
              >
                Disconnect
              </button>
            </div>
          ))
        ) : (
          <div className="device-empty">
            <Monitor size={21} />
            <p>
              Your Windows PC is home base.
              <br />
              <span>Paired devices appear here automatically.</span>
            </p>
          </div>
        )}
      </section>
      <p className="pair-web-note">
        <ShieldCheck size={16} /> On this HTTPS website, use a trusted HTTPS/WSS
        endpoint to your PC and explicitly allow this website’s origin in the
        engine. Plain LAN HTTP works in the Android APK, not this hosted page.
        Never expose the engine port publicly.{" "}
        <a href="/pairing-guide.html" target="_blank" rel="noreferrer">
          Connection guide
        </a>
      </p>
    </div>
  );
}
