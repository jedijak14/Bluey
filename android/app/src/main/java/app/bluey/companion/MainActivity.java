package app.bluey.companion;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

/** The companion stays visible while this foreground activity is open. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (getPackageName().equals("app.bluey.companion")) registerPlugin(DeviceSpeechPlugin.class);
        if (getPackageName().equals("app.bluey.kids")) registerPlugin(FamilyVaultPlugin.class);
        super.onCreate(savedInstanceState);
        if (getPackageName().equals("app.bluey.companion")) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Only bundled UI is loaded. Paired replies may arrive after the hold gesture ends.
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}
