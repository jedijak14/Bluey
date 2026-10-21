import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import {
  MOTION_KEY,
  motionEnabled,
  parseMotionPreference,
  readMotionPreference,
  type MotionPreference,
} from "../lib/motionPreference";

const MotionContext = createContext({
  preference: "system" as MotionPreference,
  enabled: true,
  systemReduced: false,
  setPreference: (_value: MotionPreference) => {},
});
export const useMotionPreference = () => useContext(MotionContext);

export function MotionProvider({ children }: { children: ReactNode }) {
  const [preference, updatePreference] = useState(readMotionPreference);
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const enabled = motionEnabled(preference, systemReduced);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setSystemReduced(media.matches);
    const stored = (event: StorageEvent) => {
      if (event.key === MOTION_KEY || event.key === null)
        updatePreference(readMotionPreference());
    };
    changed();
    media.addEventListener("change", changed);
    window.addEventListener("storage", stored);
    return () => {
      media.removeEventListener("change", changed);
      window.removeEventListener("storage", stored);
    };
  }, []);
  useLayoutEffect(() => {
    // One resolved preference drives CSS and JavaScript, including explicit On
    // while the OS still requests reduced motion. Never change device settings.
    document.documentElement.dataset.motion = enabled ? "on" : "off";
  }, [enabled]);
  const setPreference = (value: MotionPreference) => {
    const next = parseMotionPreference(value);
    updatePreference(next);
    try {
      localStorage.setItem(MOTION_KEY, next);
    } catch {
      /* Still works in this tab when storage is blocked. */
    }
  };
  return (
    <MotionContext.Provider
      value={{ preference, enabled, systemReduced, setPreference }}
    >
      {children}
    </MotionContext.Provider>
  );
}

export function MotionControl() {
  const { preference, enabled, systemReduced, setPreference } =
    useMotionPreference();
  const id = useId();
  return (
    <div className="motion-control">
      <label htmlFor={id}>Motion</label>
      <select
        id={id}
        value={preference}
        aria-describedby={`${id}-help`}
        onChange={(event) =>
          setPreference(parseMotionPreference(event.target.value))
        }
      >
        <option value="system">System setting</option>
        <option value="on">On — override reduced motion</option>
        <option value="off">Off</option>
      </select>
      <p id={`${id}-help`}>
        {preference === "on"
          ? "Motion is on for Bluey, even if your device requests reduced motion."
          : preference === "off"
            ? "Motion is off for Bluey."
            : systemReduced
              ? "Your device requests reduced motion. Choose On to animate Bluey here."
              : "Following your device: motion is on."}
        {enabled
          ? " Animations stay silent."
          : " You can still choose expressions."}
      </p>
    </div>
  );
}
