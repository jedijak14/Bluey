package app.bluey.companion;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;

/** Kids-only enrollment storage. Never stores parent passwords or parent sessions. */
@CapacitorPlugin(name = "FamilyVault")
public class FamilyVaultPlugin extends Plugin {
    private static final String ALIAS = "bluey-kids-enrollment-v1";
    private SharedPreferences prefs() { return getContext().getSharedPreferences(ALIAS, Context.MODE_PRIVATE); }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    @PluginMethod public synchronized void write(PluginCall call) {
        String token = call.getString("token", "");
        if (!token.matches("[A-Za-z0-9_-]{43}")) { call.reject("Invalid Kids enrollment."); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            String value = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." +
                Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!prefs().edit().putString("enrollment", value).commit()) throw new IllegalStateException();
            call.resolve();
        } catch (Exception error) { call.reject("Could not securely store enrollment. Ask your parent for a new code."); }
    }
    @PluginMethod public synchronized void read(PluginCall call) {
        String token = "";
        try {
            String value = prefs().getString("enrollment", "");
            if (!value.isEmpty()) {
                String[] parts = value.split("\\.", 2);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
                token = new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
            }
        } catch (Exception error) { prefs().edit().remove("enrollment").commit(); }
        JSObject result = new JSObject(); result.put("token", token); call.resolve(result);
    }
    @PluginMethod public synchronized void clear(PluginCall call) {
        if (prefs().edit().remove("enrollment").commit()) call.resolve();
        else call.reject("Could not clear enrollment storage.");
    }
}
