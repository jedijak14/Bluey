import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  ArrowLeft,
  ArrowRight,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from "lucide-react";
import { ListeningEdge } from "./ListeningEdge";
import { QuietSessionPanel } from "./QuietSessionPanel";
import { useQuietSession } from "../hooks/useQuietSession";
import { ResponseCard, type CompanionResponse } from "./ResponseCard";
import { EXPRESSION_PRESETS, liveExpression } from "../lib/expressions";
import { Avatar, FaceScreen } from "./FloatingWidget/Avatar";
import { bluetooth } from "../lib/bluetooth";
import { useBluetoothDiscovery } from "../hooks/useBluetoothDiscovery";
import { selectPairedDevice } from "../lib/bluetoothDiscovery";
import { BlueyClient } from "../lib/client";
import { DeviceSpeech } from "../lib/deviceSpeech";
import {
  pairingEndpoint,
  assertPairingTransport,
  pairingNetworkError,
} from "../lib/pairing";
import { load, save } from "../lib/storage";
import type { FaceState, Mood } from "../lib/types";
const phone = new BlueyClient();
const nativeSpeech = Capacitor.getPlatform() === "android";
export function Phone() {
  const [transport, setTransport] = useState<"wifi" | "bluetooth">("wifi");
  const [bluetoothAddress, setBluetoothAddress] = useState("");
  const [paired, setPaired] = useState(false),
    [preview, setPreview] = useState(false),
    [connected, setConnected] = useState(false);
  const [address, setAddress] = useState(() => load("bluey.phone.address", "")),
    [code, setCode] = useState("");
  const [error, setError] = useState(""),
    [pairing, setPairing] = useState(false),
    [options, setOptions] = useState(false);
  const discovery = useBluetoothDiscovery(
    nativeSpeech && transport === "bluetooth" && !paired && !preview,
  );
  useEffect(() => {
    setBluetoothAddress((previous) =>
      selectPairedDevice(discovery.devices, previous),
    );
  }, [discovery.devices]);
  const [caption, setCaption] = useState(""),
    [draft, setDraft] = useState("");
  const [report, setReport] = useState<CompanionResponse | null>(null),
    [reportOpen, setReportOpen] = useState(false);
  const [face, setFace] = useState<FaceState>({
    mood: "resting",
    gazeX: 0,
    gazeY: 0,
    talk: 0,
  });
  const alive = useRef(true),
    lastTap = useRef(0),
    holding = useRef(false),
    held = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const session = useQuietSession(phone, nativeSpeech, connected);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  function resetConnection(message = "") {
    session.cancel();
    phone.disconnect();
    setConnected(false);
    setPaired(false);
    setPreview(false);
    setOptions(false);
    setCaption("");
    setReport(null);
    setReportOpen(false);
    setError(message);
  }
  useEffect(() => {
    alive.current = true;
    if (nativeSpeech) void DeviceSpeech.stopSpeaking().catch(() => {});
    phone.onStatus = (status) => {
      setConnected(status === "connected");
      if (status === "connected") setError("");
    };
    phone.onPacket = (p) => {
      if (p.type === "unpaired") {
        resetConnection("Pairing expired. Generate a fresh code on Windows.");
        return;
      }
      if (p.type === "face") setFace({ ...(p.face as FaceState), talk: 0 });
      if (p.type === "gaze")
        setFace((f) => ({ ...f, gazeX: Number(p.x), gazeY: Number(p.y) }));
      if (p.type === "caption") setCaption(String(p.text));
      if (p.type === "response") {
        setCaption(String(p.text));
        setReport(p as unknown as CompanionResponse);
      }
      if (p.type === "error") setError(String(p.text));
      if (p.type === "home") {
        setFace((f) => ({
          ...f,
          mood: f.mood === "sleepy" ? "sleepy" : "listening",
          expression: undefined,
        }));
        setCaption("");
      }
      // Audio packets are intentionally ignored. Bluey never speaks replies.
    };
    return () => {
      alive.current = false;
      clearTimeout(holdTimer.current);
      phone.disconnect();
    };
  }, []);
  useEffect(() => {
    if (session.reply) setCaption(session.reply);
  }, [session.reply]);
  function tap() {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      if (preview)
        setFace((f) => {
          const preset =
            EXPRESSION_PRESETS[
              (EXPRESSION_PRESETS.findIndex((p) => p.id === f.expression) + 1) %
                EXPRESSION_PRESETS.length
            ];
          return { ...f, mood: preset.mood, expression: preset.id };
        });
      else session.toggle();
    } else lastTap.current = now;
  }
  async function pair() {
    setPairing(true);
    setError("");
    const controller = new AbortController(),
      timer = setTimeout(
        () => controller.abort(),
        transport === "bluetooth" ? 40000 : 12000,
      );
    try {
      if (transport === "bluetooth") {
        if (!/^\d{6}$/.test(code))
          throw new Error("Enter the six-digit code from Windows.");
        await bluetooth.connect(bluetoothAddress);
        const data = await bluetooth.request<{ token: string }>(
          { kind: "pair", code, name: "Android Bluetooth" },
          controller.signal,
        );
        if (!alive.current) {
          await bluetooth.disconnect();
          return;
        }
        if (!data.token) throw new Error("Invalid Bluetooth pairing response.");
        phone.connectBluetooth(data.token);
        setPaired(true);
        setCode("");
        setFace((f) => ({ ...f, mood: "listening" }));
        return;
      }
      const endpoint = pairingEndpoint(address);
      assertPairingTransport(
        endpoint,
        location.protocol,
        Capacitor.isNativePlatform(),
      );
      if (!/^\d{6}$/.test(code))
        throw new Error("Enter the six-digit code shown on your Windows PC.");
      const r = await fetch(`${endpoint}/api/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name: Capacitor.isNativePlatform()
            ? "Android companion"
            : "Browser companion",
        }),
        signal: controller.signal,
      });
      const data = await r.json().catch(() => {
        throw new Error(
          "This address is not a Bluey pairing endpoint. Enter your PC’s engine address, not the Vercel website address.",
        );
      });
      if (!r.ok)
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Pairing failed. Generate a new code on Windows.",
        );
      if (typeof data.token !== "string" || !data.token)
        throw new Error("The PC returned an invalid pairing response.");
      if (!alive.current) return;
      save("bluey.phone.address", endpoint);
      phone.connect(endpoint, data.token);
      setPaired(true);
      setCode("");
      setFace((f) => ({ ...f, mood: "listening" }));
    } catch (e) {
      if (transport === "bluetooth") await bluetooth.disconnect();
      setError(
        e instanceof TypeError || controller.signal.aborted
          ? pairingNetworkError(location.protocol, Capacitor.isNativePlatform())
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      clearTimeout(timer);
      setPairing(false);
    }
  }
  if (!paired && !preview)
    return (
      <div className="phone-pairing">
        {!Capacitor.isNativePlatform() && (
          <button
            className="phone-back"
            onClick={() => {
              location.hash = "";
              location.reload();
            }}
          >
            <ArrowLeft size={17} />
            Back to workspace
          </button>
        )}
        <div className="phone-pair-inner">
          <Avatar mood="resting" />
          <div>
            <span className="eyebrow-label">
              YOUR PC. YOUR LITTLE COMPANION.
            </span>
            <h1>Wake me up from your Windows PC.</h1>
            <p>
              Open Bluey on Windows. Keep us on the same Wi-Fi, then enter the
              pairing code from Connected devices.
            </p>
            {!Capacitor.isNativePlatform() &&
              location.protocol === "https:" && (
                <p className="connection-guidance">
                  This hosted page needs your PC’s trusted HTTPS/WSS address and
                  permission for this website’s origin. For ordinary Wi-Fi IP
                  pairing, use the Android APK.{" "}
                  <a
                    href="/pairing-guide.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Connection guide
                  </a>
                </p>
              )}
            {nativeSpeech && (
              <div className="bluetooth-choice">
                <label>
                  Connection
                  <select
                    aria-label="Connection transport"
                    value={transport}
                    disabled={pairing}
                    onChange={(e) =>
                      setTransport(e.target.value as "wifi" | "bluetooth")
                    }
                  >
                    <option value="wifi">Wi-Fi</option>
                    <option value="bluetooth">
                      Bluetooth · paired Windows PC
                    </option>
                  </select>
                </label>
                {transport === "bluetooth" && (
                  <>
                    <p>
                      Allow Nearby devices to find and connect to your paired
                      PC. Devices appear automatically after pairing in Android
                      Settings, including when you return to Bluey. No location
                      or contacts access is needed. In Bluey on Windows, enable
                      the incoming Bluetooth bridge under Connected devices.
                      Keep both apps open.
                    </p>
                    <button
                      type="button"
                      className="outline-button"
                      disabled={discovery.busy || pairing}
                      onClick={() => void discovery.refresh()}
                    >
                      {discovery.busy
                        ? "Finding paired devices…"
                        : "Refresh / allow Nearby devices"}
                    </button>
                    <p role="status">
                      {discovery.busy
                        ? "Checking paired devices…"
                        : discovery.devices.length
                          ? "Paired devices found. Select your PC and use its Bluey code to authorize sharing."
                          : "No paired devices found. Pair your Windows PC in Android Settings, then return here."}
                    </p>
                    {discovery.error && <p role="alert">{discovery.error}</p>}
                    <label>
                      Paired device
                      <select
                        aria-label="Bluetooth PC"
                        value={bluetoothAddress}
                        disabled={pairing || discovery.busy}
                        onChange={(e) => setBluetoothAddress(e.target.value)}
                      >
                        <option value="">Choose your Windows PC</option>
                        {discovery.devices.map((d) => (
                          <option key={d.address} value={d.address}>
                            {d.name || d.address}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void pair();
              }}
            >
              {transport === "wifi" && (
                <label>
                  PC address
                  <input
                    placeholder={
                      location.protocol === "https:" &&
                      !Capacitor.isNativePlatform()
                        ? "https://your-pc.private-network"
                        : "192.168.1.10:8765"
                    }
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>
              )}
              <label>
                Pairing code
                <input
                  placeholder="000000"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </label>
              <button className="primary-button" disabled={pairing}>
                <Wifi size={16} />
                {pairing ? "Looking for your PC…" : "Pair with Windows"}
                <ArrowRight size={16} />
              </button>
            </form>
            <p role="status">
              {pairing
                ? "Checking your code with Windows…"
                : "Enter a fresh code from Windows → Connected devices. Codes last two minutes and work once."}
            </p>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button
              className="text-button"
              onClick={() => {
                setFace((f) => ({
                  ...f,
                  mood: "listening",
                  expression: "excited",
                }));
                setPreview(true);
              }}
            >
              Play without a PC <ArrowRight size={14} />
            </button>
            <div className="pairing-privacy">
              <ShieldCheck size={14} />
              Private Wi-Fi or OS-paired Bluetooth. No cloud pairing.
            </div>
          </div>
        </div>
      </div>
    );
  return (
    <div
      className="phone-face"
      onPointerDown={(e) => {
        if (
          !e.isPrimary ||
          (e.target as HTMLElement).closest(
            "button,input,textarea,select,.phone-options,.phone-caption,.response-card,.quiet-session-panel",
          )
        )
          return;
        if (holding.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        holding.current = true;
        held.current = false;
        holdTimer.current = setTimeout(() => {
          held.current = true;
          if (!preview) sessionRef.current.hold();
        }, 350);
      }}
      onPointerUp={() => {
        if (!holding.current) return;
        holding.current = false;
        clearTimeout(holdTimer.current);
        if (held.current) session.release();
        else tap();
      }}
      onPointerCancel={() => {
        holding.current = false;
        clearTimeout(holdTimer.current);
        session.release(true);
      }}
    >
      <ListeningEdge active={session.listening} />
      <FaceScreen
        {...face}
        expression={
          preview ? face.expression : liveExpression(face.mood, face.expression)
        }
      />
      {reportOpen && report && (
        <div className="phone-report">
          <ResponseCard
            response={report}
            onClose={() => setReportOpen(false)}
          />
        </div>
      )}
      <div className="phone-top">
        <span className="phone-connection">
          <span className={`status-dot ${connected ? "green" : ""}`} />
          {preview
            ? "Expression playground"
            : connected
              ? "Connected to Windows"
              : "Reconnecting to Windows…"}
        </span>
        <div>
          {report && (
            <button
              title="Read full response"
              onClick={() => setReportOpen(true)}
            >
              Read notes
            </button>
          )}
          {session.busy && (
            <button
              title="Stop response"
              onClick={() => {
                phone.send({ type: "stop" });
                session.cancel();
              }}
            >
              <Square size={18} />
            </button>
          )}
          <button
            title={session.chirps ? "Mute reply chirps" : "Enable reply chirps"}
            aria-pressed={session.chirps}
            onClick={() => session.setChirps(!session.chirps)}
          >
            {session.chirps ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button
            title="Companion options"
            onClick={() => setOptions(!options)}
          >
            <Settings2 size={20} />
          </button>
        </div>
      </div>
      {caption && (
        <div className="phone-caption speech-bubble" aria-live="polite">
          {caption}
        </div>
      )}
      <div className="phone-instruction">
        {preview
          ? "Double tap to change expression."
          : session.transitioning
            ? "Preparing microphone…"
            : session.asking
              ? "Release to ask"
              : session.busy
                ? "Thinking quietly…"
                : session.active
                  ? "Keeping context. Hold to ask. Double tap to end."
                  : "Parked bottom-center · double tap to start a session."}
      </div>
      <QuietSessionPanel session={session} client={phone} phone />
      {options && (
        <div className="phone-options">
          <button
            title="Close options"
            className="modal-close icon-button"
            onClick={() => setOptions(false)}
          >
            <X size={18} />
          </button>
          <h2>Hey, you.</h2>
          <p>No voice out. A little chirp, a thoughtful answer.</p>
          {preview ? (
            <select
              aria-label="Expression"
              value={face.expression || face.mood}
              onChange={(e) => {
                const preset = EXPRESSION_PRESETS.find(
                  (p) => p.id === e.target.value,
                );
                setFace((f) => ({
                  ...f,
                  mood: preset?.mood || (e.target.value as Mood),
                  expression: preset?.id,
                }));
              }}
            >
              <optgroup label="New expressions">
                {EXPRESSION_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
              {[
                "listening",
                "thinking",
                "talking",
                "pointing",
                "happy",
                "sleepy",
                "resting",
              ].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          ) : (
            <>
              <p className="phone-device-voice">
                Double-tap starts or ends a quiet listening session. Keep the
                phone app in the foreground. Android may restart recognition
                between utterances; transcription is not guaranteed
                word-for-word.
              </p>
              <button
                className="outline-button"
                onClick={() => {
                  setOptions(false);
                  session.toggle();
                }}
              >
                {session.active ? "End quiet session" : "Start quiet session"}
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  session.ask(draft);
                  setDraft("");
                  setOptions(false);
                }}
              >
                <label>
                  Ask Bluey
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={4000}
                    rows={2}
                    required
                    placeholder="What’s on your mind?"
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={!connected || session.busy || !draft.trim()}
                >
                  <Send size={14} />
                  Send to my PC
                </button>
              </form>
            </>
          )}
          <button className="outline-button" onClick={() => resetConnection()}>
            Back to pairing
          </button>
        </div>
      )}
      {error && (
        <button className="phone-error" onClick={() => setError("")}>
          {error}
          <X size={14} />
        </button>
      )}
    </div>
  );
}
