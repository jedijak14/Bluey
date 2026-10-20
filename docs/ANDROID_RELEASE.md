# Bluey 0.1.1 — Android companion preview

Install **Bluey-0.1.1-Android.apk** on your Android phone. It is a universal, debug-signed sideload APK, not a Play Store release. Android may ask you to allow installation from the browser or Files app. `SHA256SUMS.txt` and APK signature/manifest verification are included with the download.

## Get connected

1. Start Bluey on your **Windows PC** with its Python backend configured. Set `BLUEY_LAN=1` before launching it (or launch the backend with `python -m backend.server --lan`).
2. Put the PC and phone on the **same trusted private Wi-Fi**. Allow Python TCP port **8765** in Windows Firewall for private networks only.
3. On Windows, open **Connected devices → Generate pairing code**.
4. Open this Android APK. Enter the PC's Wi-Fi address, e.g. `192.168.1.10:8765`, and the six-digit code within two minutes. **Do not use localhost** on the phone.
5. Double-tap Bluey to wake him. Hold to record, then release to ask. Grant microphone permission when prompted; after the first permission prompt, hold Bluey again.

The top-right options button also lets you **type a question**. Turn off **Speak replies** for text-only use if you have not installed Piper. Text chat needs only a configured model; voice additionally needs faster-whisper and Piper models on Windows. The APK does **not** contain an offline LLM or speech models and cannot control a PC that is off or disconnected.

## What is included

- Seven animated expressions, the large landscape face, offline expression playground.
- Authenticated LAN pairing with the Windows engine; no model API keys on the phone.
- Native microphone permission, bounded WAV capture, typed question fallback, streamed captions and audio playback.
- Reconnection, explicit re-pairing when credentials expire, mute, stop, and cleanup when leaving the app.
- Last PC address is remembered; pairing credentials remain session-only. Pair again after restarting the backend or phone app.

**Privacy:** pairing uses unencrypted HTTP by default. Use trusted private Wi-Fi only, never expose port 8765 to the internet. Screen/desktop actions must be approved in the Windows app.

## Checks performed by the publishing workflow

The workflow gates publication on web/client/backend tests, Android compilation/unit checks/lint, APK signature verification, and native Android emulator smoke tests. Native tests cover installing/launching the real APK, expression rendering, real HTTP/WebSocket pairing, typed requests, and microphone WAV transport to the Python bridge. The test backend uses deterministic model/STT/TTS fixtures: these tests do **not** prove real-model transcription quality, Piper pronunciation, or Windows UI Automation on your hardware. Those depend on your configured PC and devices.

This is a preview, not a claim of production certification or physical-device validation. Keep Android System WebView current; Android 10+ is recommended (minimum API 23). The companion is designed for landscape use beside a Windows display. The Windows teardrop cursor remains a separate character; this APK does not replace it.

If installing a later debug build reports a signature conflict, uninstall the older preview first. Production signing and Play Store distribution are not configured.
