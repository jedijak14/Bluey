import { bluetooth } from "./bluetooth";
import type { Packet } from "./types";
export class BlueyClient {
  socket?: WebSocket;
  private endpoint = "";
  private token = "";
  private retry?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private authenticated = false;
  private handshake?: ReturnType<typeof setTimeout>;
  private bluetoothHeartbeat?: ReturnType<typeof setInterval>;
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
  connectBluetooth(token: string) {
    this.disconnect();
    this.endpoint = "bluetooth:";
    this.token = token;
    this.stopped = false;
    this.onStatus("connecting");
    bluetooth.onPacket = (p) => {
      if (p.type === "ready") {
        this.authenticated = true;
        this.onStatus("connected");
        clearInterval(this.bluetoothHeartbeat);
        this.bluetoothHeartbeat = setInterval(
          () => this.send({ type: "ping" }),
          5000,
        );
      }
      this.dispatch(p);
    };
    bluetooth.onClose = () => {
      this.authenticated = false;
      this.onStatus("offline");
      this.dispatch({ type: "unpaired" });
    };
    void bluetooth.request({ kind: "open", token }).catch((error) => {
      this.authenticated = false;
      this.onStatus("offline");
      this.dispatch({ type: "error", text: String(error) });
    });
  }
  get connected() {
    return (
      this.authenticated &&
      !this.stopped &&
      (this.endpoint === "bluetooth:" ||
        this.socket?.readyState === WebSocket.OPEN)
    );
  }
  private sameConnection(endpoint: string, token: string) {
    return (
      this.endpoint === endpoint.replace(/\/$/, "") && this.token === token
    );
  }
  connect(endpoint: string, token: string) {
    // Saving a model or refreshing native credentials must not tear down a
    // healthy (or already authenticating) channel to the same engine.
    if (
      !this.stopped &&
      this.sameConnection(endpoint, token) &&
      (this.connected || this.handshake !== undefined)
    )
      return;
    this.disconnect();
    this.endpoint = endpoint.replace(/\/$/, "");
    this.token = token;
    this.stopped = false;
    this.attempts = 0;
    this.open();
  }
  async ensureConnected(
    endpoint: string,
    token: string,
    timeout = 25000,
  ): Promise<void> {
    this.connect(endpoint, token);
    if (this.connected) return;
    return new Promise((resolve, reject) => {
      const stop = this.subscribe((packet) => {
        if (
          packet.type === "ready" &&
          this.connected &&
          this.sameConnection(endpoint, token)
        ) {
          clearTimeout(timer);
          stop();
          resolve();
        } else if (packet.type === "unpaired") {
          clearTimeout(timer);
          stop();
          reject(
            new Error(
              "The engine rejected its credentials. Restart Bluey to refresh the native connection; do not re-enter an Ollama key.",
            ),
          );
        }
      });
      const timer = setTimeout(() => {
        stop();
        reject(
          new Error(
            "The saved model is not the problem: Bluey’s engine chat channel did not answer. Check that the Windows engine is running, then retry the connection. Your model and key are kept.",
          ),
        );
      }, timeout);
    });
  }
  private scheduleRetry() {
    clearTimeout(this.retry);
    if (!this.stopped)
      this.retry = setTimeout(
        () => this.open(),
        Math.min(10000, 1000 * 2 ** this.attempts++),
      );
  }
  private open() {
    if (this.stopped) return;
    this.authenticated = false;
    this.onStatus("connecting");
    try {
      const base = this.endpoint || location.origin;
      const socket = new WebSocket(`${base.replace(/^http/, "ws")}/api/ws`);
      this.socket = socket;
      const current = () => this.socket === socket && !this.stopped;
      const fail = (code = 1006) => {
        if (!current()) return;
        clearTimeout(this.handshake);
        this.handshake = undefined;
        this.authenticated = false;
        this.socket = undefined;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
        this.onStatus("offline");
        if (code === 4001) this.dispatch({ type: "unpaired" });
        else this.scheduleRetry();
      };
      // OPEN is not authenticated. Bound both a stalled upgrade and a server
      // that accepts the socket but never responds to the auth frame.
      this.handshake = setTimeout(() => fail(), 8000);
      socket.onopen = () => {
        if (current())
          socket.send(JSON.stringify({ type: "auth", token: this.token }));
      };
      socket.onmessage = (e) => {
        if (!current()) return;
        try {
          const p = JSON.parse(e.data);
          if (!p || typeof p.type !== "string") return;
          if (p.type === "ready") {
            clearTimeout(this.handshake);
            this.handshake = undefined;
            this.attempts = 0;
            this.authenticated = true;
            this.onStatus("connected");
          }
          if (this.authenticated) this.dispatch(p);
        } catch {
          /* Ignore invalid transport data. */
        }
      };
      socket.onclose = (e) => fail(e.code);
      socket.onerror = () => fail();
    } catch {
      this.authenticated = false;
      this.onStatus("offline");
      this.scheduleRetry();
    }
  }
  send(packet: Packet) {
    if (this.endpoint === "bluetooth:" && !this.stopped) {
      void bluetooth.send(packet, this.token).catch((error) => {
        this.onStatus("offline");
        this.dispatch({ type: "error", text: String(error) });
      });
      return;
    }
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN)
      throw new Error("Connect to your Windows backend first.");
    this.socket.send(JSON.stringify(packet));
  }
  async request<T>(
    path: string,
    body?: unknown,
    method?: string,
    signal?: AbortSignal,
    connection?: { endpoint: string; token: string },
  ): Promise<T> {
    if (this.endpoint === "bluetooth:" && !connection)
      return bluetooth.request<T>(
        {
          kind: "request",
          token: this.token,
          path,
          body,
          method: method ?? (body === undefined ? "GET" : "POST"),
        },
        signal,
      );
    const timeout = path === "/api/config/test" ? 360000 : 30000;
    const response = await fetch(
      `${connection?.endpoint ?? this.endpoint}${path}`,
      {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: {
          Authorization: `Bearer ${connection?.token ?? this.token}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
          : AbortSignal.timeout(timeout),
        cache: "no-store",
      },
    );
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
    this.authenticated = false;
    clearTimeout(this.handshake);
    this.handshake = undefined;
    clearInterval(this.bluetoothHeartbeat);
    this.bluetoothHeartbeat = undefined;
    if (this.endpoint === "bluetooth:") {
      bluetooth.onClose = () => {};
      bluetooth.onPacket = () => {};
      void bluetooth.disconnect();
      this.endpoint = "";
    }
    this.stopped = true;
    clearTimeout(this.retry);
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.close();
    }
    this.socket = undefined;
  }
}
export const client = new BlueyClient();
