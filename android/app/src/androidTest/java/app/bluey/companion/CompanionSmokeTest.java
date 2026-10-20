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
        waitFor(s, "document.querySelector('.phone-instruction')?.textContent.includes('Hold to ask')");
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
            assertEquals("false", evaluate(s, "document.querySelector('[title=\"Enable spoken replies\"]').getAttribute('aria-pressed')==='true'"));
            status(s);
            assertEquals("TTS must not initialize by default", "false", evaluate(s, "window.__voiceStatus.synthesisInitialized"));
            assertEquals("No background listening", "false", evaluate(s, "window.__voiceStatus.listening"));
            evaluate(s, "document.querySelector('[title=\"Companion options\"]').click()");
            waitFor(s, "document.querySelector('textarea')");
            assertEquals("Speak replies defaults off", "false", evaluate(s, "document.querySelector('.phone-options form input[type=checkbox]').checked"));
            evaluate(s, "document.querySelector('.phone-device-voice input').click()");
            typeQuestion(s, "android silent test");
            status(s);
            assertEquals("Text reply must not initialize TTS", "false", evaluate(s, "window.__voiceStatus.synthesisInitialized"));
            assertEquals("CI installs a system recognition fixture", "true", evaluate(s, "window.__voiceStatus.recognition"));
            assertEquals("CI must exercise the configured fixture, not another recognizer", "false", evaluate(s, "window.__voiceStatus.onDevice"));
            long pressed = SystemClock.uptimeMillis();
            s.onActivity(activity -> {
                android.webkit.WebView web = activity.getBridge().getWebView();
                MotionEvent down = MotionEvent.obtain(pressed, pressed, MotionEvent.ACTION_DOWN, web.getWidth() * .45f, web.getHeight() * .65f, 0);
                web.dispatchTouchEvent(down); down.recycle();
            });
            waitFor(s, "document.querySelector('.phone-instruction')?.textContent.includes('Listening — release')");
            s.onActivity(activity -> {
                android.webkit.WebView web = activity.getBridge().getWebView();
                MotionEvent up = MotionEvent.obtain(pressed, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, web.getWidth() * .45f, web.getHeight() * .65f, 0);
                web.dispatchTouchEvent(up); up.recycle();
            });
            waitFor(s, "document.querySelector('.phone-caption')?.textContent.includes('Message received: device recognition smoke test')");
            status(s);
            assertEquals("Recognized input must still produce silent text", "false", evaluate(s, "window.__voiceStatus.synthesisInitialized"));
            evaluate(s, "document.querySelector('[title=\"Companion options\"]').click()");
            waitFor(s, "document.querySelector('textarea')");
            evaluate(s, "document.querySelector('.phone-options form input[type=checkbox]').click()");
            typeQuestion(s, "optional device output test");
            boolean finished = false;
            long deadline = SystemClock.elapsedRealtime() + 15000;
            while (SystemClock.elapsedRealtime() < deadline) {
                status(s);
                if ("true".equals(evaluate(s, "window.__voiceStatus.synthesisInitialized && !window.__voiceStatus.speaking"))) {
                    finished = true; break;
                }
                SystemClock.sleep(100);
            }
            assertTrue("Explicit opt-in should complete through Android TTS", finished);
            assertEquals("No speech-service errors", "null", evaluate(s, "document.querySelector('.phone-error')"));
            evaluate(s, "document.querySelector('[title=\"Mute spoken replies\"]').click()");
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
