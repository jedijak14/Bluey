import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Check,
  Copy,
  Download,
  ExternalLink,
  Minus,
  X,
} from "lucide-react";

export interface Source {
  title: string;
  url: string;
  snippet?: string;
}
export interface CompanionResponse {
  request: string;
  title: string;
  text: string;
  format: "quick" | "research";
  sources: Source[];
}
export function safeWebLink(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function WebLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const safe = safeWebLink(href);
  if (!safe) return <span>{children}</span>;
  return (
    <a
      href={safe}
      title={safe}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (window.bluey?.openExternal) {
          e.preventDefault();
          void window.bluey.openExternal(safe);
        }
      }}
    >
      {children}
      <ExternalLink size={11} />
    </a>
  );
}
function inline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g)
    .map((part, index) => {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
      if (link)
        return (
          <WebLink key={index} href={link[2]}>
            {link[1]}
          </WebLink>
        );
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      return part;
    });
}
export function AnswerText({ text }: { text: string }) {
  return (
    <div className="answer-text">
      {text.split(/\n\s*\n/).map((block, i) => {
        if (/^#{1,3} /.test(block))
          return <h3 key={i}>{inline(block.replace(/^#{1,3} /, ""))}</h3>;
        if (/^[-*] /.test(block))
          return (
            <ul key={i}>
              {block.split("\n").map((line, j) => (
                <li key={j}>{inline(line.replace(/^[-*] /, ""))}</li>
              ))}
            </ul>
          );
        return <p key={i}>{inline(block)}</p>;
      })}
    </div>
  );
}
export function ResponseCard({
  response,
  onClose,
  initialCollapsed = false,
  overlay = false,
}: {
  response: CompanionResponse;
  onClose: () => void;
  initialCollapsed?: boolean;
  overlay?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  function notes() {
    return `# ${response.title}\n\n${response.text}\n\n${response.sources.map((s, i) => `${i + 1}. ${s.title} — ${s.url}`).join("\n")}`;
  }
  return (
    <section
      className={`response-card ${collapsed ? "collapsed" : ""}`}
      aria-label="Bluey response"
      onMouseEnter={() => window.bluey?.interactive(true)}
      onMouseLeave={() => window.bluey?.interactive(false)}
    >
      <header>
        <BookOpen size={17} />
        <div>
          <strong>{response.title || "A little help from Bluey"}</strong>
          <span>
            {response.sources.length
              ? "Research · source snippets included"
              : "Bluey’s notes · no live sources attached"}
          </span>
        </div>
        <button
          title={collapsed ? "Expand response" : "Minimize response"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
        </button>
        <button title="Close response" onClick={onClose}>
          {overlay ? <Minus size={17} /> : <X size={17} />}
        </button>
      </header>
      {collapsed && (
        <button
          className="response-preview"
          title="Read full report"
          onClick={() => setCollapsed(false)}
        >
          <span>{response.text}</span>
          <small>
            Click to read more
            {response.sources.length
              ? ` · ${response.sources.length} source${response.sources.length === 1 ? "" : "s"}`
              : ""}
          </small>
        </button>
      )}
      {!collapsed && (
        <>
          <div className="response-paper">
            <AnswerText text={response.text} />
            {response.sources.length > 0 && (
              <section className="response-sources">
                <h3>Sources</h3>
                <p>
                  These are search-result snippets, not independently verified
                  full pages. Open a source to check details.
                </p>
                <ol>
                  {response.sources.map((source, i) => (
                    <li key={`${i}-${source.url}`}>
                      <WebLink href={source.url}>{source.title}</WebLink>
                      {source.snippet && <p>{source.snippet}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
          <footer>
            <button
              onClick={() => {
                void navigator.clipboard
                  .writeText(notes())
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError(
                      "Clipboard unavailable. Select and copy the text instead.",
                    ),
                  );
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy notes"}
            </button>
            {!Capacitor.isNativePlatform() && (
              <button
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([notes()], { type: "text/markdown" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "Bluey-notes.md";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                <Download size={14} />
                Save notes
              </button>
            )}
            {error && <span role="status">{error}</span>}
          </footer>
        </>
      )}
    </section>
  );
}
