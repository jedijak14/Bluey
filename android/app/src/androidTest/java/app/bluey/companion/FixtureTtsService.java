package app.bluey.companion;

import android.media.AudioFormat;
import android.speech.tts.SynthesisCallback;
import android.speech.tts.SynthesisRequest;
import android.speech.tts.TextToSpeech;
import android.speech.tts.TextToSpeechService;

/** Silent PCM tests OS TTS transport/lifecycle, not pronunciation or voice quality. */
public class FixtureTtsService extends TextToSpeechService {
    @Override protected String[] onGetLanguage() { return new String[] { "eng", "USA", "" }; }
    @Override protected int onIsLanguageAvailable(String language, String country, String variant) {
        return TextToSpeech.LANG_COUNTRY_AVAILABLE;
    }
    @Override protected int onLoadLanguage(String language, String country, String variant) {
        return TextToSpeech.LANG_COUNTRY_AVAILABLE;
    }
    @Override protected void onStop() {}
    @Override protected void onSynthesizeText(SynthesisRequest request, SynthesisCallback callback) {
        callback.start(16000, AudioFormat.ENCODING_PCM_16BIT, 1);
        byte[] silence = new byte[1600];
        callback.audioAvailable(silence, 0, silence.length);
        callback.done();
    }
}
