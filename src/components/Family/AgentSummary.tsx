import type { ChildProfile } from "../../lib/family";

export function agentLabel(child: ChildProfile) {
  switch (child.agent?.state) {
    case "awaiting_report":
      return "Enrolled · waiting for first report";
    case "stale":
      return "Agent offline or report overdue";
    case "policy_pending":
      return "Saved rules awaiting agent sync";
    case "attention":
      return "Windows agent needs attention";
    case "reporting":
      return "Windows agent reporting · not verified";
    default:
      return child.agent?.recent
        ? "Windows agent reporting · not verified"
        : "No current Windows agent report";
  }
}

export function AgentSummary({
  child,
  online,
  compact = false,
}: {
  child: ChildProfile;
  online: boolean;
  compact?: boolean;
}) {
  const report = child.agent?.report;
  const details = (
    <>
      <p>
        Saved rules: version {child.policy.version}. Agent-reported version:{" "}
        {report?.policy_version ?? "none"}.
        {child.agent?.last_seen != null && (
          <>
            {" "}
            Last report:{" "}
            {new Date(child.agent.last_seen * 1000).toLocaleString()}.
          </>
        )}
      </p>
      {child.agent?.credential_expires_at != null && (
        <p
          className={
            child.agent.credential_expires_at * 1000 - Date.now() < 7 * 86400000
              ? "home-message"
              : "home-fine"
          }
        >
          Windows enrollment expires{" "}
          {new Date(child.agent.credential_expires_at * 1000).toLocaleString()}.{" "}
          A parent must recover and re-enroll Guardian before then. Expired
          credentials cannot sync; the child is restricted when the cached
          policy expires. Parent administrator recovery remains available
          offline.
        </p>
      )}
      <p className="home-fine">
        Session time is not mouse activity. A heartbeat or policy write is not
        proof of protection. Check limits and Edge/Chrome policies on the child
        PC; other browsers are not covered.
      </p>
    </>
  );
  return (
    <section className="home-agent-summary" aria-label="Windows sync and usage">
      <h3>
        {online ? agentLabel(child) : "Offline · showing last received data"}
      </h3>

      <p>
        {online && child.used_minutes != null
          ? `${child.used_minutes} minutes used today, reported by Windows Guardian.`
          : "No current usage total available. This does not mean zero minutes used."}{" "}
        Allowance: {child.policy.daily_minutes} minutes +{" "}
        {child.extra_minutes_today} approved extra minutes.
      </p>
      {compact ? (
        <details>
          <summary>For parents: Windows sync details</summary>
          {details}
        </details>
      ) : (
        details
      )}
    </section>
  );
}
