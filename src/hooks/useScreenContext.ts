import { useEffect, useRef, useState } from "react";
import { client } from "../lib/client";
export type PrivacySettings = {
  computer_use: boolean;
  screen_access: boolean;
  live_sharing: boolean;
};
export function useScreenContext(connected: boolean) {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [sharing, setSharing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const state = useRef({
    generation: 0,
    stream: null as MediaStream | null,
    lease: "",
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    alive: true,
  });
  function stop() {
    const s = state.current;
    s.generation++;
    clearTimeout(s.timer);
    s.stream?.getTracks().forEach((t) => t.stop());
    s.stream = null;
    const lease = s.lease;
    s.lease = "";
    if (lease)
      void client.request("/api/screen/stop", { lease }).catch(() => {});
    if (s.alive) {
      setSharing(false);
      setBusy(false);
    }
  }
  async function refresh() {
    try {
      setSettings(await client.request<PrivacySettings>("/api/privacy"));
      setError("");
    } catch (e) {
      setSettings(null);
      setError(String(e));
    }
  }
  useEffect(() => {
    state.current.alive = true;
    if (connected) void refresh();
    else {
      stop();
      setSettings(null);
    }
    const off = client.subscribe((p) => {
      if (p.type === "privacy_changed") {
        setSettings(p as unknown as PrivacySettings);
        if (!p.screen_access) stop();
      }
      if (p.type === "stopped") stop();
    });
    return () => {
      state.current.alive = false;
      stop();
      off();
    };
  }, [connected]);
  async function update(patch: Partial<PrivacySettings>) {
    if (!settings) return;
    if (patch.screen_access === false) stop();
    setBusy(true);
    setError("");
    try {
      setSettings(
        await client.request<PrivacySettings>(
          "/api/privacy",
          {
            computer_use: settings.computer_use,
            screen_access: settings.screen_access,
            ...patch,
          },
          "PUT",
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!settings?.screen_access || busy || sharing) return;
    const s = state.current,
      generation = ++s.generation;
    setBusy(true);
    setError("");
    let local: MediaStream | undefined;
    try {
      local = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 },
        audio: false,
      });
      if (generation !== s.generation) {
        local.getTracks().forEach((t) => t.stop());
        return;
      }
      s.stream = local;
      local.getVideoTracks()[0].addEventListener("ended", stop, { once: true });
      const result = await client.request<{ lease: string }>(
        "/api/screen/lease",
        {},
      );
      if (generation !== s.generation) {
        await client.request("/api/screen/stop", result);
        return;
      }
      s.lease = result.lease;
      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = local;
      await video.play();
      if (generation !== s.generation) {
        video.srcObject = null;
        return;
      }
      const canvas = document.createElement("canvas");
      const capture = async () => {
        if (generation !== s.generation) return;
        try {
          const scale = Math.min(
            1,
            960 / video.videoWidth,
            960 / video.videoHeight,
          );
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          canvas
            .getContext("2d")!
            .drawImage(video, 0, 0, canvas.width, canvas.height);
          await client.request(
            "/api/screen/frame",
            {
              lease: s.lease,
              image: canvas.toDataURL("image/jpeg", 0.6).split(",")[1],
            },
            "PUT",
          );
          if (generation === s.generation)
            s.timer = setTimeout(() => void capture(), 3000);
        } catch (e) {
          if (generation === s.generation) {
            setError(String(e));
            stop();
          }
        }
      };
      setSharing(true);
      setBusy(false);
      await capture();
    } catch (e) {
      local?.getTracks().forEach((t) => t.stop());
      if (generation === s.generation) {
        stop();
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }
  return { settings, sharing, busy, error, update, start, stop, refresh };
}
export type ScreenContext = ReturnType<typeof useScreenContext>;
