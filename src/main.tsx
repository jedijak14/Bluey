import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App";
import { Overlay } from "./components/FloatingWidget/Overlay";
import { Phone } from "./components/Phone";
import "./styles.css";
const overlay = location.hash === "#overlay";
if (overlay) document.documentElement.classList.add("overlay-document");
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {overlay ? (
      <Overlay />
    ) : Capacitor.isNativePlatform() || location.hash === "#phone" ? (
      <Phone />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
