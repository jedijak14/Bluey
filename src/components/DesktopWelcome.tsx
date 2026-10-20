import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Avatar } from "./FloatingWidget/Avatar";
const KEY = "bluey.desktop-welcome.v1";
export function DesktopWelcome({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === "seen";
    } catch {
      return false;
    }
  });
  const [phase, setPhase] = useState("arrival");
  useEffect(() => {
    if (entered) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      setPhase("logo");
      return;
    }
    const wink = setTimeout(() => setPhase("wink"), 500);
    const logo = setTimeout(() => setPhase("logo"), 1500);
    const reduced = () => {
      if (media.matches) {
        clearTimeout(wink);
        clearTimeout(logo);
        setPhase("logo");
      }
    };
    media.addEventListener("change", reduced);
    return () => {
      clearTimeout(wink);
      clearTimeout(logo);
      media.removeEventListener("change", reduced);
    };
  }, [entered]);
  function enter() {
    try {
      sessionStorage.setItem(KEY, "seen");
    } catch {
      /* Session-only fallback. */
    }
    setEntered(true);
  }
  if (entered) return <>{children}</>;
  return (
    <main
      className={`desktop-welcome welcome-${phase}`}
      aria-label="Welcome to Bluey"
    >
      <button className="welcome-skip" onClick={enter}>
        Skip intro
      </button>
      <div className="welcome-stage">
        <div className="welcome-berry">
          <Avatar
            mood="listening"
            expression={phase === "wink" ? "wink" : undefined}
            gaze={{ x: 0, y: 0 }}
          />
        </div>
        <div className="welcome-wordmark" aria-hidden={phase !== "logo"}>
          bluey<span>.</span>
        </div>
        <p>A little company. A lot of possibility.</p>
        <button
          className="welcome-enter"
          disabled={phase !== "logo"}
          onClick={enter}
        >
          Enter Bluey <ArrowRight size={18} />
        </button>
      </div>
      <span className="welcome-bottom">YOUR LITTLE DESKTOP COMPANION</span>
    </main>
  );
}
