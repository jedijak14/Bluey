import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Pause,
  Play,
  RotateCcw,
  VolumeX,
  Sparkles,
} from "lucide-react";
import { Avatar } from "./FloatingWidget/Avatar";
import type { Mood } from "../lib/types";
import "./MobileExpressionLab.css";

type Scene = "computer" | "idea" | "celebrate";
type Preset = {
  id: string;
  label: string;
  description: string;
  mood: Mood;
  expression?: "wink" | "sad" | "alarmed";
  scene?: Scene;
};
export const LAB_PRESETS: readonly Preset[] = [
  {
    id: "computer",
    label: "Deep work",
    description:
      "A little focus, a little power. Bluey makes the keys type all by themselves.",
    mood: "listening",
    scene: "computer",
  },
  {
    id: "idea",
    label: "Eureka!",
    description: "A little thought turns into a bright idea. There it is!",
    mood: "thinking",
    scene: "idea",
  },
  {
    id: "celebrate",
    label: "Little victory",
    description:
      "That finally-worked feeling, complete with a happy hop and confetti.",
    mood: "happy",
    scene: "celebrate",
  },
  {
    id: "listening",
    label: "All ears",
    description:
      "Wide eyes, a gentle breath, and all the attention in the world.",
    mood: "listening",
  },
  {
    id: "thinking",
    label: "Thinking",
    description: "Connecting the dots. No rush, just a little curiosity.",
    mood: "thinking",
  },
  {
    id: "talking",
    label: "Speaking",
    description: "An animated talking face, with absolutely no voice or sound.",
    mood: "talking",
  },
  {
    id: "pointing",
    label: "On it",
    description: "One confident nod. Consider your idea understood.",
    mood: "pointing",
  },
  {
    id: "happy",
    label: "Happy",
    description: "Smiling eyes and a blueberry-sized bounce.",
    mood: "happy",
  },
  {
    id: "sleepy",
    label: "Sleepy",
    description: "Heavy eyelids. A slow little settle. Just five more minutes…",
    mood: "sleepy",
  },
  {
    id: "resting",
    label: "Resting",
    description:
      "Eyes closed, gently breathing. Even Bluey needs a quiet moment.",
    mood: "resting",
  },
  {
    id: "wink",
    label: "Wink",
    description: "A tiny smile and a wink, just for you.",
    mood: "listening",
    expression: "wink",
  },
  {
    id: "sad",
    label: "A little blue",
    description: "A soft frown and a small sigh. Some days are like that.",
    mood: "listening",
    expression: "sad",
  },
  {
    id: "surprised",
    label: "Surprised",
    description: "Oh! Wide eyes and a perfectly round little gasp.",
    mood: "listening",
    expression: "alarmed",
  },
];

