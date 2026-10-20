# Bluey · Windows + Android

A local-first desktop companion with a Windows workspace, a separate animated desktop pointer, and a paired Android face. Built with Electron, React, TypeScript, Tailwind, FastAPI, `windows-use`, faster-whisper, and Piper.

**Status: installable preview builds, not a production-certified release.** GitHub Actions has built and published the Windows executables and Android APK. The Android release passed compilation, lint/unit checks, signature verification, and native Android emulator tests for launch, expressions, authenticated pairing, typed requests, and microphone WAV transport. Model/STT/TTS in those native tests are deterministic fixtures; physical-device voice quality and Windows UI Automation still require testing with your actual PC and models.

## Downloads

- **[Android companion APK 0.1.1](https://github.com/jedijak14/Bluey/releases/download/v0.1.1-android-preview.1/Bluey-0.1.1-Android.apk)** — universal, debug-signed sideload build (9.2 MB).
- [Android setup, checksums and verification](https://github.com/jedijak14/Bluey/releases/tag/v0.1.1-android-preview.1).
- [Windows installer 0.1.0](https://github.com/jedijak14/Bluey/releases/download/v0.1.0-preview.1/Bluey-0.1.0-Windows-x64-Setup.exe).
- [Windows portable 0.1.0](https://github.com/jedijak14/Bluey/releases/download/v0.1.0-preview.1/Bluey-0.1.0-Windows-x64-Portable.exe).

**The APK is a Windows-paired companion, not a standalone offline AI.** It needs the Windows backend for chat, voice, and desktop actions. Offline expression play does not need a PC. Windows builds require an external Python environment; models and speech voices are not bundled.

Android build and emulator verification: [successful run 39348558421](https://github.com/jedijak14/Bluey/actions/runs/39348558421), source `23f68deb30d37b1df4eb8b03869857b653089b19`.

APK SHA-256: `1e0b570143e57bfacfc228f199e498be97682c258a3cbd249cb0cc3ec82fc742`.

## The reference, faithfully adapted

Reviewed [rbrown101010/bluey-by-riley](https://github.com/rbrown101010/bluey-by-riley) at commit `6d84d91456f3bf7ad9b31caf31f19710b0ba8328` (Unlicense). This is a **Windows/Android adaptation**, not the original Mac/iPhone app and not wire-compatible with it.

- The Android screen is the big bottom-peeking blueberry face; the desktop pointer is a **different teardrop character**.
- Seven expressions: listening, thinking, talking, pointing, happy, sleepy, resting.
- Original blueberry colors, crown, eyes, blush, and locally bundled Fredoka / IBM Plex fonts.
- Independent pointer eyes, cubic flight paths, comet/string/off trails, and soft glow.
- Double tap the phone face to wake/rest. Hold an awake face to record; release to transcribe and ask.
- Unlike the reference's always-listening OpenAI Realtime design, **recording is explicit and local transcription is used**. No background meeting recording or cloud transcription is implemented.

See [the reference adaptation notes](docs/REFERENCE.md) and [security / protocol notes](docs/ARCHITECTURE.md).

## What is implemented

| Area              | Implementation                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat workspace    | Local conversation history, search/delete, quick prompts, text attachments, streamed responses, stop, local voice recording                                            |
| Code workspace    | CodeMirror editor, syntax highlighting, selected-folder file list, read/save, browser-only scratchpad, collapsible read-only backend logs, shared AI chat              |
| Companion preview | Seven expressions, independent pointer playground, cursor size, trail and glow preferences, reduced-motion support                                                     |
| Windows shell     | Main window + transparent always-on-top primary-display overlay, click-through except widget controls, global summon and stop shortcuts, isolated preload bridge       |
| Python engine     | Authenticated WebSocket protocol, Ollama or OpenAI-compatible streamed tool calling, bounded action loop, desktop approvals                                            |
| Windows adapter   | UIA screen labels, explicitly approved screenshot, point, click, text, scroll, focus-targeted allowlisted shortcuts, window switching; real pointer restored afterward |
| Voice adapters    | Explicit microphone → bounded PCM WAV → local faster-whisper; local Piper → sentence-sized WAV packets → playback animation                                            |
| Android project   | Capacitor native Android wrapper, native mic permission, landscape pairing / face screens, hold-to-talk, no model API keys on phone                                    |
| Pairing           | Manually entered PC address + short-lived one-use six-digit code, limited attempts, session-only phone credentials, revoke controls                                    |

The code workspace is **not a complete Cursor replacement**: no shell execution, language server, debugger, Git UI, autonomous code patching, or project indexing is included. Chat does not automatically read your open project; attach the relevant text explicitly.

## 1. Preview the interface

Requires Node.js 22+.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The interface does not fake an AI connection. Chat requests ask you to configure the backend if it is disconnected. The scratchpad and companion playground work without Python.

- Android UI preview: `http://localhost:5173/#phone`
- Browser code mode saves scratchpad files in local storage. Windows mode can open a real folder.
- All fonts and character rendering are local; no CDN is needed at runtime.
- To skip downloading Electron for web-only development: `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` (on PowerShell, set `$env:ELECTRON_SKIP_BINARY_DOWNLOAD="1"` first).

## 2. Run on Windows

Use Windows 10/11, Node.js 22+, and **Python 3.11 recommended** (3.10+ supported by the backend source). Run these commands from the repository in PowerShell:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-native.txt
npm ci
$env:BLUEY_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
npm run desktop
```

Electron starts the Python backend automatically, generates a session token, and supplies it through the isolated preload bridge. If the engine fails, the interface remains available and reports the connection as offline. On a packaged installation Python and native dependencies are **still external prerequisites**, not bundled in the installer.

### Model setup

In Settings & preferences:

- **Ollama:** run Ollama separately, download a model, and enter its name. The default is `llama3.2` at `http://127.0.0.1:11434`.
- **OpenAI-compatible:** enter a base URL including `/v1`, model ID, and your API key. The API must support streaming chat completions and function/tool calling. A vision-capable model is needed for screenshot analysis.
- Keys are kept in backend memory, never browser storage or the phone. Cloud providers receive the messages and approved screen content you send; only an actually local model keeps inference on the PC.
- The default model name is a configuration placeholder, **not an installed model**.

For backend-only development:

```powershell
.\.venv\Scripts\python.exe -m backend.server
```

The desktop token is printed **once** in the private backend startup console. In the browser, leave Backend address blank to use Vite's same-origin `/api` proxy, and paste that token into Settings. Do not share it. Tokens are never placed in WebSocket URLs. To attach Electron to an existing backend, set both `BLUEY_EXTERNAL_BACKEND=1` and `BLUEY_TOKEN` to that backend's token before launching Electron.

### Voice setup

Download voice models separately to locations outside this repository. This project does not fetch models automatically.

```powershell
$env:BLUEY_WHISPER_MODEL = "C:\BlueyModels\faster-whisper-small"
$env:BLUEY_PIPER_MODEL = "C:\BlueyModels\en_US-lessac-medium.onnx"
# The matching en_US-lessac-medium.onnx.json must sit alongside the ONNX file.
npm run desktop
```

The Whisper path must be an already-downloaded CTranslate2/faster-whisper model directory. The Piper path must point to a valid voice `.onnx` plus its configuration file. Respect model licenses.

Desktop mic: click to start, click again to stop; review the resulting transcript before sending. Android: double tap to wake, hold to record, release to send the transcription. Maximum recording length is 60 seconds. Turn on **Read responses aloud** for desktop audio. Phone options include typed questions and a **Speak replies** checkbox; disable it for text-only use without Piper. The phone cancels microphone capture when backgrounded.

First model load and CPU transcription/synthesis are **not zero-latency**. Whisper runs CPU/int8 in this implementation. Recordings are uploaded to the paired PC, temporary WAVs are deleted after transcription, and generated speech is sent as complete sentence-sized WAV chunks, not low-level streaming PCM.

### Desktop controls

| Shortcut         | Action                                          |
| ---------------- | ----------------------------------------------- |
| Ctrl + Shift + B | Toggle floating companion / pointer overlay     |
| Ctrl + Shift + S | Cancel model work and pending desktop approvals |
| Ctrl + K         | Search saved conversations in the workspace     |
| Ctrl + N         | New conversation in the workspace               |

Approve each action on the Windows PC. Bluey brings its window forward for approval and minimizes it after approval so it does not click its own dialog. Denied and expired actions do not execute. Stop cannot undo an already-completed action or forcibly interrupt a native OS call in progress.

The overlay currently targets the **primary display**. Multi-monitor normalized targeting is not implemented. Always-on-top is best-effort: exclusive-fullscreen games, secure desktop/UAC, elevated windows and protected applications can block overlays or UI Automation. Do not run Bluey as administrator to bypass these boundaries.

## 3. Pair Android

Enable LAN mode **before launching the Windows app**:

```powershell
$env:BLUEY_LAN = "1"
npm run desktop
```

Or run `python -m backend.server --lan` for a standalone backend. Allow Python on **private networks only** in Windows Firewall; TCP port is 8765. Do not forward the port on your router.

1. Install the published Bluey Android APK linked above, or build it yourself below.
2. Keep the PC and phone on the same trusted Wi-Fi.
3. In Windows → Connected devices, generate a pairing code.
4. On Android, enter the displayed private PC address, e.g. `192.168.1.10:8765`, and the six-digit code within two minutes.
5. Double tap to wake; hold to speak. Approve proposed desktop actions on the PC.

Pairing codes are one-use. Credentials are in memory and expire when the backend restarts; pair again after app/device restarts. Android can chat, transcribe, receive face/audio updates, and request stop, but **cannot approve actions, change model keys/configuration, or browse workspace files**.

There is no Bonjour/mDNS auto-discovery yet. HTTP LAN transport is **unencrypted by default**. The Android app explicitly allows cleartext for private-LAN pairing. Use only trusted private Wi-Fi; use a TLS reverse proxy and an explicitly allowed origin if stronger transport protection is required. A browser served over public HTTPS may block a connection to a private HTTP PC; use the native Android app, not the Arena preview, to test LAN pairing.

## 4. Build the APK and Windows installer

### Android APK

Install **Java 21** and **Android SDK platform 35 / build tools**, accept SDK licenses, and set `JAVA_HOME` and `ANDROID_HOME` (or `android/local.properties`). Android Studio can provide these.

```sh
npm ci
npm run android:apk
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

This is a **debug-signed sideload APK**, not a Play Store production release. A release build needs your own signing key; never commit keystores or passwords. Native Android config: `android/`, `capacitor.config.ts`. Minimum Android API 23.

### Windows installer

On Windows:

```powershell
npm ci
npm run package:win
```

Output: `release/` (NSIS installer). Unsigned builds can trigger SmartScreen. Python, `windows-use`, models and audio dependencies must be installed separately and `BLUEY_PYTHON` must point to the configured interpreter if not on PATH.

### GitHub Actions

`.github/workflows/build.yml` tests the project and builds both artifacts on push/PR or manual dispatch:

- `Bluey-Android-APK`
- `Bluey-Windows-executables`

The workflow has run successfully on GitHub. Public prerelease downloads are linked above. Android publication is gated on its native emulator tests and signed-APK verification; Windows artifacts were built in the earlier Windows release. The publication jobs are restricted to the current working branch and explicit `[release-android]` / `[release-windows]` commit markers. Other pushes run tests/builds without publishing a release.

## Validation

```sh
npm run build
npm test
python -m pip install -r backend/requirements-dev.txt
python -m pytest backend/tests -q
# Start npm run dev in a separate terminal first:
npm run test:ui
```

`test:ui` uses Playwright and the development-only `@sparticuz/chromium` bundle. Linux needs the usual Chromium shared libraries. `BLUEY_BROWSER=/path/to/chromium` selects another installed browser. Native Windows testing should use an installed Chrome/Chromium path.

Checked locally: production web build, 11 TypeScript tests, 18 backend tests, browser interaction smoke tests at desktop/phone sizes, Android asset sync. Checked on GitHub: Windows executable packaging and Android compilation, lint/unit checks, emulator launch/pairing/text/microphone-transport tests, and APK signature verification. The emulator uses fixture model/STT/TTS responses. Production npm dependencies have zero reported audit advisories at validation time; eight moderate development-only advisories remain in the Electron packaging toolchain. **Real Windows UI Automation and voice models are not yet physical-device-verified.**

## Layout

```text
src/                         React workspace and Android screens
  components/FloatingWidget/ Vector face, cursor and transparent overlay
  components/AppWindow/      Code editor / selected project / logs
  lib/                       Authenticated client, audio capture, motion
backend/                     FastAPI, model, voice, Windows adapter, tests
electron/                    Main process, isolated preload, native icons
android/                     Capacitor native Android project
public/fonts/                Offline fonts and OFL license notices
public/references/           User-supplied visual reference images
docs/                        Reference and security/protocol notes
```

The application code is public domain under the repository's [Unlicense](LICENSE). Font licenses and reference attribution are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
