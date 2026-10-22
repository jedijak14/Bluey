import {
  ArrowUpRight,
  Bluetooth,
  Mic,
  Moon,
  MousePointer2,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { liveExpression } from "../lib/expressions";
import { Avatar } from "./FloatingWidget/Avatar";
import type { FaceState } from "../lib/types";

/** Native companion control surface. The website's marketing hero stays on the web. */
export function DesktopHome({
  face,
  connected,
  model,
  onSettings,
  onDevices,
  onTools,
  onListen,
  onSleep,
  onPrompt,
}: {
  face: FaceState;
  connected: boolean;
  model: string;
  onSettings: () => void;
  onDevices: () => void;
  onTools: () => void;
  onListen: () => void;
  onSleep: () => void;
  onPrompt: (text: string) => void;
}) {
  return (
    <section className="desktop-home" aria-label="Windows companion dashboard">
      <div className="desktop-home-heading">
        <div>
          <span className="eyebrow-label">BLUEY FOR WINDOWS</span>
          <h1>A little help, right here.</h1>
        </div>
        <span className="desktop-local-chip">
          <span className={`status-dot ${connected ? "green" : ""}`} />
          {connected ? "Engine connected" : "Engine reconnecting"}
        </span>
      </div>
      <div className="desktop-stage">
        <div className="desktop-companion-scene">
          <div className="desktop-orbit" />
          <Avatar
            mood={face.mood}
            expression={liveExpression(face.mood, face.expression)}
          />
          <span>YOUR DESKTOP SIDEKICK</span>
        </div>
        <div className="desktop-companion-controls">
          <span className="desktop-kicker">AT HOME ON YOUR SCREEN</span>
          <h2>
            {face.mood === "sleepy"
              ? "Taking a little rest."
              : "Small companion. Real tools."}
          </h2>
          <p>
            I stay out of your way at the bottom of your screen. Ask me to
            point, research, or lend a hand. You approve computer actions.
          </p>
          <div className="desktop-quick-actions">
            <button
              className="primary-button"
              onClick={onListen}
              disabled={!connected}
            >
              <Mic size={16} />
              Start quiet session
            </button>
            <button
              className="outline-button"
              onClick={onSleep}
              disabled={!connected}
            >
              <Moon size={16} />
              {face.mood === "sleepy" ? "Wake up" : "Sleep"}
            </button>
          </div>
          <small>
            Ctrl + Shift + Space · session &nbsp; / &nbsp; Ctrl + Shift + S ·
            emergency stop
          </small>
        </div>
      </div>
      <div className="desktop-task-grid">
        <button
          onClick={() =>
            onPrompt(
              "Help me understand what is on my screen. Ask before reading it.",
            )
          }
        >
          <MousePointer2 />
          <strong>On my screen</strong>
          <span>Read, point, and explain</span>
          <ArrowUpRight />
        </button>
        <button
          onClick={() =>
            onPrompt(
              "Research a topic with sources. Ask me what I want to learn about.",
            )
          }
        >
          <Sparkles />
          <strong>Research with me</strong>
          <span>A clear answer, with sources</span>
          <ArrowUpRight />
        </button>
        <button onClick={onDevices}>
          <Bluetooth />
          <strong>Bring your Android</strong>
          <span>Wi-Fi or Bluetooth pairing</span>
          <ArrowUpRight />
        </button>
      </div>
      <div className="desktop-utility-row">
        <button onClick={onSettings}>
          <Settings2 size={15} />
          {model} · model settings
        </button>
        <button onClick={onTools}>
          <ShieldCheck size={15} />
          Focus, checklist & desktop tools
        </button>
        <span>Replies stay quiet. No voice output.</span>
      </div>
    </section>
  );
}
