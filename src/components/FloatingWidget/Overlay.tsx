import { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  Mic,
  Expand,
  X,
  Settings2,
  LoaderCircle,
  Minus,
} from "lucide-react";
import { liveExpression } from "../../lib/expressions";
import { CursorAvatar } from "./Avatar";
import { ResponseCard, type CompanionResponse } from "../ResponseCard";
import { client } from "../../lib/client";
import { planFlight, sampleFlight, type Flight } from "../../lib/motion";
import {
  clampCursor,
  cursorDestination,
  cursorDock,
  cursorSize,
  type CursorArea,
} from "../../lib/cursorPosition";
import { load } from "../../lib/storage";
import type { FaceState, Settings } from "../../lib/types";

import { useMotionPreference } from "../MotionPreferences";

export function Overlay() {
  const { enabled: motionOn } = useMotionPreference();
  const reducedMotion = useRef(!motionOn);
  reducedMotion.current = !motionOn;
  const [face, setFace] = useState<FaceState>({
    mood: "listening",
    gazeX: 0,
    gazeY: 0,
    talk: 0,
  });
  const [sessionActive, setSessionActive] = useState(false);
  const [caption, setCaption] = useState("");
  const [response, setResponse] = useState<CompanionResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [cardResponse, setCardResponse] = useState<CompanionResponse | null>(
    null,
  );
  const [research, setResearch] = useState<{
    request: string;
    state: string;
  } | null>(null);
  const activeResearch = useRef("");
  const dismissedResearch = useRef<string | null>(null);
  const [docked, setDocked] = useState(true);
  const dockedRef = useRef(true);
  const [layoutArea, setLayoutArea] = useState<CursorArea | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  function closeCard() {
    dismissedResearch.current = activeResearch.current;
    setExpanded(false);
    window.bluey?.interactive(false);
  }
  const [pulse, setPulse] = useState<{
    x: number;
    y: number;
    id: number;
    typing: boolean;
  } | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const cursor = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const [settings, setSettings] = useState<Partial<Settings>>(() =>
    load("bluey.settings", {}),
  );
  const size = cursorSize(settings.cursorSize);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const trailStyle = useRef(settings.trail);
  trailStyle.current = settings.trail;
  const area = useRef<CursorArea | null>(null);
  const returnAfterArrival = useRef(false);
  const requested = useRef<{ x: number; y: number } | null>(null);
  const target = useRef(cursorDock(innerWidth, innerHeight, size));
  const position = useRef({ ...target.current });
  const wake = useRef<() => void>(() => {});
  const reposition = () => {
    const point = requested.current;
    target.current = point
      ? cursorDestination(
          point.x,
          point.y,
          innerWidth,
          innerHeight,
          sizeRef.current,
        )!
      : cursorDock(innerWidth, innerHeight, sizeRef.current, area.current);
    wake.current();
  };
  const home = () => {
    returnAfterArrival.current = false;
    requested.current = null;
    reposition();
  };
  useEffect(() => {
    const storage = () => setSettings(load("bluey.settings", {}));
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);
  useEffect(() => {
    const unsubscribe = client.subscribe((p) => {
      if (p.type === "session_state") setSessionActive(Boolean(p.active));
      if (p.type === "research_state" && typeof p.request === "string") {
        const state = String(p.state);
        if (["waiting", "searching", "writing"].includes(state)) {
          if (activeResearch.current !== p.request) setCardResponse(null);
          activeResearch.current = p.request;
          setResearch({ request: p.request, state });
          if (dismissedResearch.current !== p.request) setExpanded(true);
        } else if (activeResearch.current === p.request) {
          setResearch(
            state === "complete" ? null : { request: p.request, state },
          );
        }
      }
      if (p.type === "response") {
        const answer = p as unknown as CompanionResponse;
        setResponse(answer);
        if (p.format === "research") {
          activeResearch.current = answer.request;
          setCardResponse(answer);
          setResearch(null);
          if (dismissedResearch.current !== answer.request) setExpanded(true);
        }
        setCaption(String(p.text).slice(0, 420));
      }
      if (p.type === "click_feedback") {
        setPulse({
          x: Number(p.x),
          y: Number(p.y),
          typing: Boolean(p.typing),
          id: Date.now(),
        });
        clearTimeout(pulseTimer.current);
        pulseTimer.current = setTimeout(() => setPulse(null), 1400);
      }
      if (p.type === "face") setFace(p.face as FaceState);
      if (
        p.type === "pointer" &&
        cursorDestination(p.x, p.y, innerWidth, innerHeight, sizeRef.current)
      ) {
        dockedRef.current = false;
        setDocked(false);
        returnAfterArrival.current = false;
        requested.current = { x: p.x as number, y: p.y as number };
        reposition();
      }
      if (p.type === "caption") setCaption(String(p.text));
      if (p.type === "home") {
        if (p.reason === "action_complete") {
          // Finish pointing before returning, even if the action finishes first.
          returnAfterArrival.current = true;
          wake.current();
        } else home();
        setCaption("");
      }
    });
    let alive = true;
    const previousStatus = client.onStatus;
    client.onStatus = (status) => {
      if (alive && status === "offline") {
        setResearch((current) =>
          current && ["waiting", "searching", "writing"].includes(current.state)
            ? { ...current, state: "error" }
            : current,
        );
      }
    };
    window.bluey
      ?.connection()
      .then((c) => {
        if (alive) client.connect(c.endpoint, c.token);
      })
      .catch(() => {
        /* Stay quietly docked when the engine is unavailable. */
      });
    const offCommand = window.bluey?.onCommand?.((command) => {
      if (command === "yield") {
        setCaption("");
        window.bluey?.interactive(false);
      }
    });
    const layout = (next: CursorArea) => {
      if (!alive) return;
      area.current = next;
      setLayoutArea(next);
      reposition();
    };
    const offLayout = window.bluey?.onOverlayLayout?.(layout);
    window.bluey
      ?.overlayLayout?.()
      .then(layout)
      .catch(() => {});
    window.addEventListener("resize", reposition);
    return () => {
      clearTimeout(pulseTimer.current);
      alive = false;
      client.disconnect();
      client.onStatus = previousStatus;
      unsubscribe();
      offLayout?.();
      window.removeEventListener("resize", reposition);
      offCommand?.();
    };
  }, []);
  useEffect(() => {
    let id: number | undefined;
    let flight: Flight | undefined;
    let goal = { ...position.current };
    let tilt = 0;
    let lastTime: number | undefined;
    const samples: { x: number; y: number }[] = [];
    const step = (time: number) => {
      id = undefined;
      const p = position.current,
        t = target.current;
      if (t.x !== goal.x || t.y !== goal.y) {
        flight = planFlight(p, t, time);
        // A Bézier remains inside the convex hull of its control points.
        flight.c1 = clampCursor(
          flight.c1,
          innerWidth,
          innerHeight,
          sizeRef.current,
        );
        flight.c2 = clampCursor(
          flight.c2,
          innerWidth,
          innerHeight,
          sizeRef.current,
        );
        goal = { ...t };
      }
      const dt = Math.max(
        1,
        Math.min(64, lastTime === undefined ? 16 : time - lastTime),
      );
      lastTime = time;
      const oldX = p.x;
      // Do not calculate an artificial end timestamp for reduced motion:
      // floating-point rounding can leave sampleFlight just short of done forever.
      const sample = flight
        ? reducedMotion.current
          ? { ...flight.to, done: true }
          : sampleFlight(flight, time)
        : { ...p, done: true };
      const bounded = clampCursor(
        sample,
        innerWidth,
        innerHeight,
        sizeRef.current,
      );
      p.x = bounded.x;
      p.y = bounded.y;
      const moving = !sample.done;
      // Gentle, frame-rate-independent lean; no full rotations or angle-wrap snaps.
      const desiredTilt =
        moving && !reducedMotion.current
          ? Math.max(-10, Math.min(10, ((p.x - oldX) / dt) * 10))
          : 0;
      tilt = reducedMotion.current
        ? 0
        : tilt + (desiredTilt - tilt) * (1 - Math.exp(-dt / 90));
      if (Math.abs(tilt) < 0.04) tilt = 0;
      if (cursor.current)
        cursor.current.style.transform = `translate3d(${p.x}px,${p.y}px,0)`;
      if (body.current) body.current.style.transform = `rotate(${tilt}deg)`;
      if (
        sample.done &&
        !requested.current &&
        !returnAfterArrival.current &&
        !dockedRef.current
      ) {
        dockedRef.current = true;
        setDocked(true);
      }
      if (bubble.current) {
        const width = bubble.current.offsetWidth;
        const left = Math.max(
          8,
          Math.min(
            innerWidth - width - 8,
            p.x + sizeRef.current / 2 - width / 2,
          ),
        );
        bubble.current.style.left = `${left - p.x}px`;
        bubble.current.style.top =
          !dockedRef.current && p.y < 180 ? "100%" : "auto";
        bubble.current.style.bottom = dockedRef.current
          ? "20px"
          : p.y < 180
            ? "auto"
            : "100%";
      }
      if (moving) {
        samples.push({ ...p });
        if (samples.length > 18) samples.shift();
      } else samples.length = 0;
      if (trail.current) {
        const path =
          !moving || reducedMotion.current || trailStyle.current === "none"
            ? ""
            : trailStyle.current === "string"
              ? `M${innerWidth / 2} ${innerHeight} Q${(innerWidth / 2 + p.x) / 2 + 45} ${innerHeight - 70} ${p.x + sizeRef.current / 2} ${p.y + sizeRef.current / 2}`
              : samples
                  .map(
                    (s, i) =>
                      `${i ? "L" : "M"}${s.x + sizeRef.current / 2} ${s.y + sizeRef.current / 2}`,
                  )
                  .join(" ");
        trail.current.setAttribute("d", path);
      }
      const returnHome = sample.done && returnAfterArrival.current;
      if (returnHome) {
        returnAfterArrival.current = false;
        requested.current = null;
        target.current = cursorDock(
          innerWidth,
          innerHeight,
          sizeRef.current,
          area.current,
        );
      }
      if (moving || tilt !== 0 || returnHome) id = requestAnimationFrame(step);
    };
    const start = () => {
      if (id === undefined) id = requestAnimationFrame(step);
    };
    wake.current = start;
    start();
    return () => {
      if (id !== undefined) cancelAnimationFrame(id);
      wake.current = () => {};
    };
  }, []);
  useEffect(() => {
    reposition();
  }, [size]);
  useEffect(() => {
    wake.current();
  }, [caption, expanded, docked, settings.trail, motionOn]);
  return (
    <div className="desktop-overlay">
      {expanded && (research || cardResponse) && (
        <div
          className="overlay-research"
          style={{
            top: (layoutArea?.y || 0) + 16,
            right: layoutArea
              ? Math.max(16, innerWidth - layoutArea.x - layoutArea.width + 16)
              : 16,
            maxHeight: layoutArea
              ? Math.max(120, layoutArea.height - 32)
              : undefined,
          }}
        >
          {research ? (
            <section
              className="research-progress"
              aria-label="Bluey research"
              onMouseEnter={() => window.bluey?.interactive(true)}
              onMouseLeave={() => window.bluey?.interactive(false)}
            >
              <header>
                <strong>
                  {["waiting", "searching", "writing"].includes(research.state)
                    ? "Researching"
                    : research.state === "cancelled"
                      ? "Research cancelled"
                      : "Research unavailable"}
                </strong>
                {["waiting", "searching", "writing"].includes(
                  research.state,
                ) && (
                  <LoaderCircle
                    className="research-spinner"
                    size={15}
                    aria-hidden="true"
                  />
                )}
                <button title="Close research" onClick={closeCard}>
                  <Minus size={16} />
                </button>
              </header>
              <p role="status">
                {
                  {
                    waiting: "Waiting for desktop approval…",
                    searching: "Looking up sources…",
                    writing: "Preparing your report…",
                    cancelled: "No report was completed.",
                    error:
                      "The request could not finish. Try again from the workspace.",
                  }[research.state]
                }
              </p>
            </section>
          ) : (
            cardResponse && (
              <ResponseCard
                key={cardResponse.request}
                response={cardResponse}
                initialCollapsed={cardResponse.format === "research"}
                overlay
                onClose={closeCard}
              />
            )
          )}
        </div>
      )}
      {pulse && (
        <div
          key={pulse.id}
          className="click-feedback"
          style={{ left: `${pulse.x / 10}%`, top: `${pulse.y / 10}%` }}
        >
          <i />
          <i />
          <span>{pulse.typing ? "Typing" : "Click"}</span>
        </div>
      )}
      <svg className="overlay-trail">
        <path
          ref={trail}
          fill="none"
          stroke="#8195fa"
          strokeOpacity=".35"
          strokeWidth={settings.trail === "string" ? 2 : 10}
          strokeLinecap="round"
        />
      </svg>
      <div
        ref={cursor}
        className={`overlay-cursor ${docked ? "docked" : "pointing"}`}
        data-state={docked ? "docked" : "pointing"}
        style={{
          width: size,
          height: size,
          transform: `translate3d(${position.current.x}px,${position.current.y}px,0)`,
        }}
      >
        <div ref={body} className="overlay-cursor-body" aria-hidden={docked}>
          <CursorAvatar
            mood={face.mood}
            expression={liveExpression(face.mood, face.expression)}
          />
        </div>
        <svg
          className="overlay-dock-tip"
          viewBox="0 0 32 16"
          role="img"
          aria-label="Bluey parked at bottom"
          aria-hidden={!docked}
        >
          <path
            d="M1 15 L16 1 L31 15 Z"
            fill="#f8fbff"
            stroke="#b9c8db"
            strokeWidth="0.8"
          />
        </svg>
        {caption && (
          <div
            ref={bubble}
            className="overlay-caption"
            onMouseEnter={() => window.bluey?.interactive(true)}
            onMouseLeave={() => window.bluey?.interactive(false)}
          >
            <span>{caption}</span>
            {response && (
              <button
                title="Expand answer"
                onClick={() => {
                  setCardResponse(response);
                  setResearch(null);
                  setExpanded(true);
                }}
              >
                <Expand size={13} />
              </button>
            )}
          </div>
        )}
      </div>
      <div
        className={`floating-widget ${controlsOpen ? "controls-open" : ""}`}
        onMouseEnter={() => window.bluey?.interactive(true)}
        onMouseLeave={() => window.bluey?.interactive(false)}
      >
        <button
          className="widget-toggle"
          title="Bluey controls"
          aria-expanded={controlsOpen}
          onClick={() => setControlsOpen(!controlsOpen)}
        >
          <Settings2 size={17} />
        </button>
        <div className="widget-controls">
          <button
            title={sessionActive ? "End quiet session" : "Start quiet session"}
            aria-pressed={sessionActive}
            onClick={() => window.bluey?.window("session")}
          >
            {sessionActive ? "End session" : "Session"}
          </button>
          <button
            title="Ask with Windows microphone"
            onClick={() => window.bluey?.window("microphone")}
          >
            <Mic size={15} />
          </button>
          <button
            title="Open workspace"
            onClick={() => window.bluey?.window("workspace")}
          >
            <Expand size={15} />
          </button>
          <button
            title="Return cursor home"
            onClick={() => {
              home();
              setCaption("");
            }}
          >
            <MessageCircle size={15} />
          </button>
          <button
            title="Hide companion"
            onClick={() => window.bluey?.window("overlay")}
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
