export type DeviceKind = "desktop" | "phone" | "ipad" | "tablet" | "unknown";
export type DeviceSignals = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  mobileHint?: boolean;
  coarsePointer: boolean;
};
/** Best-effort compatibility policy, not proof of physical hardware or an auth boundary. */
export function classifyDevice(s: DeviceSignals): DeviceKind {
  const ua = s.userAgent;
  if (
    /iPad/i.test(ua) ||
    (/Macintosh|MacIntel/i.test(`${ua} ${s.platform}`) && s.maxTouchPoints > 1)
  )
    return "ipad";
  if (/iPhone|iPod|Windows Phone|Android.*Mobile/i.test(ua)) return "phone";
  if (/Android|Tablet|Kindle|Silk|PlayBook/i.test(ua)) return "tablet";
  if (s.mobileHint === true) return "phone";
  if (s.maxTouchPoints > 1 && s.coarsePointer) return "tablet";
  if (
    /Windows NT|Macintosh|MacIntel|X11|Linux|CrOS/i.test(`${ua} ${s.platform}`)
  )
    return "desktop";
  return "unknown";
}
export function currentDevice(): DeviceKind {
  const n = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return classifyDevice({
    userAgent: n.userAgent,
    platform: n.platform,
    maxTouchPoints: n.maxTouchPoints || 0,
    mobileHint: n.userAgentData?.mobile,
    coarsePointer: matchMedia("(pointer: coarse)").matches,
  });
}
