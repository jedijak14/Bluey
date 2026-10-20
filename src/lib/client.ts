import type { Packet } from "./types";
export class BlueyClient {
  socket?: WebSocket;
  private endpoint = "";
  private token = "";
  private retry?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private attempts = 0;
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
          this.onPacket(p);
        } catch {
          /* Ignore invalid transport data. */
        }
      };
      socket.onclose = (e) => {
        if (this.socket !== socket) return;
        this.onStatus("offline");
        if (e.code === 4001) this.onPacket({ type: "unpaired" });
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
  async request<T>(path: string, body?: unknown, method?: string): Promise<T> {
    const response = await fetch(`${this.endpoint}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
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
    return response.json();
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
