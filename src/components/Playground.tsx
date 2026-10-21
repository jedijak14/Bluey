import { useState } from "react";
import { Check, MousePointer2, RotateCcw, Sparkles } from "lucide-react";
import { Avatar, CursorAvatar } from "./FloatingWidget/Avatar";
import type { Mood, Settings } from "../lib/types";
const moods: { id: Mood; label: string; description: string }[] = [
  {
    id: "listening",
    label: "All ears",
    description: "Present. Curious. Ready for your next idea.",
  },
  {
    id: "thinking",
    label: "Thinking",
    description: "Connecting the dots, one little thought at a time.",
  },
  {
    id: "talking",
    label: "Speaking",
    description: "A little bounce for every word.",
  },
  {
    id: "pointing",
    label: "On it",
    description: "A helpful little nudge in the right direction.",
  },
  {
    id: "happy",
    label: "Happy",
    description: "Small wins deserve a happy dance.",
  },
  {
    id: "sleepy",
    label: "Sleepy",
    description: "Even little companions need a moment.",
  },
  {
    id: "resting",
    label: "Resting",
    description: "Right here when you need me again.",
  },
];
export function Playground({
  settings,
  onSettings,
  onMood,
}: {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onMood: (m: Mood) => void;
}) {
  const [mood, setMood] = useState<Mood>("listening");
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [cursorMood, setCursorMood] = useState<Mood>("listening");
  return (
    <div className="page-scroll playground">
      <div className="page-heading">
        <span className="eyebrow-label">A LITTLE PERSONALITY</span>
        <h1>Your new favorite desk mate.</h1>
        <p>
          Not just a dot on your desktop. A companion with a world of
          expressions.
        </p>
      </div>
      <div className="playground-grid">
        <section className="face-preview">
          <div className="preview-label">
            <span className="status-dot green" />
            Meet Bluey<span>LIVE PREVIEW</span>
          </div>
          <Avatar mood={mood} />
          <div className="face-caption">
            <h2>{moods.find((m) => m.id === mood)?.label}</h2>
            <p>{moods.find((m) => m.id === mood)?.description}</p>
          </div>
          <div className="mood-buttons">
            {moods.map((m) => (
              <button
                key={m.id}
                className={mood === m.id ? "active" : ""}
                onClick={() => {
                  setMood(m.id);
                  onMood(m.id);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>
        <section className="pointer-settings">
          <div className="card-icon">
            <MousePointer2 size={21} />
          </div>
          <h2>A pointer with a personality.</h2>
          <p>
            A quiet little companion, parked bottom-center.
            <br />
            He stays put until asked to move. Click below to try it.
          </p>
          <div
            className={`cursor-stage trail-${settings.trail}`}
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setPoint({
                x: ((e.clientX - r.x) / r.width) * 100,
                y: ((e.clientY - r.y) / r.height) * 100,
              });
              setCursorMood("pointing");
              setTimeout(() => setCursorMood("listening"), 1200);
            }}
          >
            {settings.trail === "string" && point && (
              <svg
                className="pointer-string"
                width="100%"
                height="100%"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <path
                  d={`M50 100 Q${(50 + point.x) / 2} 90 ${point.x + 5} ${point.y + 10}`}
                  fill="none"
                  stroke="#7786dc"
                  strokeWidth="0.4"
                  strokeDasharray=".5 1.5"
                />
              </svg>
            )}
            <div
              className={`moving-cursor ${settings.glow ? "glow" : ""}`}
              style={{
                left: `${point?.x ?? 50}%`,
                top: point
                  ? `${point.y}%`
                  : `calc(100% - ${(settings.cursorSize + 30) / 2 + 26}px)`,
                transform: "translate(-50%, -50%)",
                width: settings.cursorSize + 30,
              }}
            >
              <CursorAvatar mood={cursorMood} />
              {settings.trail === "comet" && point && (
                <span className="cursor-comet" />
              )}
            </div>
            <span>CLICK ANYWHERE TO EXPLORE</span>
          </div>
          <label>
            Flight trail
            <div className="segmented">
              {(["comet", "string", "none"] as const).map((t) => (
                <button
                  key={t}
                  className={settings.trail === t ? "active" : ""}
                  onClick={() => onSettings({ ...settings, trail: t })}
                >
                  {t === "comet"
                    ? "✦ Comet"
                    : t === "string"
                      ? "⌁ String"
                      : "None"}
                </button>
              ))}
            </div>
          </label>
          <label className="slider-label">
            Cursor size <span>{settings.cursorSize} px</span>
            <input
              type="range"
              min="48"
              max="120"
              value={settings.cursorSize}
              onChange={(e) =>
                onSettings({ ...settings, cursorSize: Number(e.target.value) })
              }
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.glow}
              onChange={(e) =>
                onSettings({ ...settings, glow: e.target.checked })
              }
            />
            <div>
              A little extra glow
              <span>A soft blueberry halo around the cursor</span>
            </div>
            <Sparkles size={17} />
          </label>
        </section>
      </div>
      <div className="reference-note">
        <Check size={16} />
        <span>
          Faithful to Bluey’s original seven moods. Face and cursor animate
          independently.
        </span>
        <button
          onClick={() => {
            setMood("listening");
            onMood("listening");
            setPoint(null);
            setCursorMood("listening");
          }}
        >
          <RotateCcw size={13} />
          Reset preview
        </button>
      </div>
    </div>
  );
}
