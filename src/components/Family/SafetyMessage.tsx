import { useEffect, useRef } from "react";
import { ShieldAlert } from "lucide-react";
import { Avatar } from "../FloatingWidget/Avatar";
import type { SafetyAlert } from "../../lib/family";
export function SafetyMessage({
  alert,
  onClose,
  preview = false,
}: {
  alert: SafetyAlert;
  onClose: () => void;
  preview?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const site = alert.kind === "site_blocked";
  return (
    <dialog
      ref={dialog}
      className="kids-safety"
      onCancel={onClose}
      aria-labelledby="safety-title"
    >
      <img
        className="kids-logo"
        src="./bluey-kids-logo.png"
        alt="Bluey for Kids"
      />
      <div className="safety-arrival">
        <span className="safety-spark spark-one">✦</span>
        <Avatar mood="listening" expression="alarmed" gaze={{ x: 0, y: 0 }} />
        <span className="safety-spark spark-two">✧</span>
      </div>
      <ShieldAlert size={25} />
      <h2 id="safety-title">
        {site ? "A little safety pause." : "Time for a little break."}
      </h2>
      <p>
        {preview
          ? "Safety screen preview. No website was blocked and no notification was sent."
          : site
            ? `This website has been blocked due to parental settings. ${alert.seen ? "A notification has been sent to your parent." : "An alert is waiting in your parent’s Bluey Home inbox."}`
            : "Your Windows agent reported a session restriction. An alert is waiting in Bluey Home."}
      </p>
      {!preview && (
        <small>
          Reported {new Date(alert.created * 1000).toLocaleString()}. This alert
          covers the reported Windows event, not the content of other Android
          apps.
        </small>
      )}
      <button className="home-primary" onClick={onClose}>
        {preview ? "Close preview" : "Got it"}
      </button>
    </dialog>
  );
}
