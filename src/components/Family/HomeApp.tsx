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
  onSave: (policy: FamilyPolicy) => Promise<void>;
  onEnroll: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [policy, setPolicy] = useState(child.policy),
    [domains, setDomains] = useState(child.policy.blocked_domains.join("\n"));
  useEffect(() => {
    setPolicy(child.policy);
    setDomains(child.policy.blocked_domains.join("\n"));
  }, [child.id, child.policy.version]);
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
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            ...policy,
            blocked_domains: domains
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          });
        }}
      >
        <div className="home-field-grid">
          <label>
            Daily computer allowance
            <span className="home-number">
              <input
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
            rows={4}
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder={"example.com\nanother-site.com"}
          />
        </label>
        <p className="home-fine">
          One domain per line. These are parent-entered rules, not a
          comprehensive unsafe-site detector. Rules are not applied to Windows
          or browsers by this preview.
        </p>
        <button className="home-primary" disabled={disabled}>
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
    [code, setCode] = useState("");
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [invite, setInvite] = useState(""),
    [register, setRegister] = useState(false),
    [nickname, setNickname] = useState("");
  const [updated, setUpdated] = useState("");
  const session = useRef({ token: "", request: 0 });
  session.current.token = token;
  const active = demo ? exampleFamily : data,
    child =
      active.children.find((c) => c.id === selected) || active.children[0];
  async function check() {
    try {
      const r = await familyRequest<{ status: string }>("status");
      setService(r.status === "ready" ? "ready" : "unavailable");
    } catch {
      setService("unavailable");
    }
  }
  async function refresh() {
    if (!token) return;
    const request = ++session.current.request;
    try {
      const r = await familyRequest<Dashboard>("dashboard", token);
      if (
        session.current.token !== token ||
        request !== session.current.request
      )
        return;
      setData(r);
      setUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      if (
        session.current.token === token &&
        request === session.current.request
      )
        handle(e);
    }
  }
  function handle(e: unknown) {
    setMessage(e instanceof Error ? e.message : String(e));
    if (e instanceof FamilyError && e.status === 401) {
      session.current.token = "";
      setToken("");
      setData({ children: [], requests: [] });
      setCode("");
    }
  }
  useEffect(() => {
    void check();
  }, []);
  useEffect(() => {
    if (!token) return;
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, [token]);
  async function action(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await refresh();
      setMessage(success);
    } catch (e) {
      handle(e);
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
      setToken(r.token);
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
    setDemo(false);
    setCode("");
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
  return (
    <div className="bluey-home">
      <header className="home-header">
        <a className="home-brand" href="#home">
          <img src="./favicon.svg" alt="" />
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
                This preview manages profiles and requests. It does not install
                Windows enforcement, block websites, or lock a computer. Remote
                setup and a managed Windows service are still required.
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
          {!token && !demo && (
            <section className="home-signin">
              <div>
                <span className="home-eyebrow">
                  A HOME FOR YOUR WHOLE FAMILY
                </span>
                <h2>Start with a parent account.</h2>
                <p>
                  Children get their own enrollment—not your password.
                  Invitations are issued by the family-service operator.
                </p>
                <button
                  className="home-outline"
                  onClick={() => {
                    setDemo(true);
                    setSelected("demo-avery");
                  }}
                >
                  Explore a demo family <ArrowRight size={16} />
                </button>
                <p className="home-fine">
                  The demo is not a parental-control service. Do not rely on it
                  to protect a child.
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void auth();
                }}
              >
                <h3>{register ? "Create Bluey Home" : "Welcome home"}</h3>
                <label>
                  Parent username
                  <input
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={3}
                    maxLength={40}
                    pattern="[a-zA-Z0-9_.-]+"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
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
                  disabled={busy || service !== "ready"}
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
                    : "Create a parent account"}
                </button>
                {service !== "ready" && (
                  <p className="home-fine">
                    A persistent family backend has not been connected. Sign-in
                    and remote management are unavailable.{" "}
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
                  <strong>Not installed</strong>
                  <small>No usage or enforcement reports</small>
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
                        onClick={() => {
                          setSelected(c.id);
                          setCode("");
                        }}
                      >
                        <span className={`home-child-avatar color-${i % 3}`}>
                          {c.name.slice(0, 1).toUpperCase()}
                        </span>
                        <strong>{c.name}</strong>
                        <span className="home-unprotected">Not protected</span>
                        <div>
                          <Clock3 size={15} />
                          {c.policy.daily_minutes} min/day configured
                        </div>
                        <small>No verified usage reports</small>
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
                          "Rules saved. Windows and browser enforcement are not connected.",
                        )
                      }
                      onEnroll={() =>
                        void action(async () => {
                          const r = await familyRequest<{ code: string }>(
                            `children/${child.id}/enrollment`,
                            token,
                            {},
                          );
                          setCode(r.code);
                        }, "Code created. Share it only with the Kids app for this child.")
                      }
                      onRemove={() => {
                        if (
                          confirm(
                            `Remove ${child.name}’s profile, tokens and requests?`,
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
                  {code && (
                    <section className="home-enrollment">
                      <h3>Open the separate Bluey for Kids app</h3>
                      <p>
                        Enter this one-use code within 10 minutes. It enrolls
                        the Kids app—not Windows enforcement.
                      </p>
                      <code>{code}</code>
                      <button className="home-text" onClick={() => setCode("")}>
                        Hide code
                      </button>
                    </section>
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
                    Use the separate Kids APK and a one-use parent-generated
                    code. Kids credentials cannot change rules or approve their
                    own requests.
                  </p>
                </article>
                <article>
                  <Shield />
                  <h3>3. Manage Windows</h3>
                  <p>
                    Not shipped by this preview: a signed
                    administrator-installed service, offline policy enforcement,
                    managed browser filtering, parent recovery and a standard
                    child account. A fullscreen window alone is not protection.
                  </p>
                </article>
              </div>
              <p>
                Insights will show usage totals and blocked-site events once a
                trusted agent exists. No browsing history, screenshots or
                conversations are collected by this family service. It is not
                yet a Microsoft Family Safety replacement.
              </p>
              <a
                className="home-text"
                href="https://github.com/jedijak14/Bluey/blob/arena/e8d2ea05-bluey/docs/BLUEY_HOME.md"
                target="_blank"
                rel="noreferrer"
              >
                Setup and release limitations <ArrowRight size={15} />
              </a>
            </section>
          )}
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
