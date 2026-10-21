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
  sequence?: number;
  nonce?: string;
  ciphertext?: string;
}
export const Bluetooth = registerPlugin<{
  devices(): Promise<{ devices: { name: string; address: string }[] }>;
  connect(options: { address: string }): Promise<void>;
  send(options: { frame: string }): Promise<void>;
  disconnect(): Promise<void>;
  addListener(
    event: "frame" | "disconnect",
    callback: (frame: Frame) => void,
  ): Promise<PluginListenerHandle>;
}>("BlueyBluetooth");
const bytes = (base64: string) =>
  Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
const base64 = (data: Uint8Array) => {
  let result = "";
  for (let i = 0; i < data.length; i += 8192)
    result += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(result);
};
const clientAAD = new TextEncoder().encode("bluey-bt-v1:client");
const serverAAD = new TextEncoder().encode("bluey-bt-v1:server");

/** Fresh encryption keys protect old queued serial data from a later OS-paired device.
 * The handshake travels inside OS-paired secure RFCOMM. Bluey code authentication
 * is separate. No secrets, frames or keys are persisted/logged. */
class BluetoothTransport {
  private listeners: PluginListenerHandle[] = [];
  private key?: CryptoKey;
  private outgoing = 0;
  private incoming = -1;
  private writeQueue: Promise<void> = Promise.resolve();
  private readQueue: Promise<void> = Promise.resolve();
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
  private receive(frame: Frame) {
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
  }
  async connect(address: string) {
    if (Capacitor.getPlatform() !== "android")
      throw new Error("Bluetooth pairing requires the Android APK.");
    await this.disconnect();
    const raw = crypto.getRandomValues(new Uint8Array(32));
    this.key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
    this.outgoing = 0;
    this.incoming = -1;
    this.listeners.push(
      await Bluetooth.addListener("frame", (frame) => {
        const key = this.key;
        // Unsealed replies/events must never downgrade an established encrypted link.
        if (frame.kind !== "sealed" || !key) return;
        this.readQueue = this.readQueue
          .catch(() => {})
          .then(async () => {
            try {
              if (key !== this.key) return;
              const plain = await crypto.subtle.decrypt(
                {
                  name: "AES-GCM",
                  iv: bytes(frame.nonce!),
                  additionalData: serverAAD,
                },
                key,
                bytes(frame.ciphertext!),
              );
              const decoded = JSON.parse(
                new TextDecoder().decode(plain),
              ) as Frame;
              if (
                key !== this.key ||
                !Number.isSafeInteger(decoded.sequence) ||
                decoded.sequence !== this.incoming + 1
              )
                return;
              this.incoming++;
              this.receive(decoded);
            } catch {
              /* Stale, corrupt or foreign ciphertext is not application data. */
            }
          });
      }),
    );
    this.listeners.push(
      await Bluetooth.addListener("disconnect", () => {
        this.rejectPending();
        this.onClose();
      }),
    );
    try {
      await Bluetooth.connect({ address });
      await Bluetooth.send({
        frame: JSON.stringify({ kind: "hello", key: base64(raw) }),
      });
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }
  private transmit(frame: Record<string, unknown>) {
    const key = this.key;
    const next = this.writeQueue
      .catch(() => {})
      .then(async () => {
        if (!key || key !== this.key)
          throw new Error("Bluetooth disconnected.");
        const sequence = this.outgoing++;
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: nonce, additionalData: clientAAD },
          key,
          new TextEncoder().encode(JSON.stringify({ ...frame, sequence })),
        );
        if (key !== this.key) throw new Error("Bluetooth disconnected.");
        await Bluetooth.send({
          frame: JSON.stringify({
            kind: "sealed",
            nonce: base64(nonce),
            ciphertext: base64(new Uint8Array(ciphertext)),
          }),
        });
      });
    this.writeQueue = next;
    return next;
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
      void this.transmit({ ...frame, id }).catch((error) =>
        fail(error instanceof Error ? error : new Error(String(error))),
      );
    });
  }
  send(packet: Packet, token: string) {
    return this.transmit({ kind: "packet", packet, token });
  }
  private rejectPending() {
    for (const wait of this.pending.values()) {
      clearTimeout(wait.timer);
      wait.reject(new Error("Bluetooth disconnected."));
    }
    this.pending.clear();
  }
  async disconnect() {
    this.key = undefined;
    this.rejectPending();
    const listeners = this.listeners;
    this.listeners = [];
    await Promise.all(listeners.map((listener) => listener.remove()));
    await Bluetooth.disconnect().catch(() => {});
  }
}
export const bluetooth = new BluetoothTransport();
