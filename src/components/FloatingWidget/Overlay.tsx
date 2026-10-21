import { useEffect, useRef, useState } from "react";
import { MessageCircle, Mic, Expand, X } from "lucide-react";
import { Avatar, CursorAvatar } from "./Avatar";
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

export function Overlay() {
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
      if (p.type === "response") {
        setResponse(p as unknown as CompanionResponse);
        setExpanded(p.format === "research");
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
        requested.current = { x: p.x as number, y: p.y as number };
        reposition();
      }
      if (p.type === "caption") setCaption(String(p.text));
      if (p.type === "home") {
        setExpanded(false);
        home();
        setCaption("");
      }
    });
    let alive = true;
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
        setExpanded(false);
        setCaption("");
        window.bluey?.interactive(false);
      }
    });
    const layout = (next: CursorArea) => {
      if (!alive) return;
      area.current = next;
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
      client.disconnect();
      alive = false;
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
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
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
      const sample = flight
        ? sampleFlight(
            flight,
            reduced.matches ? flight.start + flight.duration : time,
          )
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
        moving && !reduced.matches
          ? Math.max(-10, Math.min(10, ((p.x - oldX) / dt) * 10))
          : 0;
      tilt = reduced.matches
        ? 0
        : tilt + (desiredTilt - tilt) * (1 - Math.exp(-dt / 90));
      if (Math.abs(tilt) < 0.04) tilt = 0;
      if (cursor.current)
        cursor.current.style.transform = `translate3d(${p.x}px,${p.y}px,0)`;
      if (body.current) body.current.style.transform = `rotate(${tilt}deg)`;
      if (bubble.current) {
        bubble.current.style.left = `${p.x > innerWidth - 360 ? -Math.min(p.x - 10, 320) : 0}px`;
        bubble.current.style.top = p.y < 180 ? "100%" : "auto";
        bubble.current.style.bottom = p.y < 180 ? "auto" : "100%";
      }
      if (moving) {
        samples.push({ ...p });
        if (samples.length > 18) samples.shift();
      } else samples.length = 0;
      if (trail.current) {
        const path =
          !moving || reduced.matches || trailStyle.current === "none"
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
      if (moving || tilt !== 0) id = requestAnimationFrame(step);
    };
    const start = () => {
      if (id === undefined) id = requestAnimationFrame(step);
    };
    wake.current = start;
    reduced.addEventListener("change", start);
    start();
    return () => {
      if (id !== undefined) cancelAnimationFrame(id);
      wake.current = () => {};
      reduced.removeEventListener("change", start);
    };
  }, []);
  useEffect(() => {
    reposition();
  }, [size]);
  useEffect(() => {
    wake.current();
  }, [caption, expanded, settings.trail]);
  return (
    <div className="desktop-overlay">
      {expanded && response && (
        <div className="overlay-research">
          <ResponseCard
            response={response}
            onClose={() => {
              setExpanded(false);
              window.bluey?.interactive(false);
            }}
          />
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
        className={`overlay-cursor ${settings.glow === false ? "" : "glow"}`}
        style={{
          width: size,
          height: size,
          transform: `translate3d(${position.current.x}px,${position.current.y}px,0)`,
        }}
      >
        <div ref={body} className="overlay-cursor-body">
          <CursorAvatar mood={face.mood} />
        </div>
        {caption && !expanded && (
          <div
            ref={bubble}
            className="overlay-caption"
            onMouseEnter={() => window.bluey?.interactive(true)}
            onMouseLeave={() => window.bluey?.interactive(false)}
          >
            <span>{caption}</span>
            {response && (
              <button title="Expand answer" onClick={() => setExpanded(true)}>
                <Expand size={13} />
              </button>
            )}
          </div>
        )}
      </div>
      <div
        className="floating-widget"
        onMouseEnter={() => window.bluey?.interactive(true)}
        onMouseLeave={() => window.bluey?.interactive(false)}
      >
        <Avatar
          mood={face.mood}
          gaze={{ x: face.gazeX, y: face.gazeY }}
          talk={face.talk}
        />
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
              setExpanded(false);
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
