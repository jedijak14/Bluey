# Bluey-Latest · 0.5.6 Windows / Android preview

This is an experimental build, not a claim that every feature in the reference video is complete.

## Downloads
- Bluey Windows installer and portable app: dedicated Windows companion dashboard, bottom-center overlay, model catalog, encrypted saved settings, and **bundled Python engine/runtime**. A separate Python installation is no longer needed for the companion engine. Ollama and your chosen model weights are still separate; use **Start local Ollama → Find models → Verify model reply** in Settings.
- Bluey Android APK: foreground companion with device speech recognition and Wi-Fi pairing; new opt-in Bluetooth SPP transport.
- Separate Bluey Home and Bluey Kids Windows installers and Android APKs are included again.
- Windows binaries are unsigned; Android APKs use debug signing. Verify SHA256SUMS.txt. An older APK signed with a different CI debug key may require uninstalling first (which clears its local app data).

## Bluetooth setup
1. Pair Android and Windows using their system Bluetooth settings.
2. On Windows: More Bluetooth settings → COM Ports → Add → Incoming. In Bluey → Connected devices, refresh and select **that incoming Bluetooth COM port**. Enable the bridge. Do not select an outgoing port.
3. Generate a Bluey pairing code on Windows. In the Android APK, select Bluetooth, list paired PCs, select your PC and enter the six-digit Bluey code.
4. Keep both applications open. Bluetooth uses the OS-paired SPP channel, not Wi-Fi/tethering. No IP address or public listener is required for Bluetooth. A fresh Bluey code is needed after the Windows engine restarts. Disable Bluetooth from Connected devices when not needed.

Bluetooth is adapter-dependent and **not yet physically verified** on a paired Android/Windows device. Protocol/authentication tests and Android compilation do not prove radio operation. Wi-Fi remains available; Wi-Fi requires Windows LAN mode and private-network firewall permission. Family apps do not expose the Bluetooth or companion automation bridge.

## Windows Guardian additions
Explicit administrator opt-in to child-SID LSA new-logon denial; native Windows save-work warning; ownership-aware offline administrator recovery. Windows CI verified actual fresh interactive logon denial, parent-admin access, child tamper denial, service-restart persistence, extra-time restoration and offline recovery. Existing enrollments are not silently upgraded. Read guardian/README.md before installing.

## Important limits
- Home/Kids family sign-in and remote management require the production family database/setup invite. Packaging the apps does not configure that service.
- Guardian is separate, experimental administrator setup and still requires its documented system-wide Python installation. Bundling the *companion* engine does not bundle the Guardian service runtime.
- No universal browser filtering, certified Hello/PIN unlock/reconnect barrier, or physical cold-boot verification. Keep established family protections enabled.
- Windows voice transcription still needs explicit local Whisper model files (`BLUEY_WHISPER_MODEL`); Android uses its own speech recognizer. No automatic spoken replies.
- Desktop actions require Windows approval and a tool-capable model. Small text-only models can chat without tool support. Cloud use depends on provider access/quota. No model weights or cloud credentials are included.
- Reference video: the shared transcript was reviewed; visual frames were not accessible. See docs/VIDEO_REFERENCE.md for the evidence/feature checklist. No claim of pixel-for-pixel or complete behavioral equivalence.
