package app.bluey.companion;

import static org.junit.Assert.*;

import android.os.SystemClock;
import android.view.MotionEvent;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Native WebView tests, using an explicitly test-only engine on the CI host. */
@RunWith(AndroidJUnit4.class)
public class CompanionSmokeTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
            script, value -> { result.set(value); done.countDown(); }
        ));
        assertTrue("WebView did not evaluate JavaScript", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    private void waitFor(ActivityScenario<MainActivity> scenario, String condition) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 30000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(evaluate(scenario, "Boolean(" + condition + ")"))) return;
            SystemClock.sleep(100);
        }
        fail("Timed out: " + condition + "\nDOM: " + evaluate(scenario, "document.body.innerText"));
    }

    private String code() throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL("http://10.0.2.2:8765/api/pair/create").openConnection();
        c.setConnectTimeout(10000); c.setReadTimeout(10000);
        c.setRequestMethod("POST"); c.setRequestProperty("Authorization", "Bearer native-smoke-test-only");
        c.setRequestProperty("Content-Type", "application/json"); c.setDoOutput(true);
        c.getOutputStream().write("{}".getBytes(StandardCharsets.UTF_8));
        assertEquals("Test backend unavailable", 200, c.getResponseCode());
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream in = c.getInputStream()) {
            byte[] buffer = new byte[1024]; int n;
            while ((n = in.read(buffer)) != -1) bytes.write(buffer, 0, n);
        } finally { c.disconnect(); }
        return new JSONObject(bytes.toString("UTF-8")).getString("code");
    }

    private boolean allowNearbyDialog(android.view.accessibility.AccessibilityNodeInfo node, StringBuilder visible) {
        String id = node.getViewIdResourceName();
        String owner = String.valueOf(node.getPackageName());
        if (visible.length() < 3000) visible.append(owner).append("/").append(id)
            .append("=").append(node.getText()).append("; ");
        if (owner.contains("permissioncontroller") && id != null
            && id.endsWith(":id/permission_allow_button") && node.isEnabled())
            return node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK);
        for (int i = 0; i < node.getChildCount(); i++) {
            android.view.accessibility.AccessibilityNodeInfo child = node.getChild(i);
            if (child != null && allowNearbyDialog(child, visible)) return true;
        }
        return false;
    }

    @Test public void bluetoothChoiceRequestsNearbyPermissionAndResumeRefreshes() throws Exception {
        org.junit.Assume.assumeTrue(android.os.Build.VERSION.SDK_INT >= 31);
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        // Reset permission from adb BEFORE instrumentation starts. Revoking a
        // granted permission in this process kills the test runner itself.
        assertEquals("Start this test with Nearby Devices permission revoked externally",
            android.content.pm.PackageManager.PERMISSION_DENIED,
            context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT));
        try (ActivityScenario<MainActivity> s = ActivityScenario.launch(MainActivity.class)) {
            waitFor(s, "document.querySelector('.phone-pairing')");
            evaluate(s, "window.__btDenied=null;Capacitor.Plugins.BlueyBluetooth.devices({requestPermission:false}).then(()=>window.__btDenied='unexpected success',e=>window.__btDenied=e.message)");
            waitFor(s, "window.__btDenied");
            assertTrue(evaluate(s, "window.__btDenied").contains("Nearby devices"));
            assertEquals(android.content.pm.PackageManager.PERMISSION_DENIED,
                context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT));
            evaluate(s, "(()=>{const e=document.querySelector('[aria-label=\"Connection transport\"]');e.value='bluetooth';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
            android.app.UiAutomation ui = InstrumentationRegistry.getInstrumentation().getUiAutomation();
            android.accessibilityservice.AccessibilityServiceInfo info = ui.getServiceInfo();
            info.flags |= android.accessibilityservice.AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                | android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
            ui.setServiceInfo(info);
            long deadline = SystemClock.elapsedRealtime() + 15000;
            boolean clicked = false;
            StringBuilder visible = new StringBuilder();
            while (!clicked && SystemClock.elapsedRealtime() < deadline) {
                visible.setLength(0);
                // Google and AOSP images use different permission-controller namespaces.
                // Inspect system windows, not just a potentially stale WebView active root.
                for (android.view.accessibility.AccessibilityWindowInfo window : ui.getWindows()) {
                    android.view.accessibility.AccessibilityNodeInfo root = window.getRoot();
                    if (root != null) clicked |= allowNearbyDialog(root, visible);
                }
                if (!clicked) SystemClock.sleep(100);
            }
            assertTrue("Choosing Bluetooth must display the actual Android Nearby Devices permission prompt"
                + "\nWindows: " + visible + "\nDOM: " + evaluate(s, "document.body.innerText"), clicked);
            waitFor(s, "!document.body.innerText.includes('Checking paired devices…')");
            assertEquals(android.content.pm.PackageManager.PERMISSION_GRANTED,
                context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT));
            evaluate(s, "window.__btChanges=0;window.__btListenerReady=false;Capacitor.Plugins.BlueyBluetooth.addListener('devicesChanged',()=>window.__btChanges++).then(()=>window.__btListenerReady=true)");
            waitFor(s, "window.__btListenerReady");
            s.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
            s.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
            waitFor(s, "window.__btChanges>0");
            // The emulator has no real paired PC: no claim of radio connectivity.
            assertEquals("No device is authorized by discovery alone", "null", evaluate(s, "document.querySelector('.face-screen')"));
        }
    }

    @Test public void offlineExpressionsAndNativePackage() throws Exception {
        assertEquals("app.bluey.companion", InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName());
        try (ActivityScenario<MainActivity> s = ActivityScenario.launch(MainActivity.class)) {
            waitFor(s, "document.querySelector('.phone-pairing')");
            assertEquals("No desktop-preview navigation in APK", "null", evaluate(s, "document.querySelector('.phone-back')"));
            evaluate(s, "document.querySelector('.text-button').click()");
            waitFor(s, "document.querySelector('.face-screen')");
            evaluate(s, "document.querySelector('[title=\"Companion options\"]').click()");
            waitFor(s, "document.querySelector('select')");
            evaluate(s, "(()=>{const e=document.querySelector('select');e.value='happy';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
            waitFor(s, "document.querySelector('.face-screen').getAttribute('aria-label')==='Bluey is happy'");
        }
    }

    private String shell(String command) throws Exception {
        android.os.ParcelFileDescriptor fd = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);
        try (java.io.InputStream in = new android.os.ParcelFileDescriptor.AutoCloseInputStream(fd)) {
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[1024]; int n;
            while ((n = in.read(buffer)) != -1) bytes.write(buffer, 0, n);
            return bytes.toString("UTF-8").trim();
        }
    }
    private void restore(String key, String value) throws Exception {
        shell(value.equals("null") || value.isEmpty() ? "settings delete secure " + key : "settings put secure " + key + " " + value);
    }
    private void status(ActivityScenario<MainActivity> s) throws Exception {
        evaluate(s, "window.__voiceStatus=null;Capacitor.Plugins.DeviceSpeech.getStatus().then(x=>window.__voiceStatus=x)");
        waitFor(s, "window.__voiceStatus");
    }
    private void typeQuestion(ActivityScenario<MainActivity> s, String question) throws Exception {
        evaluate(s, "(()=>{const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e," + JSONObject.quote(question) + ");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
        evaluate(s, "document.querySelector('.phone-options form').requestSubmit()");
        waitFor(s, "document.querySelector('.phone-caption')?.textContent.includes(" + JSONObject.quote("Message received: " + question) + ")");
        waitFor(s, "!document.querySelector('.phone-instruction')?.textContent.includes('Thinking')");
    }

    @Test public void deviceSpeechIsSilentByDefaultAndUsesAndroidServices() throws Exception {
        String oldRecognizer = shell("settings get secure voice_recognition_service");
        String oldTts = shell("settings get secure tts_default_synth");
        shell("pm grant app.bluey.companion android.permission.RECORD_AUDIO");
        shell("pm grant app.bluey.companion.test android.permission.RECORD_AUDIO");
        shell("settings put secure voice_recognition_service app.bluey.companion.test/app.bluey.companion.FixtureRecognitionService");
        shell("settings put secure tts_default_synth app.bluey.companion.test");
        try (ActivityScenario<MainActivity> s = ActivityScenario.launch(MainActivity.class)) {
            // The emulator advertises an on-device engine. This test deliberately
            // exercises our installed system-service fixture instead. Reflection
            // is instrumentation-only; there is no JS or production test switch.
            s.onActivity(activity -> {
                try {
                    java.lang.reflect.Field preference = DeviceSpeechPlugin.class.getDeclaredField("preferOnDevice");
                    preference.setAccessible(true);
                    preference.setBoolean(activity.getBridge().getPlugin("DeviceSpeech").getInstance(), false);
                } catch (ReflectiveOperationException e) { throw new AssertionError(e); }
            });
            waitFor(s, "document.querySelector('.phone-pairing')");
            String pairingCode = code();
            evaluate(s, "(()=>{const inputs=document.querySelectorAll('form input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(inputs[0],'http://10.0.2.2:8765');inputs[0].dispatchEvent(new Event('input',{bubbles:true}));set.call(inputs[1]," + JSONObject.quote(pairingCode) + ");inputs[1].dispatchEvent(new Event('input',{bubbles:true}));})()");
            evaluate(s, "document.querySelector('form').requestSubmit()");
            waitFor(s, "document.querySelector('.phone-connection')?.textContent.includes('Connected to Windows')");
            assertEquals("No spoken-output switch", "null", evaluate(s, "document.querySelector('[title=\"Enable spoken replies\"]')"));
            status(s);
            assertEquals("TTS must not initialize by default", "false", evaluate(s, "window.__voiceStatus.synthesisInitialized"));
            assertEquals("No background listening", "false", evaluate(s, "window.__voiceStatus.listening"));
            evaluate(s, "document.querySelector('[title=\"Companion options\"]').click()");
            waitFor(s, "document.querySelector('textarea')");

            typeQuestion(s, "android silent test");
            status(s);
            assertEquals("Text reply must not initialize TTS", "false", evaluate(s, "window.__voiceStatus.synthesisInitialized"));
            assertEquals("CI installs a system recognition fixture", "true", evaluate(s, "window.__voiceStatus.recognition"));
            assertEquals("CI must exercise the configured fixture, not another recognizer", "false", evaluate(s, "window.__voiceStatus.onDevice"));
            evaluate(s, "document.querySelector('[title=\"Companion options\"]').click()");
            evaluate(s, "Array.from(document.querySelectorAll('.phone-options button')).find(b=>b.textContent==='Start quiet session').click()");
            waitFor(s, "document.querySelector('.session-consent')");
            evaluate(s, "document.querySelectorAll('.session-consent input')[1].click()");
            evaluate(s, "document.querySelector('.session-consent .primary-button').click()");
            waitFor(s, "document.querySelector('.phone-instruction')?.textContent.includes('Keeping context')");
            long pressed = SystemClock.uptimeMillis();
            s.onActivity(activity -> {
                android.webkit.WebView web = activity.getBridge().getWebView();
                MotionEvent down = MotionEvent.obtain(pressed, pressed, MotionEvent.ACTION_DOWN, web.getWidth() * .45f, web.getHeight() * .45f, 0);
                web.dispatchTouchEvent(down); down.recycle();
            });
            waitFor(s, "document.querySelector('.phone-instruction')?.textContent.includes('Release to ask')");
            s.onActivity(activity -> {
                android.webkit.WebView web = activity.getBridge().getWebView();
                MotionEvent up = MotionEvent.obtain(pressed, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, web.getWidth() * .45f, web.getHeight() * .45f, 0);
                web.dispatchTouchEvent(up); up.recycle();
            });
            waitFor(s, "document.querySelector('.phone-caption')?.textContent.includes('Message received: device recognition smoke test')");
            status(s);
            assertEquals("Recognized input must still produce silent text", "false", evaluate(s, "window.__voiceStatus.synthesisInitialized"));
            evaluate(s, "document.querySelector('[title=\"Companion options\"]').click()");
            waitFor(s, "document.querySelector('textarea')");
            typeQuestion(s, "still silent test");
            status(s);
            assertEquals("Session replies never initialize TTS", "false", evaluate(s, "window.__voiceStatus.synthesisInitialized"));
            assertEquals("Session keeps input active after an answer", "true", evaluate(s, "window.__voiceStatus.listening"));
            s.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
            s.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
            status(s);
            assertEquals("Backgrounding stops recognition", "false", evaluate(s, "window.__voiceStatus.listening"));
            assertEquals("Backgrounding stops TTS", "false", evaluate(s, "window.__voiceStatus.speaking"));
        } finally {
            restore("voice_recognition_service", oldRecognizer);
            restore("tts_default_synth", oldTts);
        }
    }
}
