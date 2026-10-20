import threading
from fastapi.testclient import TestClient
from backend.gemma_service import GemmaEngine, MODEL_HANDLE, create_app

TOKEN = "test-service-only"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def test_no_auth_no_generation():
    engine = GemmaEngine()
    with TestClient(create_app(engine, TOKEN)) as api:
        assert api.get("/api/gemma/status").status_code == 401
        assert api.get("/api/gemma/status", headers=HEADERS).json()["status"] == "unavailable"
        assert api.post("/api/gemma/generate", json={"text": "Hello"}, headers=HEADERS).status_code == 503


def test_fixture_inference_is_authenticated_and_bounded():
    class Fixture(GemmaEngine):
        def start(self): self.status = "ready"
        def infer(self, body): return {"model": MODEL_HANDLE, "text": "Test fixture only", "kind": "base_model_completion"}
    with TestClient(create_app(Fixture(), TOKEN)) as api:
        result = api.post("/api/gemma/generate", json={"text": "Hello"}, headers=HEADERS)
        assert result.json()["text"] == "Test fixture only"
        assert result.json()["model"] == MODEL_HANDLE
        for body in [{"text": "a"*1201}, {"text": " "}, {"text": "Hi", "max_new_tokens": 10000}, {"text": "Hi", "url": "https://evil.example"}]:
            assert api.post("/api/gemma/generate", json=body, headers=HEADERS).status_code == 400
        assert api.post("/api/gemma/generate", content=b"x"*8193, headers=HEADERS).status_code == 413


def test_busy_capacity_is_held_until_real_computation_finishes():
    import pytest
    from fastapi import HTTPException
    from backend.gemma_service import Generation
    gate = threading.Event()
    engine = GemmaEngine()
    engine.infer = lambda body: gate.wait(5)
    try:
        first = engine.submit(Generation(text="Hi"))
        with pytest.raises(HTTPException) as exc: engine.submit(Generation(text="again"))
        assert exc.value.status_code == 429
        assert engine.busy.locked()
        gate.set()
        first.result(timeout=5)
    finally:
        gate.set()
        engine.close()


def test_errors_do_not_leak_exception_details():
    class Fixture(GemmaEngine):
        def start(self): self.status = "ready"
        def infer(self, body): raise RuntimeError("private-server-path")
    with TestClient(create_app(Fixture(), TOKEN)) as api:
        result = api.post("/api/gemma/generate", json={"text": "Hello"}, headers=HEADERS)
        assert result.status_code == 503
        assert "private-server-path" not in result.text
