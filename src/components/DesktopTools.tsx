import { useEffect, useRef, useState } from "react";
import {
  AppWindow,
  Globe,
  List,
  Music2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { client } from "../lib/client";
import { uid } from "../lib/storage";

export function DesktopTools({
  connected,
  onConnect,
}: {
  connected: boolean;
  onConnect: () => void;
}) {
  const [query, setQuery] = useState("");
  const [apps, setApps] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef("");
  useEffect(
    () =>
      client.subscribe((packet) => {
        if (packet.request !== pending.current) return;
        if (packet.type === "done" || packet.type === "error") setBusy(false);
        if (packet.type === "error") setMessage(String(packet.text));
        if (packet.type === "action_result") {
          const result = packet.result as Record<string, unknown>;
          if (Array.isArray(result.apps))
            setApps(
              result.apps.filter((x): x is string => typeof x === "string"),
            );
          setMessage(
            result.denied
              ? "Action declined. Nothing was run."
              : typeof result.notice === "string"
                ? result.notice
                : "Approved request completed.",
          );
        }
      }),
    [],
  );
  useEffect(() => {
    if (!connected) {
      setBusy(false);
      pending.current = "";
    }
  }, [connected]);
  function run(action: Record<string, unknown>) {
    if (!connected) {
      onConnect();
      return;
    }
    if (busy) return;
    pending.current = uid();
    setBusy(true);
    setMessage("Waiting for one-time Windows approval…");
    try {
      client.send({ type: "action", request: pending.current, action });
    } catch (error) {
      setBusy(false);
      setMessage(String(error));
    }
  }
  return (
    <div className="page-scroll tools-page">
      <div className="page-heading">
        <span className="eyebrow-label">A HAND, WHEN YOU ASK</span>
        <h1>Small actions. Less switching.</h1>
        <p>
          Every action needs approval on Windows. No scripts, hidden clicks, or
          automatic installs.
        </p>
      </div>
      {!connected && (
        <button className="primary-button" onClick={onConnect}>
          Connect Windows engine
        </button>
      )}
      <div className="tools-grid">
        <section>
          <Globe size={23} />
          <h2>Open a website</h2>
          <p>
            Your default browser, your existing login. Bluey never receives your
            passwords.
          </p>
          <button
            disabled={busy}
            className="outline-button"
            onClick={() =>
              run({ action: "open_url", url: "https://chatgpt.com/" })
            }
          >
            Open ChatGPT
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run({ action: "search_web", text: query });
            }}
          >
            <label>
              Search the web
              <input
                value={query}
                maxLength={500}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What would you like to look up?"
                required
              />
            </label>
            <button disabled={busy} className="primary-button">
              <Search size={15} />
              Open web search
            </button>
          </form>
          <p className="tiny muted">
            For a source-backed answer card, use Research in the chat toolbar.
          </p>
        </section>
        <section>
          <Music2 size={23} />
          <h2>Media remote</h2>
          <p>
            Send a media key to Windows’ active player. Playback support varies
            by app.
          </p>
          <div className="media-buttons">
            {[
              ["play_pause", "Play / pause"],
              ["previous", "Previous"],
              ["next", "Next"],
              ["stop", "Stop media"],
              ["volume_down", "Volume −"],
              ["volume_up", "Volume +"],
              ["mute", "Mute / unmute"],
            ].map(([command, label]) => (
              <button
                key={command}
                className="outline-button"
                disabled={busy}
                onClick={() => run({ action: "media", command })}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <section>
          <AppWindow size={23} />
          <h2>Your installed apps</h2>
          <p>
            Load Windows’ application list, then choose an exact installed app.
            Apps without a Windows application entry may need manual launch.
          </p>
          <button
            className="outline-button"
            disabled={busy}
            onClick={() => run({ action: "list_apps" })}
          >
            <List size={15} />
            Load installed apps
          </button>
          {apps.length > 0 && (
            <>
              <input
                aria-label="Filter installed apps"
                placeholder="Filter apps…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <div className="app-picker">
                {apps
                  .filter((app) =>
                    app.toLowerCase().includes(filter.toLowerCase()),
                  )
                  .map((app) => (
                    <button
                      disabled={busy}
                      key={app}
                      onClick={() => run({ action: "open_app", app })}
                    >
                      {app}
                    </button>
                  ))}
              </div>
            </>
          )}
        </section>
        <section>
          <ShieldCheck size={23} />
          <h2>Browser extensions</h2>
          <p>
            Open the extension manager for an installed browser. Installing
            extensions or changing their permissions stays in your hands.
          </p>
          <div className="media-buttons">
            {["edge", "chrome"].map((browser) => (
              <button
                disabled={busy}
                className="outline-button"
                key={browser}
                onClick={() => run({ action: "open_extensions", browser })}
              >
                {browser === "edge" ? "Edge extensions" : "Chrome extensions"}
              </button>
            ))}
          </div>
        </section>
      </div>
      {message && (
        <div className="tools-result" role="status">
          {message}
        </div>
      )}
      {busy && (
        <button
          className="danger-button"
          onClick={() => client.send({ type: "stop" })}
        >
          Cancel pending action
        </button>
      )}
    </div>
  );
}
