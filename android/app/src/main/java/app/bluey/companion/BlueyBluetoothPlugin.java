package app.bluey.companion;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothClass;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

/** Foreground-only authenticated Bluey transport over the OS-paired SPP service. */
@android.annotation.SuppressLint("MissingPermission") // Runtime gate above every Bluetooth entry point; companion only.
@CapacitorPlugin(name = "BlueyBluetooth", permissions = {
    @Permission(alias = "bluetooth", strings = {Manifest.permission.BLUETOOTH_CONNECT})
})
public class BlueyBluetoothPlugin extends Plugin {
    private static final int MAX = 1000000;
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb");
    private final ExecutorService workers = Executors.newFixedThreadPool(3);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Object writeLock = new Object();
    private volatile BluetoothSocket socket;
    private volatile int generation;
    private boolean observing;
    private final BroadcastReceiver deviceChanges = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            // Broadcasts are only refresh hints, never trusted device data or authorization.
            devicesChanged();
        }
    };

    @Override public void load() {
        super.load();
        IntentFilter filter = new IntentFilter();
        filter.addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        filter.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        filter.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        filter.addAction(BluetoothAdapter.ACTION_STATE_CHANGED);
        // Bluetooth broadcasts originate from the privileged Bluetooth service, not
        // necessarily the system UID. EXPORTED is required on recent Android versions.
        if (Build.VERSION.SDK_INT >= 33)
            getContext().registerReceiver(deviceChanges, filter, Context.RECEIVER_EXPORTED);
        else getContext().registerReceiver(deviceChanges, filter);
        observing = true;
    }
    private void devicesChanged() { notifyListeners("devicesChanged", new JSObject()); }
    @Override protected void handleOnResume() {
        super.handleOnResume();
        devicesChanged();
    }

    private boolean permitted() {
        return Build.VERSION.SDK_INT < 31 || getPermissionState("bluetooth") == PermissionState.GRANTED;
    }
    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(android.content.Context.BLUETOOTH_SERVICE);
        return manager == null ? null : manager.getAdapter();
    }
    @PluginMethod public void devices(PluginCall call) {
        if (!permitted()) {
            if (Boolean.FALSE.equals(call.getBoolean("requestPermission", true)))
                call.reject("Allow Nearby devices to find and connect to your paired PC.");
            else requestPermissionForAlias("bluetooth", call, "permissionResult");
            return;
        }
        try {
            BluetoothAdapter adapter = adapter();
            if (adapter == null || !adapter.isEnabled()) {call.reject("Turn on Bluetooth in Android Settings first.");return;}
            JSArray devices = new JSArray();
            for (BluetoothDevice device : adapter.getBondedDevices()) {
                JSObject item = new JSObject();
                item.put("address", device.getAddress()); item.put("name", device.getName());
                BluetoothClass category = device.getBluetoothClass();
                item.put("computer", category != null && category.getMajorDeviceClass() == BluetoothClass.Device.Major.COMPUTER);
                devices.put(item);
            }
            JSObject result = new JSObject();result.put("devices", devices);call.resolve(result);
        } catch (SecurityException e) {call.reject("Bluetooth permission was denied.");}
    }
    @PermissionCallback private void permissionResult(PluginCall call) {
        if (permitted()) devices(call); else call.reject("Nearby devices permission is required for Bluetooth pairing.");
    }
    @PluginMethod public void connect(PluginCall call) {
        if (!permitted()) {call.reject("Allow Nearby devices before connecting to your PC.");return;}
        final String address = call.getString("address", "");
        if (!BluetoothAdapter.checkBluetoothAddress(address)) {call.reject("Select an OS-paired Windows PC.");return;}
        closeSocket();
        final int attempt = generation;
        workers.execute(() -> {
            BluetoothSocket pending = null;
            boolean connected = false;
            try {
                BluetoothAdapter adapter = adapter();
                if (adapter == null || !adapter.isEnabled()) throw new Exception();
                BluetoothDevice device = adapter.getRemoteDevice(address);
                if (device.getBondState() != BluetoothDevice.BOND_BONDED) throw new Exception();
                pending = device.createRfcommSocketToServiceRecord(SPP);
                if (attempt != generation) {pending.close();call.reject("Bluetooth connection cancelled.");return;}
                socket = pending;
                final BluetoothSocket connecting = pending;
                Runnable timeout = () -> {try {if (!connecting.isConnected()) connecting.close();}catch(Exception ignored){}};
                main.postDelayed(timeout, 15000);
                try {pending.connect();} finally {main.removeCallbacks(timeout);}
                if (attempt != generation) {pending.close();call.reject("Bluetooth connection cancelled.");return;}
                call.resolve();
                connected = true;
                read(pending, attempt);
            } catch (Exception e) {
                if (!connected) call.reject("Cannot connect. Pair in system Settings and enable the incoming Bluetooth COM port in Bluey on Windows.");
            } finally {
                if (pending != null) try {pending.close();} catch(Exception ignored){}
                if (attempt == generation) {
                    socket = null;
                    JSObject data = new JSObject();data.put("kind", "closed");notifyListeners("disconnect", data);
                }
            }
        });
    }
    private void read(BluetoothSocket active, int attempt) throws Exception {
        InputStream in = active.getInputStream();
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int size;
        while (attempt == generation && (size = in.read(buffer)) != -1) {
            for (int i=0;i<size;i++) {
                if (buffer[i] == '\n') {
                    JSObject data = new JSObject(line.toString("UTF-8"));line.reset();
                    notifyListeners("frame", data);
                } else {
                    if (line.size() >= MAX) throw new Exception("Frame too large");
                    line.write(buffer[i]);
                }
            }
        }
    }
    @PluginMethod public void send(PluginCall call) {
        final String frame = call.getString("frame", "");
        final byte[] data = (frame+"\n").getBytes(StandardCharsets.UTF_8);
        if (data.length > MAX || frame.contains("\n") || frame.contains("\r")) {call.reject("Invalid Bluetooth frame.");return;}
        final BluetoothSocket active = socket;
        workers.execute(() -> {
            try {
                if (active == null || active != socket || !active.isConnected()) throw new Exception();
                synchronized(writeLock) {active.getOutputStream().write(data);active.getOutputStream().flush();}
                call.resolve();
            } catch(Exception e) {call.reject("Bluetooth disconnected. Reconnect to Windows.");}
        });
    }
    private void closeSocket() {
        generation++;
        BluetoothSocket old = socket;socket = null;
        if (old != null) try {old.close();} catch(Exception ignored){}
    }
    @PluginMethod public void disconnect(PluginCall call) {closeSocket();call.resolve();}
    @Override protected void handleOnStop() {
        closeSocket();
        JSObject data = new JSObject();data.put("kind", "closed");notifyListeners("disconnect", data);
        super.handleOnStop();
    }
    @Override protected void handleOnDestroy() {
        if (observing) {getContext().unregisterReceiver(deviceChanges);observing = false;}
        closeSocket();workers.shutdownNow();super.handleOnDestroy();
    }
}
