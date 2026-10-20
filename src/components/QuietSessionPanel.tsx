import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { QuietSession } from "../hooks/useQuietSession";
import type { BlueyClient } from "../lib/client";
import { DeviceSpeech } from "../lib/deviceSpeech";
import { meetingDocument, type MeetingDraft } from "../lib/quietSession";

function MeetingReview({
  draft,
  client,
  dismiss,
}: {
  draft: MeetingDraft;
  client: BlueyClient;
  dismiss: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Preparing notes…");
  const [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const abort = new AbortController();
    if (!draft.transcript.length) {
      setStatus("No speech was captured.");
      return;
    }
    void client
      .request<{ notes: string }>(
        "/api/companion/notes",
        {
          transcript: draft.transcript
            .map((x) => `[${x.at}] ${x.text}`)
            .join("\n"),
        },
        undefined,
        abort.signal,
      )
      .then((r) => {
        setNotes(r.notes);
        setStatus("Review the summary: AI notes may be wrong.");
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setStatus(
            "Summary unavailable. You can still save the transcript or write your own notes.",
          );
      });
    return () => abort.abort();
  }, [draft.id]);
  async function save() {
    setSaving(true);
    try {
      const text = meetingDocument(draft, notes),
        name = `Bluey-meeting-${draft.started.slice(0, 10)}.md`;
      if (Capacitor.getPlatform() === "android") {
        const result = await DeviceSpeech.saveNotes({ name, text });
        if (result.saved) dismiss();
      } else {
        const url = URL.createObjectURL(
          new Blob([text], { type: "text/markdown;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setStatus(
          "Download requested. Keep this draft until you verify the file, then discard it.",
        );
      }
    } catch {
      setStatus("Could not save. Your draft is still here; try again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="meeting-review" aria-label="Save meeting notes">
      <h2 ref={heading} tabIndex={-1}>
        A little recap for you.
      </h2>
      <p>Save the meeting notes and transcription?</p>
      <small>{draft.reason}</small>
      <p role="status">{status}</p>
      <label htmlFor={`meeting-notes-${draft.id}`}>Meeting notes</label>
      <textarea
        id={`meeting-notes-${draft.id}`}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={5}
      />
      <details>
        <summary>
          Review transcription ({draft.transcript.length} segments)
        </summary>
        <div className="meeting-transcript">
          {draft.transcript.map((x, i) => (
            <p key={i}>
              <time>{x.at.slice(11, 19)}</time> {x.text}
            </p>
          ))}
        </div>
      </details>
      <p className="tiny">
        No speaker identification or system-audio capture. Speech can be missed
        or misheard. Drafts are in memory only until you save them.
      </p>
      <div className="session-actions">
        <button
          className="primary-button"
          disabled={saving}
          onClick={() => void save()}
        >
          Save notes & transcription
        </button>
        <button
          className="outline-button"
          disabled={saving}
          onClick={() => {
            if (confirm("Discard these unsaved notes and transcription?"))
              dismiss();
          }}
        >
          Discard
        </button>
      </div>
    </section>
  );
}
export function QuietSessionPanel({
  session: s,
  client,
  phone = false,
}: {
  session: QuietSession;
  client: BlueyClient;
  phone?: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  return (
    <div className={`quiet-session-panel ${phone ? "on-phone" : ""}`}>
      {!phone && (
        <div className="session-actions">
          <button
            className={s.active ? "outline-button" : "primary-button"}
            onClick={s.toggle}
          >
            {s.active ? "End quiet session" : "Start quiet session"}
          </button>
          {s.active && (
            <button
              className="primary-button"
              disabled={s.busy}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                s.hold();
              }}
              onPointerUp={() => s.release()}
              onPointerCancel={() => s.release(true)}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                  e.preventDefault();
                  s.hold();
                }
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  s.release();
                }
              }}
            >
              Hold to ask
            </button>
          )}
        </div>
      )}
      {s.active && (
        <div className="session-status" role="status">
          <span className={s.listening ? "status-dot green" : "status-dot"} />
          {s.transitioning
            ? "Preparing microphone…"
            : s.asking
              ? "Release to ask"
              : s.listening
                ? "Session listening · keeping context"
                : "Microphone paused"}
          <button onClick={s.meetingToggle}>
            {s.meeting ? "End meeting" : "Take meeting notes"}
          </button>
          {s.meeting && <strong>Meeting notes recording</strong>}
          {s.trimmed && (
            <small>Recent context only · earlier context trimmed</small>
          )}
        </div>
      )}
      {!phone && s.reply && (
        <div className="session-reply" aria-live="polite">
          {s.reply}
        </div>
      )}
      {s.error && (
        <p className="session-error" role="alert">
          {s.error}
        </p>
      )}
      {s.consentOpen && (
        <section
          className="session-consent"
          aria-label="Microphone session consent"
        >
          <h2>A quiet listening session</h2>
          <p>
            Your microphone stays in use until you end the session or leave
            Bluey. Speech becomes temporary context; Bluey only answers when you
            hold and release or send a question. No spoken replies.
          </p>
          <p>
            Android uses its speech provider (which may use the internet).
            Windows uses local Whisper. Recognition can pause between utterances
            and miss words. Context and meeting summaries go to your configured
            model, which may be a cloud service.
          </p>
          <label>
            <input
              type="checkbox"
              checked={s.autoMeeting}
              onChange={(e) => s.setAutoMeeting(e.target.checked)}
            />{" "}
            Automatically notice supported meeting windows on Windows during
            this session
          </label>
          <p>
            Meeting detection is an estimate, not a call-status integration. Use
            manual controls if it misses a start or end. Only sound audible to
            this microphone is captured—not remote participants in headphones.
          </p>
          <label>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />{" "}
            I have permission from everyone being recorded.
          </label>
          <div className="session-actions">
            <button
              className="primary-button"
              disabled={!accepted}
              onClick={s.allow}
            >
              Allow & start session
            </button>
            <button
              className="outline-button"
              onClick={() => s.setConsentOpen(false)}
            >
              Not now
            </button>
          </div>
          <small>
            Double-tap again to end. Nothing is saved automatically.
          </small>
        </section>
      )}
      {s.drafts[0] && (
        <MeetingReview
          key={s.drafts[0].id}
          draft={s.drafts[0]}
          client={client}
          dismiss={() => s.discardDraft(s.drafts[0].id)}
        />
      )}
    </div>
  );
}
