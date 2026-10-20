import { Capacitor, registerPlugin } from "@capacitor/core";
export type FamilyPolicy = {
  version: number;
  daily_minutes: number;
  bedtime_start: string;
  bedtime_end: string;
  timezone: string;
  blocked_domains: string[];
  allowed_domains?: string[];
};
export type SafetyAlert = {
  id: string;
  kind: string;
  domain: string;
  created: number;
  seen: number | null;
  name?: string;
};
export type ChildProfile = {
  website_rules?: { version: string; blocked: string[]; allowed: string[] };
  alerts?: SafetyAlert[];
  agent?: {
    recent: boolean;
    last_seen: number | null;
    report: {
      policy_version: number;
      time_service: boolean;
      edge_rules: boolean;
      error: string;
    } | null;
  };
  id: string;
  name: string;
  policy: FamilyPolicy;
  extra_minutes_today: number;
  used_minutes: number | null;
  protected: boolean;
  last_seen: string | null;
  notice: string;
};
export type ExtraRequest = {
  id: string;
  child: string;
  name?: string;
  minutes: number;
  reason: string;
  status: string;
  created: number;
};
export type Dashboard = { children: ChildProfile[]; requests: ExtraRequest[] };
const nativeBase = Capacitor.isNativePlatform()
  ? import.meta.env.VITE_BLUEY_FAMILY_ORIGIN || "https://bluey-plum.vercel.app"
  : "";
export class FamilyError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function familyRequest<T>(
  path: string,
  token = "",
  body?: unknown,
  method?: string,
): Promise<T> {
  if (typeof window !== "undefined" && window.blueyFamily) {
    const result = await window.blueyFamily.request(
      path,
      token,
      body,
      method || (body === undefined ? "GET" : "POST"),
    );
    if (result.status >= 400)
      throw new FamilyError(
        result.data?.error || "Family request failed.",
        result.status,
      );
    return result.data as T;
  }
  const response = await fetch(`${nativeBase}/api/family/${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
    credentials: "omit",
  });
  const data = await response.json().catch(() => ({
    error: "The family service returned an invalid response.",
  }));
  if (!response.ok)
    throw new FamilyError(
      data.error || data.detail || "The family request failed.",
      response.status,
    );
  return data;
}
const NativeFamilyVault = registerPlugin<{
  read(): Promise<{ token: string }>;
  write(options: { token: string }): Promise<void>;
  clear(): Promise<void>;
}>("FamilyVault");
export const exampleFamily: Dashboard = {
  children: [
    {
      id: "demo-avery",
      name: "Avery",
      policy: {
        version: 0,
        daily_minutes: 120,
        bedtime_start: "21:00",
        bedtime_end: "07:00",
        timezone: "America/Los_Angeles",
        blocked_domains: ["example.com"],
      },
      extra_minutes_today: 0,
      used_minutes: null,
      protected: false,
      last_seen: null,
      notice: "Sample profile, not a real child or managed device.",
    },
    {
      id: "demo-sam",
      name: "Sam",
      policy: {
        version: 0,
        daily_minutes: 90,
        bedtime_start: "20:30",
        bedtime_end: "07:00",
        timezone: "America/Los_Angeles",
        blocked_domains: [],
      },
      extra_minutes_today: 0,
      used_minutes: null,
      protected: false,
      last_seen: null,
      notice: "Sample profile, not a real child or managed device.",
    },
  ],
  requests: [],
};

export const FamilyVault =
  typeof window !== "undefined" && window.blueyFamily
    ? {
        read: window.blueyFamily.vaultRead,
        write: window.blueyFamily.vaultWrite,
        clear: window.blueyFamily.vaultClear,
      }
    : NativeFamilyVault;
