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

    @Test public void pairsWithRealBridgeAndSendsTextAndMicrophoneAudio() throws Exception {
        // Grant the OS permission only in the test process, not in the application.
        InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(
            "pm grant app.bluey.companion android.permission.RECORD_AUDIO").close();
        try (ActivityScenario<MainActivity> s = ActivityScenario.launch(MainActivity.class)) {
            waitFor(s, "document.querySelector('.phone-pairing')");
            String pairingCode = code();
            evaluate(s, "(()=>{const inputs=document.querySelectorAll('form input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(inputs[0],'http://10.0.2.2:8765');inputs[0].dispatchEvent(new Event('input',{bubbles:true}));set.call(inputs[1]," + JSONObject.quote(pairingCode) + ");inputs[1].dispatchEvent(new Event('input',{bubbles:true}));})()");
            evaluate(s, "document.querySelector('form').requestSubmit()");
            waitFor(s, "document.querySelector('.phone-connection')?.textContent.includes('Connected to Windows')");
            evaluate(s, "document.querySelector('[title=\"Companion options\"]').click()");
            waitFor(s, "document.querySelector('textarea')");
            evaluate(s, "(()=>{const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'android smoke test');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
            evaluate(s, "document.querySelector('.phone-options form').requestSubmit()");
            waitFor(s, "document.querySelector('.phone-caption')?.textContent.includes('Message received: android smoke test')");
            waitFor(s, "document.querySelector('.phone-instruction')?.textContent.includes('Hold to ask')");
            // Real native WebView getUserMedia capture; STT/model/TTS are fixtures on CI.
            float[] point = new float[2];
            s.onActivity(activity -> {
                android.webkit.WebView web = activity.getBridge().getWebView();
                // Dispatch native MotionEvents in WebView-local coordinates to avoid
                // cross-window input injection failures on the rotated emulator.
                point[0] = web.getWidth() * 0.45f;
                point[1] = web.getHeight() * 0.65f;
            });
            long pressed = SystemClock.uptimeMillis();
            s.onActivity(activity -> {
                MotionEvent event = MotionEvent.obtain(pressed, pressed, MotionEvent.ACTION_DOWN, point[0], point[1], 0);
                activity.getBridge().getWebView().dispatchTouchEvent(event);
                event.recycle();
            });
            waitFor(s, "document.querySelector('.phone-instruction')?.textContent.includes('Listening — release')");
            SystemClock.sleep(1200);
            s.onActivity(activity -> {
                MotionEvent event = MotionEvent.obtain(pressed, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, point[0], point[1], 0);
                activity.getBridge().getWebView().dispatchTouchEvent(event);
                event.recycle();
            });
            waitFor(s, "document.querySelector('.phone-caption')?.textContent.includes('Voice transport verified')");
            waitFor(s, "document.querySelector('.phone-instruction')?.textContent.includes('Hold to ask')");
            assertEquals("No voice or microphone error", "null", evaluate(s, "document.querySelector('.phone-error')"));
        }
    }
}
