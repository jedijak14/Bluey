"""Frozen Windows engine entry point; no shell, downloads or elevated execution."""
import multiprocessing
import os
import sys
os.environ["ANONYMIZED_TELEMETRY"] = "false"
if __name__ == '__main__':
    multiprocessing.freeze_support()
    if "--self-check" in sys.argv:
        from windows_use.agent.desktop.service import Desktop
        from windows_use import uia
        from faster_whisper import WhisperModel
        import serial
        import websockets.asyncio.client
        print("Bundled Windows desktop, speech and Bluetooth modules import successfully.")
    else:
        from backend.server import main
        main()
