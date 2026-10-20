import type { CSSProperties } from "react";
/** Visual feedback only. This component never starts a microphone or requests permission. */
export function ListeningEdge({
  active,
  level = 0,
}: {
  active: boolean;
  level?: number;
}) {
  if (!active) return null;
  const intensity = Number.isFinite(level)
    ? Math.max(0, Math.min(1, level))
    : 0;
  return (
    <div
      className="listening-edge"
      aria-hidden="true"
      data-active="true"
      style={{ "--listen-opacity": 0.55 + intensity * 0.25 } as CSSProperties}
    />
  );
}
