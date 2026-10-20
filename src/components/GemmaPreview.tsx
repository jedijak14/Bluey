import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Cpu,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import { Avatar } from "./FloatingWidget/Avatar";
import { AnswerText } from "./ResponseCard";
const HANDLE = "keras/gemma3/keras/gemma3_1b";
type Status = "checking" | "ready" | "loading" | "unavailable" | "error";
export function GemmaPreview({ standalone = false }: { standalone?: boolean }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ prompt: string; answer: string }[]>(
    [],
  );
  const active = useRef<AbortController | null>(null);
  const health = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  async function check() {
    health.current?.abort();
    const controller = new AbortController();
    health.current = controller;
    setStatus("checking");
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch("/api/gemma/status", {
        signal: controller.signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (
        !response.ok ||
        data.model !== HANDLE ||
        !["ready", "loading", "unavailable", "error"].includes(data.status)
      )
        throw new Error();
      if (mounted.current && health.current === controller)
        setStatus(data.status);
    } catch {
      if (mounted.current && health.current === controller)
        setStatus("unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void check();
    return () => {
      mounted.current = false;
      health.current?.abort();
      active.current?.abort();
    };
  }, []);
  async function ask() {
    if (!prompt.trim() || busy || active.current || status !== "ready") return;
    const question = prompt.trim();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    const timeout = setTimeout(() => controller.abort(), 95000);
    try {
      const response = await fetch("/api/gemma/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ text: question, max_new_tokens: 128 }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Gemma could not complete the request.");
      if (
        data.model !== HANDLE ||
        typeof data.text !== "string" ||
        !data.text.trim()
      )
        throw new Error("The service returned an invalid answer.");
      if (mounted.current && active.current === controller) {
        setHistory((items) =>
          [...items, { prompt: question, answer: data.text }].slice(-20),
        );
        setPrompt("");
      }
    } catch (e) {
      if (mounted.current && active.current === controller)
        setError(
          controller.signal.aborted
            ? "Request timed out. The server may still be finishing its computation."
            : e instanceof Error
              ? e.message
              : "Request failed.",
        );
    } finally {
      clearTimeout(timeout);
      if (mounted.current && active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  function stop() {
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setError(
      "Stopped waiting for the answer. The server may still be finishing its current computation.",
    );
  }
  return (
    <section
      className={`starter-lab gemma-preview ${standalone ? "standalone" : ""}`}
      aria-label="Gemma 3 preview"
    >
      <header className="starter-heading">
        <div>
          <span className="starter-eyebrow">
            <Cpu size={15} /> BLUEY / GEMMA 3
          </span>
          <h1>A bigger mind. The same little Bluey.</h1>
          <p>
            The exact Gemma 3 1B preset you chose. A desktop browser experience,
            powered by a separate inference service.
          </p>
        </div>
        {standalone && (
          <a className="outline-button" href="./">
            <ArrowLeft size={15} />
            Workspace
          </a>
        )}
      </header>
      <div className="gemma-verified">
        <CheckCircle2 size={17} />
        <span>Desktop browser detected</span>
        <small>Compatibility check only · not a hardware benchmark</small>
      </div>
      <div className="starter-grid">
        <div className="starter-conversation">
          <div className="starter-chat-heading">
            <span>
              <span
                className={`status-dot ${status === "ready" ? "green" : ""}`}
              />
              {busy
                ? "Gemma is generating…"
                : status === "ready"
                  ? "Gemma weights loaded"
                  : status === "checking"
                    ? "Checking inference service…"
                    : status === "loading"
                      ? "Model loading on server"
                      : "Model not available"}
            </span>
            <button
              title="Clear conversation"
              disabled={busy}
              onClick={() => setHistory([])}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div
            className="starter-messages"
            role="log"
            aria-live="polite"
            aria-label="Gemma conversation"
          >
            {!history.length && (
              <div className="starter-empty">
                <Avatar mood={busy ? "thinking" : "listening"} />
                <h2>
                  {status === "ready"
                    ? "Try a short question."
                    : "Your model. One connection away."}
                </h2>
                <p>
                  {status === "ready"
                    ? "This is the pretrained base model, not the instruction-tuned variant. Treat its output as an experimental text completion."
                    : "Gemma answers will appear here only after the real model is loaded. No tiny-model fallback, canned replies, or simulated training."}
                </p>
                <div className="starter-examples">
                  {[
                    "What is photosynthesis?",
                    "Explain how a browser works.",
                    "What makes a good study plan?",
                  ].map((q) => (
                    <button key={q} onClick={() => setPrompt(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {history.map((item, i) => (
              <div className="starter-turn" key={i}>
                <p className="starter-question">{item.prompt}</p>
                <div className="starter-answer">
                  <span>GEMMA 3 1B · BASE MODEL OUTPUT</span>
                  <AnswerText text={item.answer} />
                  <small>
                    Generated text can be incorrect. No live search or source
                    verification was performed.
                  </small>
                </div>
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="starter-error">
              {error}
            </p>
          )}
          <form
            className="starter-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <label className="sr-only" htmlFor="gemma-prompt">
              Question for Gemma
            </label>
            <textarea
              id="gemma-prompt"
              rows={2}
              maxLength={1200}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask a short question…"
            />
            {busy ? (
              <button type="button" title="Stop request" onClick={stop}>
                <Square size={18} />
              </button>
            ) : (
              <button
                title="Ask Gemma"
                disabled={status !== "ready" || !prompt.trim()}
              >
                <ArrowUp size={20} />
              </button>
            )}
          </form>
          <p className="starter-private">
            <ShieldCheck size={15} />
            Sending shares this prompt with the configured inference host.
            History stays in this tab; earlier turns are not sent automatically.
            Silent by default.
          </p>
        </div>
        <aside className="starter-details">
          <div className="starter-panel">
            <span className="starter-eyebrow">01 / YOUR SELECTED MODEL</span>
            <h2>Gemma 3 · 1B</h2>
            <p className="gemma-handle">{HANDLE}</p>
            <dl>
              <div>
                <dt>Source</dt>
                <dd>Kaggle · Keras</dd>
              </div>
              <div>
                <dt>Model type</dt>
                <dd>Pretrained base</dd>
              </div>
              <div>
                <dt>Runs on</dt>
                <dd>Python inference host</dd>
              </div>
              <div>
                <dt>Browser support</dt>
                <dd>Desktop / laptop</dd>
              </div>
            </dl>
            <button
              className="outline-button"
              disabled={status === "checking"}
              onClick={() => void check()}
            >
              <RefreshCw size={14} />
              Recheck connection
            </button>
          </div>
          <div className="starter-panel">
            <span className="starter-eyebrow">02 / HONEST STATUS</span>
            <h2>
              {status === "ready"
                ? "Connected to Gemma"
                : "Inference needs a host"}
            </h2>
            <p>
              {status === "ready"
                ? "The service reports the requested preset is loaded. Questions are sent only when you choose Ask Gemma."
                : "The website does not download or run Keras weights itself. An operator must download the preset, start the Python service, and connect the website’s server-side gateway."}
            </p>
            <p>
              The supplied preset is not instruction-tuned. No fine-tuning or
              Gemma quality benchmark has been completed here. It cannot browse
              the web or control your PC in this mode.
            </p>
            <a
              href="https://github.com/jedijak14/Bluey/blob/arena/253a410c-bluey/docs/GEMMA_WEBSITE.md"
              target="_blank"
              rel="noreferrer"
            >
              Operator setup guide ↗
            </a>
          </div>
        </aside>
      </div>
    </section>
  );
}
