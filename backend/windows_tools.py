"""Approved Windows utilities. Inputs never become shell commands or executable paths."""
import os
import sys
import subprocess


def installed_apps():
    if sys.platform != "win32":
        raise RuntimeError("Installed applications are available only on Windows.")
    import pythoncom
    import win32com.client
    pythoncom.CoInitialize()
    folder = win32com.client.Dispatch("Shell.Application").Namespace("shell:AppsFolder")
    if folder is None:
        raise RuntimeError("Windows could not enumerate installed applications.")
    return folder.Items()


def app_catalog():
    return {"apps": sorted({str(item.Name) for item in installed_apps() if item.Name}, key=str.casefold)[:400]}


def open_app(name: str):
    items = [item for item in installed_apps() if str(item.Name).casefold() == name.strip().casefold()]
    if len(items) != 1:
        raise RuntimeError("Choose an exact, unique installed app name from the application list. No executable path or command is accepted.")
    items[0].InvokeVerb("open")
    return {"requested_open": str(items[0].Name), "notice": "Launch requested from Windows AppsFolder. Use read_screen to verify the app opened."}


def open_extensions(browser: str):
    import winreg
    executable = "chrome.exe" if browser == "chrome" else "msedge.exe"
    candidates = []
    for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for view in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
            try:
                with winreg.OpenKey(root, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\" + executable, 0, winreg.KEY_READ | view) as key:
                    candidates.append(winreg.QueryValue(key, None))
            except OSError:
                pass
    for candidate in candidates:
        if os.path.isfile(candidate) and os.path.basename(candidate).lower() == executable:
            subprocess.Popen([candidate, ("chrome" if browser == "chrome" else "edge") + "://extensions/"], shell=False)
            return {"opened": "Extension manager", "browser": browser, "notice": "Existing browser extensions only. No extension was installed or granted permissions."}
    raise RuntimeError("This browser was not found in Windows App Paths. Open it manually and use its Extensions menu.")


def media_command(command: str):
    # Media keys are handled by Windows/the active media application. Toggle is
    # deliberately labelled as a toggle; we cannot infer a player's current state.
    import ctypes
    codes = {"play_pause": 0xB3, "next": 0xB0, "previous": 0xB1, "stop": 0xB2,
             "mute": 0xAD, "volume_up": 0xAF, "volume_down": 0xAE}
    code = codes[command]
    ctypes.windll.user32.keybd_event(code, 0, 0, 0)
    ctypes.windll.user32.keybd_event(code, 0, 2, 0)
    return {"sent_media_key": command, "notice": "Sent to Windows. Support depends on the active player; playback state is not verified."}
