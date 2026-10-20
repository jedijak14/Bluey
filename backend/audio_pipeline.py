"""Local-only voice. Models are explicit paths; nothing downloads behind your back."""

import base64
import io
import os
import tempfile
import threading
import wave
from pathlib import Path


class AudioPipeline:
    def __init__(self):
        self.whisper = None
        self.piper = None
        self.lock = threading.Lock()

    def capabilities(self):
        return {
            "stt_model": bool(os.getenv("BLUEY_WHISPER_MODEL")),
            "tts_model": bool(os.getenv("BLUEY_PIPER_MODEL")),
        }

    def transcribe(self, encoded: str) -> str:
        if len(encoded) > 12_000_000:
            raise ValueError("Recording exceeds the 60-second limit.")
        data = base64.b64decode(encoded, validate=True)
        with wave.open(io.BytesIO(data), "rb") as wav:
            if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
                raise ValueError("Expected mono, 16-bit PCM WAV audio.")
            if (
                not 8000 <= wav.getframerate() <= 96000
                or wav.getnframes() / wav.getframerate() > 60
            ):
                raise ValueError("Recording must be no longer than 60 seconds.")
        model_path = os.getenv("BLUEY_WHISPER_MODEL", "")
        if not model_path or not Path(model_path).is_dir():
            raise RuntimeError(
                "Set BLUEY_WHISPER_MODEL to a downloaded faster-whisper model directory."
            )
        with self.lock:
            if self.whisper is None:
                from faster_whisper import WhisperModel

                self.whisper = WhisperModel(
                    model_path, device="cpu", compute_type="int8", local_files_only=True
                )
            # NamedTemporaryFile must be closed before Whisper opens it on Windows.
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as file:
                file.write(data)
                name = file.name
            try:
                segments, _ = self.whisper.transcribe(name, beam_size=3, vad_filter=True)
                return " ".join(segment.text.strip() for segment in segments).strip()
            finally:
                Path(name).unlink(missing_ok=True)

    def synthesize(self, text: str) -> str:
        path = os.getenv("BLUEY_PIPER_MODEL", "")
        if not path or not Path(path).is_file():
            raise RuntimeError(
                "Set BLUEY_PIPER_MODEL to your local Piper .onnx voice (with its .onnx.json file)."
            )
        with self.lock:
            if self.piper is None:
                from piper import PiperVoice

                self.piper = PiperVoice.load(path)
            output = io.BytesIO()
            with wave.open(output, "wb") as wav:
                self.piper.synthesize_wav(text[:1500], wav)
            return base64.b64encode(output.getvalue()).decode("ascii")
