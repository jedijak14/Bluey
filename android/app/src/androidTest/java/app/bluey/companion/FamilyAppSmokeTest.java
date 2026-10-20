package app.bluey.companion;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;
import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FamilyAppSmokeTest {
    private String evaluate(ActivityScenario<MainActivity> s, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        s.onActivity(a -> a.getBridge().getWebView().evaluateJavascript(script, v -> {result.set(v); done.countDown();}));
        assertTrue(done.await(10, TimeUnit.SECONDS)); return result.get();
    }
    private void waitFor(ActivityScenario<MainActivity> s, String condition) throws Exception {
        long deadline = SystemClock.elapsedRealtime()+30000;
        while(SystemClock.elapsedRealtime()<deadline) {
            if("true".equals(evaluate(s,"Boolean("+condition+")"))) return;
            SystemClock.sleep(100);
        }
        fail("Timed out: "+condition+" DOM: "+evaluate(s,"document.body.innerText"));
    }
    @Test public void separatePackageNoMicrophoneAndCorrectScreen() throws Exception {
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String name = c.getPackageName();
        assumeTrue(name.equals("app.bluey.home") || name.equals("app.bluey.kids"));
        String[] permissions = c.getPackageManager().getPackageInfo(name,PackageManager.GET_PERMISSIONS).requestedPermissions;
        for (String permission : permissions) assertNotEquals(Manifest.permission.RECORD_AUDIO,permission);
        try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)) {
            waitFor(s,name.endsWith("home")?"document.querySelector('.bluey-home')":"document.querySelector('.bluey-kids')");
            assertEquals("null",evaluate(s,"document.querySelector('.phone-pairing')"));
            if(name.endsWith("kids")) {
                // Exercise the real Keystore-backed bridge, never a production credential.
                evaluate(s,"window.vaultTest=null;Capacitor.Plugins.FamilyVault.write({token:'a'.repeat(43)}).then(()=>Capacitor.Plugins.FamilyVault.read()).then(r=>window.vaultTest=r.token).catch(e=>window.vaultTest='error')");
                waitFor(s,"window.vaultTest === 'a'.repeat(43)");
                String disk = c.getSharedPreferences("bluey-kids-enrollment-v1",Context.MODE_PRIVATE).getString("enrollment", "");
                assertFalse(disk.contains("aaaaaaaaaaaaaaaa")); assertTrue(disk.contains("."));
                evaluate(s,"window.vaultTest=null;Capacitor.Plugins.FamilyVault.clear().then(()=>Capacitor.Plugins.FamilyVault.read()).then(r=>window.vaultTest=r.token)");
                waitFor(s,"window.vaultTest === ''");
            }
        }
    }
}
