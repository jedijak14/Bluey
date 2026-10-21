import { useEffect, useState } from "react";
export type GuardianHealth = {
  state: string;
  signInState?: string;
  nativeWarning?: string;
  networkState?: string;
  signOutAtCutoff?: boolean;
  restriction?: string;
  policyVersion?: number;
  blocklistVersion?: string;
  verified?: boolean;
  browserRules?: Partial<Record<"edge" | "chrome", boolean>>;
};
export function GuardianStatus() {
  const [health, setHealth] = useState<GuardianHealth>({ state: "checking" });
  const [setupError, setSetupError] = useState("");
  useEffect(() => {
    if (!window.blueyFamily) return;
    let alive = true;
    const refresh = async () => {
      try {
        const next = await window.blueyFamily!.guardianStatus();
        if (alive) setHealth(next);
      } catch {
        if (alive) setHealth({ state: "unavailable" });
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  if (!window.blueyFamily) return null;
  return (
    <section className="home-warning guardian-status" role="status">
      <div>
        <strong>
          {health.state === "admin_needed"
            ? "Admin Permissions is needed"
            : health.state === "checking"
              ? "Checking Windows Guardian…"
              : health.state === "wrong_account"
                ? "This is not the enrolled child account"
                : health.state === "reporting"
                  ? "Windows Guardian is reporting"
                  : "Protection needs administrator attention"}
        </strong>
        <p>
          {health.state === "admin_needed"
            ? "Ask your parent to install and enroll Windows Guardian using an administrator account. Installing this companion alone does not enable protection."
            : health.state === "reporting"
              ? `Applied policy ${health.policyVersion}. Blocklist ${health.blocklistVersion}. ${Object.entries(
                  health.browserRules ?? {},
                )
                  .filter(([, applied]) => applied)
                  .map(([browser]) => (browser === "edge" ? "Edge" : "Chrome"))
                  .join(
                    " and ",
                  )} policy writes and session-time enforcement are reported, not independently verified. ${health.networkState === "filtered" ? "Strict network containment is also reported; unsupported browsers/apps are denied direct access." : "Other browsers are not covered by these browser policies."}`
              : "No verified protection status. Keep your existing parental controls enabled."}
        </p>
        {health.networkState && health.networkState !== "disabled" && (
          <p>
            Strict Windows network mode: {health.networkState}. Only
            parent-approved HTTPS sites and the family control service are
            allowed through the gateway. This status is not independent proof
            against every bypass.
          </p>
        )}
        {health.signOutAtCutoff && (
          <p>
            At cutoff Windows signs out this child account, including
            disconnected sessions. Save your work before the warning expires;
            unsaved changes may be lost.
          </p>
        )}
        {health.signInState && (
          <p>
            Windows sign-in policy: {health.signInState.replaceAll("_", " ")}.
            {health.signInState === "disabled"
              ? " A parent can opt in to new-logon blocking in administrator setup. Existing installations are not changed automatically."
              : " This is Windows LSA policy for the enrolled child, not a fullscreen lock. Hello/PIN unlock and existing-session reconnect still require device testing."}
          </p>
        )}
        {health.nativeWarning === "failed" && (
          <p role="alert">
            Windows could not display the save-your-work warning. The time limit
            is still enforced independently.
          </p>
        )}
        {health.restriction && (
          <p>
            Windows restriction: {health.restriction.replaceAll("_", " ")}.
            Closing this companion does not stop the Windows service.
          </p>
        )}
        <button
          className="home-text"
          onClick={async () => {
            try {
              setSetupError(await window.blueyFamily!.openSetupGuide());
            } catch {
              setSetupError(
                "Could not open the setup instructions. Open the guardian folder in the app’s installation resources.",
              );
            }
          }}
        >
          Parent administrator setup & recovery
        </button>
        {setupError && <p role="alert">{setupError}</p>}
      </div>
    </section>
  );
}
