import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import type { Packet } from "./types";
interface Frame {
  kind: string;
  id?: string;
  data?: unknown;
  error?: string;
  packet?: Packet;
}
export const Bluetooth = registerPlugin<{
  devices(): Promise<{ devices: { name: string; address: string }[] }>;
  connect(options: { address: string }): Promise<void>;
  send(options: { frame: string }): Promise<void>;
  disconnect(): Promise<void>;
  addListener(
    event: "frame",
    callback: (frame: Frame) => void,
  ): Promise<PluginListenerHandle>;
}>("BlueyBluetooth");

/** One foreground Android connection. Tokens stay in memory, never in a Bluetooth URL. */
class BluetoothTransport {
  private listener?: PluginListenerHandle;
  private pending = new Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  onPacket: (p: Packet) => void = () => {};
  onClose: () => void = () => {};
  async connect(address: string) {
    if (Capacitor.getPlatform() !== "android")
      throw new Error("Bluetooth pairing requires the Android APK.");
    await this.disconnect();
    this.listener = await Bluetooth.addListener("frame", (frame) => {
      if (frame.kind === "event" && frame.packet) this.onPacket(frame.packet);
      if (frame.kind === "closed") {
        this.rejectPending();
        this.onClose();
      }
      const wait = frame.id && this.pending.get(frame.id);
      if (wait) {
        clearTimeout(wait.timer);
        this.pending.delete(frame.id!);
        frame.error
          ? wait.reject(new Error(frame.error))
          : wait.resolve(frame.data);
      }
    });
    try {
      await Bluetooth.connect({ address });
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }
  request<T>(frame: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted)
      return Promise.reject(new Error("Bluetooth request cancelled."));
    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const fail = (error: Error) => {
        const wait = this.pending.get(id);
        if (wait) {
          clearTimeout(wait.timer);
          this.pending.delete(id);
        }
        signal?.removeEventListener("abort", abort);
        reject(error);
      };
      const abort = () => fail(new Error("Bluetooth request cancelled."));
      const timer = setTimeout(
        () =>
          fail(new Error("Bluetooth request timed out. Reconnect to Windows.")),
        frame.path === "/api/companion/notes" ? 120000 : 20000,
      );
      this.pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener("abort", abort);
          resolve(value as T);
        },
        reject: fail,
        timer,
      });
      signal?.addEventListener("abort", abort, { once: true });
      void Bluetooth.send({ frame: JSON.stringify({ ...frame, id }) }).catch(
        (error) =>
          fail(error instanceof Error ? error : new Error(String(error))),
      );
    });
  }
  send(packet: Packet) {
    return Bluetooth.send({
      frame: JSON.stringify({ kind: "packet", packet }),
    });
  }
  private rejectPending() {
    for (const wait of this.pending.values()) {
      clearTimeout(wait.timer);
      wait.reject(new Error("Bluetooth disconnected."));
    }
    this.pending.clear();
  }
  async disconnect() {
    this.rejectPending();
    await this.listener?.remove();
    this.listener = undefined;
    await Bluetooth.disconnect().catch(() => {});
  }
}
export const bluetooth = new BluetoothTransport();
