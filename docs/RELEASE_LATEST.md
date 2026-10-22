# Bluey-Latest · 0.5.9 Windows / Android preview

This is an experimental build. The release is named **Bluey-Latest**, with immutable source tag `v0.5.9`. The user supplied nine reference frames for the dock and research cards; this is not a claim of full-video parity or universal browser protection.

## New in 0.5.9
- Windows setup is not marked complete until the engine authenticates the chat WebSocket. An Ollama catalog or configuration HTTP response alone is no longer treated as completed setup.
- Stalled socket upgrades/authentication time out and retry automatically. Saving a model no longer tears down a healthy connection, and stale socket callbacks cannot change the current connection state.
- After Windows setup completes, model/connection settings are inaccessible, including after restart. The selected model stays visible but read-only. **Privacy & data** and emergency stop remain available. A **Retry saved connection** action reuses native credentials without asking for another Ollama key or altering the saved model.
- Actual packaged Electron-to-bundled-engine chat and process restart are checked in Windows CI. This uses a deterministic provider fixture alongside the separate real Ollama inference gate, not a claim of testing every user's PC.

## Retained from 0.5.8
- **Quiet workspace in Desktop tools:** focus sessions (1–180 minutes), pause/resume, a five-minute break timer, and silent in-app completion reminders even after switching back to chat. Uses saved deadlines and catches up after sleep/restart. This is not a system alarm; open Bluey to see reminders. No voice, microphone, or notification permissions.
- **Saved checklist:** add, complete, remove, and clear completed tasks. Up to 100 tasks, available without the AI engine.
- **Quick notes and export:** auto-saved local plain text, with notes + checklist export to a `.txt` file. Storage failures show an explicit warning. Notes/tasks are not encrypted or synced; do not store secrets here.
- **Expression overhaul:** twelve new shared animated expressions across the desktop mascot, Windows pointer and Android face. The mobile Expression Lab has 29 choices and retains the original Super Bluey preview. No billing or paid features activated.
- Includes the strict Windows Guardian source/enforcement changes, opt-in only; parental Android enforcement remains excluded. Registration remains closed and the existing Neon service is unchanged.

## Retained from 0.5.7
- Screenshot-matched bottom-center dock: only a small white upward triangle is visible at rest; the full cursor appears for explicit pointing and tucks away on return. Removed the duplicate large bottom-right mascot and overlay glows.
- Persistent top-right research card: real approval/search/report progress, three-line preview, expandable scrollable report and sources, collapse and dismiss controls. Returning home does not erase the report; cancelled/failed/disconnected requests stop the progress indicator.
- Android requests Nearby Devices when you choose Bluetooth, automatically lists OS-paired PCs, and refreshes after pairing changes or returning from Settings. It does not request location/contacts, silently approve desktop access, or repeatedly prompt after denial.
- The Android emulator test exercises the actual permission dialog and native resume event. Radio operation on the user's paired hardware still needs a device test.
- Home/Kids production storage is connected to Neon, without Supabase. The live database query returned `ready`. New parent registration remains **closed at the operator's request** until a private setup invite is configured. This is not an end-to-end parent login claim.
- A persistent SQLite + HTTPS self-hosting setup is also included as an optional alternative; it is not deployed automatically.

## Downloads
At the user’s request, this update replaces the existing **Bluey-Latest** release in place (same release ID), rather than adding another release. All seven native packages are tested, uploaded with new 0.5.9 filenames, and SHA-256 verified before the release moves to the new source tag and superseded assets are removed. Old source tags remain unchanged. Native tests and real model-inference gates remain required. Download SHA256SUMS.txt or the versioned SHA256SUMS-0.5.9.txt.

- Bluey Windows installer and portable app: dedicated Windows companion dashboard, bottom-center overlay, model catalog, encrypted saved settings, and **bundled Python engine/runtime**. A separate Python installation is no longer needed for the companion engine. Ollama and your chosen model weights are still separate; use **Start local Ollama → Find models → Verify model reply** in Settings.
- Bluey Android APK: foreground companion with device speech recognition and Wi-Fi pairing; new opt-in Bluetooth SPP transport.
- Separate Bluey Home and Bluey Kids Windows installers and Android APKs are included again.
- Windows binaries are unsigned; Android APKs use debug signing. Verify SHA256SUMS.txt. An older APK signed with a different CI debug key may require uninstalling first (which clears its local app data).

## Bluetooth setup
1. Pair Android and Windows using their system Bluetooth settings.
2. On Windows: More Bluetooth settings → COM Ports → Add → Incoming. In Bluey → Connected devices, refresh and select **that incoming Bluetooth COM port**. Enable the bridge. Do not select an outgoing port.
3. Generate a Bluey pairing code on Windows. In the Android APK, select Bluetooth and allow Nearby Devices. Paired devices appear automatically; select your PC if needed and enter the six-digit Bluey code.
4. Keep both applications open. Bluetooth uses the OS-paired SPP channel, not Wi-Fi/tethering. No IP address or public listener is required for Bluetooth. A fresh Bluey code is needed after the Windows engine restarts. Disable Bluetooth from Connected devices when not needed.

The transport uses a fresh AES-GCM key and sequence checks inside the OS-paired secure RFCOMM channel, so another paired device cannot inherit a previous phone session or read its buffered replies. Each application packet also requires the current phone token.

Bluetooth is adapter-dependent and **not yet physically verified** on a paired Android/Windows device. Protocol/authentication tests and Android compilation do not prove radio operation. Wi-Fi remains available; Wi-Fi requires Windows LAN mode and private-network firewall permission. Family apps do not expose the Bluetooth or companion automation bridge.

## Windows Guardian additions
Explicit administrator opt-in to child-SID LSA new-logon denial; native Windows save-work warning; ownership-aware offline administrator recovery. Windows CI verified actual fresh interactive logon denial, parent-admin access, child tamper denial, service-restart persistence, extra-time restoration and offline recovery. Existing enrollments are not silently upgraded. Read guardian/README.md before installing.

## Important limits
- Home/Kids have a reachable production Neon database. Registration is deliberately closed until the operator enables it with a private setup invite. Existing-account login remains available; no real parent login has been verified here.
- Guardian is separate, experimental administrator setup and still requires its documented system-wide Python installation. Bundling the *companion* engine does not bundle the Guardian service runtime.
- No universal browser filtering, certified Hello/PIN unlock/reconnect barrier, or physical cold-boot verification. Keep established family protections enabled.
- Windows voice transcription still needs explicit local Whisper model files (`BLUEY_WHISPER_MODEL`); Android uses its own speech recognizer. No automatic spoken replies.
- Desktop actions require Windows approval and a tool-capable model. Small text-only models can chat without tool support. Cloud use depends on provider access/quota. No model weights or cloud credentials are included.
- Reference: nine user-supplied screenshots now guide the dock and report-card layout. The transcript and frame review are recorded in docs/VIDEO_REFERENCE.md; full-video timing and pixel-for-pixel equivalence are not claimed.
