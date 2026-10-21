import { useEffect, useRef, useState } from "react";
import {
  FlaskConical,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Copy,
  ExternalLink,
  Heart,
  History,
  Keyboard,
  Maximize2,
  MessageCircle,
  Mic,
  Minus,
  Monitor,
  MoreHorizontal,
  MousePointer2,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useQuietSession } from "./hooks/useQuietSession";
import { QuietSessionPanel } from "./components/QuietSessionPanel";
import { useScreenContext, type ScreenContext } from "./hooks/useScreenContext";
import { PrivacyControls } from "./components/PrivacyControls";
import { ListeningEdge } from "./components/ListeningEdge";
import { Avatar } from "./components/FloatingWidget/Avatar";
import { Playground } from "./components/Playground";
import { CodeWorkspace } from "./components/AppWindow/CodeWorkspace";
import { GemmaPreview } from "./components/GemmaPreview";
import { DesktopHome } from "./components/DesktopHome";
import { DesktopTools } from "./components/DesktopTools";
import {
  ResponseCard,
  AnswerText,
  type CompanionResponse,
} from "./components/ResponseCard";
import { client } from "./lib/client";
import { ConnectedDevices, openPairing } from "./components/ConnectedDevices";
import { connectionEndpoint } from "./lib/pairing";
import { Microphone } from "./lib/audio";
import { load, save, uid } from "./lib/storage";
import type { Conversation, FaceState, Packet, Settings } from "./lib/types";

const defaults: Settings = {
  endpoint: "",
  token: "",
  provider: "ollama",
  model: "llama3.2",
  modelUrl: "http://127.0.0.1:11434",
  voice: false,
  trail: "comet",
  cursorSize: 72,
  glow: true,
};
type ModelInfo = {
  provider: Settings["provider"];
  model: string;
  base_url: string;
  setup_complete?: boolean;
  key_configured: boolean;
  key_storage: string;
  warning?: string;
};
const initialFace: FaceState = {
  mood: "listening",
  gazeX: 0,
  gazeY: 0,
  talk: 0,
};
type Page = "gemma" | "chat" | "companion" | "devices" | "tools";
const quickActions = [
  {
    icon: Monitor,
    title: "A little help on screen",
    description: "Point me in the right direction",
    prompt:
      "Help me understand what is on my screen. Ask permission before reading it.",
    color: "blue",
  },
  {
    icon: Code2,
    title: "Build something together",
    description: "An extra pair of eyes on your code",
    prompt: "Let’s build something together. Help me plan a small project.",
    color: "purple",
  },
  {
    icon: Sparkles,
    title: "Make room for ideas",
    description: "Untangle a thought, find a spark",
    prompt: "Help me brainstorm. Ask me what I’m working on first.",
    color: "peach",
  },
];

