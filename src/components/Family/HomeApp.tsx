import { AgentSummary, agentLabel } from "./AgentSummary";
import { EnrollmentCode, type FamilyEnrollment } from "./EnrollmentCode";
import { useFamilyPolling } from "../../lib/useFamilyPolling";
import { HomeDeviceSetup } from "./HomeDeviceSetup";
import { useEffect, useRef, useState } from "react";
import {
  Home,
  Shield,
  Clock3,
  ArrowRight,
  Plus,
  LogOut,
  RefreshCw,
  Globe2,
  Bell,
  Heart,
  Users,
  Link2,
} from "lucide-react";
import { Avatar } from "../FloatingWidget/Avatar";
import {
  exampleFamily,
  familyRequest,
  FamilyError,
  type Dashboard,
  type ChildProfile,
  type FamilyPolicy,
} from "../../lib/family";

function ChildRules({
  child,
  onSave,
  onEnroll,
  onRemove,
  disabled,
}: {
  child: ChildProfile;
  onSave: (policy: FamilyPolicy) => Promise<boolean>;
  onEnroll: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [dirty, setDirty] = useState(false);
  const [allowed, setAllowed] = useState(
    (child.policy.allowed_domains || []).join("\n"),
  );
  const [policy, setPolicy] = useState(child.policy),
    [domains, setDomains] = useState(child.policy.blocked_domains.join("\n"));
  useEffect(() => {
    if (dirty) return;
    setPolicy(child.policy);
    setAllowed((child.policy.allowed_domains || []).join("\n"));
    setDomains(child.policy.blocked_domains.join("\n"));
  }, [child.id, child.policy.version, dirty]);
  return (
    <section className="home-rule-panel">
      <div className="home-section-title">
        <div>
          <span className="home-eyebrow">A LITTLE BALANCE</span>
          <h2>{child.name}’s rules</h2>
        </div>
        <Shield size={25} />
      </div>
      <form
        onChange={() => setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            ...policy,
            allowed_domains: allowed
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
            blocked_domains: domains
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          }).then((saved) => {
            if (saved) setDirty(false);
          });
        }}
      >
        <div className="home-field-grid">
          <label>
            Daily computer allowance
            <span className="home-number">
              <input
                disabled={disabled}
                type="number"
                min={0}
                max={720}
                required
                value={policy.daily_minutes}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    daily_minutes: Number(e.target.value),
                  })
                }
              />
              minutes
            </span>
          </label>
          <label>
            Timezone
            <input
              disabled={disabled}
              value={policy.timezone}
              onChange={(e) =>
                setPolicy({ ...policy, timezone: e.target.value })
              }
              required
              maxLength={60}
            />
          </label>
          <label>
            Bedtime starts
            <input
              disabled={disabled}
              type="time"
              value={policy.bedtime_start}
              onChange={(e) =>
                setPolicy({ ...policy, bedtime_start: e.target.value })
              }
              required
            />
          </label>
          <label>
            Bedtime ends
            <input
              disabled={disabled}
              type="time"
              value={policy.bedtime_end}
              onChange={(e) =>
                setPolicy({ ...policy, bedtime_end: e.target.value })
              }
              required
            />
          </label>
        </div>
        <label>
          Blocked website domains
          <textarea
            disabled={disabled}
            rows={4}
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder={"example.com\nanother-site.com"}
          />
        </label>
        <label>
          Parent allowlist exceptions
          <textarea
            disabled={disabled}
            rows={3}
            value={allowed}
            onChange={(e) => setAllowed(e.target.value)}
            placeholder="x.com"
          />
        </label>
        <p className="home-fine">
          Deterministic rules—not AI decisions. X/Twitter and a starter list of
          adult services are blocked by default. Your allowlist overrides
          matching blocks; each domain includes its subdomains. Allowing x.com
          does not also allow twitter.com. Unlisted websites are not certified
          safe. Requires an updated, enrolled Guardian and managed Edge or
          Chrome.
        </p>
        <details>
          <summary>
            Effective blocklist ·{" "}
            {child.website_rules?.version || "awaiting updated service"}
          </summary>
          <p className="home-fine">
            {child.website_rules?.blocked.join(", ") ||
              "Connect to the updated family service to retrieve the effective blocklist."}
          </p>
        </details>
        {dirty && policy.version !== child.policy.version && (
          <div role="alert" className="home-message">
            Rules changed on another device. Your unsaved edits are kept here.
            Load the saved rules before editing again.
            <button
              type="button"
              className="home-text"
              onClick={() => setDirty(false)}
            >
              Load saved rules
            </button>
          </div>
        )}
        <button
          className="home-primary"
          disabled={
            disabled || (dirty && policy.version !== child.policy.version)
          }
        >
          Save rules <ArrowRight size={16} />
        </button>
      </form>
      <div className="home-secondary-actions">
        <button disabled={disabled} onClick={onEnroll}>
          <Link2 size={15} />
          Enroll Kids app
        </button>
        <button disabled={disabled} onClick={onRemove}>
          Remove profile
        </button>
      </div>
    </section>
  );
}
export function HomeApp() {
  const [service, setService] = useState<"checking" | "ready" | "unavailable">(
      "checking",
    ),
    [token, setToken] = useState(""),
    [demo, setDemo] = useState(false),
    [data, setData] = useState<Dashboard>({ children: [], requests: [] });
  const [tab, setTab] = useState<"family" | "requests" | "setup">("family"),
    [selected, setSelected] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [code, setCode] = useState<FamilyEnrollment | null>(null);
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [invite, setInvite] = useState(""),
    [register, setRegister] = useState(false),
    [nickname, setNickname] = useState("");
  const [updated, setUpdated] = useState("");
  const [alerts, setAlerts] = useState<
    import("../../lib/family").SafetyAlert[]
  >([]);
  const session = useRef({ token: "", request: 0 });
  session.current.token = token;
  const active = demo ? exampleFamily : data,
    child =
      active.children.find((c) => c.id === selected) || active.children[0];
  const [serviceDetail, setServiceDetail] = useState("");
  const [registrationAvailable, setRegistrationAvailable] = useState<
    boolean | undefined
  >();
  async function check() {
    try {
      const r = await familyRequest<{
        status: string;
        error?: string;
        registration_available?: boolean;
      }>("status");
      setService(r.status === "ready" ? "ready" : "unavailable");
      setServiceDetail(
        typeof r.error === "string"
          ? r.error
          : "The family service is not connected yet.",
      );
      setRegistrationAvailable(r.registration_available);
    } catch (error) {
      setService("unavailable");
      setServiceDetail(
        error instanceof Error
          ? error.message
          : "The family service could not be reached.",
      );
    }
  }
  async function refresh() {
    if (!token) return false;
    const request = ++session.current.request;
    try {
      const r = await familyRequest<Dashboard>("dashboard", token);
      if (
        session.current.token !== token ||
        request !== session.current.request
      )
        return;
      setData(r);
      setService("ready");
      setUpdated(new Date().toLocaleTimeString());
      const inbox = await familyRequest<
        import("../../lib/family").SafetyAlert[]
      >("alerts", token);
      if (
        session.current.token !== token ||
        request !== session.current.request
      )
        return false;
      setAlerts(inbox);
      return true;
    } catch (e) {
      if (
        session.current.token === token &&
        request === session.current.request
      ) {
        setService(
          e instanceof FamilyError && e.status === 401
            ? "ready"
            : "unavailable",
        );
        handle(e);
      }
      return false;
    }
  }

  function handle(e: unknown) {
    setMessage(e instanceof Error ? e.message : String(e));
    if (e instanceof FamilyError && e.status === 401) {
      session.current.token = "";
      setToken("");
      setData({ children: [], requests: [] });
      setCode(null);
      setAlerts([]);
      setSelected("");
      setUpdated("");
      session.current.request++;
    }
  }
  useEffect(() => {
    void check();
  }, []);
  useEffect(
    () => () => {
      session.current.token = "";
      session.current.request++;
    },
    [],
  );
  useFamilyPolling(refresh, token);
  async function action(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      const refreshed = await refresh();
      if (session.current.token === token)
        setMessage(
          refreshed
            ? success
            : `${success} The dashboard could not refresh; displayed data may be out of date. Retry Refresh family.`,
        );
      return Boolean(refreshed);
    } catch (e) {
      if (e instanceof FamilyError && e.status === 409) await refresh();
      handle(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function auth() {
    setBusy(true);
    setMessage("");
    try {
      const r = await familyRequest<{ token: string }>(
        register ? "auth/register" : "auth/login",
        "",
        { username, password, ...(register ? { invite } : {}) },
      );
      session.current.token = r.token;
      setToken(r.token);
      setService("ready");
      if (!import.meta.env.VITE_BLUEY_VARIANT) location.hash = "home";
      setPassword("");
      setInvite("");
      setDemo(false);
    } catch (e) {
      handle(e);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    const oldToken = token;
    session.current.token = "";
    session.current.request++;
    setToken("");
    setData({ children: [], requests: [] });
    setAlerts([]);
    setDemo(false);
    setCode(null);
    setSelected("");
    setMessage("");
    setUpdated("");
    if (oldToken)
      try {
        await familyRequest("auth/logout", oldToken, {});
      } catch {
        /* Local identity is already gone. Server sessions expire. */
      }
  }
  if (!token)
    return (
      <main className="bluey-home account-gate">
        <header className="home-header">
          <a className="home-brand" href="#">
            <img src="./bluey-home-logo.png" alt="" />
            bluey<span>account</span>
          </a>
          <span className="home-connection">Private family access</span>
        </header>
        <div className="account-content">
          <section className="home-signin">
            <div>
              <span className="home-eyebrow">A HOME FOR YOUR WHOLE FAMILY</span>
              <h2>Sign in to your Bluey Account.</h2>
              <p>
                Children get their own enrollment—not your password. Invitations
                are issued by the family-service operator.
              </p>
              <p className="home-fine">
                Home opens only after your Bluey Account is authenticated. No
                public family dashboard or demo data.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void auth();
              }}
            >
              <h3>{register ? "Create Bluey Account" : "Bluey Account"}</h3>
              <label>
                Parent username
                <input
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  maxLength={40}
                  pattern={"[a-zA-Z0-9_.\\-]+"}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
              {register && (
                <label>
                  Operator setup invite
                  <input
                    type="password"
                    value={invite}
                    onChange={(e) => setInvite(e.target.value)}
                    required
                    maxLength={128}
                  />
                </label>
              )}
              <button
                className="home-primary"
                disabled={
                  busy ||
                  service !== "ready" ||
                  (register && registrationAvailable === false)
                }
              >
                {register ? "Create parent account" : "Sign in"}
                <ArrowRight size={16} />
              </button>
              <button
                type="button"
                className="home-text"
                onClick={() => setRegister(!register)}
              >
                {register
                  ? "Already have an account?"
                  : "Create a Bluey Account"}
              </button>
              {register && registrationAvailable === false && (
                <p className="home-fine">
                  Account creation is disabled until the operator configures a
                  private setup invite. Existing accounts can still sign in.
                </p>
              )}
              {!window.blueyFamily && (
                <a
                  className="home-text"
                  href="https://bluey-plum.vercel.app/family-setup.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Connect the family database · setup instructions
                </a>
              )}
              {service !== "ready" && (
                <p className="home-fine">
                  {service === "checking"
                    ? "Checking the family service…"
                    : serviceDetail}{" "}
                  <button
                    type="button"
                    className="home-text"
                    onClick={() => void check()}
                  >
                    Check again
                  </button>
                </p>
              )}
            </form>
          </section>
          <HomeDeviceSetup />
          {message && (
            <p role="alert" className="home-message">
              {message}
            </p>
          )}
          <a href="#">← Back to Bluey</a>
        </div>
      </main>
    );
  return (
    <div className="bluey-home">
      <header className="home-header">
        <a className="home-brand" href="#home">
          <img src="./bluey-home-logo.png" alt="" />
          bluey<span>home</span>
        </a>
        <span
          className={`home-connection ${service === "ready" ? "connected" : ""}`}
        >
          {service === "ready"
            ? "Family service connected"
            : service === "checking"
              ? "Checking connection…"
              : "Remote service not connected"}
        </span>
        {(token || demo) && (
          <button disabled={busy} onClick={() => void logout()}>
            <LogOut size={16} />
            {demo ? "Leave demo" : "Sign out"}
          </button>
        )}
      </header>
      <div className="home-layout">
        <aside className="home-sidebar">
          <span className="home-eyebrow">YOUR FAMILY SPACE</span>
          <nav>
            {[
              ["family", "My family", Users],
              ["requests", "Time requests", Bell],
              ["setup", "Setup & safety", Shield],
            ].map(([id, title, Icon]) => (
              <button
                key={String(id)}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id as typeof tab)}
              >
                {typeof Icon !== "string" && <Icon size={18} />} {String(title)}
                {id === "requests" &&
                  active.requests.some((r) => r.status === "pending") && <i />}
              </button>
            ))}
          </nav>
          <div className="home-side-note">
            <Heart size={18} />
            <p>
              More together.
              <br />A little less screen time.
            </p>
            <small>Private by design. Honest about what’s connected.</small>
          </div>
          <a href="#">
            Bluey companion <ArrowRight size={14} />
          </a>
        </aside>
        <main className="home-main">
          <div className="home-heading">
            <div>
              <span className="home-eyebrow">
                BLUEY HOME · FOUNDATION PREVIEW
              </span>
              <h1>
                A little guidance.
                <br />
                <em>A lot of growing room.</em>
              </h1>
              <p>
                A thoughtful place for family rules, little requests, and
                healthier digital days.
              </p>
            </div>
            <Avatar mood="happy" gaze={{ x: 0, y: 0 }} />
          </div>
          <div className="home-warning" role="status">
            <Shield size={22} />
            <div>
              <strong>Not protected yet</strong>
              <p>
                Rules require the separately installed experimental Windows
                Guardian service. It can disconnect over-budget child sessions
                and apply Edge/Chrome rules. Neither all-browser protection nor
                Android enforcement is verified.
              </p>
            </div>
          </div>
          {demo && (
            <div className="home-demo-label">
              DEMO FAMILY · Fictional profiles. No devices, live usage, or
              protection. Changes are disabled.
            </div>
          )}
          {message && (
            <p className="home-message" role="status">
              {message}
            </p>
          )}

          {(token || demo) && (
            <>
              <div className="home-stats">
                <article>
                  <Users />
                  <span>Child profiles</span>
                  <strong>{active.children.length}</strong>
                  <small>Each with separate rules</small>
                </article>
                <article>
                  <Bell />
                  <span>Waiting for you</span>
                  <strong>
                    {
                      active.requests.filter((r) => r.status === "pending")
                        .length
                    }
                  </strong>
                  <small>More-time requests</small>
                </article>
                <article>
                  <Shield />
                  <span>Verified protection</span>
                  <strong>Not verified</strong>
                  <small>Check each device’s agent status</small>
                </article>
              </div>
              {tab === "family" && (
                <>
                  <div className="home-section-title">
                    <h2>Your little people</h2>
                    <button
                      onClick={() => void refresh()}
                      disabled={demo || busy}
                      aria-label="Refresh family"
                    >
                      <RefreshCw size={17} />
                    </button>
                  </div>
                  <div className="home-child-grid">
                    {active.children.map((c, i) => (
                      <button
                        key={c.id}
                        className={`home-child ${child?.id === c.id ? "selected" : ""}`}
                        disabled={busy}
                        onClick={() => {
                          setSelected(c.id);
                          setCode(null);
                        }}
                      >
                        <span className={`home-child-avatar color-${i % 3}`}>
                          {c.name.slice(0, 1).toUpperCase()}
                        </span>
                        <strong>{c.name}</strong>
                        <span className="home-unprotected">
                          {service === "ready"
                            ? agentLabel(c)
                            : "Offline · status unknown"}
                        </span>
                        <div>
                          <Clock3 size={15} />
                          {c.policy.daily_minutes} min/day configured
                        </div>
                        <small>
                          {service === "ready" && c.used_minutes != null
                            ? `${c.used_minutes} min used today · agent reported`
                            : "Usage unavailable, not zero"}
                        </small>
                        <span className="home-child-link">
                          Manage rules <ArrowRight size={15} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <form
                    className="home-add-child"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        const c = await familyRequest<ChildProfile>(
                          "children",
                          token,
                          { name: nickname },
                        );
                        setSelected(c.id);
                        setNickname("");
                      }, "Profile created. A Kids app can now be enrolled.");
                    }}
                  >
                    <label>
                      Child nickname
                      <input
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        maxLength={40}
                        required
                        placeholder="Use a nickname, not a full name"
                      />
                    </label>
                    <button className="home-outline" disabled={demo || busy}>
                      <Plus size={16} />
                      Add child
                    </button>
                  </form>
                  {child && (
                    <AgentSummary child={child} online={service === "ready"} />
                  )}
                  {child && (
                    <ChildRules
                      key={child.id}
                      child={child}
                      disabled={demo || busy}
                      onSave={(policy) =>
                        action(
                          () =>
                            familyRequest(
                              `children/${child.id}/policy`,
                              token,
                              policy,
                              "PUT",
                            ),
                          "Rules saved. Check the Windows agent’s applied policy version before relying on them.",
                        )
                      }
                      onEnroll={() =>
                        void action(async () => {
                          setCode(null);
                          const r = await familyRequest<{
                            code: string;
                            expires_in: number;
                          }>(`children/${child.id}/enrollment`, token, {});
                          setCode({
                            code: r.code,
                            childId: child.id,
                            childName: child.name,
                            scope: "kids",
                            expiresAt:
                              Date.now() + (r.expires_in || 600) * 1000,
                          });
                        }, "Code created. Share it only with the Kids app for this child.")
                      }
                      onRemove={() => {
                        if (
                          confirm(
                            `Remove ${child.name}’s profile, tokens and requests? Recover/uninstall Guardian locally FIRST. Removing this profile does not remove Windows rules; a still-installed service will eventually block the child when its cached policy expires.`,
                          )
                        )
                          void action(
                            () =>
                              familyRequest(
                                `children/${child.id}`,
                                token,
                                undefined,
                                "DELETE",
                              ),
                            "Profile removed and enrollment revoked.",
                          );
                      }}
                    />
                  )}
                  {child && (
                    <section className="home-rule-panel">
                      <h2>Windows enforcement setup</h2>
                      <HomeDeviceSetup />
                      <p>
                        Use a separate parent administrator and a standard child
                        account. This experimental service disconnects
                        over-budget sessions and applies Edge/Chrome rules; it
                        is not all-browser or Android protection.
                      </p>
                      <p className="home-fine">
                        {(["edge", "chrome"] as const).map((browser) => (
                          <span key={browser} style={{ display: "block" }}>
                            {browser === "edge"
                              ? "Microsoft Edge"
                              : "Google Chrome"}
                            :{" "}
                            {service === "ready" &&
                            child.agent?.recent &&
                            (child.agent.report?.browser_rules?.[browser] ??
                              (browser === "edge"
                                ? child.agent.report?.edge_rules
                                : false)) === true
                              ? "policy write reported — verify on the child PC"
                              : "no current policy-write confirmation"}
                          </span>
                        ))}
                        Other browsers: not covered. Older Guardian enrollments
                        manage Edge only; parent recovery and re-enrollment are
                        required to add Chrome.
                      </p>
                      <button
                        className="home-outline"
                        disabled={busy || demo}
                        onClick={() =>
                          void action(async () => {
                            setCode(null);
                            const result = await familyRequest<{
                              code: string;
                              expires_in: number;
                            }>(
                              `children/${child.id}/agent-enrollment`,
                              token,
                              {},
                            );
                            setCode({
                              code: result.code,
                              childId: child.id,
                              childName: child.name,
                              scope: "windows",
                              expiresAt:
                                Date.now() + (result.expires_in || 600) * 1000,
                            });
                          }, "Windows-only enrollment code created. Install from the administrator account.")
                        }
                      >
                        Create Windows agent code
                      </button>
                      <p>
                        {service === "ready" && child.agent?.recent
                          ? `Agent reporting · policy version ${child.agent.report?.policy_version ?? "unknown"}. ${child.agent.report?.error || "Verify enforcement on the child PC."}`
                          : "No recent Windows agent report. Protection cannot be verified."}
                      </p>
                      <a
                        className="home-text"
                        href="https://github.com/jedijak14/Bluey/blob/arena/d8ea8f13-bluey/guardian/README.md"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Administrator install & recovery instructions
                      </a>
                    </section>
                  )}
                  {code && code.childId === child?.id && (
                    <EnrollmentCode
                      enrollment={code}
                      onHide={() => setCode(null)}
                    />
                  )}
                </>
              )}
              {tab === "requests" && (
                <section className="home-rule-panel">
                  <h2>A little more time?</h2>
                  <p>
                    Requests refresh while Home is open. Background push
                    notifications are not configured.
                  </p>
                  {!active.requests.length && (
                    <div className="home-empty">
                      <Bell size={30} />
                      <h3>Nothing waiting for you.</h3>
                      <p>
                        A child’s requests will appear here after their Kids app
                        is enrolled.
                      </p>
                    </div>
                  )}
                  {active.requests.map((r) => (
                    <article className="home-request" key={r.id}>
                      <div>
                        <strong>
                          {r.name} · {r.minutes} more minutes
                        </strong>
                        <p>{r.reason || "No reason added."}</p>
                        <small>
                          {new Date(r.created * 1000).toLocaleString()} ·{" "}
                          {r.status}
                        </small>
                      </div>
                      {r.status === "pending" && (
                        <div>
                          <button
                            className="home-primary"
                            disabled={busy || demo}
                            onClick={() =>
                              void action(
                                () =>
                                  familyRequest(
                                    `requests/${r.id}/decision`,
                                    token,
                                    { decision: "approve" },
                                  ),
                                "Approved in Home. A managed Windows agent is still needed to apply extra time.",
                              )
                            }
                          >
                            Approve
                          </button>
                          <button
                            className="home-outline"
                            disabled={busy || demo}
                            onClick={() =>
                              void action(
                                () =>
                                  familyRequest(
                                    `requests/${r.id}/decision`,
                                    token,
                                    { decision: "deny" },
                                  ),
                                "Request declined.",
                              )
                            }
                          >
                            Not now
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </section>
              )}
            </>
          )}
          {tab === "setup" && (
            <section className="home-rule-panel">
              <h2>A safer setup starts with honesty.</h2>
              <div className="home-setup-grid">
                <article>
                  <Globe2 />
                  <h3>1. Connect Home</h3>
                  <p>
                    Host the family API with HTTPS, durable storage and an
                    operator invite. Vercel serves this dashboard and its
                    authenticated gateway; it does not provide the database.
                  </p>
                </article>
                <article>
                  <Home />
                  <h3>2. Enroll Kids</h3>
                  <p>
                    Use the separate Windows Kids app and a one-use
                    parent-generated Kids code. Existing Android installations
                    use the same flow. Kids credentials cannot change rules or
                    approve their own requests.
                  </p>
                </article>
                <article>
                  <Shield />
                  <h3>3. Manage Windows</h3>
                  <p>
                    The experimental Guardian service needs separate
                    administrator setup and its own Windows agent code. It
                    supports cached session-time limits, Edge/Chrome policies
                    and parent recovery. It is unsigned and is not an
                    all-browser or Windows sign-in barrier.
                  </p>
                </article>
              </div>
              <p>
                Usage totals appear only with a recent same-day Windows agent
                report. Automatic browser blocked-site reporting is not
                implemented. No browsing history, screenshots or conversations
                are collected by this family service. It is not yet a Microsoft
                Family Safety replacement.
              </p>
              <a
                className="home-text"
                href="https://github.com/jedijak14/Bluey/blob/arena/d8ea8f13-bluey/docs/BLUEY_HOME.md"
                target="_blank"
                rel="noreferrer"
              >
                Setup and release limitations <ArrowRight size={15} />
              </a>
            </section>
          )}
          <section className="home-rule-panel">
            <h2>Safety inbox</h2>
            <p>
              Agent-reported events, not verified browsing history. Background
              push is not configured.
            </p>
            {alerts.length ? (
              alerts.map((alert) => (
                <article className="home-request" key={alert.id}>
                  <div>
                    <strong>
                      {alert.name}: {alert.kind.replaceAll("_", " ")}
                    </strong>
                    <p>
                      {alert.domain || "Windows session policy"} ·{" "}
                      {new Date(alert.created * 1000).toLocaleString()}
                    </p>
                  </div>
                  <button
                    className="home-outline"
                    disabled={busy || Boolean(alert.seen)}
                    onClick={() =>
                      void action(
                        () =>
                          familyRequest(`alerts/${alert.id}/seen`, token, {}),
                        "Marked read.",
                      )
                    }
                  >
                    {alert.seen ? "Read" : "Mark read"}
                  </button>
                </article>
              ))
            ) : (
              <p>No safety alerts received.</p>
            )}
          </section>
          <footer className="home-footer">
            <span>bluey home · room to grow.</span>
            <small>
              {updated
                ? `Last refreshed ${updated}`
                : "No live family data loaded"}
            </small>
          </footer>
        </main>
      </div>
    </div>
  );
}
