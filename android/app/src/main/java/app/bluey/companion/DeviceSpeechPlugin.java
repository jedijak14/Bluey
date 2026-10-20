package app.bluey.companion;

import android.Manifest;
import android.app.Activity;
import android.view.WindowManager;
import android.media.AudioManager;
import android.media.ToneGenerator;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/** Phone-owned speech only. Never starts a recognizer or TTS at app launch. */
@CapacitorPlugin(name = "DeviceSpeech", permissions = {
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
})
public class DeviceSpeechPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean foreground = false;
    private boolean preferOnDevice = true;
    private Session session;
    private final AtomicInteger captureGeneration = new AtomicInteger();
    private TextToSpeech tts;
    private boolean ttsReady;
    private int ttsGeneration;
    private PluginCall speechCall;
    private String utterance;
    private Runnable speechTimeout;

    private static final class Session {
        final String id = UUID.randomUUID().toString();
        SpeechRecognizer recognizer;
        boolean complete;
        String text = "", error;
        PluginCall stopCall;
        Runnable timeout;
    }

    @PluginMethod public void getStatus(PluginCall call) {
        main.post(() -> {
            JSObject result = new JSObject();
            result.put("recognition", SpeechRecognizer.isRecognitionAvailable(getContext()));
            result.put("onDevice", onDeviceAvailable());
            result.put("listening", session != null && !session.complete);
            result.put("speaking", speechCall != null);
            result.put("synthesisInitialized", tts != null);
            result.put("synthesis", !getContext().getPackageManager().queryIntentServices(
                new Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE), 0).isEmpty());
            call.resolve(result);
        });
    }

    private boolean onDeviceAvailable() {
        return preferOnDevice && Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
    }

    @PluginMethod public void startRecognition(PluginCall call) {
        call.getData().put("_captureGeneration", captureGeneration.incrementAndGet());
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermission");
        } else begin(call);
    }

    @PermissionCallback private void microphonePermission(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone permission was denied. Enable it in Android Settings or type your question.", "PERMISSION_DENIED");
        } else begin(call);
    }

    private void begin(PluginCall call) {
        main.post(() -> {
            if (call.getInt("_captureGeneration", -1) != captureGeneration.get()) { call.reject("Listening cancelled.", "CANCELLED"); return; }
            if (!foreground) {
                call.reject("Return to Bluey and hold again to speak.", "BACKGROUND");
                return;
            }
            cancelRecognitionSession();
            if (!onDeviceAvailable() && !SpeechRecognizer.isRecognitionAvailable(getContext())) {
                call.reject("No Android speech recognition service is installed. Enable one in Android Settings or type your question.", "UNAVAILABLE");
                return;
            }
            getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            Session current = new Session();
            session = current;
            try {
                current.recognizer = onDeviceAvailable()
                    ? SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext())
                    : SpeechRecognizer.createSpeechRecognizer(getContext());
                current.recognizer.setRecognitionListener(new RecognitionListener() {
                    public void onReadyForSpeech(Bundle b) {}
                    public void onBeginningOfSpeech() {}
                    public void onRmsChanged(float rms) {}
                    public void onBufferReceived(byte[] b) {}
                    public void onEndOfSpeech() {}
                    public void onPartialResults(Bundle b) {}
                    public void onEvent(int type, Bundle b) {}
                    public void onError(int code) { finishRecognition(current, "", recognitionError(code)); }
                    public void onResults(Bundle results) {
                        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        finishRecognition(current, matches == null || matches.isEmpty() ? "" : matches.get(0), null);
                    }
                });
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag());
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                current.recognizer.startListening(intent);
                // Native timeout also applies when the WebView's timers are suspended.
                current.timeout = () -> finishRecognition(current, "", "Listening timed out. Hold again or type your question.");
                main.postDelayed(current.timeout, 60000);
                JSObject result = new JSObject(); result.put("id", current.id); call.resolve(result);
            } catch (RuntimeException e) {
                cancelRecognitionSession();
                call.reject("Android could not start speech recognition. Check your speech service and microphone settings.", "UNAVAILABLE");
            }
        });
    }

    @PluginMethod public void stopRecognition(PluginCall call) {
        main.post(() -> {
            Session current = session;
            if (current == null || !current.id.equals(call.getString("id"))) {
                call.reject("Listening was cancelled. Hold again to speak.", "CANCELLED"); return;
            }
            if (current.stopCall != null) { call.reject("Already finishing this recording.", "BUSY"); return; }
            current.stopCall = call;
            if (current.complete) { deliverRecognition(current); return; }
            main.removeCallbacks(current.timeout);
            current.timeout = () -> finishRecognition(current, "", "Android did not return a transcript. Try again or type your question.");
            main.postDelayed(current.timeout, 10000);
            try { current.recognizer.stopListening(); }
            catch (RuntimeException e) { finishRecognition(current, "", "Speech recognition stopped unexpectedly. Please try again."); }
        });
    }

    private void finishRecognition(Session current, String text, String error) {
        if (session != current || current.complete) return;
        current.complete = true; current.text = text; current.error = error;
        if (current.timeout != null) main.removeCallbacks(current.timeout);
        current.recognizer.destroy(); current.recognizer = null;
        // Automatic end-of-speech results are held until the user releases.
        if (current.stopCall != null) deliverRecognition(current);
    }

    private void deliverRecognition(Session current) {
        PluginCall call = current.stopCall;
        current.stopCall = null; session = null;
        if (current.error != null) call.reject(current.error, "RECOGNITION_FAILED");
        else { JSObject result = new JSObject(); result.put("text", current.text); call.resolve(result); }
    }

    private String recognitionError(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "No speech detected. Hold again or type your question.";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "Microphone permission is required. Check Android Settings.";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "Your Android speech service needs a connection or an offline language pack.";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "Android speech recognition is busy. Please try again.";
            default: return "Android speech recognition failed (" + code + "). Try again or type your question.";
        }
    }

    @PluginMethod public void cancelRecognition(PluginCall call) {
        captureGeneration.incrementAndGet();
        main.post(() -> { cancelRecognitionSession(); call.resolve(); });
    }

    private void cancelRecognitionSession() {
        getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        Session old = session; session = null;
        if (old == null) return;
        if (old.timeout != null) main.removeCallbacks(old.timeout);
        if (old.recognizer != null) { old.recognizer.cancel(); old.recognizer.destroy(); }
        if (old.stopCall != null) old.stopCall.reject("Listening cancelled.", "CANCELLED");
    }

    @PluginMethod public void chirp(PluginCall call) {
        main.post(() -> {
            if (!foreground) { call.resolve(); return; }
            try {
                ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 25);
                tone.startTone(ToneGenerator.TONE_PROP_ACK, 140);
                main.postDelayed(tone::release, 300);
                call.resolve();
            } catch (RuntimeException e) { call.reject("Chirp unavailable."); }
        });
    }

    @PluginMethod public void saveNotes(PluginCall call) {
        String text = call.getString("text", "");
        if (text.length() > 250000) { call.reject("Notes exceed the save limit."); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/markdown");
        intent.putExtra(Intent.EXTRA_TITLE, "Bluey-meeting-notes.md");
        startActivityForResult(call, intent, "notesCreated");
    }

    @ActivityCallback private void notesCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject response = new JSObject(); response.put("saved", false); call.resolve(response); return;
        }
        try (OutputStream output = getContext().getContentResolver().openOutputStream(result.getData().getData())) {
            if (output == null) throw new java.io.IOException("No destination");
            output.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
            JSObject response = new JSObject(); response.put("saved", true); call.resolve(response);
        } catch (Exception e) { call.reject("Could not save notes. Choose another destination."); }
    }

    @PluginMethod public void speak(PluginCall call) {
        main.post(() -> {
            String text = call.getString("text", "").trim();
            if (!foreground) { call.reject("Speech is disabled in the background.", "BACKGROUND"); return; }
            if (text.isEmpty() || text.length() > 3000) { call.reject("Speech requires 1–3000 characters.", "INVALID_TEXT"); return; }
            stopSynthesis();
            speechCall = call;
            speechTimeout = () -> {
                PluginCall waiting = speechCall; speechCall = null;
                if (tts != null) tts.stop();
                if (waiting != null) waiting.reject("Android text-to-speech timed out. Check your installed voice.", "TTS_UNAVAILABLE");
            };
            main.postDelayed(speechTimeout, 180000);
            if (ttsReady) { sayPending(); return; }
            if (tts != null) return;
            int generation = ++ttsGeneration;
            tts = new TextToSpeech(getContext(), status -> main.post(() -> {
                if (generation != ttsGeneration || tts == null) return;
                if (status != TextToSpeech.SUCCESS || tts.setLanguage(Locale.getDefault()) < 0) {
                    failSynthesis("Install a text-to-speech voice for your language in Android Settings.");
                    tts.shutdown(); tts = null; return;
                }
                ttsReady = true;
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    public void onStart(String id) {}
                    public void onDone(String id) { main.post(() -> finishSynthesis(id, null)); }
                    public void onError(String id) { main.post(() -> finishSynthesis(id, "Android could not speak this reply. Check your device voice settings.")); }
                });
                sayPending();
            }));
        });
    }

    private void sayPending() {
        if (speechCall == null || !foreground) return;
        utterance = UUID.randomUUID().toString();
        if (tts.speak(speechCall.getString("text"), TextToSpeech.QUEUE_FLUSH, null, utterance) == TextToSpeech.ERROR)
            failSynthesis("Android text-to-speech is unavailable. Check your installed voice.");
    }

    private void finishSynthesis(String id, String error) {
        if (speechCall == null || !id.equals(utterance)) return;
        PluginCall call = speechCall; speechCall = null;
        main.removeCallbacks(speechTimeout);
        if (error == null) call.resolve(); else call.reject(error, "TTS_UNAVAILABLE");
    }

    private void failSynthesis(String message) {
        if (speechTimeout != null) main.removeCallbacks(speechTimeout);
        PluginCall call = speechCall; speechCall = null;
        if (call != null) call.reject(message, "TTS_UNAVAILABLE");
    }

    @PluginMethod public void stopSpeaking(PluginCall call) {
        main.post(() -> { stopSynthesis(); call.resolve(); });
    }

    private void stopSynthesis() {
        if (speechTimeout != null) main.removeCallbacks(speechTimeout);
        if (tts != null) tts.stop();
        PluginCall call = speechCall; speechCall = null; utterance = null;
        if (call != null) call.reject("Speech cancelled.", "CANCELLED");
    }

    @Override protected void handleOnResume() { foreground = true; }
    @Override protected void handleOnPause() {
        foreground = false;
        captureGeneration.incrementAndGet();
        cancelRecognitionSession(); stopSynthesis();
    }
    @Override protected void handleOnDestroy() {
        foreground = false; ++ttsGeneration;
        cancelRecognitionSession(); stopSynthesis();
        if (tts != null) { tts.shutdown(); tts = null; }
        ttsReady = false;
    }
}
