# Bluey · Windows + Android

A local-first desktop companion with a Windows workspace, a separate animated desktop pointer, and a paired Android face. Built with Electron, React, TypeScript, Tailwind, FastAPI, `windows-use`, faster-whisper, and Piper.

**Status: preview, not a validated production release.** Published Windows and Android previews are available under [GitHub Releases](https://github.com/jedijak14/Bluey/releases). The current website changes are checked with production builds, client/backend tests, and browser smoke tests. Those checks do not validate Windows UI Automation, microphone/Piper quality on physical devices, or a user's private HTTPS/VPN setup. Python and model files remain external prerequisites.

## Gemma website preview

Open **Gemma 3 preview** in the sidebar or `/#gemma`. The configured model is exactly `keras/gemma3/keras/gemma3_1b`, a pretrained **base** model—not a model trained by Bluey and not the instruct variant. It needs a separately provisioned Python inference host; the website reports unavailable until that host is connected. The retired tiny scratch model is not a fallback. See [download, Kaggle notebook and hosting setup](docs/GEMMA_WEBSITE.md).

The website is desktop/laptop-only, with illustrated unsupported-device screens for phones, iPads and tablets. Detection uses browser signals and is not hardware authentication. The native Android paired companion remains separate. Automatic Wi-Fi PC discovery is not implemented by this change.

## Download Bluey 0.2.0

Published preview: [v0.2.0-preview.3](https://github.com/jedijak14/Bluey/releases/tag/v0.2.0-preview.3).

| Platform              | Download                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android               | [Bluey-0.2.0-Android.apk](https://github.com/jedijak14/Bluey/releases/download/v0.2.0-preview.3/Bluey-0.2.0-Android.apk)                           |
| Windows x64 installer | [Bluey-0.2.0-Windows-x64-Setup.exe](https://github.com/jedijak14/Bluey/releases/download/v0.2.0-preview.3/Bluey-0.2.0-Windows-x64-Setup.exe)       |
| Windows x64 portable  | [Bluey-0.2.0-Windows-x64-Portable.exe](https://github.com/jedijak14/Bluey/releases/download/v0.2.0-preview.3/Bluey-0.2.0-Windows-x64-Portable.exe) |

[Checksums](https://github.com/jedijak14/Bluey/releases/download/v0.2.0-preview.3/SHA256SUMS.txt) · [Windows setup](docs/RELEASE_NOTES.md) · [Android setup](docs/ANDROID_RELEASE.md). Windows binaries are unsigned and still require the Python/model setup. Android is debug-signed; a different preview signing key can require uninstalling the previous APK (clears app data). **Bluey is silent by default.**

## 0.2.0 preview additions

Research cards and quick-answer bubbles; approved web research with source snippets; ChatGPT/browser and installed-app launching; media keys; Edge/Chrome extension managers; visible typing and click feedback; Windows microphone selection; silent-by-default Android device speech. See [release scope and limitations](docs/RELEASE_0.2.0.md). [Both platform build gates passed](https://github.com/jedijak14/Bluey/actions/runs/39361654895), including Bluey’s Android emulator tests.

## The reference, faithfully adapted

Reviewed [rbrown101010/bluey-by-riley](https://github.com/rbrown101010/bluey-by-riley) at commit `6d84d91456f3bf7ad9b31caf31f19710b0ba8328` (Unlicense). This is a **Windows/Android adaptation**, not the original Mac/iPhone app and not wire-compatible with it.

- The Android screen is the big bottom-peeking blueberry face; the desktop pointer is a **different teardrop character**.
- Seven expressions: listening, thinking, talking, pointing, happy, sleepy, resting.
- Original blueberry colors, crown, eyes, blush, and locally bundled Fredoka / IBM Plex fonts.
- Independent pointer eyes, cubic flight paths, comet/string/off trails, and soft glow.
- Double tap the phone face to wake/rest. Hold an awake face to record; release to transcribe and ask.
- Unlike the reference's always-listening OpenAI Realtime design, **recording is explicit**. Windows uses local transcription. Android prefers on-device recognition, but its configured system provider may use a network after explicit consent. No background meeting recording is implemented.

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

## Website pairing

Production frontend: **https://bluey-plum.vercel.app**. Use **Enter pairing code** in the toolbar (or **Connected devices → Pair this device**) to enter your PC endpoint and six-digit code. This opens the companion, not desktop administration.

To generate codes, connect the Windows engine in Settings, then open **Connected devices → Pair my Android**. The countdown updates every second; devices are checked every two seconds while connected. Unused expired codes renew automatically while this screen stays open. Pairing, errors, disconnecting, or leaving the screen stop automatic renewal. Code generation works with the existing released Windows API; no cloud pairing service is implied.

**HTTPS matters:** the Vercel frontend does not host the Windows engine. Browser pairing needs a trusted HTTPS/WSS endpoint over your private network/VPN, with the exact website origin explicitly configured in `BLUEY_ALLOWED_ORIGINS`. Do not publicly expose port 8765 or disable browser security. Ordinary HTTP LAN pairing remains available in the Android APK. See the [connection guide](public/pairing-guide.html), also available at `/pairing-guide.html` on the website.

### Pairing regression tests

After `npm ci` and installing `backend/requirements-dev.txt`, run `npm run build`, then start `npm run dev`. In a separate terminal, start an **isolated test engine** on port 8765 with `BLUEY_LAN=1 BLUEY_TOKEN=pairing-browser-smoke python -m backend.server --lan`. Run `npm run test:pairing`. Never point this test at a real user's engine: it revokes existing test devices. Stop the test engine afterward.

The browser test checks real API redemption/authenticated WebSocket/revocation, plus deterministic short-lived code renewal and hosted HTTPS client fixtures. It also checks mobile drawer close/backdrop/Escape/navigation, disconnected generation, and HTTP-from-HTTPS rejection. Production build tests do not validate a user's private TLS/VPN setup or physical hardware. `npm test`, `npm run test:ui`, and `python -m pytest backend/tests -q` cover the remaining client/UI/backend behavior. On minimal Linux images, use a system browser via `BLUEY_BROWSER`, or provide the shared libraries required by the bundled Sparticuz Chromium.

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

These model instructions apply to desktop/browser voice; Android 0.2.0 does not need these models for device input/output. Download voice models separately to locations outside this repository. This project does not fetch models automatically.

```powershell
$env:BLUEY_WHISPER_MODEL = "C:\BlueyModels\faster-whisper-small"
$env:BLUEY_PIPER_MODEL = "C:\BlueyModels\en_US-lessac-medium.onnx"
# The matching en_US-lessac-medium.onnx.json must sit alongside the ONNX file.
npm run desktop
```

The Whisper path must be an already-downloaded CTranslate2/faster-whisper model directory. The Piper path must point to a valid voice `.onnx` plus its configuration file. Respect model licenses.

Desktop mic: click to start, click again to stop; review the resulting transcript before sending. Turn on **Read responses aloud** for desktop audio. Android 0.2.0 uses device speech recognition after explicit opt-in: double tap to wake, hold to speak, release to send recognized text. **Bluey is silent by default**; optional Android spoken replies use the device TTS engine, not Piper. See [Android device speech and privacy](docs/ANDROID_RELEASE.md).

First model load and CPU transcription/synthesis are **not zero-latency**. Whisper runs CPU/int8 in this implementation. For desktop/browser voice (not Android device speech), recordings are uploaded to the paired PC, temporary WAVs are deleted after transcription, and generated speech is sent as complete sentence-sized WAV chunks, not low-level streaming PCM.

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

1. Install the Bluey Android debug APK built below.
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

[Verified release run 39361654895](https://github.com/jedijak14/Bluey/actions/runs/39361654895) built source `36daa18a5bdec691463d72f425d40c30f5dd6166` and published the downloads above only after both platform jobs succeeded. Android speech tests use instrumentation-only system-service fixtures; they do not establish real speech accuracy or voice quality.

## Validation

```sh
npm run build
npm test
python -m pip install -r backend/requirements-dev.txt
python -m pytest backend/tests -q
# Start npm run dev in a separate terminal first:
npm run test:ui
npm run test:device-speech
npm run test:features
```

`test:ui` uses Playwright and the development-only `@sparticuz/chromium` bundle. Linux needs the usual Chromium shared libraries. `BLUEY_BROWSER=/path/to/chromium` selects another installed browser. Native Windows testing should use an installed Chrome/Chromium path.

Checked locally and in CI: production web build, 27 TypeScript tests, 33 backend tests, browser interaction/native-bridge/feature smoke tests. CI also passed Android compilation/lint/native emulator tests and Windows EXE packaging/header/checksum verification. Production npm dependencies have zero reported audit advisories at validation time; eight moderate development-only advisories remain in the Electron packaging toolchain. Native integrations are source-complete adapters, **not yet hardware-verified**.

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
