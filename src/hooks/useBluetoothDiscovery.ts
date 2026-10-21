import { useEffect, useRef, useState } from "react";
import { Bluetooth } from "../lib/bluetooth";
import {
  BluetoothDiscovery,
  type DiscoveryState,
} from "../lib/bluetoothDiscovery";

export function useBluetoothDiscovery(enabled: boolean) {
  const controller = useRef<BluetoothDiscovery | null>(null);
  const [state, setState] = useState<DiscoveryState>({
    devices: [],
    busy: false,
    error: "",
  });
  useEffect(() => {
    if (!enabled) return;
    const discovery = new BluetoothDiscovery(Bluetooth, setState);
    controller.current = discovery;
    discovery.start();
    return () => {
      discovery.dispose();
      controller.current = null;
    };
  }, [enabled]);
  return { ...state, refresh: () => controller.current?.refresh(true) };
}
