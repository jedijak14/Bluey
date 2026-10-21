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
| 1:55–2:08 | Sleep command and sleeping mascot | Explicit Sleep/Wake control in native Windows dashboard; existing sleepy expression. Exact explicit sleep/wake requests also set the mascot state without requiring a model; visual parity remains unverified. |
| 2:09–2:19 | Public project and wake-up | GitHub release requested as Bluey-Latest. Android/Windows retained; iOS/Mac are not target builds. |

## Acceptance checks still requiring the supplied video / physical devices
- Examine actual visual frames and audio; enumerate details absent from the transcript.
- Windows microphone/Whisper model configuration and real Ollama inference with the user's installed model.
- Pair real Bluetooth adapters, disconnect/reconnect, app background/foreground and incoming-port recovery.
- Physical UIA pointing/focus/typing and explicit final-submit confirmation; no credentials in test logs.
- Parent-supervised Guardian boot/Hello/PIN/recovery and every-browser architecture.

Do not turn this checklist into a blanket “everything works” claim.

Bluetooth reconnect isolation uses fresh per-connection AES-GCM keys and authenticated sequence numbers inside the OS-paired secure RFCOMM link. Every application packet must carry the current phone token. Old buffered replies are unreadable by a later device. This does not replace OS Bluetooth pairing or certify adapter behavior.

## Updated user direction
The user waived further reference-video matching and clarified the Bluetooth requirement: after OS pairing, the PC should appear automatically in the app, with Nearby Devices permission requested before access. Android now refreshes the paired-device list on Bluetooth selection, bond/connection changes and foreground resume. This is paired-device discovery, not location scanning or proof of a physical radio connection. Bluey code authorization and Windows bridge setup remain necessary.

## Supplied screenshot references (IMG_0326–IMG_0334)
The user subsequently supplied nine actual frames and requested matching the visible dock/report behavior. These supersede the earlier waiver for those details; the full video's motion/timing still has not been inspected.

- IMG_0329–IMG_0331 show a small white upward-pointing triangle at the bottom center, with the body tucked away. The full Bluey cursor is visible when pointing/typing in IMG_0332–IMG_0334. The Windows overlay now hides its cursor body at rest and draws a flat triangle flush to the usable display edge, respecting the taskbar. Only explicit pointing moves it away.
- IMG_0327 shows a compact white top-right “Researching” card. Engine events now distinguish approval waiting, source lookup, report preparation, cancellation and failure. No simulated search progress.
- IMG_0326/IMG_0328 show a preview/full research report with sources and expansion/minimization controls. The overlay starts completed research as a three-line preview; clicking expands its scrollable text/sources, collapsing restores the preview, and dismissal remains respected for that request. Returning home or receiving a quick reply does not erase the report.
- Overlay cursor, speech bubbles and report cards have no glow. The duplicate large bottom-right mascot is replaced by compact controls. The phone remains silent; no TTS was introduced.

Automated browser tests cover the dock marker, explicit flight/return, native work-area coordinates, preview/expand/collapse/dismiss, progress/error states, retained reports and source links. Packaged Windows checks remain a release gate, not a claim that physical Bluetooth or all-browser protection is verified.
