# Reference review — ScreenApp video

Source: https://screenapp.io/app/share/W0s9zq2g_2_x8U6Im4RGZhDp
Title returned: “Can Claude build a cross_platform AI app _ Riley Brown 1080p h264”
Length shown: 2:19. The page provided a transcript, **not accessible visual frames**. Upload of the original video was requested. Styling, animation timing, pointer trajectories, layouts, screen transitions and details not described by the transcript are unverified, not invented.

| Time | Transcript evidence | Android/Windows implementation / remaining gate |
|---|---|---|
| 0:00–0:24 | Desktop + phone companion, listening, mouse following, point on screen | Windows overlay and Android foreground companion. Existing Wi-Fi pairing; new optional Bluetooth SPP. Preserve user's later bottom-center stationary cursor requirement instead of passive mouse-following. Physical Bluetooth test pending. |
| 0:25–0:36 | Point to a named chat on screen | Approved accessibility read followed by normalized primary-display pointing. Requires supported Windows UIA and a tool-capable model; not verified against the video app. |
| 0:37–0:59 | Research a projects feature, point to Projects, click to read more | Existing approved web research and source cards; explicit pointing and click actions. Research is source snippets, not a claim of complete webpage reading. |
| 0:59–1:14 | Open ChatGPT, focus its prompt box, type a prompt | Existing installed-app/browser opening, focus/password checks, visible bounded typing. Each action requires approval; arbitrary terminal commands prohibited. End-to-end physical app scenario pending. |
| 1:15–1:20 | Positive feedback | Existing mascot expressions; no spoken replies per user instruction. Exact visual expression unknown without frames. |
| 1:21–1:30 | Open Chrome and Twitter | Existing app catalog and URL actions. Original companion can open URLs after approval; managed Kids restrictions remain separate and X defaults blocked. |
| 1:31–1:54 | Compose “building something cool”, ask confirmation, post | Existing typed text plus separately approved submission. No autonomous publishing. Account login and successful posting are not tested/claimed. |
| 1:55–2:08 | Sleep command and sleeping mascot | Explicit Sleep/Wake control in native Windows dashboard; existing sleepy expression. Natural-language sleep command parity not yet verified. |
| 2:09–2:19 | Public project and wake-up | GitHub release requested as Bluey-Latest. Android/Windows retained; iOS/Mac are not target builds. |

## Acceptance checks still requiring the supplied video / physical devices
- Examine actual visual frames and audio; enumerate details absent from the transcript.
- Windows microphone/Whisper model configuration and real Ollama inference with the user's installed model.
- Pair real Bluetooth adapters, disconnect/reconnect, app background/foreground and incoming-port recovery.
- Physical UIA pointing/focus/typing and explicit final-submit confirmation; no credentials in test logs.
- Parent-supervised Guardian boot/Hello/PIN/recovery and every-browser architecture.

Do not turn this checklist into a blanket “everything works” claim.
