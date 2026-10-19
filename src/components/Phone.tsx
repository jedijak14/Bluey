import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Mic,
  Settings2,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from "lucide-react";
import { Avatar, FaceScreen } from "./FloatingWidget/Avatar";
import { BlueyClient } from "../lib/client";
import { Microphone } from "../lib/audio";
import type { FaceState, Mood } from "../lib/types";
const phone = new BlueyClient();
export function Phone() {
  const [paired, setPaired] = useState(false);
  const [preview, setPreview] = useState(false);
  const [connected, setConnected] = useState(false);
  const [awake, setAwake] = useState(false);
  const [recording, setRecording] = useState(false);
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pairing, setPairing] = useState(false);
  const [options, setOptions] = useState(false);
  const [volume, setVolume] = useState(true);
  const [caption, setCaption] = useState("");
  const [face, setFace] = useState<FaceState>({
    mood: "resting",
    gazeX: 0,
    gazeY: 0,
    talk: 0,
  });
  const mic = useRef(new Microphone());
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const recordingRef = useRef(false);
  const volumeRef = useRef(volume);
  const alive = useRef(true);
  const lastTap = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<string[]>([]);
  const token = useRef("");
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
      setFace((f) => ({ ...f, mood: "talking", talk: 0.7 }));
      a.onended = () => {
        setFace((f) => ({ ...f, mood: "listening", talk: 0 }));
        next();
      };
      a.play().catch(() =>
        setError("Tap the speaker button to enable audio playback."),
      );
    };
    phone.onStatus = (s) => setConnected(s === "connected");
    phone.onPacket = (p) => {
      if (p.type === "stopped") {
        audio.current?.pause();
        queue.current = [];
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
      if (p.type === "error") setError(String(p.text));
      if (p.type === "transcript") {
        setCaption(String(p.text));
        phone.send({
          type: "chat",
          request: crypto.randomUUID(),
          messages: [{ role: "user", content: String(p.text) }],
          voice: true,
        });
      }
      if (p.type === "audio") {
        queue.current.push(String(p.audio));
        if (!audio.current || audio.current.ended) next();
      }
    };
    return () => {
      alive.current = false;
      phone.disconnect();
      audio.current?.pause();
      clearTimeout(hold.current ?? undefined);
      if (recordingRef.current) void mic.current.stop();
    };
  }, []);
  async function pair() {
    setPairing(true);
    setError("");
    try {
      let endpoint = address.trim().replace(/\/$/, "");
      if (!/^https?:\/\//.test(endpoint)) endpoint = `http://${endpoint}`;
      const url = new URL(endpoint);
      if (!url.port) url.port = "8765";
      const r = await fetch(`${url.origin}/api/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name: "Android companion" }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? "Pairing failed");
      token.current = data.token;
      phone.connect(url.origin, data.token);
      setPaired(true);
      setFace((f) => ({ ...f, mood: "listening" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPairing(false);
    }
  }
  async function startHold() {
    if (!awake) return;
    if (preview) {
      setFace((f) => ({ ...f, mood: "listening" }));
      setCaption("Preview only — pair with Windows for voice.");
      return;
    }
    if (!connected) return;
    try {
      await mic.current.start((n) => setFace((f) => ({ ...f, talk: n })));
      if (!holding.current || !alive.current) {
        await mic.current.stop();
        return;
      }
      recordingRef.current = true;
      setRecording(true);
      setFace((f) => ({ ...f, mood: "listening" }));
      hold.current = setTimeout(() => void release(), 59000);
    } catch (e) {
      setError(`Microphone: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function release() {
    holding.current = false;
    clearTimeout(hold.current ?? undefined);
    if (recordingRef.current) {
      recordingRef.current = false;
      setRecording(false);
      try {
        const wav = await mic.current.stop();
        phone.send({ type: "transcribe", audio: wav });
        setFace((f) => ({ ...f, mood: "thinking" }));
      } catch (e) {
        setError(String(e));
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
    }
    lastTap.current = now;
  }
  if (!paired && !preview)
    return (
      <div className="phone-pairing">
        <button
          className="phone-back"
          onClick={() => {
            location.hash = "";
            location.reload();
          }}
        >
          <ArrowLeft size={17} />
          Workspace preview
        </button>
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void pair();
              }}
            >
              <label>
                PC address
                <input
                  placeholder="192.168.1.10:8765"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                  autoCapitalize="none"
                />
              </label>
              <label>
                Pairing code
                <input
                  placeholder="000000"
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
            "button,input,select,.phone-options",
          )
        )
          return;
        holding.current = true;
        hold.current = setTimeout(() => void startHold(), 350);
      }}
      onPointerUp={() => {
        if (!holding.current) return;
        const wasRecording = recordingRef.current;
        void release();
        if (!wasRecording) tap();
      }}
      onPointerCancel={() => void release()}
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
          <button
            title="Toggle voice audio"
            onClick={() => {
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
              : "Everything starts on your PC."}
          </p>
          {preview && (
            <select
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
          )}
          <button
            className="outline-button"
            onClick={() => {
              phone.disconnect();
              setPaired(false);
              setPreview(false);
              setOptions(false);
              setAwake(false);
            }}
          >
            Back to pairing
          </button>
        </div>
      )}
      {error && (
        <button className="phone-error" onClick={() => setError("")}>
          {error} <X size={14} />
        </button>
      )}
    </div>
  );
}
