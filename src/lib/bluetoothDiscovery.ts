import type { PairedBluetoothDevice } from "./bluetooth";

type Handle = { remove(): Promise<void> };
type DeviceAPI = {
  devices(options: {
    requestPermission: boolean;
  }): Promise<{ devices: PairedBluetoothDevice[] }>;
  addListener(event: "devicesChanged", callback: () => void): Promise<Handle>;
};
export type DiscoveryState = {
  devices: PairedBluetoothDevice[];
  busy: boolean;
  error: string;
};

export function selectPairedDevice(
  devices: PairedBluetoothDevice[],
  previous: string,
) {
  if (devices.some((device) => device.address === previous)) return previous;
  const computers = devices.filter((device) => device.computer);
  // Selection is only a convenience. Never connect, send data or authorize a PC here.
  if (computers.length === 1) return computers[0].address;
  return devices.length === 1 ? devices[0].address : "";
}

/** Only starts on the user's Bluetooth choice. Automatic refresh never prompts. */
export class BluetoothDiscovery {
  private active = true;
  private handle?: Handle;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private state: DiscoveryState = { devices: [], busy: false, error: "" };
  constructor(
    private api: DeviceAPI,
    private changed: (state: DiscoveryState) => void,
  ) {}
  start() {
    void this.api
      .addListener("devicesChanged", () => {
        if (!this.active) return;
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => void this.refresh(false), 150);
      })
      .then((handle) => {
        if (!this.active) void handle.remove().catch(() => {});
        else this.handle = handle;
      })
      .catch(() => {
        /* Manual refresh remains available if listener setup fails. */
      });
    void this.refresh(true);
  }
  async refresh(requestPermission: boolean) {
    if (!this.active || this.state.busy) return;
    this.state = { ...this.state, busy: true, error: "" };
    this.changed(this.state);
    try {
      const result = await this.api.devices({ requestPermission });
      if (!this.active) return;
      const devices = [...result.devices].sort(
        (a, b) =>
          Number(!!b.computer) - Number(!!a.computer) ||
          (a.name || a.address).localeCompare(b.name || b.address),
      );
      this.state = { devices, busy: false, error: "" };
    } catch (error) {
      if (!this.active) return;
      this.state = {
        devices: [],
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    this.changed(this.state);
  }
  dispose() {
    this.active = false;
    clearTimeout(this.refreshTimer);
    void this.handle?.remove().catch(() => {});
  }
}
