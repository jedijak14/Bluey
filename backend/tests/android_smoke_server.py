"""CI-only transport fixtures. Not packaged with or enabled in the production app.

Exercises the real FastAPI auth/pairing/WebSocket bridge and validates real PCM
from the Android WebView. It does NOT test Whisper accuracy or a real LLM/voice.
"""
import base64
import io
import os
import wave

if os.getenv("BLUEY_NATIVE_SMOKE_TEST") != "1":
    raise RuntimeError("This fixture is only for the explicit native smoke test.")

from backend import server  # noqa: E402


async def stream(messages):
    yield {"text": "Message received: "}
    yield {"text": messages[-1]["content"]}


def transcribe(encoded):
    with wave.open(io.BytesIO(base64.b64decode(encoded, validate=True)), "rb") as wav:
        assert wav.getnchannels() == 1 and wav.getsampwidth() == 2
        assert wav.getnframes() > 0, "Android sent an empty recording"
        assert wav.getnframes() / wav.getframerate() <= 60
    return "Voice transport verified"


def synthesize(text):
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\0\0" * 4000)
    return base64.b64encode(output.getvalue()).decode()


server.model.stream = stream
server.audio.transcribe = transcribe
server.audio.synthesize = synthesize
server.main()
