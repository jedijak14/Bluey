import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  ArrowLeft,
  ArrowRight,
  Mic,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from "lucide-react";
import { Avatar, FaceScreen } from "./FloatingWidget/Avatar";
import { BlueyClient } from "../lib/client";
import { Microphone } from "../lib/audio";
import {
  pairingEndpoint,
  assertPairingTransport,
  pairingNetworkError,
} from "../lib/pairing";
import { load, save, uid } from "../lib/storage";
import type { FaceState, Mood } from "../lib/types";

const phone = new BlueyClient();
export function Phone() {
  const [paired, setPaired] = useState(false),
    [preview, setPreview] = useState(false),
    [connected, setConnected] = useState(false);
  const [awake, setAwake] = useState(false),
    [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false);
  const [address, setAddress] = useState(() => load("bluey.phone.address", "")),
    [code, setCode] = useState("");
  const [error, setError] = useState(""),
    [pairing, setPairing] = useState(false),
    [options, setOptions] = useState(false);
  const [volume, setVolume] = useState(true),
    [caption, setCaption] = useState(""),
    [draft, setDraft] = useState("");
  const [face, setFace] = useState<FaceState>({
    mood: "resting",
    gazeX: 0,
    gazeY: 0,
    talk: 0,
  });
  const mic = useRef(new Microphone()),
    hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false),
    recordingRef = useRef(false),
    starting = useRef(false),
    alive = useRef(true),
    busyRef = useRef(false);
  const volumeRef = useRef(volume),
    lastTap = useRef(0),
    connectedRef = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null),
    queue = useRef<string[]>([]);
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]),
    response = useRef({ request: "", text: "" });

  function markBusy(value: boolean) {
    busyRef.current = value;
    setBusy(value);
  }
  function stopAudio() {
    audio.current?.pause();
    audio.current = null;
    queue.current = [];
  }
  function resetConnection(message = "") {
    phone.disconnect();
    connectedRef.current = false;
    setConnected(false);
    setPaired(false);
    setPreview(false);
    setOptions(false);
    setAwake(false);
    stopAudio();
    markBusy(false);
    history.current = [];
    response.current = { request: "", text: "" };
    setCaption("");
    setError(message);
  }
  function ask(text: string) {
    const content = text.trim();
    if (!content) {
      setError(
        "No speech detected. Hold Bluey and try again, or type in options.",
      );
      markBusy(false);
      return;
    }
    if (!connectedRef.current) {
      setError("Reconnect to your Windows PC first.");
      markBusy(false);
      return;
    }
    const request = uid();
    history.current = [
      ...history.current.slice(-22),
      { role: "user", content },
    ];
    response.current = { request, text: "" };
    stopAudio();
    markBusy(true);
    setError("");
    setCaption(content);
    setFace((f) => ({ ...f, mood: "thinking", talk: 0 }));
    try {
      phone.send({
        type: "chat",
        request,
        messages: history.current,
        voice: volumeRef.current,
      });
    } catch (e) {
      setError(String(e));
      markBusy(false);
    }
  }
  function stop() {
    stopAudio();
    markBusy(false);
    response.current = { request: "", text: "" };
    if (connectedRef.current) phone.send({ type: "stop" });
    setFace((f) => ({ ...f, mood: "listening", talk: 0 }));
  }
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);
  useEffect(() => {
    alive.current = true;
    const next = () => {
      const wav = queue.current.shift();
      if (!wav) return;
      const a = new Audio(`data:audio/wav;base64,${wav}`);
      audio.current = a;
      a.volume = volumeRef.current ? 1 : 0;
      a.onplay = () => setFace((f) => ({ ...f, mood: "talking", talk: 0.7 }));
      a.onended = () => {
        setFace((f) => ({ ...f, mood: "listening", talk: 0 }));
        next();
      };
      a.onerror = () => {
        audio.current = null;
        setError(
          "This audio response could not be played. The text is still available.",
        );
        next();
      };
      a.play().catch(() =>
        setError("Tap the speaker button to enable audio playback."),
      );
    };
    phone.onStatus = (s) => {
      connectedRef.current = s === "connected";
      setConnected(s === "connected");
      if (s === "connected") setError("");
      if (s === "offline") {
        setError(
          "The live connection to Windows is unavailable. Retrying automatically. Check your PC and network; HTTPS proxies must forward WebSocket connections too.",
        );
        stopAudio();
        markBusy(false);
      }
    };
    phone.onPacket = (p) => {
      if (p.type === "unpaired") {
        resetConnection(
          "Your pairing expired or was disconnected on Windows. Generate a new code.",
        );
        return;
      }
      if (p.type === "stopped") {
        stopAudio();
        markBusy(false);
      }
      if (p.type === "face") {
        const incoming = p.face as FaceState;
        setFace(
          audio.current && !audio.current.paused && !audio.current.ended
            ? { ...incoming, mood: "talking", talk: 0.5 }
            : incoming,
        );
      }
      if (p.type === "caption") setCaption(String(p.text));
      if (p.type === "error") {
        setError(String(p.text));
        markBusy(false);
        setFace((f) => ({ ...f, mood: "listening", talk: 0 }));
      }
      if (p.type === "transcript") ask(String(p.text));
      if (p.type === "token" && p.request === response.current.request)
        response.current.text += String(p.text);
      if (p.type === "done" && p.request === response.current.request) {
        if (response.current.text)
          history.current.push({
            role: "assistant",
            content: response.current.text,
          });
        response.current = { request: "", text: "" };
        markBusy(false);
      }
      if (p.type === "audio") {
        queue.current.push(String(p.audio));
        if (!audio.current || audio.current.ended) next();
      }
    };
    const hidden = () => {
      if (document.hidden) {
        void release(false);
        stopAudio();
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      alive.current = false;
      holding.current = false;
      phone.disconnect();
      stopAudio();
      clearTimeout(hold.current ?? undefined);
      document.removeEventListener("visibilitychange", hidden);
      if (recordingRef.current) {
        recordingRef.current = false;
        void mic.current.stop();
      }
    };
  }, []);
  async function pair() {
    setPairing(true);
    setError("");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 12000);
    try {
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
  async function startHold() {
    if (!awake || starting.current || recordingRef.current || busyRef.current)
      return;
    if (preview) {
      setFace((f) => ({ ...f, mood: "listening" }));
      setCaption("Preview only — pair with Windows for voice.");
      return;
    }
    if (!connectedRef.current) {
      setError("Waiting for your Windows PC to reconnect.");
      return;
    }
    starting.current = true;
    try {
      await mic.current.start((n) => {
        if (alive.current) setFace((f) => ({ ...f, talk: n }));
      });
      if (!holding.current || !alive.current || document.hidden) {
        await mic.current.stop();
        if (alive.current && !document.hidden)
          setError("Microphone ready. Hold Bluey again to speak.");
        return;
      }
      recordingRef.current = true;
      setRecording(true);
      setError("");
      setFace((f) => ({ ...f, mood: "listening" }));
      hold.current = setTimeout(() => void release(), 59000);
    } catch (e) {
      if (alive.current)
        setError(
          `Microphone: ${e instanceof Error ? e.message : String(e)}. You can also type in options.`,
        );
    } finally {
      starting.current = false;
    }
  }
  async function release(sendAudio = true) {
    holding.current = false;
    clearTimeout(hold.current ?? undefined);
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    try {
      const wav = await mic.current.stop();
      if (sendAudio && alive.current && connectedRef.current) {
        markBusy(true);
        phone.send({ type: "transcribe", audio: wav });
        setFace((f) => ({ ...f, mood: "thinking", talk: 0 }));
      }
    } catch (e) {
      if (alive.current) {
        setError(String(e));
        markBusy(false);
      }
    }
  }
  function tap() {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      setAwake((a) => {
        setFace((f) => ({ ...f, mood: a ? "resting" : "listening" }));
        return !a;
      });
      setCaption("");
      lastTap.current = 0;
    } else lastTap.current = now;
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void pair();
              }}
            >
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
            <button className="text-button" onClick={() => setPreview(true)}>
              Play without a PC <ArrowRight size={14} />
            </button>
            <div className="pairing-privacy">
              <ShieldCheck size={14} />
              Trusted private Wi-Fi only. No cloud pairing.
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
          (e.target as HTMLElement).closest(
            "button,input,textarea,select,.phone-options,.phone-caption",
          )
        )
          return;
        if (holding.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        holding.current = true;
        hold.current = setTimeout(() => void startHold(), 350);
      }}
      onPointerUp={() => {
        if (!holding.current) return;
        const wasRecording = recordingRef.current;
        void release();
        if (!wasRecording) tap();
      }}
      onPointerCancel={() => void release(false)}
    >
      <FaceScreen {...face} />
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
          {busy && (
            <button title="Stop response" onClick={stop}>
              <Square size={18} />
            </button>
          )}
          <button
            title="Toggle voice audio"
            onClick={() => {
              if (audio.current?.paused && !audio.current.ended && volume) {
                void audio.current
                  .play()
                  .catch(() => setError("Audio could not start."));
                return;
              }
              setVolume((v) => !v);
              if (audio.current) audio.current.volume = volume ? 0 : 1;
            }}
          >
            {volume ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button
            title="Companion options"
            onClick={() => setOptions(!options)}
          >
            <Settings2 size={20} />
          </button>
        </div>
      </div>
      {caption && <div className="phone-caption">{caption}</div>}
      <div className="phone-instruction">
        {recording ? (
          <>
            <Mic size={16} />
            Listening — release to ask
          </>
        ) : busy ? (
          "Thinking with your Windows PC…"
        ) : awake ? (
          "Hold to ask. Double tap to rest."
        ) : (
          "Double tap to wake me up."
        )}
      </div>
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
          <p>
            {preview
              ? "Try a little personality."
              : "Speak to me, or type a little thought."}
          </p>
          {preview ? (
            <select
              aria-label="Expression"
              value={face.mood}
              onChange={(e) =>
                setFace((f) => ({ ...f, mood: e.target.value as Mood }))
              }
            >
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!busyRef.current) {
                  ask(draft);
                  setDraft("");
                  setOptions(false);
                  setAwake(true);
                }
              }}
            >
              <label>
                Ask Bluey
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={4000}
                  rows={2}
                  placeholder="What’s on your mind?"
                  required
                />
              </label>
              <button
                className="primary-button"
                disabled={!connected || busy || !draft.trim()}
              >
                <Send size={14} />
                Send to my PC
              </button>
              <label className="phone-voice-choice">
                <input
                  type="checkbox"
                  checked={volume}
                  onChange={(e) => {
                    setVolume(e.target.checked);
                    if (audio.current)
                      audio.current.volume = e.target.checked ? 1 : 0;
                  }}
                />
                Speak replies (requires Piper on PC)
              </label>
            </form>
          )}
          <button
            className="outline-button"
            onClick={() => {
              void release(false);
              if (busyRef.current) stop();
              resetConnection();
            }}
          >
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
