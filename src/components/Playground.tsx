import { useEffect, useRef, useState } from "react";
import {
  Check,
  MousePointer2,
  RotateCcw,
  Sparkles,
  Play,
  Pause,
} from "lucide-react";
import { Avatar, CursorAvatar, FaceScreen } from "./FloatingWidget/Avatar";
import { ExpressionScene, LAB_PRESETS } from "./MobileExpressionLab";
import { MotionControl, useMotionPreference } from "./MotionPreferences";
import { EXPRESSION_PRESETS, type Expression } from "../lib/expressions";
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
  onMood: (m: Mood, expression?: Expression) => void;
}) {
  const [superPreview, setSuperPreview] = useState(false);
  const [expression, setExpression] = useState<Expression | undefined>(
    "excited",
  );
  const [mood, setMood] = useState<Mood>("listening");
  const { enabled: motionOn } = useMotionPreference();
  const reducedMotion = !motionOn;
  const [playing, setPlaying] = useState(true);
  const [replay, setReplay] = useState(0);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = setInterval(() => {
      if (!document.hidden)
        setExpression(
          (current) =>
            EXPRESSION_PRESETS[
              (EXPRESSION_PRESETS.findIndex((p) => p.id === current) + 1) %
                EXPRESSION_PRESETS.length
            ].id,
        );
    }, 4000);
    return () => clearInterval(timer);
  }, [playing, reducedMotion]);
  useEffect(
    () => () => {
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
    },
    [],
  );
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [cursorMood, setCursorMood] = useState<Mood>("listening");
  const activeMood =
    EXPRESSION_PRESETS.find((p) => p.id === expression)?.mood || mood;
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
          <Avatar
            key={`${expression || mood}-${replay}`}
            mood={activeMood}
            expression={expression}
          />
          <MotionControl />
          <div className="expression-controls">
            <button
              onClick={() => setPlaying(!playing)}
              disabled={reducedMotion}
              aria-label={
                playing && !reducedMotion
                  ? "Pause expressions"
                  : "Play expressions"
              }
            >
              {playing && !reducedMotion ? (
                <Pause size={14} />
              ) : (
                <Play size={14} />
              )}
              {playing && !reducedMotion ? "Pause tour" : "Play tour"}
            </button>
            <button
              disabled={reducedMotion}
              onClick={() => setReplay((value) => value + 1)}
            >
              <RotateCcw size={14} /> Replay expression
            </button>
          </div>
          <p className="expression-status">
            {reducedMotion
              ? "Motion is off. Choose On above to animate, or select an expression below."
              : playing
                ? "A silent tour of 12 new expressions"
                : "Tour paused · the selected expression stays animated"}
          </p>
          <div className="face-caption">
            <h2>
              {EXPRESSION_PRESETS.find((p) => p.id === expression)?.label ||
                moods.find((m) => m.id === mood)?.label}
            </h2>
            <p>
              {EXPRESSION_PRESETS.find((p) => p.id === expression)
                ?.description || moods.find((m) => m.id === mood)?.description}
            </p>
          </div>
          <div className="expression-library">
            <h3>A whole new range of feelings</h3>
            <div
              className="mood-buttons"
              role="group"
              aria-label="New expressions"
            >
              {EXPRESSION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  aria-pressed={expression === preset.id}
                  className={expression === preset.id ? "active" : ""}
                  onClick={() => {
                    setPlaying(false);
                    setReplay((value) => value + 1);
                    setExpression(preset.id);
                    setMood(preset.mood);
                    onMood(preset.mood, preset.id);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="expression-view-grid">
            <figure>
              <CursorAvatar mood={activeMood} expression={expression} />
              <figcaption>Windows pointer</figcaption>
            </figure>
            <figure>
              <FaceScreen
                mood={activeMood}
                expression={expression}
                gazeX={0}
                gazeY={0}
                talk={0}
              />
              <figcaption>Android face</figcaption>
            </figure>
          </div>
          <button
            className="outline-button"
            onClick={() => setSuperPreview(!superPreview)}
          >
            {superPreview ? "Close Super Bluey preview" : "Preview Super Bluey"}
          </button>
          {superPreview && (
            <div className="app-super-preview">
              <p>
                Super Bluey · Paid plan preview · Coming soon. Free to preview;
                no purchase available.
              </p>
              <ExpressionScene
                key={replay}
                preset={LAB_PRESETS.find((p) => p.id === "super")!}
              />
            </div>
          )}
          <details className="classic-expressions">
            <summary>Classic moods</summary>
            <div className="mood-buttons">
              {moods.map((m) => (
                <button
                  key={m.id}
                  className={!expression && mood === m.id ? "active" : ""}
                  aria-pressed={!expression && mood === m.id}
                  onClick={() => {
                    setPlaying(false);
                    setReplay((value) => value + 1);
                    setExpression(undefined);
                    setMood(m.id);
                    onMood(m.id);
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </details>
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
              if (cursorTimer.current) clearTimeout(cursorTimer.current);
              cursorTimer.current = setTimeout(
                () => setCursorMood("listening"),
                1200,
              );
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
              <CursorAvatar mood={cursorMood} expression={expression} />
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
          12 new expressions across the desktop companion, Windows pointer, and
          Android face. Classic moods remain available.
        </span>
        <button
          onClick={() => {
            setPlaying(true);
            setReplay((value) => value + 1);
            if (cursorTimer.current) clearTimeout(cursorTimer.current);
            setExpression("excited");
            setMood("listening");
            onMood("listening", "excited");
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
