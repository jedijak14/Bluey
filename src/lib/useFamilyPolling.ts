import { useEffect, useRef } from "react";

/** One scheduled refresh at a time; resume immediately when Home/Kids returns.
 * Response/session ownership is still checked by the caller before applying data.
 */
export function useFamilyPolling(
  refresh: () => Promise<unknown>,
  identity: string,
) {
  const current = useRef(refresh);
  current.current = refresh;
  useEffect(() => {
    if (!identity) return;
    let stopped = false;
    let running = false;
    const run = async () => {
      if (stopped || running || document.hidden) return;
      running = true;
      try {
        await current.current();
      } finally {
        running = false;
      }
    };
    void run();
    const timer = setInterval(() => void run(), 10000);
    const resume = () => void run();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [identity]);
}
