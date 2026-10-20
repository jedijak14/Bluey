# Bluey 0.3.0 — Windows preview

Windows 10/11, x64. Two versions of the same application:

- **Setup.exe**: installer with an install-location chooser and uninstall support.
- **Portable.exe**: launches without installing the application. Preferences and chats still use the current Windows user's application-data storage; this is not a fully self-contained USB profile.

## Important before you run

These executables are **unsigned preview builds**. Windows SmartScreen may warn about an unknown publisher. No certificate or production signing is included. Verify downloaded files against `SHA256SUMS.txt`.

**The Python engine is not bundled.** Chat, voice and Windows control need Python 3.11, the backend requirements, a configured model, and (for Windows microphone transcription) a downloaded Whisper model. The companion playground and local code scratchpad can be used without these. This is not a fully validated production release.

### Set up the backend interpreter (PowerShell)

Download the source from this release and extract it, then run from the extracted directory:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-native.txt
$python = (Resolve-Path .\.venv\Scripts\python.exe).Path
[Environment]::SetEnvironmentVariable("BLUEY_PYTHON", $python, "User")
$env:BLUEY_PYTHON = $python
```

Launch Bluey from this PowerShell session, or sign out and back into Windows so shortcuts see the new environment variable. The EXEs contain the backend Python source and launch it using this interpreter. Do not move/delete the virtual environment afterward.

For Android pairing also set `BLUEY_LAN=1` before launch and allow port 8765 only on a trusted private network. Pairing transport is HTTP unless you configure TLS. No cloud pairing service is involved.

Model API keys are configured in Settings. Local Ollama and downloaded transcription models are external requirements. See `README.md` in the source for complete setup and native-platform limitations.

Web builds and automated tests are checked before packaging. Packaging does not establish that all UIA interactions, audio devices, games, or display configurations work on a physical Windows PC. Native OS calls in progress cannot be forcibly undone by Stop. Review every proposed desktop action.

## Quiet sessions and meeting notes

Ctrl+Shift+Space starts/ends a session on the single paired phone, or this PC if none is paired. Initial recording requires informed consent. Hold the phone screen (or the workspace Hold to ask control for a PC session) and release to ask. Replies are text only, with a brief phone chirp. The legacy one-shot microphone button still transcribes to a draft.

Meeting detection is a best-effort Windows window heuristic, not a guaranteed meeting integration. Use manual Start/End controls when needed. Only microphone-audible voices are captured; headphone participants are not automatically transcribed. Review summaries and explicitly save notes/transcripts. Context and unsaved drafts are temporary. Read docs/QUIET_SESSIONS.md for bounds and privacy details. Update the APK and engine together.
