import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BluetoothDiscovery,
  selectPairedDevice,
  type DiscoveryState,
} from "./bluetoothDiscovery";

const pc = { name: "My PC", address: "AA:BB:CC:DD:EE:01", computer: true };
const headphones = {
  name: "Headphones",
  address: "AA:BB:CC:DD:EE:02",
  computer: false,
};
function fixture() {
  let notify = () => {};
  const remove = vi.fn(async () => {});
  const api = {
    devices: vi.fn(async (_options: { requestPermission: boolean }) => ({
      devices: [pc],
    })),
    addListener: vi.fn(
      async (_event: "devicesChanged", callback: () => void) => {
        notify = callback;
        return { remove };
      },
    ),
  };
  const states: DiscoveryState[] = [];
  const discovery = new BluetoothDiscovery(api, (value) => states.push(value));
  return { discovery, api, states, remove, notify: () => notify() };
}
afterEach(() => vi.useRealTimers());
describe("OS-paired Bluetooth discovery", () => {
  it("does nothing until enabled, then requests Nearby Devices once", async () => {
    const f = fixture();
    expect(f.api.devices).not.toHaveBeenCalled();
    f.discovery.start();
    await vi.waitFor(() => expect(f.states.at(-1)?.devices).toEqual([pc]));
    expect(f.api.devices).toHaveBeenCalledExactlyOnceWith({
      requestPermission: true,
    });
    f.discovery.dispose();
    expect(f.remove).toHaveBeenCalledOnce();
  });
  it("debounces OS pairing/resume changes and refreshes without permission prompts", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.discovery.start();
    await vi.runAllTimersAsync();
    f.api.devices.mockResolvedValue({ devices: [] });
    f.notify();
    f.notify();
    f.notify();
    await vi.runAllTimersAsync();
    expect(f.api.devices).toHaveBeenCalledTimes(2);
    expect(f.api.devices).toHaveBeenLastCalledWith({
      requestPermission: false,
    });
    expect(f.states.at(-1)?.devices).toEqual([]);
    f.discovery.dispose();
  });
  it("reports denial; automatic updates cannot ask again, explicit retry can", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.api.devices.mockRejectedValue(new Error("Nearby devices denied"));
    f.discovery.start();
    await vi.runAllTimersAsync();
    expect(f.states.at(-1)?.error).toContain("denied");
    f.notify();
    await vi.runAllTimersAsync();
    expect(f.api.devices).toHaveBeenLastCalledWith({
      requestPermission: false,
    });
    f.api.devices.mockResolvedValue({ devices: [pc] });
    await f.discovery.refresh(true);
    expect(f.states.at(-1)?.error).toBe("");
    expect(f.api.devices).toHaveBeenLastCalledWith({ requestPermission: true });
    f.discovery.dispose();
  });
  it("ignores late permission results and removes late subscriptions after unmount", async () => {
    const f = fixture();
    let resolve!: (result: { devices: (typeof pc)[] }) => void;
    f.api.devices.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    f.discovery.start();
    f.discovery.dispose();
    resolve({ devices: [pc] });
    await Promise.resolve();
    await Promise.resolve();
    expect(f.states).toHaveLength(1);
    expect(f.remove).toHaveBeenCalledOnce();
  });
  it("keeps explicit selection and never guesses among multiple computers", () => {
    const second = { ...pc, address: "AA:BB:CC:DD:EE:03" };
    expect(selectPairedDevice([headphones, pc], "")).toBe(pc.address);
    expect(selectPairedDevice([headphones, pc], headphones.address)).toBe(
      headphones.address,
    );
    expect(selectPairedDevice([pc, second], "")).toBe("");
    expect(selectPairedDevice([], pc.address)).toBe("");
    expect(selectPairedDevice([headphones], "")).toBe("");
  });
});
