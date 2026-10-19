import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Avatar, CursorAvatar } from "./Avatar";
import { client } from "../../lib/client";
import { planFlight, sampleFlight, type Flight } from "../../lib/motion";
import { load } from "../../lib/storage";
import type { FaceState, Settings } from "../../lib/types";

export function Overlay() {
  const [face, setFace] = useState<FaceState>({
    mood: "listening",
    gazeX: 0,
    gazeY: 0,
    talk: 0,
  });
  const [caption, setCaption] = useState("");
  const cursor = useRef<HTMLDivElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const target = useRef({ x: innerWidth / 2, y: innerHeight - 80 });
  const position = useRef({ ...target.current });
  const pinned = useRef(false);
  const [settings, setSettings] = useState<Partial<Settings>>(() =>
    load("bluey.settings", {}),
  );
  useEffect(() => {
    const storage = () => setSettings(load("bluey.settings", {}));
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);
  useEffect(() => {
    client.onPacket = (p) => {
      if (p.type === "face") setFace(p.face as FaceState);
      if (p.type === "pointer") {
        target.current = {
          x: (Number(p.x) * innerWidth) / 1000,
          y: (Number(p.y) * innerHeight) / 1000,
        };
        pinned.current = true;
      }
      if (p.type === "caption") setCaption(String(p.text));
      if (p.type === "home") {
        pinned.current = false;
        target.current = { x: innerWidth / 2, y: innerHeight - 80 };
        setCaption("");
      }
    };
    window.bluey?.connection().then((c) => client.connect(c.endpoint, c.token));
    const off = window.bluey?.onPointer((p) => {
      if (!pinned.current)
        setFace((f) => ({
          ...f,
          gazeX: (p.x / innerWidth - 0.5) * 2,
          gazeY: (p.y / innerHeight - 0.5) * 2,
        }));
    });
    return () => {
      client.disconnect();
      off?.();
    };
  }, []);
  useEffect(() => {
    let id = 0;
    let flight: Flight | undefined;
    let goal = { ...position.current };
    const samples: { x: number; y: number }[] = [];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = (time: number) => {
      const p = position.current,
        t = target.current;
      if (t.x !== goal.x || t.y !== goal.y) {
        flight = planFlight(p, t, time);
        goal = { ...t };
      }
      const sample = flight
        ? sampleFlight(flight, reduced ? time + 2000 : time)
        : { ...p, angle: 0, done: true };
      p.x = sample.x;
      p.y = sample.y;
      const angle = sample.angle;
      const moving = !sample.done;
      if (cursor.current)
        cursor.current.style.transform = `translate(${p.x}px,${p.y}px) rotate(${moving ? angle : 0}deg)`;
      samples.push({ ...p });
      if (samples.length > 18) samples.shift();
      if (trail.current) {
        const path =
          settings.trail === "string"
            ? `M${innerWidth / 2} ${innerHeight} Q${(innerWidth / 2 + p.x) / 2 + 45} ${innerHeight - 70} ${p.x + 25} ${p.y + 35}`
            : settings.trail === "none" || !moving
              ? ""
              : samples
                  .map((s, i) => `${i ? "L" : "M"}${s.x + 22} ${s.y + 32}`)
                  .join(" ");
        trail.current.setAttribute("d", path);
      }
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [settings.trail]);
  return (
    <div className="desktop-overlay">
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
        style={{ width: settings.cursorSize ?? 72 }}
      >
        <CursorAvatar mood={face.mood} />
        {caption && <div className="overlay-caption">{caption}</div>}
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
            title="Return cursor home"
            onClick={() => {
              pinned.current = false;
              target.current = { x: innerWidth / 2, y: innerHeight - 80 };
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
