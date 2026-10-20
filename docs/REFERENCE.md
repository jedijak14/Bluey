# Reference review and platform mapping

Reference: https://github.com/rbrown101010/bluey-by-riley
Reviewed commit: `6d84d91456f3bf7ad9b31caf31f19710b0ba8328`
License: Unlicense.

## What the source actually does

- `Shared/Palette.swift`: four-stop blueberry gradient (`A9BCFF`, `6C86F5`, `4254D6`, `2B2F8F`), dark nose (`1C1F66`), ink (`17151F`), soft ink and panels.
- `Shared/GooglyLink.swift`: seven moods, gaze in -1…1, talk envelope in 0…1, Bonjour `_googly._tcp`, newline-delimited JSON over TCP. This is an Apple Network framework implementation, not a WebSocket service.
- `iOS/Sources/FaceView.swift`: 844×390 landscape canvas, 820×700 bottom-cropped berry, crown, separate brows, blush, catchlights, thinking dots, floating sleep Zs, blinking and gaze, breathing, leaning and talk bounce. A damped spring drives each expressive parameter.
- `iOS/Sources/PairingView.swift`: sleepy full-body blob beside same-Wi-Fi instructions, with offline play.
- `iOS/Sources/LiveVoice.swift` and `Mac/Sources/GooglyMac/RealtimeHost.swift`: phone-hosted OpenAI Realtime session; ephemeral client token minted by the Mac; VAD collects context while awake; press-and-hold requests a response. Current README says text replies/chirps, not spoken model output.
- `Mac/Sources/GooglyMac/CursorOverlay.swift`: the cursor is **not the same berry drawing**. It is a rounded-corner teardrop, white rim, blueberry gradient, soft glow, two small independently animated eyes, 48–120 pt sizing. It follows curved flights with eased arrivals. Modes are docked, following (tucked), and pinned; tails are comet, slack string, or none. It has captions and landing effects.
- `Mac/Sources/GooglyMac/ComputerControl.swift`: Quartz keyboard/mouse input, cursor restoration, application and URL helpers. Mac-specific privacy permissions and OS services cannot be reused on Windows.
- `Mac/Sources/GooglyMac/PhoneServer.swift`: LAN phone connection and shared state. The original discovery/pairing protocol does not provide this adaptation's scoped authentication model.
- Original includes meeting recording/notes and cloud research beyond this directive's local companion core.

## Adaptation decisions

| Original                   | Windows / Android implementation                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| SwiftUI Canvas             | Local animated SVG React components; distinct full berry, peeking face, and teardrop artwork                          |
| Individual damped springs  | CSS breathing/blink/talk + smoothed gaze; TypeScript cubic flight engine for overlay (not a line-for-line Swift port) |
| Fredoka / IBM Plex         | Same font files bundled with original OFL notices                                                                     |
| Mac NSPanel / CALayer      | Electron transparent primary-display overlay, click-through outside widget controls                                   |
| iOS landscape app          | Capacitor Android app, landscape face, local mic permission, offline expression playground                            |
| Bonjour + newline TCP      | Explicit PC address + one-time code, authenticated WebSocket, scoped phone credentials                                |
| Mac-minted Realtime secret | Windows-hosted model client; phone never gets model credentials                                                       |
| Cloud Realtime audio       | User-controlled local PCM recording, faster-whisper transcription, local Piper response speech                        |
| macOS accessibility/Quartz | Pinned windows-use 0.8.1 Desktop/UIA adapter on a dedicated COM worker                                                |
| Menu-bar-only Mac controls | Main Electron Chat / Code workspace, global Windows shortcuts                                                         |

## Deliberate differences / remaining gaps

- No automatic network discovery; no wire compatibility with the Mac/iPhone apps.
- No always-on session recording, meeting notes, cloud speech fallback, or automatic model downloads.
- The pointer gets curved motion and simple trail rendering, but the original's particle effects, exact inertial redirect solver and all docking gestures are not fully replicated.
- Phone gaze receives backend face states; continuous desktop-mouse gaze forwarding to the phone is not implemented (the Windows widget itself tracks the mouse).
- Chat and IDE share the same conversation; IDE is a code workspace rather than a full language-server/debugger environment.
- Native integration and packaging require Windows/Android validation; browser rendering alone does not validate these paths.

Android 0.1.2 correction: Bluey remains **silent by default**, with expressive visuals and captions. Device recognition handles opted-in microphone input; device TTS is an optional user-enabled output, not the default character behavior. Android speech providers may use network processing when offline services/packs are unavailable; the original privacy-first Windows voice pipeline remains separate.
