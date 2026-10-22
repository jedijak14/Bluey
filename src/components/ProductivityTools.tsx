import { useEffect, useState } from "react";
import { CheckCheck, Download, NotebookPen, Timer, Trash2 } from "lucide-react";
import { Avatar } from "./FloatingWidget/Avatar";
import type { ProductivityStore } from "../hooks/useProductivity";
import {
  exportProductivity,
  idleTimer,
  MAX_NOTE,
  MAX_TASKS,
  pauseTimer,
  resumeTimer,
  startTimer,
  timeLeft,
} from "../lib/productivity";
import "./ProductivityTools.css";

export function ProductivityTools({ store }: { store: ProductivityStore }) {
  const { data, setData, unsaved } = store;
  const [task, setTask] = useState("");
  const [minutes, setMinutes] = useState("25");
  const [now, setNow] = useState(Date.now());
  const [exportError, setExportError] = useState("");
  useEffect(() => {
    if (data.timer.status !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [data.timer]);
  const seconds = Math.ceil(timeLeft(data.timer, now) / 1000);
  const finished = data.timer.status === "finished";
  const active = ["running", "paused"].includes(data.timer.status);
  const completed = data.tasks.filter((t) => t.done).length;
  const validMinutes =
    /^\d+$/.test(minutes) && Number(minutes) >= 1 && Number(minutes) <= 180;
  function begin(phase: "focus" | "break", duration: number) {
    const time = Date.now();
    setNow(time);
    setData((s) => ({ ...s, timer: startTimer(duration, phase, time) }));
  }
  function download() {
    try {
      const url = URL.createObjectURL(
        new Blob([exportProductivity(data)], {
          type: "text/plain;charset=utf-8",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "Bluey-workspace.txt";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportError("");
    } catch {
      setExportError(
        "Export could not start. You can select and copy your notes instead.",
      );
    }
  }
  return (
    <section className="productivity" aria-label="Offline workspace">
      <div className="kit-heading">
        <div>
          <span className="eyebrow-label">A LITTLE EVERYDAY HELP</span>
          <h2>Your quiet workspace.</h2>
          <p>
            No AI connection needed. Saved on this device only, not synced or
            encrypted. Don’t store passwords here.
          </p>
        </div>
        <button className="outline-button" onClick={download}>
          <Download size={16} />
          Export notes & checklist
        </button>
      </div>
      <p className={unsaved ? "kit-warning" : "tiny muted"} role="status">
        {unsaved
          ? "Storage unavailable — changes are only in memory. Export before closing Bluey."
          : "Saved locally on this device."}
      </p>
      {exportError && <p role="alert">{exportError}</p>}
      <div className="kit-grid">
        <section className="kit-card kit-focus" aria-labelledby="focus-title">
          <div className="kit-card-title">
            <Timer size={19} />
            <h3 id="focus-title">Focus with Bluey</h3>
            <span className="kit-badge">SILENT</span>
          </div>
          <div className="kit-focus-scene">
            <Avatar
              expression={finished ? "proud" : active ? "zen" : "relieved"}
            />
            <div>
              <span>
                {data.timer.phase === "break" ? "Break time" : "Focus time"}
                {data.timer.status === "paused" ? " · Paused" : ""}
              </span>
              <output aria-label="Time remaining" aria-live="off">
                {String(Math.floor(seconds / 60)).padStart(2, "0")}:
                {String(seconds % 60).padStart(2, "0")}
              </output>
            </div>
          </div>
          {finished && (
            <p role="status">
              {data.timer.phase === "focus"
                ? "Nice work! Take a little break."
                : "Break finished. Ready when you are."}
            </p>
          )}
          {!active && (
            <>
              <div className="kit-actions">
                {[15, 25, 50].map((n) => (
                  <button
                    key={n}
                    className="outline-button"
                    aria-pressed={minutes === String(n)}
                    onClick={() => setMinutes(String(n))}
                  >
                    {n} min
                  </button>
                ))}
              </div>
              <label className="kit-duration">
                Focus minutes{" "}
                <input
                  type="number"
                  min="1"
                  max="180"
                  step="1"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </label>
            </>
          )}
          <div className="kit-actions">
            {!active && (
              <button
                className="primary-button"
                disabled={!validMinutes}
                onClick={() => begin("focus", Number(minutes))}
              >
                Start focus
              </button>
            )}
            {data.timer.status === "running" && (
              <button
                className="primary-button"
                onClick={() =>
                  setData((s) => ({
                    ...s,
                    timer: pauseTimer(s.timer, Date.now()),
                  }))
                }
              >
                Pause timer
              </button>
            )}
            {data.timer.status === "paused" && (
              <button
                className="primary-button"
                onClick={() => {
                  setNow(Date.now());
                  setData((s) => ({
                    ...s,
                    timer: resumeTimer(s.timer, Date.now()),
                  }));
                }}
              >
                Resume timer
              </button>
            )}
            {!active && (
              <button
                className="outline-button"
                onClick={() => begin("break", 5)}
              >
                5-minute break
              </button>
            )}
            {data.timer.status !== "idle" && (
              <button
                className="outline-button"
                onClick={() => setData((s) => ({ ...s, timer: idleTimer() }))}
              >
                Reset timer
              </button>
            )}
          </div>
          <p className="tiny muted">
            A silent in-app reminder, not a system alarm. Time continues while
            minimized or closed; check back in Bluey after sleep or reopening.
            No sound, microphone, or notifications.
          </p>
        </section>
        <section className="kit-card" aria-labelledby="checklist-title">
          <div className="kit-card-title">
            <CheckCheck size={19} />
            <h3 id="checklist-title">One thing at a time</h3>
          </div>
          <p className="tiny muted" role="status">
            {completed} of {data.tasks.length} complete
          </p>
          <form
            className="kit-add-task"
            onSubmit={(e) => {
              e.preventDefault();
              const text = task.trim();
              if (!text || data.tasks.length >= MAX_TASKS) return;
              setData((s) => ({
                ...s,
                tasks: [
                  ...s.tasks,
                  { id: crypto.randomUUID(), text, done: false },
                ],
              }));
              setTask("");
            }}
          >
            <input
              aria-label="New task"
              placeholder="What’s your next small step?"
              value={task}
              maxLength={200}
              onChange={(e) => setTask(e.target.value)}
            />
            <button
              className="primary-button"
              disabled={!task.trim() || data.tasks.length >= MAX_TASKS}
            >
              Add task
            </button>
          </form>
          {data.tasks.length === 0 && (
            <p className="kit-empty">
              A clear desk, a fresh start. Add your first task.
            </p>
          )}
          {data.tasks.length >= MAX_TASKS && (
            <p role="status">100 tasks saved. Remove a task to add another.</p>
          )}
          <ul className="kit-task-list">
            {data.tasks.map((t) => (
              <li key={t.id}>
                <label className={t.done ? "kit-done" : ""}>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() =>
                      setData((s) => ({
                        ...s,
                        tasks: s.tasks.map((item) =>
                          item.id === t.id
                            ? { ...item, done: !item.done }
                            : item,
                        ),
                      }))
                    }
                  />
                  <span>{t.text}</span>
                </label>
                <button
                  className="icon-button"
                  aria-label={`Delete task: ${t.text}`}
                  onClick={() =>
                    setData((s) => ({
                      ...s,
                      tasks: s.tasks.filter((item) => item.id !== t.id),
                    }))
                  }
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          {completed > 0 && (
            <button
              className="outline-button"
              onClick={() =>
                setData((s) => ({
                  ...s,
                  tasks: s.tasks.filter((t) => !t.done),
                }))
              }
            >
              Clear completed ({completed})
            </button>
          )}
        </section>
        <section className="kit-card kit-notes" aria-labelledby="notes-title">
          <div className="kit-card-title">
            <NotebookPen size={19} />
            <h3 id="notes-title">Catch a thought</h3>
            <span className="tiny muted">
              {data.notes.length.toLocaleString()} / 20,000
            </span>
          </div>
          <label className="sr-only" htmlFor="kit-notes">
            Quick notes
          </label>
          <textarea
            id="kit-notes"
            aria-label="Quick notes"
            rows={7}
            maxLength={MAX_NOTE}
            value={data.notes}
            onChange={(e) => setData((s) => ({ ...s, notes: e.target.value }))}
            placeholder="Ideas, meeting takeaways, that thing you don’t want to forget…"
          />
          <p className="tiny muted">
            Plain text, saved as you type. Export anytime to keep your own copy.
          </p>
        </section>
      </div>
    </section>
  );
}
