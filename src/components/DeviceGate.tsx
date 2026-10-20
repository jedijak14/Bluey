import { useEffect, useState, type ReactNode } from "react";
import { Monitor, RefreshCw, ShieldCheck } from "lucide-react";
import { currentDevice, type DeviceKind } from "../lib/deviceSupport";
export function DeviceGate({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<DeviceKind | null>(null);
  useEffect(() => {
    setDevice(currentDevice());
  }, []);
  if (device === "desktop") return <>{children}</>;
  const label =
    device === "ipad"
      ? "iPad"
      : device === "phone"
        ? "phone"
        : device === "tablet"
          ? "tablet"
          : "device";
  return (
    <main className="device-gate">
      <a className="device-brand" href="./">
        <img src="./favicon.svg" alt="Bluey" width="42" height="42" />
        bluey<span>.</span>
      </a>
      <section className="device-card">
        <span className="device-kicker">
          <ShieldCheck size={15} /> BROWSER COMPATIBILITY
        </span>
        {device ? (
          <>
            <img
              className={`device-illustration ${device === "phone" ? "phone" : ""}`}
              src={`./devices/${device === "phone" ? "phone" : "tablet"}.svg`}
              alt={`Illustration of ${device === "ipad" ? "an iPad" : device === "phone" ? "a phone" : "a tablet"} showing Bluey`}
            />
            <h1>
              {device === "unknown"
                ? "We couldn’t verify this browser."
                : `A little more room for Bluey.`}
            </h1>
            <p className="device-description">
              {device === "unknown"
                ? "Please open Bluey in a standard desktop browser on a laptop or desktop computer."
                : `This browser appears to be on ${label === "iPad" ? "an" : "a"} ${label}. The Bluey website is available on desktop and laptop computers only.`}
            </p>
            <div className="device-support">
              <Monitor size={20} />
              <div>
                <strong>Continue on your computer</strong>
                <span>Phones, iPads and other tablets are not supported.</span>
              </div>
            </div>
            <button
              className="outline-button"
              onClick={() => setDevice(currentDevice())}
            >
              <RefreshCw size={15} />
              Check again
            </button>
            <p className="device-footnote">
              This is a best-effort browser check, not hardware authentication.
              A small desktop window is still supported. The native Android
              paired companion is separate.
            </p>
          </>
        ) : (
          <>
            <div className="device-checking" role="status">
              Checking browser compatibility…
            </div>
            <p>No model has been loaded.</p>
          </>
        )}
      </section>
      <footer>Little companion. Desktop home.</footer>
    </main>
  );
}
