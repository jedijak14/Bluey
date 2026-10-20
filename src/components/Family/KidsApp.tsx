import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { ArrowRight, Clock3, Heart, Shield } from "lucide-react";
import { GuardianStatus } from "./GuardianStatus";
import { SafetyMessage } from "./SafetyMessage";
import type { SafetyAlert } from "../../lib/family";
import { Avatar } from "../FloatingWidget/Avatar";
import {
  FamilyError,
  FamilyVault,
  familyRequest,
  type ChildProfile,
  type ExtraRequest,
} from "../../lib/family";
export function KidsApp() {
  const [token, setToken] = useState(""),
    [code, setCode] = useState(""),
    [profile, setProfile] = useState<
      (ChildProfile & { requests: ExtraRequest[] }) | null
    >(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [minutes, setMinutes] = useState(15),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState(false);
  const [safety, setSafety] = useState<SafetyAlert | null>(null);
  const [safetyPreview, setSafetyPreview] = useState(false);
  const seenAlerts = useRef(new Set<string>());
  const session = useRef({ token: "", generation: 0 });
  session.current.token = token;
  const dialog = useRef<HTMLDialogElement>(null),
    native = Capacitor.isNativePlatform() || Boolean(window.blueyFamily);
  useEffect(() => {
    let alive = true;
    const generation = session.current.generation;
    if (native)
      void FamilyVault.read()
        .then((r) => {
          if (alive && generation === session.current.generation)
            setToken(r.token);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  async function forget() {
    session.current.generation++;
    session.current.token = "";
    setPreview(false);
    setSafety(null);
    seenAlerts.current.clear();
    setToken("");
    setProfile(null);
    if (native) await FamilyVault.clear().catch(() => {});
  }
  async function refresh() {
    try {
      const result = await familyRequest<
        ChildProfile & { requests: ExtraRequest[] }
      >("kid", token);
      if (session.current.token === token) {
        setProfile(result);
        const latest = result.alerts?.find(
          (a) => !seenAlerts.current.has(a.id),
        );
        if (latest) {
          seenAlerts.current.add(latest.id);
          setSafety(latest);
          setSafetyPreview(false);
        }
      }
    } catch (e) {
      if (session.current.token !== token) return;
      setMessage(String(e));
      if (e instanceof FamilyError && e.status === 401) void forget();
    }
  }
  useEffect(() => {
    if (!token) return;
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, [token]);
  useEffect(() => {
    if (preview) dialog.current?.showModal();
    else dialog.current?.close();
  }, [preview]);
  async function enroll() {
    session.current.generation++;
    setBusy(true);
    setMessage("");
    try {
      const r = await familyRequest<{ token: string }>("enroll", "", { code });
      if (native) await FamilyVault.write({ token: r.token });
      setToken(r.token);
      setCode("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function request() {
    setBusy(true);
    setMessage("");
    try {
      await familyRequest("kid/requests", token, { minutes, reason });
      setReason("");
      setPreview(false);
      await refresh();
      setMessage("Request sent. Your parent can review it in Bluey Home.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="bluey-kids">
      <header>
        <a className="home-brand" href="#kids">
          <img src="./bluey-kids-logo.png" alt="" />
          bluey<span>for kids</span>
        </a>
        <span>
          <Shield size={15} />
          FOUNDATION PREVIEW
        </span>
      </header>
      <section className="kids-welcome">
        <Avatar mood="happy" gaze={{ x: 0, y: 0 }} />
        <span className="home-eyebrow">YOUR LITTLE DIGITAL SIDEKICK</span>
        <h1>
          {profile
            ? `Hey, ${profile.name}.`
            : "A little company. Just for you."}
        </h1>
        <p>
          {profile
            ? "A little play, a little learning, and room for everything else."
            : "Ask your parent to set up your space in Bluey Home."}
        </p>
      </section>
      {window.blueyFamily && <GuardianStatus />}
      <div className="kids-card">
        <p className="home-warning">
          <Shield size={20} />
          <span>
            Not protected: this app does not enforce Windows limits, filter
            websites, or lock your computer.
          </span>
        </p>
        {!token ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enroll();
            }}
          >
            <h2>Let’s get you connected.</h2>
            <label>
              Code from your parent
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
                minLength={12}
                maxLength={100}
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </label>
            <button className="home-primary" disabled={busy}>
              Connect my space <ArrowRight size={16} />
            </button>
            <p className="home-fine">
              Use the one-use code from Bluey Home, never a parent password. A
              remote family service must be connected first.
            </p>
          </form>
        ) : profile ? (
          <>
            <div className="kids-allowance">
              <Clock3 />
              <div>
                <span>Configured daily allowance</span>
                <strong>{profile.policy.daily_minutes} minutes</strong>
                <small>
                  {profile.extra_minutes_today} extra minutes approved today ·
                  no verified usage data
                </small>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void request();
              }}
            >
              <h2>A little more time?</h2>
              <label>
                Extra minutes
                <select
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                >
                  {[15, 30, 45, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </label>
              <label>
                A note for your parent (optional)
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={240}
                  rows={3}
                />
              </label>
              <button
                className="home-primary"
                disabled={
                  busy || profile.requests.some((r) => r.status === "pending")
                }
              >
                Ask my parent <Heart size={16} />
              </button>
            </form>
            <div className="kids-requests">
              {profile.requests.map((r) => (
                <p key={r.id}>
                  {r.minutes} minutes · <strong>{r.status}</strong>
                </p>
              ))}
            </div>
            <button className="home-text" onClick={() => setPreview(true)}>
              Preview the time-up screen (not a computer lock)
            </button>
            <button
              className="home-text"
              disabled={busy}
              onClick={() => void forget()}
            >
              Forget this app’s enrollment
            </button>
          </>
        ) : (
          <p>Opening your space…</p>
        )}
        {message && (
          <p className="home-message" role="status">
            {message}
          </p>
        )}
      </div>
      <footer>
        Limits become real only with a managed Windows agent. This preview is
        not a safety barrier.
      </footer>
      <button
        className="home-text"
        onClick={() => {
          setSafetyPreview(true);
          setSafety({
            id: "preview",
            kind: "site_blocked",
            domain: "",
            created: Date.now() / 1000,
            seen: null,
          });
        }}
      >
        Preview safety message (not enforcement)
      </button>
      {safety && (
        <SafetyMessage
          alert={safety}
          preview={safetyPreview}
          onClose={() => setSafety(null)}
        />
      )}
      <dialog
        ref={dialog}
        onCancel={() => setPreview(false)}
        className="kids-break"
      >
        <span className="home-eyebrow">
          DESIGN PREVIEW · YOUR COMPUTER IS NOT LOCKED
        </span>
        <Avatar expression="sad" gaze={{ x: 0, y: 0 }} />
        <h2>Time for a little break.</h2>
        <p>
          When a managed device reaches its limit, this is the kind of screen
          you would see. Windows enforcement is not installed by this preview.
        </p>
        <button
          className="home-primary"
          disabled={
            !profile ||
            busy ||
            profile.requests.some((r) => r.status === "pending")
          }
          onClick={() => void request()}
        >
          Request {minutes} more minutes
        </button>
        <button className="home-text" onClick={() => setPreview(false)}>
          Close preview
        </button>
      </dialog>
    </main>
  );
}
