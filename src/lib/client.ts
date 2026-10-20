import type { Packet } from "./types";
export class BlueyClient {
  socket?: WebSocket;
  private endpoint = "";
  private token = "";
  private retry?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private attempts = 0;
  private listeners = new Set<(p: Packet) => void>();
  subscribe(listener: (p: Packet) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private dispatch(packet: Packet) {
    this.onPacket(packet);
    this.listeners.forEach((listener) => listener(packet));
  }
  onPacket: (p: Packet) => void = () => {};
  onStatus: (s: "connected" | "connecting" | "offline") => void = () => {};
  connect(endpoint: string, token: string) {
    this.disconnect();
    this.endpoint = endpoint.replace(/\/$/, "");
    this.token = token;
    this.stopped = false;
    this.open();
  }
  private open() {
    this.onStatus("connecting");
    try {
      const base = this.endpoint || location.origin;
      const socket = new WebSocket(`${base.replace(/^http/, "ws")}/api/ws`);
      this.socket = socket;
      socket.onopen = () =>
        socket.send(JSON.stringify({ type: "auth", token: this.token }));
      socket.onmessage = (e) => {
        try {
          const p = JSON.parse(e.data);
          if (p.type === "ready") {
            this.attempts = 0;
            this.onStatus("connected");
          }
          this.dispatch(p);
        } catch {
          /* Ignore invalid transport data. */
        }
      };
      socket.onclose = (e) => {
        if (this.socket !== socket) return;
        this.onStatus("offline");
        if (e.code === 4001) this.dispatch({ type: "unpaired" });
        if (!this.stopped && e.code !== 4001) {
          this.retry = setTimeout(
            () => this.open(),
            Math.min(15000, 1000 * 2 ** this.attempts++),
          );
        }
      };
      socket.onerror = () => socket.close();
    } catch {
      this.onStatus("offline");
    }
  }
  send(packet: Packet) {
    if (this.socket?.readyState !== WebSocket.OPEN)
      throw new Error("Connect to your Windows backend first.");
    this.socket.send(JSON.stringify(packet));
  }
  async request<T>(
    path: string,
    body?: unknown,
    method?: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(`${this.endpoint}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
      cache: "no-store",
    });
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: response.statusText }));
      throw new Error(
        typeof error.detail === "string"
          ? error.detail
          : "The backend rejected this request.",
      );
    }
    try {
      return await response.json();
    } catch {
      throw new Error(
        "The address did not return a Bluey engine response. Check the backend address; the hosted website is not the engine.",
      );
    }
  }
  disconnect() {
    this.stopped = true;
    clearTimeout(this.retry);
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
    }
    this.socket = undefined;
  }
}
export const client = new BlueyClient();
