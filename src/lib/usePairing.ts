import { useEffect, useRef, useState } from "react";
import { client } from "./client";

export interface PairedDevice {
  id: string;
  name: string;
}
export interface PairCode {
  code: string;
  expires_in: number;
  addresses: string[];
  expiresAt: number;
}

/** Uses the published Windows engine's API; no new engine version is required. */
export function usePairing(connected: boolean, endpoint: string) {
  const [pair, setPair] = useState<PairCode | null>(null);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const command = useRef<
    (action?: "generate" | { revoke: string }) => Promise<void>
  >(async () => {});

  useEffect(() => {
    setPair(null);
    setDevices([]);
    setMessage("");
    setError("");
    setBusy(false);
    if (!connected) return;
    const controller = new AbortController();
    let inFlight = false;
    let activeAction: "generate" | { revoke: string } | undefined;
    let pendingAction: "generate" | { revoke: string } | undefined;
    let refresh = false;
    let expiresAt = 0;
    let known: Set<string> | null = null;
    let codeError = false;
    let poll: ReturnType<typeof setTimeout>;
    const run = async (action?: "generate" | { revoke: string }) => {
      if (controller.signal.aborted) return;
      if (inFlight) {
        // A visibility/poll refresh can start between pointerdown and click.
        // Queue that user command rather than silently dropping it. Duplicate
        // clicks during a mutation must not generate multiple different codes.
        if (action && !activeAction) pendingAction = action;
        return;
      }
      activeAction = action;
      clearTimeout(poll);
      inFlight = true;
      setBusy(true);
      let generating = false;
      try {
        if (action && typeof action === "object")
          await client.request(
            `/api/devices/${encodeURIComponent(action.revoke)}`,
            undefined,
            "DELETE",
            controller.signal,
          );
        // Check for redemption BEFORE rotating an expired code. This also keeps
        // the device list live on older released engines without event support.
        const next = await client.request<PairedDevice[]>(
          "/api/devices",
          undefined,
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const added = known && next.some((device) => !known!.has(device.id));
        known = new Set(next.map((device) => device.id));
        setDevices(next);
        if (added && refresh) {
          refresh = false;
          expiresAt = 0;
          setPair(null);
          setMessage("Paired successfully. Your device is ready to connect.");
        }
        if (action === "generate" || (refresh && Date.now() >= expiresAt)) {
          generating = true;
          activeAction = "generate";
          const started = Date.now();
          const data = await client.request<Omit<PairCode, "expiresAt">>(
            "/api/pair/create",
            {},
            undefined,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          if (
            !/^\d{6}$/.test(data.code) ||
            !Number.isFinite(data.expires_in) ||
            data.expires_in <= 0 ||
            !Array.isArray(data.addresses)
          )
            throw new Error(
              "The PC returned an invalid pairing code. Reconnect and try again.",
            );
          // Measure from request start, not arrival, so network delay cannot
          // make a code look valid longer than the server accepts it.
          expiresAt = started + data.expires_in * 1000;
          refresh = true;
          setPair({ ...data, expiresAt });
          setMessage("");
        }
        if (generating || action) codeError = false;
        if (!codeError) setError("");
      } catch (e) {
        if (controller.signal.aborted) return;
        codeError = codeError || generating || action === "generate";
        if (refresh || generating)
          setMessage(
            "Automatic code refresh stopped. Generate a new code to retry.",
          );
        refresh = false; // Explicit retry after an error; never churn codes.
        setPair(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        inFlight = false;
        activeAction = undefined;
        if (!controller.signal.aborted) {
          if (pendingAction) {
            const next = pendingAction;
            pendingAction = undefined;
            void run(next);
          } else {
            setBusy(false);
            poll = setTimeout(() => void run(), 2000);
          }
        }
      }
    };
    command.current = run;
    void run();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const visible = () => {
      if (!document.hidden) {
        setNow(Date.now());
        void run();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearTimeout(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", visible);
      command.current = async () => {};
    };
  }, [connected, endpoint]);

  return {
    pair,
    devices,
    busy,
    error,
    message,
    remaining: pair
      ? Math.max(
          0,
          Math.ceil((pair.expiresAt - Math.max(now, Date.now())) / 1000),
        )
      : 0,
    generate: () => command.current("generate"),
    revoke: (id: string) => command.current({ revoke: id }),
  };
}
