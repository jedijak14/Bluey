// WAV recording works offline, including in the Android WebView; no cloud speech API.
export class Microphone {
  private context?: AudioContext;
  private stream?: MediaStream;
  private processor?: ScriptProcessorNode;
  private samples: Float32Array[] = [];
  private length = 0;
  async start(onLevel: (n: number) => void, deviceId?: string) {
    if (this.context || this.stream)
      throw new Error("Recording is already active.");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
        video: false,
      });
      this.context = new AudioContext();
      await this.context.resume();
      const source = this.context.createMediaStreamSource(this.stream);
      this.processor = this.context.createScriptProcessor(4096, 1, 1);
      this.samples = [];
      this.length = 0;
      const sampleRate = this.context.sampleRate;
      this.processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const remaining = sampleRate * 60 - this.length;
        if (remaining <= 0) return;
        const s = input.subarray(0, remaining);
        this.samples.push(new Float32Array(s));
        this.length += s.length;
        onLevel(
          Math.min(
            1,
            Math.sqrt(s.reduce((a, b) => a + b * b, 0) / s.length) * 5,
          ),
        );
      };
      source.connect(this.processor);
      this.processor.connect(this.context.destination);
    } catch (error) {
      this.processor?.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      if (this.context && this.context.state !== "closed")
        await this.context.close();
      this.context = undefined;
      this.stream = undefined;
      this.processor = undefined;
      throw error;
    }
  }
  async stop(): Promise<string> {
    const rate = this.context?.sampleRate ?? 48000;
    this.processor?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    const context = this.context;
    this.context = undefined;
    this.stream = undefined;
    this.processor = undefined;
    if (context && context.state !== "closed") await context.close();
    const b = new ArrayBuffer(44 + this.length * 2),
      v = new DataView(b);
    const str = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
    };
    str(0, "RIFF");
    v.setUint32(4, 36 + this.length * 2, true);
    str(8, "WAVE");
    str(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    str(36, "data");
    v.setUint32(40, this.length * 2, true);
    let o = 44;
    for (const s of this.samples)
      for (const n of s) {
        v.setInt16(o, Math.max(-1, Math.min(1, n)) * 32767, true);
        o += 2;
      }
    this.samples = [];
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.readAsDataURL(new Blob([b], { type: "audio/wav" }));
    });
  }
}
