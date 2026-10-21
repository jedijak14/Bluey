import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Monitor,
  ShieldCheck,
  Sparkles,
  X,
  Mic,
  ExternalLink,
} from "lucide-react";
import { Avatar } from "./FloatingWidget/Avatar";
import { currentDevice, type DeviceKind } from "../lib/deviceSupport";
import { MotionControl } from "./MotionPreferences";
const RESTRICTION =
  "iPads, Phones, and other tablets are not supported. You are now viewing the mobile version of the website.";
export function MobileWebsite({
  device,
  requestedAI = false,
  onDesktop,
}: {
  device: DeviceKind;
  requestedAI?: boolean;
  onDesktop: () => void;
}) {
  const [blocked, setBlocked] = useState(requestedAI);
  const [checking, setChecking] = useState(false);
  const [detected, setDetected] = useState(device);
  const button = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const frame = useRef(0);
  const hadDialog = useRef(false);
  useEffect(() => {
    setBlocked(requestedAI);
  }, [requestedAI]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    if (!blocked) {
      if (hadDialog.current) button.current?.focus();
      hadDialog.current = false;
      return;
    }
    hadDialog.current = true;
    close.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBlocked(false);
      }
      if (e.key === "Tab") {
        e.preventDefault();
        close.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
    };
  }, [blocked]);
  function test() {
    setChecking(true);
    frame.current = requestAnimationFrame(() => {
      const result = currentDevice();
      setDetected(result);
      setChecking(false);
      if (result === "desktop") onDesktop();
      else setBlocked(true);
    });
  }
  const label =
    detected === "ipad"
      ? "iPad"
      : detected === "phone"
        ? "phone"
        : detected === "tablet"
          ? "tablet"
          : "unidentified device";
  return (
    <main className="mobile-site">
      <div inert={blocked}>
        <header className="mobile-site-nav">
          <a href="#" className="mobile-brand" aria-label="Bluey home">
            <img src="./favicon.svg" alt="" />
            bluey<span>.</span>
          </a>
          <a href="#account">Bluey Account · Home</a>
          <a href="#about-bluey">
            Meet Bluey <ArrowDown size={14} />
          </a>
        </header>
        <MotionControl />
        <section className="mobile-intro">
          <span className="mobile-eyebrow">
            A LITTLE COMPANION. A DIFFERENT VIEW.
          </span>
          <div className="mobile-character-scene">
            <span className="mobile-halo" />
            <img
              className="mobile-device"
              src={`./devices/${device === "phone" ? "phone" : "tablet"}.svg`}
              alt={
                device === "ipad"
                  ? "iPad illustration"
                  : device === "phone"
                    ? "Phone illustration"
                    : "Generic tablet illustration"
              }
            />
            <Avatar
              mood="listening"
              expression="sad"
              gaze={{ x: 0, y: 0 }}
              className="mobile-sad-bluey"
            />
          </div>
          <h1>
            Big ideas.
            <br />
            <em>A smaller screen.</em>
          </h1>
          <p className="mobile-lede">
            Bluey’s desktop experience needs a little more room. But you can
            still meet your companion, explore the features, and learn how it
            all works right here.
          </p>
          <div className="mobile-access-note">
            <Monitor size={19} />
            <p>{RESTRICTION}</p>
          </div>
          <a className="mobile-explore" href="#about-bluey">
            Explore Bluey <ArrowDown size={16} />
          </a>
        </section>
        <section id="about-bluey" className="mobile-story">
          <span className="mobile-eyebrow">MEET YOUR LITTLE SIDEKICK</span>
          <h2>
            More personality.
            <br />
            Less getting in your way.
          </h2>
          <p>
            Bluey is a Windows desktop companion with its own expressive pointer
            and an optional paired Android face. This mobile site is a guide—not
            a remote desktop or a running AI model.
          </p>
          <div className="mobile-feature-grid">
            <article>
              <Sparkles />
              <h3>A face for every moment</h3>
              <p>
                A focused “On it,” quiet thinking bubbles, and a warm welcome.
                Little details that make the workspace feel more human.
              </p>
            </article>
            <article>
              <ShieldCheck />
              <h3>You stay in control</h3>
              <p>
                Desktop actions need your approval. Bluey never speaks replies.
                Double-tap the paired phone to start a quiet session; hold and
                release to ask.
              </p>
            </article>
            <article>
              <Mic />
              <h3>Know when it’s listening</h3>
              <p>
                A gentle blue outline appears around the screen during active
                microphone recording—not while Bluey is merely thinking or idle.
              </p>
            </article>
          </div>
        </section>
        <section className="mobile-ai-card">
          <span className="mobile-eyebrow">THE AI PREVIEW</span>
          <h2>Curious? Meet Gemma.</h2>
          <p>
            The desktop preview is configured for Gemma 3 1B. It needs a
            connected Python inference service; publishing a website alone does
            not make the model available.
          </p>
          <button ref={button} onClick={test} disabled={checking}>
            {checking ? "Checking browser signals…" : "Test AI"}
            <ArrowRight size={18} />
          </button>
          <small>
            We check compatibility when you press Test AI. Phones and tablets
            can browse this guide, but cannot enter the AI preview.
          </small>
        </section>
        <section className="mobile-how">
          <span className="mobile-eyebrow">WHEN YOU’RE BACK AT YOUR DESK</span>
          <h2>Three little steps.</h2>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>Open on your computer</h3>
                <p>
                  Use a desktop or laptop browser for the AI preview and full
                  workspace.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Connect the right engine</h3>
                <p>
                  Gemma needs a hosted inference service. Windows automation
                  uses the separate Bluey engine on your PC.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Make yourself at home</h3>
                <p>
                  Explore your companion and approve actions one at a time. The
                  native Android paired app is separate from this mobile
                  website.
                </p>
              </div>
            </li>
          </ol>
          <a href="./downloads.html" target="_blank" rel="noreferrer">
            Downloads & setup guides <ExternalLink size={14} />
          </a>
        </section>
        <footer className="mobile-site-footer">
          <span>
            bluey<span>.</span>
          </span>
          <p>
            Little companion. Desktop home.
            <br />
            You’re browsing the mobile information site.
          </p>
          <small>
            Device detection uses browser signals, not a CPU/GPU identity scan.
            An unidentified tablet is not assumed to be an iPad.
          </small>
        </footer>
      </div>
      {blocked && (
        <div
          className="mobile-ai-block"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setBlocked(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-ai-title"
          >
            <Avatar mood="listening" expression="sad" gaze={{ x: 0, y: 0 }} />
            <span className="mobile-eyebrow">AI PREVIEW · DESKTOP ONLY</span>
            <h2 id="mobile-ai-title">Let’s try this on a computer.</h2>
            <p>
              This browser appears to be on{" "}
              {label === "iPad" || label === "unidentified device" ? "an" : "a"}{" "}
              {label}. {RESTRICTION}
            </p>
            <p className="mobile-detection-note">
              This check is an estimate based on browser/platform signals. No
              CPU/GPU identity is collected or sent.
            </p>
            <button
              ref={close}
              onClick={() => {
                setBlocked(false);
              }}
            >
              <X size={16} />
              Keep exploring
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
