# Quiet sessions (0.3.0 preview)

## Phone and Windows

Bluey no longer speaks replies, even if an older client sends `voice: true`. The Android speaker control only mutes/unmutes a brief local notification chirp. No TTS engine is initialized by the new UI.

1. Pair the Android app with the Windows engine. Double-tap the face to request a session. On the first use, read the disclosure and confirm you have permission from everyone recorded. **Allow & start session** starts the microphone.
2. Ambient speech becomes temporary context, not an instruction to Bluey. He stays quiet. **Hold the screen, wait for “Release to ask”, speak, and release** to ask a question. Short taps never submit questions. The session keeps listening after the text reply.
3. Double-tap again to end the session and return the cursor to following the mouse. The blue outline indicates capture, not just a facial expression. Cancellation/disconnection never silently restarts recording.
4. On Windows, **Ctrl+Shift+Space** toggles the single connected phone's session. With no phone connected it toggles a Windows-microphone session. Multiple connected phones require choosing one by double-tapping it. The workspace also has **Start quiet session** and a keyboard-accessible **Hold to ask** button. Existing Ctrl+Shift+B (overlay), Ctrl+Shift+S (emergency stop), and the one-shot transcription button remain separate. Shortcut conflicts are logged, not overridden.

Windows microphone sessions require local Whisper, like one-shot transcription. An explicitly started Electron session can continue while its window is minimized. Browser sessions and the Android app stop when hidden. Keep Android in the foreground; the native recognizer keeps the screen awake while it runs. No background service records a locked phone.

## Honest capture limits

Android's built-in recognizer ends utterances automatically. Bluey restarts it, but there can be gaps and providers may impose their own limits. On-device recognition is preferred; fallback Android providers may process audio online. Windows keeps one microphone stream open and sends bounded WAV chunks to its local engine. Slow or failed transcription stops the session rather than pretending to have captured context. No implementation here guarantees every word.

Recent context is capped at 24,000 characters and cleared on session end. The UI reports trimming. Meeting transcripts have a separate 160,000-character limit; reaching it ends capture and offers the partial draft for saving. Unfinished utterances can be lost on lifecycle cancellation. No raw-audio archive, persistent background-context store, or automatic transcript file is created.

## “What's this?”

During a session question, Bluey first marks the real Windows mouse location on the primary display. This does not click or move your mouse. Reading the target's contents still requires the existing explicit Windows screen-read approval. The model receives the target coordinates and approved screen result, never a fabricated view. Non-Windows hosts and secondary-display targets report a limitation. Other desktop actions retain individual approval gates.

## Meeting notes

Only an explicitly started session can automatically create notes. Automatic detection is opt-in in the disclosure. A local Windows heuristic checks visible window titles for a narrow set of Zoom Meeting/Webinar, Google Meet code, and Teams meeting/call patterns. It waits 10 seconds to begin and 30 seconds without a matching window to offer a recap. No window title is sent to the phone/model. Unknown/error signals do not count as a meeting ending.

This is **not a reliable meeting-platform integration**. Renamed windows, browser tabs, minimized windows, localization and other applications can be missed or misclassified. Use **Take meeting notes / End meeting** to correct boundaries. The UI describes inferred ends as estimates. Only microphone-audible speech is transcribed: remote attendees in headphones are not captured. There is no system-audio loopback, speaker identification or calendar access.

When a meeting ends, a draft appears asking whether to save notes and transcription. A bounded, **tool-disabled** summary request goes to the configured Windows model (including a cloud provider if selected); it cannot perform desktop actions. Review/edit it. If the model fails, the transcript remains saveable. Android uses the system file picker; cancelling or failing to save retains the draft. Desktop browsers request a Markdown download and retain the draft until you verify/discard it. Unsaved drafts are volatile and disappear if you close/reload the app.

## Validation and deployment scope

Unit tests cover context bounds, meeting limits, detection debounce/unknown signals, API authentication, tool-disabled summaries and suppression of old voice flags. Browser fixtures cover consent, ambient context without automatic chat, hold/release, text/chirp-only output, continuing capture, meeting review/save, double-tap end, Windows-to-phone toggle, denied permission and background cleanup. Android instrumentation uses a test-only speech service; it does not establish recognition accuracy on physical devices.

The Vercel site does not run the Windows engine or phone speech APIs. The APK/Windows binaries and Python engine must be updated together for session endpoints and the native chirp/save APIs. The separate Gemma service remains unchanged and unconfigured; meeting summaries use the configured companion engine, not a fake Gemma fallback.
