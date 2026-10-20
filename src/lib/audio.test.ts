import { afterEach, expect, it, vi } from "vitest";
import { Microphone } from "./audio";

afterEach(() => vi.unstubAllGlobals());
it("does not leave the microphone running if Stop happens during the permission prompt", async () => {
  let grant!: (stream: MediaStream) => void;
  const stopTrack = vi.fn();
  const getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((resolve) => {
        grant = resolve;
      }),
  );
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal(
    "FileReader",
    class {
      result = "data:audio/wav;base64,AA";
      onload?: () => void;
      readAsDataURL() {
        this.onload?.();
      }
    },
  );
  const mic = new Microphone();
  const started = mic.start(vi.fn(), "chosen-windows-device");
  const rejected = expect(started).rejects.toThrow("Recording cancelled");
  await mic.stop();
  grant({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream);
  await rejected;
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(getUserMedia).toHaveBeenCalledWith({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      deviceId: { exact: "chosen-windows-device" },
    },
    video: false,
  });
});
