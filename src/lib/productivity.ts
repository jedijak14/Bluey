export const PRODUCTIVITY_KEY = "bluey.productivity.v1";
export const MAX_TASKS = 100;
export const MAX_NOTE = 20000;
const MAX_DURATION = 180 * 60 * 1000;
export interface Task {
  id: string;
  text: string;
  done: boolean;
}
export interface FocusTimer {
  phase: "focus" | "break";
  status: "idle" | "running" | "paused" | "finished";
  duration: number;
  remaining: number;
  deadline: number | null;
}
export interface Productivity {
  notes: string;
  tasks: Task[];
  timer: FocusTimer;
}
export function idleTimer(): FocusTimer {
  return {
    phase: "focus",
    status: "idle",
    duration: 25 * 60000,
    remaining: 25 * 60000,
    deadline: null,
  };
}
export function emptyProductivity(): Productivity {
  return { notes: "", tasks: [], timer: idleTimer() };
}
export function timeLeft(timer: FocusTimer, now: number): number {
  return timer.status === "running" && timer.deadline !== null
    ? Math.max(0, Math.min(timer.duration, timer.deadline - now))
    : timer.remaining;
}
export function reconcileTimer(timer: FocusTimer, now: number): FocusTimer {
  return timer.status === "running" && timeLeft(timer, now) === 0
    ? { ...timer, status: "finished", remaining: 0, deadline: null }
    : timer;
}
export function startTimer(
  minutes: number,
  phase: FocusTimer["phase"],
  now: number,
): FocusTimer {
  const duration =
    Math.round(
      Math.max(1, Math.min(180, Number.isFinite(minutes) ? minutes : 25)),
    ) * 60000;
  return {
    phase,
    status: "running",
    duration,
    remaining: duration,
    deadline: now + duration,
  };
}
export function pauseTimer(timer: FocusTimer, now: number): FocusTimer {
  const current = reconcileTimer(timer, now);
  return current.status === "running"
    ? {
        ...current,
        status: "paused",
        remaining: timeLeft(current, now),
        deadline: null,
      }
    : current;
}
export function resumeTimer(timer: FocusTimer, now: number): FocusTimer {
  return timer.status === "paused"
    ? { ...timer, status: "running", deadline: now + timer.remaining }
    : timer;
}
export function parseProductivity(
  raw: string | null,
  now: number,
): Productivity {
  const result = emptyProductivity();
  try {
    const data = JSON.parse(raw || "null");
    if (!data || typeof data !== "object") return result;
    if (typeof data.notes === "string")
      result.notes = data.notes.slice(0, MAX_NOTE);
    const ids = new Set<string>();
    if (Array.isArray(data.tasks)) {
      result.tasks = data.tasks
        .filter((task: Task) => {
          if (
            !task ||
            typeof task.id !== "string" ||
            !task.id ||
            task.id.length > 100 ||
            ids.has(task.id) ||
            typeof task.text !== "string" ||
            !task.text.trim()
          )
            return false;
          ids.add(task.id);
          return true;
        })
        .slice(0, MAX_TASKS)
        .map((task: Task) => ({
          id: task.id,
          text: task.text.trim().slice(0, 200),
          done: task.done === true,
        }));
    }
    const t = data.timer;
    if (
      t &&
      ["idle", "running", "paused", "finished"].includes(t.status) &&
      ["focus", "break"].includes(t.phase) &&
      Number.isFinite(t.duration) &&
      t.duration >= 60000 &&
      t.duration <= MAX_DURATION &&
      Number.isFinite(t.remaining) &&
      t.remaining >= 0 &&
      t.remaining <= t.duration &&
      (t.status !== "running" ||
        (Number.isFinite(t.deadline) &&
          t.deadline > 0 &&
          t.deadline <= now + MAX_DURATION))
    ) {
      result.timer = reconcileTimer(
        {
          phase: t.phase,
          status: t.status,
          duration: t.duration,
          remaining: t.status === "finished" ? 0 : t.remaining,
          deadline: t.status === "running" ? t.deadline : null,
        },
        now,
      );
    }
  } catch {
    /* Corrupt or old storage must not prevent launching Bluey. */
  }
  return result;
}
export function exportProductivity(data: Productivity): string {
  return (
    "Bluey · My workspace\n\nCHECKLIST\n" +
    data.tasks.map((t) => `${t.done ? "[x]" : "[ ]"} ${t.text}`).join("\n") +
    "\n\nNOTES\n" +
    data.notes +
    "\n"
  );
}
