export type MotionPreference = "system" | "on" | "off";
export const MOTION_KEY = "bluey.motion-preference.v1";

export function parseMotionPreference(value: unknown): MotionPreference {
  return value === "on" || value === "off" ? value : "system";
}

export function motionEnabled(
  preference: MotionPreference,
  systemReduced: boolean,
) {
  return preference === "on" || (preference === "system" && !systemReduced);
}

export function readMotionPreference(): MotionPreference {
  try {
    return parseMotionPreference(localStorage.getItem(MOTION_KEY));
  } catch {
    return "system";
  }
}
