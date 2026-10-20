package app.bluey.companion;

import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionService;
import android.speech.SpeechRecognizer;
import java.util.ArrayList;
import java.util.Collections;

/** Deterministic Android service installed ONLY in the instrumentation APK. */
public class FixtureRecognitionService extends RecognitionService {
    @Override protected void onStartListening(Intent intent, Callback callback) {
        try { callback.readyForSpeech(new Bundle()); }
        catch (android.os.RemoteException e) { throw new RuntimeException(e); }
    }
    @Override protected void onStopListening(Callback callback) {
        Bundle result = new Bundle();
        result.putStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION,
            new ArrayList<>(Collections.singletonList("device recognition smoke test")));
        try { callback.results(result); }
        catch (android.os.RemoteException e) { throw new RuntimeException(e); }
    }
    @Override protected void onCancel(Callback callback) {}
}
