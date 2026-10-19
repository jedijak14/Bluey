import { useEffect, useRef, useState } from "react";
import {
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
  Volume2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { Avatar, CursorAvatar } from "./components/FloatingWidget/Avatar";
import { Playground } from "./components/Playground";
import { CodeWorkspace } from "./components/AppWindow/CodeWorkspace";
import { client } from "./lib/client";
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
const initialFace: FaceState = {
  mood: "listening",
  gazeX: 0,
  gazeY: 0,
  talk: 0,
};
type Page = "chat" | "companion" | "devices";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const voiceRef = useRef(settings.voice);
  const scroll = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [sidebar, setSidebar] = useState(true);
  const [pair, setPair] = useState<{
    code: string;
    expires_in: number;
    addresses: string[];
  } | null>(null);
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([]);
  const conversation = conversations.find((c) => c.id === active);
  const notify = (text: string) => setNotice(text);
  useEffect(() => {
    voiceRef.current = settings.voice;
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
    client.onStatus = setStatus;
    client.onPacket = (p: Packet) => {
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
    window.bluey?.connection().then((c) => {
      setSettings((s) => ({ ...s, ...c }));
      client.connect(c.endpoint, c.token);
    });
    return () => {
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
        setSettingsOpen(false);
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
        "Connect your local engine in Settings to start chatting. Nothing has been sent.",
      );
      setSettingsOpen(true);
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
        voice: settings.voice,
      });
    } catch (e) {
      setBusy(false);
      notify(String(e));
    }
  }
  async function toggleMic() {
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
        await mic.current.start(setLevel);
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
  async function connect(s: Settings, key: string) {
    setSettings(s);
    client.connect(s.endpoint, s.token);
    try {
      await client.request("/api/config", {
        provider: s.provider,
        model: s.model,
        base_url: s.modelUrl,
        api_key: key || undefined,
      });
      notify("Model configuration saved for this backend session.");
      setSettingsOpen(false);
    } catch (e) {
      notify(String(e));
    }
  }
  async function makePair() {
    try {
      const data = await client.request<{
        code: string;
        expires_in: number;
        addresses: string[];
      }>("/api/pair/create", {});
      setPair(data);
      setDevices(await client.request("/api/devices"));
    } catch (e) {
      notify(String(e));
    }
  }
  useEffect(() => {
    if (page === "devices" && status === "connected")
      client
        .request<{ id: string; name: string }[]>("/api/devices")
        .then(setDevices)
        .catch(() => {});
  }, [page, status]);
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
                {m.text || (
                  <span className="typing">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </div>
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
    <div className={`app-shell ${!sidebar ? "sidebar-hidden" : ""}`}>
      <aside className="sidebar">
        <button className="brand" onClick={newChat}>
          <Avatar mood="happy" />
          <span>
            bluey<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="workspace-label">
          YOUR LITTLE SIDEKICK <span>✦</span>
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
      <main className="main-window">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button"
              title="Toggle sidebar"
              onClick={() => setSidebar((v) => !v)}
            >
              <PanelLeftClose size={18} />
            </button>
            <span className="breadcrumb-divider" />
            <span>Personal workspace</span>
            <ChevronRight size={13} />
            <strong>
              {page === "chat"
                ? mode === "chat"
                  ? "New conversation"
                  : "Code workspace"
                : page === "companion"
                  ? "My companion"
                  : "Connected devices"}
            </strong>
          </div>
          <div className="top-actions">
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
          <div className="mode-switch">
            <button
              className={mode === "chat" ? "active" : ""}
              onClick={() => {
                setMode("chat");
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
        ) : (
          <div className="page-scroll">
            <div className="page-heading">
              <span className="eyebrow-label">BETTER TOGETHER</span>
              <h1>A little closer, on every screen.</h1>
              <p>
                Give Bluey a home on your Android. Keep the brains on your PC.
              </p>
            </div>
            <div className="device-layout">
              <div className="device-illustration">
                <div className="illustration-monitor">
                  <CursorAvatar />
                  <span>WINDOWS</span>
                </div>
                <div className="pair-dots">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="illustration-phone">
                  <Avatar mood={pair ? "listening" : "resting"} />
                </div>
                <span className="connection-caption">
                  <Wifi size={14} /> One Wi-Fi. Two friends.
                </span>
              </div>
              <div className="pair-card">
                <div className="card-icon">
                  <Smartphone size={22} />
                </div>
                <h2>Meet on your Android</h2>
                <p>
                  Open the Bluey Android app, enter your PC’s address and the
                  one-time code below.
                </p>
                <ol>
                  <li>
                    <span>1</span>Connect both devices to trusted Wi-Fi.
                  </li>
                  <li>
                    <span>2</span>Enable LAN mode when starting the backend.
                  </li>
                  <li>
                    <span>3</span>Generate a code and pair within 2 minutes.
                  </li>
                </ol>
                {pair ? (
                  <div className="pair-code">
                    <span>ONE-TIME PAIRING CODE</span>
                    <strong>{pair.code}</strong>
                    <small>
                      {pair.addresses.join(" or ")} · expires after 2 minutes
                    </small>
                  </div>
                ) : null}
                <button
                  className="primary-button"
                  onClick={() => void makePair()}
                >
                  <Wifi size={16} />
                  {pair ? "Generate a new code" : "Generate pairing code"}
                  <ArrowRight size={16} />
                </button>
                <p className="tiny muted">
                  Pairing requires the Windows backend. The phone never receives
                  your model API key.
                </p>
              </div>
            </div>
            <div className="connected-list">
              <h3>
                Paired devices <span>{devices.length}</span>
              </h3>
              {devices.length ? (
                devices.map((d) => (
                  <div className="device-row" key={d.id}>
                    <Smartphone size={20} />
                    <div>
                      <strong>{d.name}</strong>
                      <span>Paired for this backend session</span>
                    </div>
                    <button
                      className="outline-button"
                      onClick={async () => {
                        try {
                          await client.request(
                            `/api/devices/${d.id}`,
                            undefined,
                            "DELETE",
                          );
                          setDevices((ds) => ds.filter((x) => x.id !== d.id));
                        } catch (e) {
                          notify(String(e));
                        }
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                ))
              ) : (
                <div className="device-empty">
                  <Monitor size={21} />
                  <p>
                    Your Windows PC is home base.
                    <br />
                    <span>Paired Android devices will appear here.</span>
                  </p>
                </div>
              )}
            </div>
            <button
              className="text-button"
              onClick={() => {
                location.hash = "#phone";
                location.reload();
              }}
            >
              Preview the Android companion <ExternalLink size={13} />
            </button>
          </div>
        )}
        <footer className="statusbar">
          <span>
            <span
              className={`status-dot ${status === "connected" ? "green" : ""}`}
            />
            {status === "connected"
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
          settings={settings}
          status={status}
          onClose={() => setSettingsOpen(false)}
          onConnect={connect}
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
  settings,
  status,
  onClose,
  onConnect,
  onClear,
}: {
  settings: Settings;
  status: string;
  onClose: () => void;
  onConnect: (s: Settings, key: string) => Promise<void>;
  onClear: () => void;
}) {
  const [s, setS] = useState(settings);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("engine");
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
            Connection & model
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
              await onConnect(s, key);
              setBusy(false);
            }}
          >
            <div className="field-row">
              <label>
                Backend address
                <input
                  value={s.endpoint}
                  onChange={(e) => setS({ ...s, endpoint: e.target.value })}
                  placeholder="Blank = same-origin development proxy"
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
            <label>
              Model provider
              <select
                value={s.provider}
                onChange={(e) =>
                  setS({
                    ...s,
                    provider: e.target.value as Settings["provider"],
                    modelUrl:
                      e.target.value === "ollama"
                        ? "http://127.0.0.1:11434"
                        : "https://api.openai.com/v1",
                    model:
                      e.target.value === "ollama" ? "llama3.2" : "gpt-4o-mini",
                  })
                }
              >
                <option value="ollama">Ollama · on your machine</option>
                <option value="openai">OpenAI-compatible API · your key</option>
              </select>
            </label>
            <div className="field-row">
              <label>
                Model
                <input
                  value={s.model}
                  onChange={(e) => setS({ ...s, model: e.target.value })}
                  required
                />
              </label>
              <label>
                Model base URL
                <input
                  type="url"
                  value={s.modelUrl}
                  onChange={(e) => setS({ ...s, modelUrl: e.target.value })}
                  required
                />
              </label>
            </div>
            {s.provider === "openai" && (
              <label>
                API key{" "}
                <span className="muted">(kept only in backend memory)</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Leave blank to retain the existing key"
                />
              </label>
            )}
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={s.voice}
                onChange={(e) => setS({ ...s, voice: e.target.checked })}
              />
              <div>
                Read responses aloud
                <span>Uses your locally installed Piper voice.</span>
              </div>
              <Volume2 size={18} />
            </label>
            <div className="settings-note">
              <ShieldCheck size={17} />
              <span>
                {s.provider === "ollama"
                  ? "With Ollama, prompts and audio stay on your local network."
                  : "Cloud models receive the messages you send. Voice transcription remains local."}{" "}
                Voice models must be installed separately.
              </span>
            </div>
            <div className="modal-buttons">
              <span className="tiny muted">Engine: {status}</span>
              <button className="primary-button" disabled={busy}>
                {busy ? "Connecting…" : "Save & connect"}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        ) : (
          <div className="privacy-settings">
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
