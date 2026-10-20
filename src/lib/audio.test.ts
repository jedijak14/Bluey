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
it("drains session audio without closing the microphone and resets the buffer", async () => {
  let processAudio:
    | ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void)
    | null = null;
  const stopTrack = vi.fn();
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [{ stop: stopTrack }] }),
    },
  });
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      sampleRate = 8000;
      resume = async () => {};
      close = async () => {
        this.state = "closed";
      };
      createMediaStreamSource() {
        return { connect: () => {} };
      }
      createScriptProcessor() {
        return {
          connect: () => {},
          disconnect: () => {},
          set onaudioprocess(fn: typeof processAudio) {
            processAudio = fn;
          },
        };
      }
    },
  );
  const sizes: number[] = [];
  vi.stubGlobal(
    "FileReader",
    class {
      result = "data:audio/wav;base64,AA";
      onload?: () => void;
      readAsDataURL(blob: Blob) {
        sizes.push(blob.size);
        this.onload?.();
      }
    },
  );
  const mic = new Microphone();
  await mic.start(() => {});
  (processAudio as unknown as (event: unknown) => void)({
    inputBuffer: { getChannelData: () => new Float32Array([0.1, 0.2, 0.3]) },
  });
  await mic.drain();
  await mic.drain();
  expect(sizes).toEqual([50, 44]);
  expect(stopTrack).not.toHaveBeenCalled();
  await mic.cancel();
  expect(stopTrack).toHaveBeenCalledOnce();
});
