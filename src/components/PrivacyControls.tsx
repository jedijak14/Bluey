import type { ScreenContext } from "../hooks/useScreenContext";
export function PrivacyControls({ control: c }: { control: ScreenContext }) {
  return (
    <section className="device-permissions">
      <h3>What Bluey is allowed to do</h3>
      {!c.settings ? (
        <p>
          Connect to an updated Windows engine to manage its permissions.{" "}
          <button className="text-button" onClick={() => void c.refresh()}>
            Check permissions
          </button>
        </p>
      ) : (
        <>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={c.settings.computer_use}
              disabled={c.busy}
              onChange={(e) =>
                void c.update({ computer_use: e.target.checked })
              }
            />
            <div>
              Computer Use
              <span>
                Allow approved clicks, typing, app launches and other desktop
                actions. Off blocks them at the engine.
              </span>
            </div>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={c.settings.screen_access}
              disabled={c.busy}
              onChange={(e) =>
                void c.update({ screen_access: e.target.checked })
              }
            />
            <div>
              Screen access
              <span>
                Off blocks screen reads, screenshots and live sharing. Enabling
                this does not start capture.
              </span>
            </div>
          </label>
          <div className="settings-note">
            Live viewing keeps only a recent frame in engine memory, refreshed
            about every 3 seconds. No video file is saved. Frames accompany
            questions to your configured model, which may be a cloud service.
            Use a vision-capable model; the Gemma base preview cannot see
            images.
          </div>
          <button
            className="outline-button"
            disabled={!c.settings.screen_access || c.busy}
            onClick={() => (c.sharing ? c.stop() : void c.start())}
          >
            {c.sharing ? "Stop sharing screen" : "Choose a screen to share"}
          </button>
        </>
      )}
      {c.error && (
        <p role="alert" className="error-text">
          {c.error}
        </p>
      )}
    </section>
  );
}
