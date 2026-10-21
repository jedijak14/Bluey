import { useState } from "react";

export function HomeDeviceSetup() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  if (!window.blueyFamily) return null;
  return (
    <section
      className="home-rule-panel"
      aria-label="Local Windows administrator setup"
    >
      <h3>Set up control on the child’s Windows PC</h3>
      <p>
        Open Home on the child’s test PC with a separate parent administrator
        account. Installing Home does not install Guardian or grant it Windows
        permissions. The local wizard requests Windows administrator approval.
      </p>
      <p className="home-fine">
        Install requires system-wide Python 3.11+ under Program Files, a loaded
        standard child profile and a one-use Windows agent code. The wizard
        offers optional Windows new-logon blocking and native save-your-work
        notices. Keep a separate parent administrator account; recovery works
        offline. This does not enable Android or all-browser protection.
      </p>
      <button
        type="button"
        className="home-outline"
        disabled={running || !window.blueyFamily.openGuardianSetup}
        onClick={async () => {
          setRunning(true);
          setMessage(
            "Complete the Windows administrator prompt and local setup window. No protection is confirmed yet.",
          );
          try {
            setMessage(await window.blueyFamily!.openGuardianSetup());
          } catch {
            setMessage(
              "Could not start setup. Admin Permissions is needed. Open the bundled instructions.",
            );
          } finally {
            setRunning(false);
          }
        }}
      >
        {running
          ? "Waiting for administrator setup…"
          : "Install or recover Windows Guardian"}
      </button>
      <button
        type="button"
        className="home-text"
        onClick={async () => {
          try {
            const error = await window.blueyFamily!.openSetupGuide();
            if (error) setMessage(error);
          } catch {
            setMessage(
              "Open the guardian folder in the app’s installation resources.",
            );
          }
        }}
      >
        Read administrator instructions
      </button>
      {!window.blueyFamily.openGuardianSetup && (
        <p>Update the Home Windows app to use guided setup.</p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
