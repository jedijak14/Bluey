# Bluey 0.3.0 — Quiet Android sessions

Install the matching **Bluey-0.3.0-Android.apk** and update the Windows engine. This is a debug-signed sideload preview, not a Play Store release. Publication requires compilation, lint, emulator integration checks and APK signature verification. See the release's checksums.

## Pair and start

1. Configure the Windows Python engine and companion model. Set `BLUEY_LAN=1` before launch; allow port 8765 only on trusted private Wi-Fi.
2. On Windows, generate a code in **Connected devices**. In Android, enter the PC address (e.g. `192.168.1.10:8765`) and fresh six-digit code. Pairing alone does not install a model or locate the PC automatically.
3. Double-tap Bluey. Read the session disclosure and confirm everyone recorded has consented. **Allow & start session** requests microphone permission.
4. Ambient speech becomes temporary context; Bluey stays quiet. Hold the screen, wait for **Release to ask**, say your question, and release. He replies in a text bubble with a brief chirp. Mute chirps with the speaker icon. There is no spoken-output switch.
5. Double-tap again to end and return to follow mode. Ctrl+Shift+Space on Windows controls the single paired phone's session.

Keep Android in the foreground. The native recognizer keeps the screen awake while active. Hiding the app, disconnecting or cancelling stops capture; it does not resume automatically. Recognition restarts between utterances and may miss words. On-device recognition is preferred, but an Android provider may use the internet. Android sends recognized text, not microphone WAVs, to Windows. Windows Whisper/Piper are not needed for Android input/output; a configured PC model is still required for answers.

## Meetings and saving

Automatic meeting detection checks a narrow set of Windows window patterns during an explicitly started session. It is an estimate; manual **Take meeting notes / End meeting** controls are available. It cannot capture headphone participants or identify speakers. Meeting summaries use the configured model (possibly cloud), with desktop tools disabled. Review/edit them before relying on them.

At the end, choose **Save notes & transcription** and pick a document location in Android's file picker. Cancel/failure retains the draft. Nothing is saved automatically; closing/reloading loses unsaved drafts. See [limits and full privacy contract](QUIET_SESSIONS.md).

## Verification and preview limitations

Native instrumentation uses a test-only Android recognition service with real pairing/WebSocket transport. It checks quiet input, text replies and lifecycle cleanup, not physical recognition accuracy or audible chirp quality. The browser fixture additionally checks meeting review/save API behavior. Physical device file-picker/recognizer behavior still needs checking on your phone.

Android 10+ is recommended (minimum API 23); keep System WebView current. A different CI debug signing key can require uninstalling an older preview before installation, which clears its data. The APK is not standalone AI. Pairing credentials stay in memory; re-pair after restarting the app or engine. Never expose the unencrypted LAN engine publicly. All desktop actions still require Windows approval.
