# Bluey 0.3.0 preview — Quiet sessions & meeting drafts

- Double-tap a paired phone to explicitly start/end a quiet microphone session.
- Ambient speech becomes bounded temporary context; hold, speak and release to ask.
- Text reply bubbles and a short phone notification chirp. No spoken replies, including legacy requests with voice enabled.
- Ctrl+Shift+Space toggles the single paired phone, or a local Windows session when no phone is connected.
- “What's this?” marks the actual primary-display mouse location; reading content still requires Windows approval.
- Best-effort meeting-window detection plus manual Start/End meeting controls. Review/edit/save or discard notes and transcript. Android saves through its system file picker.

## Requirements and limitations

Update both app and Python engine. Configure a companion model; Windows microphone capture additionally needs local Whisper. Android uses its device speech recognizer and can restart between utterances, with gaps. Keep the phone foregrounded. Have everyone’s permission to record.

Meeting detection is a narrow Windows window-title heuristic, not a guaranteed Zoom/Teams/Meet integration. Only microphone-audible voices are captured; there is no loopback capture of headphone participants or speaker identification. Notes can contain errors. Background context and unsaved meeting drafts are memory-only; save before closing the app. See docs/QUIET_SESSIONS.md for full limits.

Windows executables are unsigned; the Android preview is debug-signed. A different debug signing key from an earlier CI build may require uninstalling the old preview first, which clears its app data. Native speech is tested with an emulator service fixture, not physical-device recognition accuracy. Gemma hosting, automatic Wi-Fi discovery and standalone Android inference are not added by this release.
