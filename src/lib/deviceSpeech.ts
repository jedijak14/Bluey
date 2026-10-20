import { registerPlugin } from "@capacitor/core";

export const DEFAULT_SPEAK_REPLIES = false;
export interface DeviceSpeechPlugin {
  getStatus(): Promise<{
    listening?: boolean;
    recognition: boolean;
    onDevice: boolean;
    synthesis: boolean;
  }>;
  startRecognition(): Promise<{ id: string }>;
  stopRecognition(options: { id: string }): Promise<{ text: string }>;
  cancelRecognition(): Promise<void>;
  chirp(): Promise<void>;
  saveNotes(options: {
    name: string;
    text: string;
  }): Promise<{ saved: boolean }>;
  speak(options: { text: string }): Promise<void>;
  stopSpeaking(): Promise<void>;
}
export const DeviceSpeech = registerPlugin<DeviceSpeechPlugin>("DeviceSpeech");

/** Android always requests text: even opted-in speech is synthesized on the phone. */
export function requestServerVoice(native: boolean, enabled: boolean) {
  void native;
  void enabled;
  return false;
}

/** Cancellable sequence avoids queuing an entire reply after mute/backgrounding. */
export class DeviceReplySpeaker {
  private generation = 0;
  constructor(
    private device: Pick<
      DeviceSpeechPlugin,
      "speak" | "stopSpeaking"
    > = DeviceSpeech,
  ) {}
  stop() {
    this.generation++;
    return this.device.stopSpeaking().catch(() => {});
  }
  async speak(
    text: string,
    onError: (message: string) => void,
    onActive: (value: boolean) => void,
  ) {
    const stopped = this.stop();
    const generation = this.generation;
    // Bound long output. Captions retain the text even if speech is unavailable.
    const chunks =
      text.slice(0, 12000).match(/[\s\S]{1,2800}(?:\s|$)|[\s\S]{1,2800}/g) ??
      [];
    try {
      await stopped;
      if (generation !== this.generation) return;
      if (chunks.length) onActive(true);
      for (const chunk of chunks) {
        if (generation !== this.generation) return;
        await this.device.speak({ text: chunk });
      }
    } catch (error) {
      if (
        generation === this.generation &&
        !(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "CANCELLED"
        )
      )
        onError(
          error instanceof Error
            ? error.message
            : "Device speech is unavailable. Check Android voice settings.",
        );
    } finally {
      if (generation === this.generation) onActive(false);
    }
  }
}
