# Bluey 0.5.3 preview — quiet bottom-center cursor

The little desktop cursor now parks at the bottom-center of the primary display's usable work area, above the Windows taskbar. It does not follow the mouse. Only explicit engine pointing/action packets move it away; completed or failed coordinate actions return it automatically. Home/session-end also returns it to its dock, where it stays.

Movement uses eased, bounded curves, with a subtle settling lean instead of abrupt full rotations. Speech bubbles remain upright. Dock placement adapts to cursor size, work-area and display changes; reduced-motion preferences are respected. The renderer stops its movement animation loop when settled, and the desktop process no longer polls/broadcasts mouse position at 20 Hz. The website pointer playground starts and resets at bottom-center too.

Checks cover dock geometry, invalid targets, mouse noise, explicit flight, return-home behavior, resizing, taskbar offsets, cursor size and reduced motion. Packaged Windows smoke checks use the actual overlay and native work-area IPC with fixture engine messages, without executing desktop actions.

This release prioritizes the cursor only. Unfinished account-gate/enforcement work is NOT included. Guardian capabilities remain those of 0.5.2; no all-browser or non-bypassable-logon protection is claimed. Windows previews remain unsigned and require separate engine/model setup. Android APKs remain debug-signed; no Android enforcement work is included.
