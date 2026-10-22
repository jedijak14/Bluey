import { useEffect, useState } from "react";
import {
  emptyProductivity,
  parseProductivity,
  PRODUCTIVITY_KEY,
  reconcileTimer,
} from "../lib/productivity";

/** Lives at the app root so the silent timer survives navigation between tools/chat. */
export function useProductivity() {
  const [initial] = useState(() => {
    try {
      return {
        data: parseProductivity(
          localStorage.getItem(PRODUCTIVITY_KEY),
          Date.now(),
        ),
        unavailable: false,
      };
    } catch {
      return { data: emptyProductivity(), unavailable: true };
    }
  });
  const [data, setData] = useState(initial.data);
  const [unsaved, setUnsaved] = useState(initial.unavailable);
  useEffect(() => {
    try {
      localStorage.setItem(PRODUCTIVITY_KEY, JSON.stringify(data));
      setUnsaved(false);
    } catch {
      setUnsaved(true);
    }
  }, [data]);
  useEffect(() => {
    if (data.timer.status !== "running") return;
    const check = () =>
      setData((previous) => {
        const timer = reconcileTimer(previous.timer, Date.now());
        return timer === previous.timer ? previous : { ...previous, timer };
      });
    const interval = window.setInterval(check, 1000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, [data.timer.status]);
  return { data, setData, unsaved };
}
export type ProductivityStore = ReturnType<typeof useProductivity>;
