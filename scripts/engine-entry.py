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
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        cipher = AESGCM(AESGCM.generate_key(bit_length=256))
        nonce = os.urandom(12)
        sealed = cipher.encrypt(nonce, b"Bluetooth self-check", b"bluey-bt-v1:client")
        assert cipher.decrypt(nonce, sealed, b"bluey-bt-v1:client") == b"Bluetooth self-check"
        print("Windows desktop, speech and Bluetooth imports and AES-GCM self-check passed.")
    else:
        from backend.server import main
        main()
