"""Local-only, best-effort visible-window heuristic; never returns window titles.
A missing/minimized/renamed window is NOT proof a call ended. User confirmation
and manual meeting controls remain necessary. No audio or screenshot capture.
"""
import re
import sys


def meeting_title(title):
    return bool(re.search(r"^(?:Zoom Meeting|Zoom Webinar)$|\bMeet - [a-z]{3}-[a-z]{4}-[a-z]{3}\b|\b(?:Meeting|Call) with .+\| Microsoft Teams$", title, re.I))


def meeting_signal():
    if sys.platform != "win32":
        return {"active": None, "supported": False}
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.windll.user32
    user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    found = []
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def visit(hwnd, _):
        if user32.IsWindowVisible(hwnd):
            size = min(user32.GetWindowTextLengthW(hwnd), 1024)
            buf = ctypes.create_unicode_buffer(size + 1)
            user32.GetWindowTextW(hwnd, buf, size + 1)
            if meeting_title(buf.value): found.append(True)
        return True
    callback = callback_type(visit)
    user32.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
    if not user32.EnumWindows(callback, 0):
        return {"active": None, "supported": False}
    return {"active": bool(found), "supported": True}
