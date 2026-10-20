"""Optional, separately hosted Gemma inference. Never downloads weights on HTTP requests."""
import asyncio
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
import secrets
import threading
import time

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

MODEL_HANDLE = "keras/gemma3/keras/gemma3_1b"


class Generation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=1200)
    max_new_tokens: int = Field(default=128, ge=16, le=192)

    @field_validator("text")
    @classmethod
    def nonempty(cls, text):
        if not text.strip():
            raise ValueError("Enter a question")
        return text.strip()


class GemmaEngine:
    def __init__(self, model_path=None):
        self.model_path = model_path
        self.status = "unavailable"
        self.model = None
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="gemma")
        self.busy = threading.Lock()

    def start(self):
        if self.model_path:
            self.status = "loading"
            self.executor.submit(self._load)

    def _load(self):
        try:
            path = Path(self.model_path).expanduser().resolve()
            if not path.is_dir() or not (path / "config.json").is_file():
                raise ValueError("Use the local preset directory returned by kagglehub")
            os.environ.setdefault("KERAS_BACKEND", "torch")
            import tensorflow as tf
            # Tokenization uses TF, inference uses Torch. Do not reserve GPU RAM twice.
            tf.config.set_visible_devices([], "GPU")
            import keras
            import keras_hub
            keras.config.set_dtype_policy("float32")
            self.model = keras_hub.models.Gemma3CausalLM.from_preset(str(path))
            self.model.compile(sampler="greedy", jit_compile=False)
            self.status = "ready"
        except Exception:
            self.status = "error"
            logging.exception("Gemma preset loading failed; service remains unavailable")

    def infer(self, body):
        import numpy as np
        prompt = f"Question: {body.text}\nAnswer:"
        count = int(np.asarray(self.model.preprocessor.tokenizer.tokenize(prompt)).size) + 1
        if count > 384:
            raise ValueError("Prompt exceeds the 384-token preview limit. Shorten it.")
        generated = self.model.generate(prompt, max_length=count + body.max_new_tokens)
        if not isinstance(generated, str) or not generated.startswith(prompt):
            raise RuntimeError("Unexpected model output format")
        completion = generated[len(prompt):].strip()
        if not completion:
            raise RuntimeError("The model returned no completion")
        return {"text": completion[:12000], "model": MODEL_HANDLE, "kind": "base_model_completion"}

    def submit(self, body):
        if not self.busy.acquire(blocking=False):
            raise HTTPException(429, "Gemma is already generating. Please try later.")
        try:
            future = self.executor.submit(self.infer, body)
        except Exception:
            self.busy.release()
            raise
        future.add_done_callback(lambda _: self.busy.release())
        return future

    def close(self):
        self.executor.shutdown(wait=False, cancel_futures=True)


def create_app(engine=None, token=None):
    engine = engine or GemmaEngine(os.getenv("BLUEY_GEMMA_MODEL_PATH"))
    token = token if token is not None else os.getenv("BLUEY_GEMMA_TOKEN", "")
    attempts = deque()

    @asynccontextmanager
    async def lifespan(app):
        if token:
            engine.start()
        yield
        engine.close()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    def authorize(value):
        if not token:
            raise HTTPException(503, "Inference service authentication is not configured")
        if not secrets.compare_digest(value, f"Bearer {token}"):
            raise HTTPException(401, "Unauthorized")

    @app.get("/api/gemma/status")
    async def status(authorization: str = Header(default="")):
        authorize(authorization)
        return {"status": engine.status, "model": MODEL_HANDLE, "kind": "pretrained_base", "busy": engine.busy.locked()}

    @app.post("/api/gemma/generate")
    async def generate(request: Request, authorization: str = Header(default="")):
        authorize(authorization)
        # Bound body even for chunked requests; prompts/credentials are never logged.
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 8192:
                raise HTTPException(413, "Request too large")
        try:
            body = Generation.model_validate_json(raw)
        except ValueError:
            raise HTTPException(400, "Use 1–1200 characters and 16–192 output tokens")
        if engine.status != "ready":
            raise HTTPException(503, "Gemma is not loaded")
        now = time.monotonic()
        while attempts and attempts[0] < now - 60:
            attempts.popleft()
        if len(attempts) >= 20:
            raise HTTPException(429, "Preview rate limit reached. Try again in a minute.")
        future = engine.submit(body)
        attempts.append(now)
        # A timeout/disconnect must NOT release capacity while native inference runs.
        wrapped = asyncio.wrap_future(future)
        wrapped.add_done_callback(lambda f: f.exception() if not f.cancelled() else None)
        try:
            return await asyncio.wait_for(asyncio.shield(wrapped), timeout=85)
        except TimeoutError:
            raise HTTPException(504, "Generation timed out. The current computation may still be finishing.")
        except ValueError:
            raise HTTPException(400, "Prompt exceeds the tokenizer limit. Shorten it.")
        except Exception:
            raise HTTPException(503, "Gemma could not complete this request")

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8766, access_log=False)