export default function App() {
  const [page, setPage] = useState<Page>("chat");
  const [mode, setMode] = useState<"chat" | "code">("chat");
  const [settings, setSettings] = useState<Settings>(() => ({
    ...defaults,
    ...load("bluey.settings", {}),
    token: "",
  }));
  const modelSyncEpoch = useRef(0);
  const configuring = useRef(false);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [setupComplete, setSetupComplete] = useState(() =>
    load("bluey.setup-complete.v1", false),
  );
  const rememberSetup = () => {
    save("bluey.setup-complete.v1", true);
    setSetupComplete(true);
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [researchMode, setResearchMode] = useState(false);
  const [report, setReport] = useState<CompanionResponse | null>(null);
  const micAction = useRef<() => void>(() => {});
  const [help, setHelp] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    load("bluey.chats", []),
  );
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [status, setStatus] = useState<"offline" | "connecting" | "connected">(
    "offline",
  );
  const screenContext = useScreenContext(status === "connected");
  const quiet = useQuietSession(
    client,
    false,
    status === "connected",
    settings.microphoneId,
  );
  useEffect(() => {
    if (quiet.consentOpen || quiet.drafts.length)
      window.bluey?.window("workspace");
  }, [quiet.consentOpen, quiet.drafts.length]);
  const [face, setFace] = useState(initialFace);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [logs, setLogs] = useState<string[]>([
    "Bluey workspace ready. Connect the local engine to receive live logs.",
  ]);
  const [pending, setPending] = useState<{
    id: string;
    action: Record<string, unknown>;
  } | null>(null);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const mic = useRef(new Microphone());
  const micBusy = useRef(false);
  const flight = useRef<{
    conversation: string;
    message: string;
    request: string;
  } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioQueue = useRef<string[]>([]);
  const voiceRef = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [sidebar, setSidebar] = useState(
    () => !window.matchMedia("(max-width: 700px)").matches,
  );
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  function closeSidebar() {
    setSidebar(false);
    sidebarToggle.current?.focus();
  }
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const resized = () => setSidebar(!media.matches);
    media.addEventListener("change", resized);
    resized();
    return () => media.removeEventListener("change", resized);
  }, []);
  const conversation = conversations.find((c) => c.id === active);
  const notify = (text: string) => setNotice(text);
  useEffect(() => {
    voiceRef.current = false;
    save("bluey.settings", { ...settings, token: undefined });
  }, [settings]);
  useEffect(() => save("bluey.chats", conversations), [conversations]);
  useEffect(() => {
    scroll.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages, busy]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 6500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    const playNext = () => {
      const next = audioQueue.current.shift();
      if (!next) {
        setFace((f) => ({ ...f, mood: "listening", talk: 0 }));
        return;
      }
      const a = new Audio(`data:audio/wav;base64,${next}`);
      audio.current = a;
      setFace((f) => ({ ...f, mood: "talking", talk: 0.5 }));
      a.onended = playNext;
      a.onerror = playNext;
      a.play().catch(() => {
        audioQueue.current = [];
        setNotice("Your browser blocked audio. Enable voice and try again.");
      });
    };
    client.onStatus = (state) => {
      if (state === "connected" && !configuring.current) {
        const epoch = modelSyncEpoch.current;
        void client
          .request<ModelInfo>("/api/config")
          .then((info) => {
            if (epoch !== modelSyncEpoch.current) return;
            if (info.provider !== "ollama" && info.provider !== "openai")
              return;
            setModelInfo(info);
            if (info.setup_complete) rememberSetup();
            setSettings((s) => ({
              ...s,
              provider: info.provider,
              model: info.model,
              modelUrl: info.base_url,
            }));
          })
          .catch(() => {});
      }
      setStatus(state);
      if (state === "offline") window.bluey?.window("resume-overlay");
    };
    client.onPacket = (p: Packet) => {
      if (p.type === "approval_resolved" || p.type === "stopped")
        window.bluey?.window("resume-overlay");
      if (
        p.type === "response" &&
        flight.current &&
        flight.current.request === p.request
      ) {
        const response = p as unknown as CompanionResponse;
        const targetMessage = flight.current.message;
        setConversations((cs) =>
          cs.map((c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === targetMessage ? { ...m, sources: response.sources } : m,
            ),
          })),
        );
        if (response.format === "research") setReport(response);
      }
      if (p.type === "face") {
        const incoming = p.face as FaceState;
        setFace(
          audio.current && !audio.current.paused && !audio.current.ended
            ? { ...incoming, mood: "talking", talk: 0.5 }
            : incoming,
        );
      }
      if (p.type === "log")
        setLogs((l) => [
          ...l.slice(-199),
          `${new Date().toLocaleTimeString()}  ${String(p.text)}`,
        ]);
      if (p.type === "token" && flight.current?.request === p.request) {
        const f = flight.current!;
        setConversations((cs) =>
          cs.map((c) =>
            c.id === f.conversation
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === f.message
                      ? { ...m, text: m.text + String(p.text) }
                      : m,
                  ),
                }
              : c,
          ),
        );
      }
      if (p.type === "done" && flight.current?.request === p.request) {
        const f = flight.current!;
        setConversations((cs) =>
          cs.map((c) =>
            c.id === f.conversation
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === f.message && !m.text
                      ? { ...m, text: "No text response was returned." }
                      : m,
                  ),
                }
              : c,
          ),
        );
        setBusy(false);
        flight.current = null;
      }
      if (p.type === "error") {
        const f = flight.current;
        if (f && p.request === f.request)
          setConversations((cs) =>
            cs.map((c) =>
              c.id === f.conversation
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === f.message && !m.text
                        ? {
                            ...m,
                            text: `I couldn’t complete that request. ${String(p.text)}`,
                          }
                        : m,
                    ),
                  }
                : c,
            ),
          );
        setNotice(String(p.text));
        setLogs((l) => [...l.slice(-199), `ERROR  ${p.text}`]);
        setBusy(false);
        setFace(initialFace);
      }
      if (p.type === "transcript") {
        setDraft(String(p.text));
        setFace(initialFace);
        setNotice("Transcription ready. Review it, then send.");
      }
      if (p.type === "approval") {
        setPending({
          id: String(p.id),
          action: p.action as Record<string, unknown>,
        });
        window.bluey?.window("approval");
      }
      if (p.type === "approval_resolved") setPending(null);
      if (p.type === "stopped") {
        audio.current?.pause();
        audioQueue.current = [];
        setBusy(false);
        setPending(null);
      }
      if (p.type === "audio" && voiceRef.current) {
        audioQueue.current.push(String(p.audio));
        if (!audio.current || audio.current.ended || audio.current.paused)
          playNext();
      }
    };
    const offCommand = window.bluey?.onCommand?.((command) => {
      if (command === "microphone") micAction.current();
      if (command === "session") {
        try {
          client.send({ type: "session_toggle" });
        } catch {
          setNotice("Connect to Windows before starting a session.");
        }
      }
    });
    window.bluey?.connection().then((c) => {
      setSettings((s) => ({ ...s, ...c }));
      client.connect(c.endpoint, c.token);
    });
    return () => {
      offCommand?.();
      client.disconnect();
      audio.current?.pause();
      audioQueue.current = [];
    };
  }, []);
  useEffect(() => {
    if (status === "offline" && busy) {
      setBusy(false);
      flight.current = null;
      setNotice(
        "Connection lost. Your conversation is saved locally; reconnect to continue.",
      );
    }
  }, [status, busy]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        setActive(null);
        setDraft("");
        setPage("chat");
      }
      if (e.key === "Escape") {
        if (window.matchMedia("(max-width: 700px)").matches) closeSidebar();
        setSettingsOpen(false);
        setReport(null);
        setHelp(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  const newChat = () => {
    setActive(null);
    setDraft("");
    setPage("chat");
    textarea.current?.focus();
  };
  function send(text = draft) {
    if (!text.trim() || busy) return;
    if (status !== "connected") {
      notify(
        setupComplete
          ? "Bluey is reconnecting automatically. Your draft is kept; try again when the engine is ready."
          : "Connect your local engine in Settings to start chatting. Nothing has been sent.",
      );
      if (!setupComplete) setSettingsOpen(true);
      return;
    }
    const id = active ?? uid(),
      message = uid(),
      request = uid();
    const old = conversation?.messages ?? [];
    const user = { id: uid(), role: "user" as const, text: text.trim() };
    setConversations((cs) => {
      const c = {
        id,
        title: conversation?.title ?? text.trim().slice(0, 42),
        updated: Date.now(),
        messages: [
          ...old,
          user,
          { id: message, role: "assistant" as const, text: "" },
        ],
      };
      return [c, ...cs.filter((x) => x.id !== id)];
    });
    setActive(id);
    setDraft("");
    setBusy(true);
    flight.current = { conversation: id, message, request };
    try {
      client.send({
        type: "chat",
        request,
        messages: [...old, user].map(({ role, text }) => ({
          role,
          content: text,
        })),
        voice: false,
        mode: researchMode ? "research" : "chat",
      });
    } catch (e) {
      setBusy(false);
      notify(String(e));
    }
  }
  async function toggleMic() {
    if (quiet.active) {
      notify("End the quiet session before making a separate recording.");
      return;
    }
    if (micBusy.current) return;
    if (status !== "connected") {
      notify("Connect the local engine before using the microphone.");
      return;
    }
    micBusy.current = true;
    try {
      if (recording) {
        setRecording(false);
        const wav = await mic.current.stop();
        client.send({ type: "transcribe", audio: wav });
        setFace({ ...initialFace, mood: "thinking" });
      } else {
        await mic.current.start(setLevel, settings.microphoneId);
        setRecording(true);
        setFace({ ...initialFace, mood: "listening" });
      }
    } catch (e) {
      notify(`Microphone: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      micBusy.current = false;
    }
  }
  useEffect(() => {
    if (!recording) return;
    const t = setTimeout(() => void toggleMic(), 59000);
    return () => clearTimeout(t);
  }, [recording]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        void mic.current.stop().catch(() => {});
        setRecording(false);
        setLevel(0);
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      void mic.current.stop().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (status !== "connected") {
      void mic.current.stop().catch(() => {});
      setRecording(false);
      setLevel(0);
    }
  }, [status]);
  useEffect(() => {
    if (quiet.active) {
      void mic.current.cancel();
      setRecording(false);
    }
  }, [quiet.active]);
  micAction.current = () => void toggleMic();
  async function connect(s: Settings, key: string) {
    configuring.current = true;
    modelSyncEpoch.current++;
    try {
      // Native engine credentials are supplied by Electron, never typed by the user.
      const native = await window.bluey?.connection();
      const endpoint = connectionEndpoint(
        native?.endpoint ?? s.endpoint,
        location,
        Boolean(window.bluey),
        import.meta.env.DEV,
      );
      const token = native?.token ?? s.token;
      const config = {
        provider: s.provider,
        model: s.model,
        base_url: s.modelUrl,
        api_key: key === "" ? undefined : key,
      };
      const info = await client.request<ModelInfo>(
        "/api/config",
        config,
        "POST",
        undefined,
        { endpoint, token },
      );
      if (
        status !== "connected" ||
        endpoint !== settings.endpoint ||
        token !== settings.token
      )
        client.connect(endpoint, token);
      setModelInfo(info);
      rememberSetup();
      setSettings({ ...s, endpoint, token });
      notify(
        info.key_configured && info.key_storage !== "windows_encrypted"
          ? "Settings saved. This engine keeps keys in memory or environment only; they are not written to disk."
          : "Setup complete. Bluey will reconnect automatically.",
      );
      setSettingsOpen(false);
    } catch (e) {
      // Model failures must not disconnect a healthy engine or erase a working key.
      throw new Error(e instanceof Error ? e.message : String(e));
    } finally {
      configuring.current = false;
      modelSyncEpoch.current++;
    }
  }
  async function findModels(s: Settings, key: string, signal: AbortSignal) {
    const native = await window.bluey?.connection();
    const endpoint = connectionEndpoint(
      native?.endpoint ?? s.endpoint,
      location,
      Boolean(window.bluey),
      import.meta.env.DEV,
    );
    return client.request<{ models: string[] }>(
      "/api/models",
      {
        provider: s.provider,
        base_url: s.modelUrl,
        api_key: key || undefined,
      },
      "POST",
      signal,
      { endpoint, token: native?.token ?? s.token },
    );
  }
  function stop() {
    const f = flight.current;
    if (f)
      setConversations((cs) =>
        cs.map((c) =>
          c.id === f.conversation
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === f.message && !m.text
                    ? { ...m, text: "Response stopped." }
                    : m,
                ),
              }
            : c,
        ),
      );
    flight.current = null;
    audio.current?.pause();
    audioQueue.current = [];
    try {
      client.send({ type: "stop" });
    } catch {}
    setBusy(false);
    setPending(null);
    setFace(initialFace);
  }
  const composer = (
    <div className="composer-area">
      {(!window.bluey ||
        conversation ||
        quiet.active ||
        quiet.consentOpen ||
        quiet.drafts.length > 0 ||
        quiet.error) && <QuietSessionPanel session={quiet} client={client} />}
      <div className={`composer ${recording ? "recording" : ""}`}>
        <textarea
          ref={textarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            recording
              ? "I’m listening… tap the square when you’re done."
              : "Ask anything, or just say hello…"
          }
          aria-label="Message Bluey"
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
        />
        <div className="composer-tools">
          <div className="composer-left">
            <button
              className="icon-button"
              title="Add text or code file"
              onClick={() => document.getElementById("attach")?.click()}
            >
              <Plus size={19} />
            </button>
            <input
              id="attach"
              type="file"
              accept=".txt,.md,.py,.ts,.tsx,.js,.json,.css,.html"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > 100000) {
                    notify("Please choose a text file smaller than 100 KB.");
                    return;
                  }
                  const text = await f.text();
                  setDraft((d) => `${d}\n\nFile: ${f.name}\n${text}`);
                }
                e.target.value = "";
              }}
            />
            <span className="tool-divider" />
            <button
              className="model-picker"
              onClick={() => setSettingsOpen(true)}
            >
              <span className="model-dot" />
              {settings.model}
              <ChevronDown size={12} />
            </button>
          </div>
          <div className="composer-right">
            {recording && (
              <span className="recording-label">
                <i style={{ transform: `scaleY(${0.3 + level})` }} />
                Recording locally
              </span>
            )}
            <button
              title={recording ? "Stop recording" : "Record your voice"}
              className={`icon-button ${recording ? "active" : ""}`}
              onClick={() => void toggleMic()}
            >
              {recording ? <Square size={16} /> : <Mic size={19} />}
            </button>
            <button
              title={busy ? "Stop response" : "Send message"}
              className="send-button"
              disabled={!busy && !draft.trim()}
              onClick={() => (busy ? stop() : send())}
            >
              {busy ? <Square size={17} /> : <ArrowUp size={19} />}
            </button>
          </div>
        </div>
      </div>
      <div className="composer-footnote">
        <ShieldCheck size={12} />
        <span>Your space. Your data. Always in your control.</span>
        <span className="enter-hint">
          Enter to send <span>↵</span>
        </span>
      </div>
    </div>
  );
  const chat = (
    <div className={`chat-content ${conversation ? "has-conversation" : ""}`}>
      {!conversation ? (
        window.bluey ? (
          <DesktopHome
            face={face}
            connected={status === "connected"}
            model={settings.model}
            onSettings={() => setSettingsOpen(true)}
            onDevices={() => setPage("devices")}
            onTools={() => setPage("tools")}
            onListen={() => quiet.toggle()}
            onSleep={() =>
              client.send({
                type: "mood",
                mood: face.mood === "sleepy" ? "listening" : "sleepy",
              })
            }
            onPrompt={(text) => {
              setDraft(text);
              textarea.current?.focus();
            }}
          />
        ) : (
          <>
            <div className="welcome">
              <div className="hello-badge">
                <span />A little company. A lot of possibility.
              </div>
              <div className="hero-character">
                <div className="hero-halo" />
                <span className="little-star star-one">✦</span>
                <span className="little-star star-two">✧</span>
                <Avatar
                  mood={face.mood}
                  onClick={() => {
                    setFace({ ...initialFace, mood: "happy" });
                    setTimeout(() => setFace(initialFace), 2200);
                  }}
                />
                <div className="hello-bubble">
                  hey, you <span>✦</span>
                </div>
                <div className="character-shadow" />
              </div>
              <h1>
                Big ideas. <span>Little companion.</span>
              </h1>
              <p>
                I’m Bluey. Here to think with you, build with you,
                <br className="desktop-break" /> and make your desktop feel a
                little more human.
              </p>
            </div>
            <div className="suggestions">
              {quickActions.map((q) => (
                <button
                  className="suggestion"
                  key={q.title}
                  onClick={() => {
                    setDraft(q.prompt);
                    textarea.current?.focus();
                  }}
                >
                  <span className={`suggestion-icon ${q.color}`}>
                    <q.icon size={19} />
                  </span>
                  <strong>{q.title}</strong>
                  <span>{q.description}</span>
                  <ArrowRight className="suggestion-arrow" size={15} />
                </button>
              ))}
            </div>
            <div className="try-label">
              <span>Or try</span>
              <button
                onClick={() => {
                  setPage("companion");
                }}
              >
                meeting your companion <ArrowRight size={12} />
              </button>
            </div>
          </>
        )
      ) : (
        <div className="messages">
          {conversation.messages.map((m) => (
            <div key={m.id} className={`message ${m.role}`}>
              <div className="message-author">
                {m.role === "assistant" ? (
                  <>
                    <Avatar className="message-avatar" />
                    Bluey
                  </>
                ) : (
                  <>
                    <span className="user-avatar">Y</span>You
                  </>
                )}
              </div>
              <div className="message-text">
                {m.text ? (
                  <AnswerText text={m.text} />
                ) : (
                  <span className="typing">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </div>
              {m.sources && m.sources.length > 0 && (
                <button
                  className="text-button"
                  onClick={() =>
                    setReport({
                      request: m.id,
                      title: conversation.title,
                      text: m.text,
                      format: "research",
                      sources: m.sources ?? [],
                    })
                  }
                >
                  Open research & sources
                </button>
              )}
              {m.role === "assistant" && m.text && (
                <button
                  className="message-copy icon-button"
                  title="Copy response"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(m.text)
                      .then(() => notify("Copied to clipboard."))
                      .catch(() =>
                        notify("Clipboard permission is not available."),
                      )
                  }
                >
                  <Copy size={13} />
                </button>
              )}
            </div>
          ))}
          <div ref={scroll} />
        </div>
      )}
      {composer}
    </div>
  );
  return (
    <div
      className={`app-shell ${window.bluey ? "desktop-app" : ""} ${!sidebar ? "sidebar-hidden" : ""}`}
    >
      <ListeningEdge active={recording || quiet.listening} level={level} />
      {screenContext.sharing && (
        <div className="screen-sharing-banner" role="status">
          Screen visible to Bluey · recent frames, not a saved recording{" "}
          <button onClick={screenContext.stop}>Stop sharing</button>
        </div>
      )}
      {sidebar && (
        <button
          className="sidebar-backdrop"
          aria-label="Dismiss sidebar"
          onClick={closeSidebar}
        />
      )}
      <aside
        id="workspace-sidebar"
        className="sidebar"
        inert={!sidebar}
        onClick={(event) => {
          if (
            window.matchMedia("(max-width: 700px)").matches &&
            (event.target as HTMLElement).closest(
              "nav button, .new-chat, .brand, .recent-item > button:first-child, .sidebar-settings, .sidebar-footer button",
            )
          )
            closeSidebar();
        }}
      >
        <button
          className="icon-button sidebar-close"
          aria-label="Close sidebar"
          onClick={closeSidebar}
        >
          <X size={18} />
        </button>
        <button className="brand" onClick={newChat}>
          <Avatar mood="happy" />
          <span>
            bluey<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="workspace-label">
          {window.bluey ? "WINDOWS COMPANION" : "YOUR LITTLE SIDEKICK"}{" "}
          <span>✦</span>
        </div>
        <button className="new-chat" onClick={newChat}>
          <Plus size={17} />
          New conversation<span>Ctrl N</span>
        </button>
        <nav>
          <button
            className={page === "chat" ? "selected" : ""}
            onClick={() => setPage("chat")}
          >
            <MessageCircle size={17} />
            Conversations
            <span className="nav-count">{conversations.length}</span>
          </button>
          <button
            className={page === "companion" ? "selected" : ""}
            onClick={() => setPage("companion")}
          >
            <Sparkles size={17} />
            My companion
          </button>
          <button
            className={page === "devices" ? "selected" : ""}
            onClick={() => setPage("devices")}
          >
            <Smartphone size={17} />
            Connected devices
          </button>
          <button
            className={page === "tools" ? "selected" : ""}
            onClick={() => setPage("tools")}
          >
            <Zap size={17} />
            Desktop tools
          </button>
          {!window.bluey && (
            <button
              className={page === "gemma" ? "selected" : ""}
              onClick={() => {
                location.hash = "gemma";
              }}
            >
              <FlaskConical size={17} />
              Test AI
            </button>
          )}
          <button
            onClick={() => {
              location.hash = "account";
            }}
          >
            <ShieldCheck size={17} />
            Bluey Account · Home
          </button>
          {!window.bluey && (
            <button
              onClick={() => {
                location.href = "/downloads.html";
              }}
            >
              <ExternalLink size={17} />
              Downloads · Windows & Android
            </button>
          )}
        </nav>
        <div className="recent-title">
          <span>RECENT CONVERSATIONS</span>
          <button
            title="Search conversations"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Search size={14} />
          </button>
        </div>
        {searchOpen && (
          <input
            className="sidebar-search"
            autoFocus
            placeholder="Find a conversation…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        <div className="recent-list">
          {conversations
            .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
            .map((c) => (
              <div
                className={`recent-item ${c.id === active ? "active" : ""}`}
                key={c.id}
              >
                <button
                  onClick={() => {
                    setActive(c.id);
                    setPage("chat");
                  }}
                >
                  <MessageCircle size={14} />
                  <span>{c.title}</span>
                </button>
                <button
                  title="Delete conversation"
                  onClick={() => {
                    setConversations((cs) => cs.filter((x) => x.id !== c.id));
                    if (active === c.id) setActive(null);
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          {conversations.length === 0 && (
            <div className="empty-history">
              <History size={17} />
              <p>
                A fresh start.
                <br />
                Your conversations will live here.
              </p>
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          {!setupComplete && (
            <div className="local-card">
              <span className="local-icon">
                <ShieldCheck size={18} />
              </span>
              <div>
                <strong>A home for your thoughts</strong>
                <span>Local-first. Private by design.</span>
              </div>
              <div className="local-card-detail">
                <span
                  className={`status-dot ${status === "connected" ? "green" : ""}`}
                />
                {status === "connected"
                  ? "Local engine connected"
                  : "Your data stays with you"}
                <ArrowRight size={12} />
              </div>
            </div>
          )}
          <button
            className="sidebar-settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={17} />
            Settings & preferences
            <ChevronRight size={14} />
          </button>
          <div className="sidebar-footer">
            <span className="user-avatar">Y</span>
            <div>
              <strong>Your workspace</strong>
              <span>Make yourself at home</span>
            </div>
            <button
              className="icon-button"
              title="Help & shortcuts"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={17} />
            </button>
          </div>
        </div>
      </aside>
      {report && (
        <div className="response-overlay">
          <ResponseCard
            key={report.request}
            response={report}
            onClose={() => setReport(null)}
          />
        </div>
      )}
      <main className="main-window">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button"
              title="Toggle sidebar"
              ref={sidebarToggle}
              aria-expanded={sidebar}
              aria-controls="workspace-sidebar"
              onClick={() => setSidebar((v) => !v)}
            >
              <PanelLeftClose size={18} />
            </button>
            <span className="breadcrumb-divider" />
            <span>
              {window.bluey ? "Bluey · Windows" : "Personal workspace"}
            </span>
            <ChevronRight size={13} />
            <strong>
              {page === "chat"
                ? mode === "chat"
                  ? "New conversation"
                  : "Code workspace"
                : page === "companion"
                  ? "My companion"
                  : page === "gemma"
                    ? "Gemma 3 preview"
                    : page === "tools"
                      ? "Desktop tools"
                      : "Connected devices"}
            </strong>
          </div>
          <div className="top-actions">
            {!setupComplete && (
              <button
                title="Connection settings"
                className="engine-status"
                onClick={() => setSettingsOpen(true)}
              >
                <span
                  className={`status-dot ${status === "connected" ? "green" : ""}`}
                />
                {status === "connected"
                  ? "Engine online"
                  : status === "connecting"
                    ? "Connecting"
                    : "Local-first"}
                <ShieldCheck size={13} />
              </button>
            )}
            <button
              className="icon-button"
              title="Help & shortcuts"
              onClick={() => setHelp(true)}
            >
              <MoreHorizontal size={20} />
            </button>
            {window.bluey && (
              <div className="window-actions">
                <button
                  title="Minimize"
                  onClick={() => window.bluey?.window("minimize")}
                >
                  <Minus size={14} />
                </button>
                <button
                  title="Maximize"
                  onClick={() => window.bluey?.window("maximize")}
                >
                  <Maximize2 size={12} />
                </button>
                <button
                  title="Close"
                  onClick={() => window.bluey?.window("close")}
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
        </header>
        <div className="subbar">
          <button className="pair-shortcut text-button" onClick={openPairing}>
            <Smartphone size={15} /> Enter pairing code
          </button>
          <div className="mode-switch">
            <button
              className={mode === "chat" && !researchMode ? "active" : ""}
              onClick={() => {
                setMode("chat");
                setResearchMode(false);
                setPage("chat");
              }}
            >
              <MessageCircle size={15} />
              Chat
            </button>
            <button
              className={mode === "code" ? "active" : ""}
              onClick={() => {
                setMode("code");
                setPage("chat");
              }}
            >
              <Code2 size={16} />
              Code
            </button>
            <button
              className={researchMode && page === "chat" ? "active" : ""}
              onClick={() => {
                setResearchMode(true);
                setMode("chat");
                setPage("chat");
              }}
            >
              <Search size={15} />
              Research
            </button>
          </div>
          <div className="subbar-right">
            <span>
              <span className="small-spark">✧</span> A thought partner, not just
              a tool.
            </span>
            <button
              className="outline-button widget-toggle"
              onClick={() => {
                if (window.bluey) window.bluey.window("overlay");
                else {
                  setPage("companion");
                  notify(
                    "Desktop overlay is available in the Windows app. Try the pointer playground here.",
                  );
                }
              }}
            >
              <MousePointer2 size={14} />
              Open companion
              <ExternalLink size={12} />
            </button>
          </div>
        </div>
        {page === "chat" ? (
          mode === "chat" ? (
            chat
          ) : (
            <CodeWorkspace
              chat={chat}
              connected={status === "connected"}
              logs={logs}
              notify={notify}
            />
          )
        ) : page === "companion" ? (
          <Playground
            settings={settings}
            onSettings={(s) => setSettings(s)}
            onMood={(m) => {
              setFace({ ...initialFace, mood: m });
              if (status === "connected")
                client.send({ type: "mood", mood: m });
            }}
          />
        ) : page === "gemma" ? (
          <GemmaPreview />
        ) : page === "tools" ? (
          <DesktopTools
            connected={status === "connected"}
            onConnect={() => setSettingsOpen(true)}
          />
        ) : (
          <ConnectedDevices
            status={status}
            endpoint={settings.endpoint}
            onConnect={() => setSettingsOpen(true)}
          />
        )}
        <footer className="statusbar">
          <span>
            <span
              className={`status-dot ${status === "connected" ? "green" : ""}`}
            />
            {setupComplete
              ? settings.model
              : status === "connected"
                ? "Connected to your engine"
                : "Ready when you are"}
          </span>
          <span>
            <Keyboard size={12} />
            <span className="shortcut-hint">
              Ctrl + Shift + B to summon Bluey
            </span>
            <span className="status-separator" />
            Made for your everyday <Heart size={11} />
          </span>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status">
          <span>
            <Sparkles size={16} />
            {notice}
          </span>
          <button onClick={() => setNotice("")} title="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
      {settingsOpen && (
        <SettingsDialog
          privacy={screenContext}
          settings={settings}
          modelInfo={modelInfo}
          onForgetKey={async () => {
            const info = await client.request<ModelInfo>(
              "/api/config/key",
              undefined,
              "DELETE",
            );
            setModelInfo(info);
            notify(
              "Saved key removed. If you set BLUEY_API_KEY in the host environment, remove it there too to prevent it returning after restart.",
            );
          }}
          status={status}
          onClose={() => setSettingsOpen(false)}
          onConnect={connect}
          onFindModels={findModels}
          onClear={() => {
            setConversations([]);
            setActive(null);
            notify("Local conversation history cleared.");
          }}
        />
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal help-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              onClick={() => setHelp(false)}
              title="Close"
            >
              <X size={19} />
            </button>
            <span className="eyebrow-label">A LITTLE HELLO</span>
            <h2>Make yourself at home.</h2>
            <p>
              Bluey runs beside you, not instead of you. Connect a local Ollama
              model or your own OpenAI-compatible API to get started.
            </p>
            <div className="help-row">
              <Keyboard size={18} />
              <span>Show / hide companion</span>
              <kbd>Ctrl Shift B</kbd>
            </div>
            <div className="help-row">
              <Square size={17} />
              <span>Emergency stop</span>
              <kbd>Ctrl Shift S</kbd>
            </div>
            <div className="help-row">
              <Search size={17} />
              <span>Find a conversation</span>
              <kbd>Ctrl K</kbd>
            </div>
            <div className="help-row">
              <Mic size={17} />
              <span>Android companion</span>
              <span>Hold to talk · double tap to wake</span>
            </div>
            <p className="tiny">
              Global hotkeys require the Windows app. An exclusive-fullscreen
              game may hide overlays. Automation always requires approval on
              your PC.
            </p>
            <button
              className="primary-button"
              onClick={() => {
                setHelp(false);
                setSettingsOpen(true);
              }}
            >
              Set up my engine <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
      {pending && (
        <div className="modal-backdrop">
          <section className="modal">
            <ShieldCheck size={28} />
            <h2>A little permission?</h2>
            <p>
              Bluey wants to perform this one action on your desktop. Review
              every field before allowing it.
            </p>
            <pre className="approval-json">
              {JSON.stringify(pending.action, null, 2)}
            </pre>
            <div className="modal-buttons">
              <button
                className="outline-button"
                onClick={() => {
                  client.send({
                    type: "approve",
                    id: pending.id,
                    allow: false,
                  });
                  setPending(null);
                }}
              >
                Not this time
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  window.bluey?.window("yield");
                  client.send({ type: "approve", id: pending.id, allow: true });
                  setPending(null);
                }}
              >
                Allow once <Check size={16} />
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SettingsDialog({
  privacy,
  settings,
  modelInfo,
  onForgetKey,
  status,
  onClose,
  onConnect,
  onFindModels,
  onClear,
}: {
  privacy: ScreenContext;
  settings: Settings;
  modelInfo: ModelInfo | null;
  onForgetKey: () => Promise<void>;
  status: string;
  onClose: () => void;
  onConnect: (s: Settings, key: string) => Promise<void>;
  onFindModels: (
    s: Settings,
    key: string,
    signal: AbortSignal,
  ) => Promise<{ models: string[] }>;
  onClear: () => void;
}) {
  const [s, updateS] = useState(settings);
  const edited = useRef(false);
  const setS = (next: Settings) => {
    edited.current = true;
    updateS(next);
  };
  useEffect(() => {
    if (!edited.current) updateS(settings);
  }, [settings]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [micNotice, setMicNotice] = useState("");
  const [key, setKey] = useState("");
  const [connectError, setConnectError] = useState("");
  const sameCredential =
    modelInfo?.provider === s.provider &&
    modelInfo?.base_url.replace(/\/$/, "") ===
      s.modelUrl.trim().replace(/\/$/, "");
  const hasSavedKey = sameCredential && modelInfo?.key_configured;

  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("engine");
  const [models, setModels] = useState<string[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [modelError, setModelError] = useState("");
  const [modelNotice, setModelNotice] = useState("");
  const discovery = useRef<AbortController | null>(null);
  async function discover() {
    discovery.current?.abort();
    const controller = new AbortController();
    discovery.current = controller;
    setFinding(true);
    setModelError("");
    try {
      const result = await onFindModels(s, key, controller.signal);
      if (controller.signal.aborted) return;
      setModels(result.models);
      if (!result.models.includes(s.model)) setS({ ...s, model: "" });
    } catch (error) {
      if (!controller.signal.aborted)
        setModelError(error instanceof Error ? error.message : String(error));
    } finally {
      if (!controller.signal.aborted) setFinding(false);
    }
  }
  useEffect(() => {
    discovery.current?.abort();
    setModels(null);
    setFinding(false);
    setModelError("");
    return () => discovery.current?.abort();
  }, [s.provider, s.modelUrl, s.endpoint, s.token, key]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings and preferences"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close icon-button"
          onClick={onClose}
          title="Close settings"
        >
          <X size={19} />
        </button>
        <span className="eyebrow-label">MAKE IT YOURS</span>
        <h2>Settings & preferences</h2>
        <p>A familiar face. An engine of your choosing.</p>
        <div className="settings-tabs">
          <button
            className={tab === "engine" ? "active" : ""}
            onClick={() => setTab("engine")}
          >
            <Zap size={15} />
            Model settings
          </button>
          <button
            className={tab === "privacy" ? "active" : ""}
            onClick={() => setTab("privacy")}
          >
            <ShieldCheck size={15} />
            Privacy
          </button>
        </div>
        {tab === "engine" ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setConnectError("");
              try {
                await onConnect(s, key);
              } catch (error) {
                setConnectError(
                  error instanceof Error ? error.message : String(error),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="connection-guidance">
              {window.bluey
                ? "Your Windows engine address and token are supplied automatically. Local Ollama needs no API key. Ollama Cloud uses its own provider key. "
                : "This web workspace needs a trusted HTTPS connection to your Windows engine for desktop actions. The engine token is not an Ollama API key. "}
              <a href="/pairing-guide.html" target="_blank" rel="noreferrer">
                Connection guide
              </a>
            </p>
            {!window.bluey && (
              <div className="field-row">
                <label>
                  Backend address
                  <input
                    value={s.endpoint}
                    onChange={(e) => setS({ ...s, endpoint: e.target.value })}
                    placeholder="https://your-pc.private-network"
                  />
                </label>
                <label>
                  Backend token
                  <input
                    type="password"
                    value={s.token}
                    onChange={(e) => setS({ ...s, token: e.target.value })}
                    placeholder="From the backend startup log"
                    required
                  />
                </label>
              </div>
            )}
            <label>
              Model provider
              <select
                value={
                  s.provider === "ollama" &&
                  /^https:\/\/ollama\.com(?:\/|$)/i.test(s.modelUrl)
                    ? "ollama-cloud"
                    : s.provider
                }
                onChange={(e) => {
                  const cloud = e.target.value === "ollama-cloud";
                  setKey("");
                  setConnectError("");
                  setS({
                    ...s,
                    provider: cloud
                      ? "ollama"
                      : (e.target.value as Settings["provider"]),
                    modelUrl: cloud
                      ? "https://ollama.com"
                      : e.target.value === "ollama"
                        ? "http://127.0.0.1:11434"
                        : "https://api.openai.com/v1",
                    model: cloud
                      ? ""
                      : e.target.value === "ollama"
                        ? "llama3.2"
                        : "gpt-4o-mini",
                  });
                }}
              >
                <option value="ollama">Ollama · on your machine</option>
                <option value="ollama-cloud">Ollama Cloud · your key</option>
                <option value="openai">OpenAI-compatible API · your key</option>
              </select>
            </label>
            <div className="field-row">
              <label>
                Model
                <select
                  aria-label="Model"
                  value={s.model}
                  onChange={(e) => setS({ ...s, model: e.target.value })}
                  required
                  disabled={finding}
                >
                  <option value="">
                    {finding ? "Finding models…" : "Choose a model"}
                  </option>
                  {s.model && !models?.includes(s.model) && (
                    <option value={s.model}>
                      {s.model} (current selection)
                    </option>
                  )}
                  {models?.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Model base URL
                <input
                  type="url"
                  value={s.modelUrl}
                  onChange={(e) => {
                    setKey("");
                    setS({ ...s, modelUrl: e.target.value });
                  }}
                  required
                />
              </label>
            </div>
            <label>
              Provider API key{" "}
              <span className="muted">
                {hasSavedKey
                  ? "(already configured — leave blank to keep it)"
                  : "(optional for local Ollama; required for Ollama Cloud)"}
              </span>
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={
                  hasSavedKey
                    ? "Saved key retained — no need to enter it again"
                    : "Provider key, not the Bluey engine token"
                }
              />
            </label>
            <button
              type="button"
              className="outline-button"
              disabled={finding || busy}
              onClick={() => void discover()}
            >
              {finding ? "Finding models…" : "Find models"}
            </button>
            {window.bluey?.startOllama && s.provider === "ollama" && (
              <button
                type="button"
                className="outline-button"
                disabled={busy || finding}
                onClick={async () => {
                  try {
                    setModelNotice(
                      (await window.bluey!.startOllama!()).message,
                    );
                  } catch (error) {
                    setModelError(
                      error instanceof Error ? error.message : String(error),
                    );
                  }
                }}
              >
                Start local Ollama
              </button>
            )}
            <button
              type="button"
              className="outline-button"
              disabled={busy || finding || !s.model}
              onClick={async () => {
                setBusy(true);
                setModelError("");
                setModelNotice(
                  "Checking a real model reply. A cold model can take several minutes…",
                );
                try {
                  const native = await window.bluey?.connection();
                  await client.request(
                    "/api/config/test",
                    {
                      provider: s.provider,
                      model: s.model,
                      base_url: s.modelUrl,
                      api_key: key || undefined,
                    },
                    "POST",
                    undefined,
                    {
                      endpoint: native?.endpoint ?? s.endpoint,
                      token: native?.token ?? s.token,
                    },
                  );
                  setModelNotice(
                    "Model replied successfully. This verifies chat, not desktop-tool support.",
                  );
                } catch (error) {
                  setModelNotice("");
                  setModelError(
                    error instanceof Error ? error.message : String(error),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Verify model reply
            </button>
            {modelNotice && <p role="status">{modelNotice}</p>}
            {modelError && <p role="alert">{modelError}</p>}
            {models !== null && (
              <p role="status">
                {models.length
                  ? `${models.length} models found. Choose one from the Model dropdown.`
                  : "No models found on this server. For local Ollama, install a model in Ollama, then click Find models again."}
              </p>
            )}
            <p className="tiny muted">
              Finding models only reads the server's catalog. It does not
              generate a test prompt or download a model. A public catalog does
              not verify cloud inference access. Windows saves keys encrypted;
              keys are never stored in the browser.
            </p>
            {(hasSavedKey || modelInfo?.warning) && (
              <button
                type="button"
                className="outline-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setConnectError("");
                  try {
                    await onForgetKey();
                    setKey("");
                  } catch (error) {
                    setConnectError(
                      error instanceof Error ? error.message : String(error),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Forget saved provider key
              </button>
            )}
            {modelInfo?.warning && <p role="status">{modelInfo.warning}</p>}
            {connectError && (
              <p role="alert" className="connection-guidance">
                {connectError}
              </p>
            )}
            <div className="microphone-settings">
              <label>
                Windows / computer microphone
                <select
                  value={s.microphoneId ?? ""}
                  onChange={(e) => setS({ ...s, microphoneId: e.target.value })}
                >
                  <option value="">System default microphone</option>
                  {microphones.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || "Microphone"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="outline-button"
                onClick={async () => {
                  try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                      audio: true,
                      video: false,
                    });
                    stream.getTracks().forEach((track) => track.stop());
                    setMicrophones(
                      (await navigator.mediaDevices.enumerateDevices()).filter(
                        (d) => d.kind === "audioinput",
                      ),
                    );
                    setMicNotice(
                      "Microphones refreshed. No recording was retained.",
                    );
                  } catch {
                    setMicNotice(
                      "Microphone unavailable. Check Windows privacy settings, your device, and permission for Bluey.",
                    );
                  }
                }}
              >
                Find microphones
              </button>
              <p className="tiny muted">
                Uses this computer’s input, never the phone microphone.
                Recording is explicit; local Whisper is needed for desktop
                transcription. {micNotice}
              </p>
            </div>
            <p className="settings-note">
              No spoken replies. Quiet sessions keep context until you end them.
              Ctrl+Shift+Space toggles the paired phone session (or this PC if
              no phone is connected).
            </p>
            <div className="settings-note">
              <ShieldCheck size={17} />
              <span>
                {s.provider === "ollama" &&
                /^http:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(
                  s.modelUrl,
                )
                  ? "Local models run on your PC. Cloud-tagged models served through local Ollama still send prompts to Ollama Cloud."
                  : "Remote/cloud models receive the messages you send. Voice transcription remains local."}{" "}
                Voice models must be installed separately.
              </span>
            </div>
            <div className="modal-buttons">
              <span className="tiny muted">Engine: {status}</span>
              <button
                className="primary-button"
                disabled={busy || finding || !s.model}
              >
                {busy ? "Saving…" : "Save model"}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        ) : (
          <div className="privacy-settings">
            <PrivacyControls control={privacy} />
            <h3>Local by default. Honest by design.</h3>
            <p>
              Conversation history lives in this app’s local storage. API keys
              are not saved in the browser or sent to your Android device.
              Pairing tokens expire when the backend stops.
            </p>
            <p>
              Microphone recording starts only when you ask. Audio is sent to
              your Windows backend for transcription, and temporary files are
              deleted. Desktop actions need one-time approval.
            </p>
            <p>
              LAN pairing uses unencrypted HTTP unless you configure TLS. Use a
              trusted private network only, never expose the service to the
              internet.
            </p>
            <button
              className="danger-button"
              onClick={() => {
                if (confirm("Delete all locally saved conversations?"))
                  onClear();
              }}
            >
              <Trash2 size={15} />
              Clear conversation history
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
