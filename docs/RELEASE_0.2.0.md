# Bluey 0.2.0 — Research cards & desktop tools

A Windows + Android **preview**, not a guarantee of flawless operation. Bluey stays silent by default.

## New in this release

- Compact quick-answer bubbles on the Windows overlay; longer answers and research open a scrollable paper-style card. Copy notes, save Markdown on desktop, minimize or close the card. Android can open the latest research notes from its face screen.
- Research mode requests explicit Windows approval before sending a query to DuckDuckGo. It summarizes returned **search-result snippets**, attaches actual returned source links, and warns that full pages have not been verified. No invented fallback results if the provider blocks requests or asks for a CAPTCHA. Open web search remains available as an alternative.
- Desktop tools: open ChatGPT in the default browser; open web searches; list and launch uniquely named apps registered in Windows AppsFolder; send media keys; open Chrome/Edge extension managers. No arbitrary commands, executable paths, extension installs, or permission changes are accepted.
- Click rings for approved Bluey clicks. Text entry stays visibly animated and checks Stop, password protection and keyboard focus between small chunks. It does not automatically press Enter. Terminal/shell typing is blocked.
- Windows/computer microphone selector and a microphone shortcut on the companion overlay. Uses the PC's actual input; microphone permission and the local Whisper model are still required for Windows transcription. It never secretly activates a remote Windows microphone from the phone.
- Android device recognition with explicit consent; on-device recognition preferred when available. Optional device text-to-speech stays off at startup and is cancelled on mute/backgrounding. Android sends recognized text to the PC, not microphone WAVs, and does not need Whisper/Piper for its own voice input/output.
- Fix for an approval-cleanup cancellation race. Existing sidebar, pairing countdown, automatic code refresh and live device updates retained.

## Important limits

- Windows 10/11 x64 previews are unsigned. Python and the native backend dependencies are external prerequisites; see Windows-Setup-Instructions.md. An AI model must be configured. The Vercel website is not a Windows automation service.
- Android is a universal **debug-signed sideload APK**, not Play Store signing. See Android-Setup-Instructions.md. If debug signatures differ, uninstall the previous preview before installing this one (clears app data).
- Android speech/voice providers may use the network if offline services or language packs are unavailable. The consent notice is explicit; offline-only operation is not promised.
- App launch requests are verified against Windows' app catalog, not a promise that every app installed through every mechanism has an entry. Browser extension management supports registered Edge and Chrome installations. Other extensions can be used through approved screen interactions when accessible.
- Media keys target Windows' active player. Play/pause is a **toggle**; Bluey does not claim to know playback state. App and browser launches should be verified through a fresh screen read before further interactions.
- UI Automation is primary-monitor scoped. Password fields and uninspectable controls are blocked. Stop prevents subsequent steps but cannot undo an OS event already sent.
- Search snippets and page contents are untrusted data. Searches go to an external provider only after approval; using a cloud AI model also sends it the selected snippets.

## Verification

Release publication is gated on frontend/backend tests, Android compilation/lint, native emulator tests, Windows EXE packaging and file/signature/checksum verification. Android speech tests use **instrumentation-only OS speech-service fixtures** and a deterministic backend; they do not test real speech accuracy or audible voice quality. Browser tests use explicit fixtures for research and desktop actions. Physical Windows app control, media-player compatibility, microphone quality, real search-provider availability and physical Android behavior still need target-device validation. Test success is not a claim that everything is perfect.
