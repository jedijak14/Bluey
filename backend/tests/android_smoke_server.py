"""CI-only transport fixtures. Not packaged with or enabled in the production app.

Exercises real auth/pairing/WebSocket and requires Android to request text only.
Device speech services are instrumentation fixtures, not model-quality tests.
"""
import os

if os.getenv("BLUEY_NATIVE_SMOKE_TEST") != "1":
    raise RuntimeError("This fixture is only for the explicit native smoke test.")

from backend import server  # noqa: E402


async def stream(messages):
    yield {"text": "Message received: "}
    yield {"text": messages[-1]["content"]}


def transcribe(encoded):
    raise RuntimeError("Android must use its device recognizer, not PC transcription.")


def synthesize(text):
    raise RuntimeError("Android must request text only, not PC speech synthesis.")


server.model.stream = stream
server.audio.transcribe = transcribe
server.audio.synthesize = synthesize
server.main()
