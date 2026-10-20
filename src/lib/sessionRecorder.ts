import { DeviceSpeech } from "./deviceSpeech";
import { Microphone } from "./audio";
/** Android recognition is utterance-based, not a guaranteed gapless audio stream. */
export class SessionRecorder {
  private mic = new Microphone();
  private id = "";
  private generation = 0;
  private started = 0;
  constructor(
    private native: boolean,
    private transcribe: (wav: string) => Promise<string>,
    private microphoneId: () => string | undefined = () => undefined,
  ) {}
  async start() {
    const generation = ++this.generation;
    if (this.native) {
      const { id } = await DeviceSpeech.startRecognition();
      if (generation !== this.generation) {
        await DeviceSpeech.cancelRecognition();
        throw new Error("Session cancelled.");
      }
      this.id = id;
    } else await this.mic.start(() => {}, this.microphoneId());
    this.started = Date.now();
  }
  async ready() {
    if (this.native)
      return (
        (await DeviceSpeech.getStatus()).listening === false ||
        Date.now() - this.started > 45000
      );
    return Date.now() - this.started > 8000;
  }
  snapshot(): Promise<string> | undefined {
    return this.native ? undefined : this.mic.drain();
  }
  async cut(snapshot?: Promise<string>): Promise<string> {
    this.started = Date.now();
    if (this.native) {
      const id = this.id;
      this.id = "";
      try {
        return (await DeviceSpeech.stopRecognition({ id })).text;
      } catch (e) {
        if (/No speech detected|No match/i.test(String(e))) return "";
        throw e;
      }
    }
    return this.transcribe(await (snapshot ?? this.mic.drain()));
  }
  async restart() {
    if (this.native) await this.start();
  }
  cancel() {
    this.generation++;
    this.id = "";
    return this.native ? DeviceSpeech.cancelRecognition() : this.mic.cancel();
  }
}