/** All artwork is local SVG/CSS. No model, screen access, audio or device actions. */
export function ExpressionScene({ preset }: { preset: Preset }) {
  return (
    <div
      className={`lab-scene scene-${preset.scene || "face"} lab-mood-${preset.mood}`}
      role="img"
      aria-label={`Bluey: ${preset.label}`}
    >
      <div className="lab-scene-art" aria-hidden="true">
        <div className="lab-floor" />
        <div className="lab-actor">
          <Avatar
            mood={preset.mood}
            expression={preset.expression}
            gaze={
              preset.scene === "computer" ? { x: 0.9, y: 0.2 } : { x: 0, y: 0 }
            }
          />
        </div>
        {preset.scene === "computer" && (
          <svg className="lab-props" viewBox="0 0 480 360">
            <path
              d="M28 310H452"
              stroke="#c6b8df"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <rect
              x="270"
              y="102"
              width="180"
              height="135"
              rx="14"
              fill="#433d66"
            />
            <rect
              x="279"
              y="111"
              width="162"
              height="109"
              rx="7"
              fill="#27283e"
            />
            <circle cx="288" cy="119" r="2.5" fill="#f1acba" />
            <circle cx="297" cy="119" r="2.5" fill="#f4d6a0" />
            <circle cx="306" cy="119" r="2.5" fill="#a2d8c1" />
            <g strokeLinecap="round" strokeWidth="5">
              <path
                className="lab-code-line code-one"
                d="M292 140H368"
                stroke="#b3a3ef"
              />
              <path
                className="lab-code-line code-two"
                d="M303 155H416"
                stroke="#a6c9eb"
              />
              <path
                className="lab-code-line code-three"
                d="M303 170H389"
                stroke="#a2d8c1"
              />
              <path
                className="lab-code-line code-four"
                d="M292 185H354"
                stroke="#b3a3ef"
              />
            </g>
            <rect
              className="lab-screen-caret"
              x="363"
              y="181"
              width="3"
              height="10"
              fill="#f5f0ff"
            />
            <circle cx="360" cy="228" r="3" fill="#b4a5de" />
            <path d="M348 237H372L378 268H342Z" fill="#b5a8ce" />
            <rect
              x="322"
              y="266"
              width="78"
              height="7"
              rx="3.5"
              fill="#8c80a9"
            />
            <path
              d="M242 280H410L429 301H224Z"
              fill="#b3a6d0"
              stroke="#8e80ac"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {[0, 1, 2].map((row) => (
              <g key={row}>
                {Array.from({ length: 11 }, (_, col) => (
                  <rect
                    key={col}
                    x={242 + col * 14 - row * 3}
                    y={284 + row * 5}
                    width="10"
                    height="3"
                    rx="1"
                    fill="#e9e2f4"
                  />
                ))}
              </g>
            ))}
            <g className="lab-power" fill="none" strokeLinecap="round">
              <circle
                className="lab-power-source"
                cx="132"
                cy="122"
                r="17"
                fill="#b4a0ff"
                fillOpacity=".18"
                stroke="#b4a0ff"
                strokeWidth="1.5"
              />
              <path
                d="M132 122C238 78 194 250 308 288"
                stroke="#b4a0ff"
                strokeWidth="8"
                opacity=".12"
              />
              <path
                className="lab-power-flow"
                d="M132 122C238 78 194 250 308 288"
                stroke="#a18bdf"
                strokeWidth="2"
                strokeDasharray="3 17"
              />
              <path
                className="lab-power-spark"
                d="M214 208l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"
                fill="#beacf6"
                stroke="#a18bdf"
                strokeWidth="1"
              />
            </g>
            {[0, 1, 2].map((key) => (
              <rect
                key={key}
                className="lab-powered-key"
                x={280 + key * 28}
                y={284 + key * 5}
                width="10"
                height="3"
                rx="1"
                fill="#f3e7ff"
                stroke="#ad90e2"
                strokeWidth="1"
                style={{ animationDelay: `${-key * 0.4}s` }}
              />
            ))}
            <path
              d="M64 310L58 346M418 310L424 346"
              stroke="#c6b8df"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
        )}
        {preset.scene === "idea" && (
          <svg className="lab-props" viewBox="0 0 480 360">
            <g className="lab-bulb">
              <circle cx="365" cy="85" r="51" fill="#ffedb0" opacity=".35" />
              <path
                d="M343 82a22 22 0 1 1 44 0c0 12-13 16-13 30h-18c0-14-13-18-13-30Z"
                fill="#ffe7a0"
                stroke="#bc924c"
                strokeWidth="3"
              />
              <path
                d="M357 118h16m-14 6h12m-12-31 6 6 6-6m-6 6v12"
                fill="none"
                stroke="#bc924c"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <g
                className="lab-idea-rays"
                stroke="#d6a343"
                strokeWidth="3"
                strokeLinecap="round"
              >
                <path d="M365 41V30M325 52l-8-8M405 52l8-8M316 83h-11M414 83h11" />
              </g>
            </g>
          </svg>
        )}
        {preset.scene === "celebrate" && (
          <svg className="lab-props" viewBox="0 0 480 360">
            {[60, 105, 156, 205, 265, 320, 370, 422].map((x, index) => (
              <g
                key={x}
                className={`lab-confetti confetti-${index}`}
                style={{ animationDelay: `${-index * 0.27}s` }}
              >
                <path
                  d={`M${x} ${40 + (index % 3) * 18}l7 14`}
                  stroke={
                    ["#a78dd6", "#e9adbc", "#dfbd72", "#81bbae"][index % 4]
                  }
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

export function MobileExpressionLab({ active = true }: { active?: boolean }) {
  const [index, setIndex] = useState(0);
  const [replay, setReplay] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touring, setTouring] = useState(false);
  const [inView, setInView] = useState(false);
  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  const stage = useRef<HTMLDivElement>(null);
  const preset = LAB_PRESETS[index];
  const running = !paused && inView && !hidden && active;
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.1 },
    );
    if (stage.current) observer.observe(stage.current);
    const visibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!running || !touring) return;
    const timer = setInterval(
      () => setIndex((value) => (value + 1) % LAB_PRESETS.length),
      4500,
    );
    return () => clearInterval(timer);
  }, [running, touring]);
  const choose = (next: number, reveal = false) => {
    setIndex(next);
    setTouring(false);
    setPaused(false);
    setReplay((value) => value + 1);
    if (reveal && stage.current) {
      const rect = stage.current.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > innerHeight)
        stage.current.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
    }
  };
  return (
    <section
      id="expression-lab"
      className="mobile-expression-lab"
      aria-labelledby="expression-lab-title"
    >
      <div className="lab-heading">
        <span className="mobile-eyebrow">
          A LITTLE PERSONALITY · RIGHT HERE
        </span>
        <h2 id="expression-lab-title">
          The Expression Lab<span>.</span>
        </h2>
        <p>
          Tap a mood. Meet a different side of Bluey. No app, account, or AI
          connection needed.
        </p>
      </div>
      <div className="lab-layout">
        <div className="lab-preview">
          <div className="lab-preview-top">
            <span>
              <span className="lab-status-dot" />
              {running ? "IN MOTION" : "PAUSED"}
            </span>
            <span>
              <VolumeX size={13} /> ALWAYS SILENT
            </span>
          </div>
          <label className="lab-select">
            Expression
            <select
              aria-label="Choose a Bluey expression"
              value={preset.id}
              onChange={(event) =>
                choose(
                  LAB_PRESETS.findIndex(
                    (item) => item.id === event.target.value,
                  ),
                )
              }
            >
              <optgroup label="New animated scenes">
                {LAB_PRESETS.slice(0, 3).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Everyday Bluey">
                {LAB_PRESETS.slice(3).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <div
            ref={stage}
            className={`lab-stage ${running ? "" : "lab-paused"}`}
            data-preset={preset.id}
          >
            <ExpressionScene key={`${preset.id}-${replay}`} preset={preset} />
          </div>
          <div
            className="lab-caption"
            aria-live={touring ? "off" : "polite"}
            aria-atomic="true"
          >
            <h3>{preset.label}</h3>
            <p>{preset.description}</p>
          </div>
          <div
            className="lab-playback"
            role="group"
            aria-label="Scene playback"
          >
            <button
              onClick={() => setPaused(!paused)}
              aria-label={paused ? "Resume scene" : "Pause scene"}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={() => {
                setReplay((value) => value + 1);
                setPaused(false);
              }}
            >
              <RotateCcw size={16} />
              Replay scene
            </button>
            <button
              aria-pressed={touring}
              onClick={() => {
                setTouring(!touring);
                setPaused(false);
              }}
            >
              {touring ? <Pause size={16} /> : <Play size={16} />}
              {touring ? "Stop tour" : "Play tour"}
            </button>
          </div>
        </div>
        <div className="lab-picker">
          <div className="lab-picker-heading">
            <Sparkles size={17} />
            <h3>Little scenes, big feelings</h3>
            <span>NEW</span>
          </div>
          <div
            className="lab-new-scenes"
            role="group"
            aria-label="New animated scenes"
          >
            {LAB_PRESETS.slice(0, 3).map((item, i) => (
              <button
                key={item.id}
                aria-pressed={index === i}
                onClick={(event) => choose(i, event.detail > 0)}
              >
                <span className="lab-scene-number">0{i + 1}</span>
                <span>
                  {item.label}
                  <small>
                    {
                      [
                        "Typing with a little power",
                        "A bright idea",
                        "A happy celebration",
                      ][i]
                    }
                  </small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
          <h3 className="lab-moods-title">Everyday Bluey</h3>
          <div
            className="lab-mood-grid"
            role="group"
            aria-label="Bluey expressions"
          >
            {LAB_PRESETS.slice(3).map((item, i) => (
              <button
                key={item.id}
                aria-pressed={index === i + 3}
                onClick={(event) => choose(i + 3, event.detail > 0)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="lab-footnote">
            Just a little animation playground. The computer scene is
            pretend—Bluey isn’t using your device or running code.
          </p>
        </div>
      </div>
    </section>
  );
}
