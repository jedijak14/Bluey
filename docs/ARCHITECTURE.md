# Runtime architecture and security boundaries

## Data flow

```text
Electron main ── private session token via preload ── React main / overlay
       │                                                   │
       └─ launches Python                                  │ authenticated WS
                                                           ▼
Android ── one-use pair code ── scoped phone token ── FastAPI engine
  │                                                        │
  └─ microphone PCM WAV ── faster-whisper ── transcript ── model adapter
                                                           │
                       one-action PC approval ◀── tool request
                                                           │
                           UIA worker ◀── explicit approval │
                                                           ▼
                              local Piper ── WAV chunks ── playback / face
```

## Authentication

- Desktop token: 256-bit random session credential unless supplied via `BLUEY_TOKEN`. Generated in Electron main for automatic launch; never saved in browser localStorage. The standalone backend logs it once for local setup.
- HTTP privileged endpoints use `Authorization: Bearer …`; WebSockets authenticate in the first frame within 5 seconds. Tokens are not URL query parameters or request logs.
- Server verifies WebSocket origins against an explicit allowlist. Development: `http://localhost:5173`, `http://127.0.0.1:5173`; Android: `https://localhost`; Electron files: `null`. Add exact origins with comma-separated `BLUEY_ALLOWED_ORIGINS` before starting the backend, including your preview HTTPS origin if required.
- Codes expire in 120 seconds, invalidate after redemption, and are rate-limited per source plus globally. A new code invalidates the previous one.
- Phone tokens live in memory on both sides. Revocation closes matching WebSockets. Phones may not approve actions or access config/workspace HTTP routes.
- Loopback binding is the default. LAN mode must be deliberately enabled. HTTP is not encrypted: private Wi-Fi only, or place behind a TLS endpoint. CORS is not authentication.

## Minimal WebSocket protocol

Authenticate:

```json
{ "type": "auth", "token": "<session credential>" }
```

Receive `ready` with `role: desktop | phone` before considering the client connected.

Client messages:

- `chat`: request ID, up to 60 `{role: user|assistant, content}` messages, optional voice flag.
- `transcribe`: base64 mono 16-bit PCM WAV; max 60 seconds, max transport size 12 MB.
- `approve`: pending action ID and strict boolean `allow`; desktop role only.
- `mood`: valid seven-state name; desktop role only.
- `stop`: cancel active model/voice jobs, revoke pending approvals, send pointer home.
- `ping`: keepalive check.

Server messages: `ready`, `token`, `done`, `error`, `face`, `caption`, `pointer`, `home`, `audio`, `transcript`, `approval`, `approval_resolved`, `stopped`, `log`, `pong`.

`face` contains mood, gazeX, gazeY, talk. `pointer` is primary-display normalized x/y 0…1000; Electron converts to display-independent overlay coordinates. Native UIA converts to physical pixels.

## Automation boundaries

The project uses the low-level `windows_use.agent.desktop.service.Desktop`, not its autonomous Agent. Every action, including reading UI labels and taking a screenshot, needs explicit desktop approval. Tools are a Pydantic allowlist; there is no shell, arbitrary Python, URL or process-launch tool.

Approval is single-use, times out after 90 seconds, and is never forwarded to phones. A global one-request model lock prevents two conversations interleaving desktop control. The model loop is limited to six steps and four actions per response. Input content, tool arguments, output and recordings are bounded.

Screens are untrusted data. A system instruction says not to obey on-screen instructions, but prompt text is not a complete security boundary. User review is still required. Password/uninspectable controls are excluded from UIA labels and blocked for clicks, typing and shortcut focus. Screenshots are an explicitly approved exception: they may contain visible sensitive content, and the approval says so. Model output is rendered as text, not injected HTML.

Coordinate-based shortcuts first request UIA focus on the approved target and verify the focused process. User actions can still race an automation call. Do not use this build unattended or for financial, credential, destructive, or other high-stakes workflows. The real system pointer is restored after native actions, but clicking still briefly uses the OS pointer; the visible teardrop is independent artwork, not a second OS mouse.

Stop cancels async work and prevents the next native action. Python cannot forcibly interrupt an already-running UIA call in its worker; it cannot undo completed changes. Large text entry is bounded to 500 characters. Prefer short actions. Global hotkey registration may fail if another app owns the key; Electron reports it in its console.

## Workspace and storage

Only the desktop token can choose/read/write a workspace. Electron requires a native folder picker. The backend resolves paths, refuses traversal and escaping symlinks, excludes `.git`, `.ssh`, `.env*`, `node_modules` and virtualenv directories, limits reads, and lists at most 1,000 text files. Existing-file writes only; no create/delete API. A desktop-token holder can choose any folder accessible to the OS user; protect this credential accordingly.

This is not a hardened multi-user filesystem sandbox: there is no protection against an external local process racing a symlink/file replacement. File saves are simple UTF-8 writes, not transactional version control. Back up your work.

Conversation history and appearance preferences use localStorage. Scratchpad edits are saved only when you click Save. Model endpoint/name preferences persist; desktop tokens and API keys do not. Cloud provider keys stay in backend memory. There is no encrypted chat-history store yet. Clear history through Privacy settings. Android backup is disabled.

## Dependency and platform limitations

- Native packages are optional and lazily loaded. Importing the FastAPI server on Linux requires no Windows modules or speech models.
- `ANONYMIZED_TELEMETRY=false` is set before importing windows-use. Bluey adds no analytics.
- Piper voice and Whisper model paths must already exist. No automatic online download or cloud fallback.
- Audio is recorded through browser/WebView Web Audio. Microphone capture runs in the frontend, not a Python system-wide microphone daemon. It only starts after an explicit gesture.
- Android contains no background service or PC automation engine. The PC hosts inference, permissions, and automation.
- The build workflow produces unsigned Windows and debug-signed Android artifacts. Production signing and distribution are not configured.

## Android device speech (0.1.2)

`DeviceSpeechPlugin` is a locally registered Capacitor bridge to Android SpeechRecognizer and TextToSpeech. No speech service starts at launch. Replies default to captions; optional device TTS requires explicit session opt-in. Android always sends `chat` with `voice: false`, even when device TTS is enabled, and never sends microphone WAVs or a `transcribe` packet. Browser/Windows audio paths are unchanged except the companion's silent default.

Recognition needs both informed UI opt-in and Android microphone permission. Prefer on-device recognition on API 31+ when available; otherwise use the configured system provider with an offline preference. That preference is not a guarantee: provider speech/voice packs may use the network. Typed input remains available without speech services. Native sessions are bounded, cancel on Activity pause/destruction, and reject stale session IDs. Optional output is lazy-initialized, chunked, cancelled on mute/stop/backgrounding and never replayed automatically after cancellation. Test speech services exist only in the instrumentation APK, not the shipped APK.
