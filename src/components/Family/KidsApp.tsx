import { AgentSummary } from "./AgentSummary";
import { useFamilyPolling } from "../../lib/useFamilyPolling";
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
  const [online, setOnline] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [vaultError, setVaultError] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [clearFailed, setClearFailed] = useState(false);
  const requestId = useRef(0);
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
          if (alive && generation === session.current.generation) {
            setRestoreError("");
            setToken(r.token);
          }
        })
        .catch(() => {
          if (alive && generation === session.current.generation)
            setRestoreError(
              "Saved enrollment could not be read. Retry after unlocking your device’s encrypted storage, or ask your parent for help. A storage error does not mean your enrollment was removed.",
            );
        });
    return () => {
      alive = false;
    };
  }, [restoreAttempt]);
  async function forget() {
    session.current.generation++;
    session.current.token = "";
    requestId.current++;
    setOnline(false);
    setVaultError("");
    setPreview(false);
    setSafety(null);
    seenAlerts.current.clear();
    setToken("");
    setProfile(null);
    if (native) {
      try {
        await FamilyVault.clear();
        setClearFailed(false);
        setRestoreError("");
      } catch {
        setClearFailed(true);
      }
    }
  }
  async function refresh() {
    const request = ++requestId.current;
    try {
      const result = await familyRequest<
        ChildProfile & { requests: ExtraRequest[] }
      >("kid", token);
      if (session.current.token === token && request === requestId.current) {
        setOnline(true);
        setConnectionError("");
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
      if (session.current.token !== token || request !== requestId.current)
        return;
      setOnline(false);
      setConnectionError(e instanceof Error ? e.message : String(e));
      if (e instanceof FamilyError && e.status === 401) void forget();
    }
  }
  useFamilyPolling(refresh, token);
  useEffect(
    () => () => {
      session.current.token = "";
      session.current.generation++;
      requestId.current++;
    },
    [],
  );
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
      if (native) {
        try {
          await FamilyVault.write({ token: r.token });
          setVaultError("");
        } catch {
          setVaultError(
            "Connected for this session only. Encrypted storage could not save enrollment. Retry saving before closing the app; the pairing code has already been used.",
          );
        }
      }
      session.current.token = r.token;
      setToken(r.token);
      setClearFailed(false);
      setRestoreError("");
      setConnectionError("");
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
      if (session.current.token !== token) return;
      setReason("");
      setPreview(false);
      await refresh();
      setMessage("Request sent. Your parent can review it in Bluey Home.");
    } catch (e) {
      if (session.current.token !== token) return;
      if (e instanceof FamilyError && e.status === 401) void forget();
      else if (e instanceof FamilyError && e.status === 409) await refresh();
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
            The Kids app alone does not enforce Windows limits or filter
            websites. Windows Guardian must be installed separately by a parent;
            its reports are not verified protection.
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
                disabled={busy}
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
                  {profile.extra_minutes_today} extra minutes approved today
                </small>
              </div>
            </div>
            <AgentSummary child={profile} online={online} compact />
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
                  disabled={busy}
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
                  disabled={busy}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={240}
                  rows={3}
                />
              </label>
              <button
                className="home-primary"
                disabled={
                  busy ||
                  !online ||
                  profile.requests.some((r) => r.status === "pending")
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
        {token && !online && (
          <div role="status">
            <p>
              {profile
                ? "Connection interrupted. Showing last received rules; your enrollment is still saved."
                : "Waiting for the family service. You do not need a new code for a temporary outage."}
            </p>
            <button className="home-outline" onClick={() => void refresh()}>
              Retry connection
            </button>
          </div>
        )}
        {restoreError && !token && (
          <div role="alert">
            <p>{restoreError}</p>
            <button
              className="home-outline"
              disabled={busy}
              onClick={() => setRestoreAttempt((n) => n + 1)}
            >
              Retry saved enrollment
            </button>
          </div>
        )}
        {clearFailed && (
          <div role="alert">
            <p>
              The app disconnected, but encrypted enrollment could not be
              removed from this device. Retry before closing the app.
            </p>
            <button
              className="home-outline"
              disabled={busy}
              onClick={() => void forget()}
            >
              Retry removing enrollment
            </button>
          </div>
        )}
        {connectionError && (
          <p className="home-message" role="status">
            {connectionError}
          </p>
        )}
        {vaultError && token && (
          <div role="alert">
            <p>{vaultError}</p>
            <button
              className="home-outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await FamilyVault.write({ token });
                  setVaultError("");
                  setMessage("Enrollment saved securely on this device.");
                } catch {
                  setVaultError(
                    "Encrypted storage is still unavailable. Keep this app open and ask your parent for help.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Retry saving enrollment
            </button>
          </div>
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
            !online ||
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
