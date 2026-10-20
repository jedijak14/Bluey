# Bluey 0.2.0 — Android device speech, silent by default

Install **Bluey-0.2.0-Android.apk** on your Android phone. This is a universal, debug-signed sideload preview, not a Play Store release. The release workflow publishes the APK only after compilation, lint, tests, emulator checks and signature verification pass. Checksums and verification reports accompany the download.

## Bluey is silent by default

Replies appear as captions. **Speak replies is OFF each time the app launches.** There is no automatic greeting, no startup TTS initialization and no continuous/background listening. Expressions—including the visual “talking” expression—do not mean spoken audio is enabled.

- **Voice input on Android:** in Companion options, explicitly enable **Use device speech recognition** and review the provider notice. Double-tap to wake Bluey, hold to speak, then release to send the recognized text. Grant microphone permission when prompted; hold again if the permission prompt interrupted the gesture.
- **Optional spoken output:** enable **Speak replies using Android voice** (or tap the muted speaker). Only replies requested after opting in are read aloud. Turning it off cancels active/pending speech. It is not remembered across app restarts.
- **Device services:** Android's SpeechRecognizer handles input; TextToSpeech handles optional output. No audio WAV, PC transcription request, or PC speech-synthesis request is sent by the Android companion. The PC still supplies AI text responses.
- **Privacy:** Android 12+ on-device recognition is preferred when available. Otherwise the configured Android recognition provider is used with an offline preference; a provider may ignore that preference or require internet. This is **not an offline-only guarantee**. Manage installed languages, voice engines and offline voice packs in Android Settings. The optional TTS engine may also use network services depending on its selected voice.
- If a service, permission or language is unavailable, Bluey displays an actionable error and keeps typed questions/captions available. It never silently falls back to sending microphone audio to the PC.
- Stop, mute, leaving the app and disconnecting cancel device speech as appropriate. Microphone sessions have a native 60-second limit; finishing recognition has a 10-second timeout.

Browser companions still use the Windows voice pipeline when explicitly enabled; the Android system bridge only exists in the APK. Browser spoken output is also off by default.

## Pair with Windows

1. Start Bluey on Windows with its Python backend configured. Set `BLUEY_LAN=1` before launching it (or run `python -m backend.server --lan`).
2. Connect the PC and phone to the same trusted private Wi-Fi. Allow Python TCP port 8765 in Windows Firewall for private networks only.
3. On Windows, open **Connected devices → Generate pairing code**.
4. In the Android APK, enter the PC's Wi-Fi address, e.g. `192.168.1.10:8765`, and the six-digit code within two minutes. Do not use localhost on the phone.
5. Type a question in Companion options, or enable device speech recognition as described above.

Android input/output no longer requires Whisper or Piper on Windows. You still need a configured AI model/backend on the PC. These models and a Python interpreter are not bundled in the Windows preview. The APK is not a standalone offline AI assistant.

Pairing uses unencrypted HTTP by default: trusted private Wi-Fi only; never expose port 8765 to the internet. Desktop actions require approval on Windows. Only the endpoint is remembered by the phone; pairing credentials stay in memory. Pair again after restarting the backend or app.

## Verification scope

Client tests cover silent defaults, Android text-only requests, optional native speech chunking/cancellation and error handling. Native emulator tests exercise the registered Capacitor plugin with **test-APK-only Android recognition/TTS service fixtures**, real HTTP pairing/authenticated WebSocket transport, captions, silent defaults, explicit output opt-in and lifecycle cleanup. The backend fixture rejects any attempt to use PC transcription or synthesis. Recognition fixtures return deterministic text; TTS fixtures return silent PCM. These tests validate integration, **not real speech accuracy, pronunciation, audible output quality or physical-device behavior**. Real speech services vary by phone and installed language packs.

The app remains landscape-oriented with seven expressions and a separate Windows pointer character. Keep Android System WebView current; Android 10+ is recommended (minimum API 23).

If Android reports a signature mismatch when updating a debug preview, uninstall the previous APK first (this clears its app data). Production signing and Play Store distribution are not configured. The previous published APK does not acquire these changes automatically; install the new version.

## Research notes

Enable Research in companion options for an explicitly approved web search. The PC must approve the query. Tap **Read notes** after the response to see the paper-style answer and source snippets. Android supports copying notes; Markdown file downloads are a desktop/browser feature.
