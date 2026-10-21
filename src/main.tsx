import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App";
import { MotionProvider } from "./components/MotionPreferences";
import { HomeApp } from "./components/Family/HomeApp";
import { KidsApp } from "./components/Family/KidsApp";
import { Overlay } from "./components/FloatingWidget/Overlay";
import { GemmaPreview } from "./components/GemmaPreview";
import { DesktopWelcome } from "./components/DesktopWelcome";
import { MobileWebsite } from "./components/MobileWebsite";
import { currentDevice } from "./lib/deviceSupport";
import { Phone } from "./components/Phone";
import "./styles.css";
function Root() {
  const [hash, setHash] = useState(location.hash);
  const [device, setDevice] = useState(currentDevice);
  const native = Capacitor.isNativePlatform();
  const overlay = !native && Boolean(window.bluey) && hash === "#overlay";
  useEffect(() => {
    const changed = () => {
      setHash(location.hash);
      setDevice(currentDevice());
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("overlay-document", overlay);
  }, [overlay]);
  const variant = import.meta.env.VITE_BLUEY_VARIANT;
  if (variant === "home") return <HomeApp />;
  if (variant === "kids") return <KidsApp />;
  if (hash === "#home" || hash === "#account") return <HomeApp />;
  if (hash === "#kids") return <KidsApp />;
  const content = ["#gemma", "#starter"].includes(hash) ? (
    <GemmaPreview standalone />
  ) : hash === "#phone" ? (
    <Phone />
  ) : (
    <App />
  );
  return native ? (
    <Phone />
  ) : overlay ? (
    <Overlay />
  ) : device !== "desktop" && !window.bluey ? (
    <MobileWebsite
      device={device}
      requestedAI={["#gemma", "#starter"].includes(hash)}
      onDesktop={() => {
        setDevice(currentDevice());
        location.hash = "gemma";
      }}
    />
  ) : window.bluey ? (
    content
  ) : (
    <DesktopWelcome>{content}</DesktopWelcome>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MotionProvider>
      <Root />
    </MotionProvider>
  </React.StrictMode>,
);

import "./components/Family/family.css";
