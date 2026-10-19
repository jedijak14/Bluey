import asyncio
import base64
import io
import json
import wave

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend import server
from backend.audio_pipeline import AudioPipeline
from backend.automation import DesktopAction
from backend.model import ModelConfig
from backend.security import Pairing, Workspace


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(server, "pairing", Pairing())
    monkeypatch.setattr(server, "workspace", Workspace())
    monkeypatch.setattr(server, "engine_lock", asyncio.Lock())
    monkeypatch.setattr(server, "LAN", True)
    return TestClient(server.app)


def headers():
    return {"Authorization": f"Bearer {server.TOKEN}"}


def authenticate(ws, token=None):
    ws.send_json({"type": "auth", "token": token or server.TOKEN})
    return ws.receive_json()


def receive_type(ws, wanted):
    for _ in range(40):
        packet = ws.receive_json()
        if packet["type"] == wanted:
            return packet
    raise AssertionError(f"No {wanted} packet received")


def test_health_exposes_no_secrets(api):
    data = api.get("/api/health").json()
    assert data["status"] == "ok"
    assert server.TOKEN not in json.dumps(data)


def test_settings_require_desktop_auth(api):
    assert api.post("/api/config", json={}).status_code == 401
    assert api.post("/api/config", json={"model": "test"}, headers=headers()).status_code == 200


def test_pair_one_time_and_revocation(api):
    code = api.post("/api/pair/create", headers=headers()).json()["code"]
    result = api.post("/api/pair", json={"code": code, "name": "Test Android"})
    assert result.status_code == 200
    phone = result.json()
    assert api.post("/api/pair", json={"code": code}).status_code == 403
    assert (
        api.get("/api/devices", headers={"Authorization": f"Bearer {phone['token']}"}).status_code
        == 401
    )
    assert api.get("/api/devices", headers=headers()).json()[0]["name"] == "Test Android"
    assert api.delete("/api/devices/" + phone["device"]["id"], headers=headers()).status_code == 200
    assert api.get("/api/devices", headers=headers()).json() == []


def test_pair_expiry_and_rate_limit():
    pairing = Pairing()
    code = pairing.create()
    pairing.expires = 0
    with pytest.raises(HTTPException) as expired:
        pairing.redeem(code, "phone", "ip")
    assert expired.value.status_code == 403
    for _ in range(4):
        with pytest.raises(HTTPException):
            pairing.redeem("000000", "phone", "ip")
    with pytest.raises(HTTPException) as limited:
        pairing.redeem("000000", "phone", "ip")
    assert limited.value.status_code == 429


def test_pair_disabled_without_lan(api, monkeypatch):
    monkeypatch.setattr(server, "LAN", False)
    assert api.post("/api/pair/create", headers=headers()).status_code == 409
    assert api.post("/api/pair", json={"code": "123456"}).status_code == 403


def test_websocket_auth_rejects_bad_token(api):
    from starlette.websockets import WebSocketDisconnect

    with api.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": "nope"})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4001


def test_websocket_rejects_unknown_origin(api):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with api.websocket_connect("/api/ws", headers={"origin": "https://evil.example"}):
            pass


def test_phone_cannot_approve_actions(api):
    code = server.pairing.create()
    token, _ = server.pairing.redeem(code, "Android", "ip")
    with api.websocket_connect("/api/ws") as ws:
        assert authenticate(ws, token)["role"] == "phone"
        ws.send_json({"type": "approve", "id": "fake", "allow": True})
        assert ws.receive_json()["type"] == "error"


def test_streamed_chat(api, monkeypatch):
    async def fake_stream(messages):
        assert messages[-1]["content"] == "Hello"
        yield {"text": "Hello, "}
        yield {"text": "friend."}

    monkeypatch.setattr(server.model, "stream", fake_stream)
    with api.websocket_connect("/api/ws") as ws:
        authenticate(ws)
        ws.send_json(
            {
                "type": "chat",
                "request": "one",
                "messages": [{"role": "user", "content": "Hello"}],
            }
        )
        output = ""
        while True:
            p = ws.receive_json()
            if p["type"] == "token":
                output += p["text"]
            if p["type"] == "done":
                break
        assert output == "Hello, friend."


def test_model_action_waits_for_one_time_approval(api, monkeypatch):
    executed = []

    async def fake_stream(messages):
        if messages[-1]["role"] == "user":
            yield {
                "tools": [
                    {
                        "id": "a1",
                        "type": "function",
                        "function": {
                            "name": "desktop_action",
                            "arguments": '{"action":"point","x":500,"y":500}',
                        },
                    }
                ]
            }
        else:
            yield {"text": "Pointed."}

    async def fake_execute(action):
        executed.append(action)
        return {"completed": True}

    monkeypatch.setattr(server.model, "stream", fake_stream)
    monkeypatch.setattr(server.automation, "run", fake_execute)
    with api.websocket_connect("/api/ws") as ws:
        authenticate(ws)
        ws.send_json(
            {
                "type": "chat",
                "request": "action",
                "messages": [{"role": "user", "content": "Point at the center."}],
            }
        )
        approval = receive_type(ws, "approval")
        assert executed == []
        ws.send_json({"type": "approve", "id": approval["id"], "allow": True})
        receive_type(ws, "done")
        assert len(executed) == 1
        assert server.approvals == {}


def test_denied_action_never_executes(api, monkeypatch):
    async def fake_stream(messages):
        if messages[-1]["role"] == "user":
            yield {
                "tools": [
                    {
                        "id": "a1",
                        "type": "function",
                        "function": {
                            "name": "desktop_action",
                            "arguments": '{"action":"read_screen"}',
                        },
                    }
                ]
            }
        else:
            assert "denied" in messages[-1]["content"]
            yield {"text": "Okay, I won’t read the screen."}

    async def fail(_):
        raise AssertionError("Denied action executed")

    monkeypatch.setattr(server.model, "stream", fake_stream)
    monkeypatch.setattr(server.automation, "run", fail)
    with api.websocket_connect("/api/ws") as ws:
        authenticate(ws)
        ws.send_json({"type": "chat", "messages": [{"role": "user", "content": "Read screen"}]})
        p = receive_type(ws, "approval")
        ws.send_json({"type": "approve", "id": p["id"], "allow": False})
        receive_type(ws, "done")


def test_workspace_read_write_and_traversal(api, tmp_path):
    root = tmp_path / "project"
    root.mkdir()
    (root / "hello.py").write_text("hello")
    (tmp_path / "secret.txt").write_text("secret")
    (root / ".env").write_text("SECRET=hidden")
    (root / "escape.txt").symlink_to(tmp_path / "secret.txt")
    assert api.post("/api/workspace/open", headers=headers(), json={"root": str(root)}).json()[
        "files"
    ] == ["hello.py"]
    assert (
        api.get("/api/workspace/file", params={"path": "hello.py"}, headers=headers()).json()[
            "content"
        ]
        == "hello"
    )
    for name in ["../secret.txt", ".env", "escape.txt"]:
        assert (
            api.get("/api/workspace/file", params={"path": name}, headers=headers()).status_code
            == 403
        )
    assert (
        api.put(
            "/api/workspace/file",
            headers=headers(),
            json={"path": "hello.py", "content": "updated"},
        ).status_code
        == 200
    )
    assert (root / "hello.py").read_text() == "updated"


def test_action_validation():
    for action in [
        {"action": "shell", "text": "rm -rf"},
        {"action": "click"},
        {"action": "point", "x": 1001, "y": 0},
        {"action": "shortcut", "keys": "win+l"},
        {"action": "click", "x": 1, "y": 1, "unknown": True},
    ]:
        with pytest.raises(ValidationError):
            DesktopAction.model_validate(action)


def test_config_rejects_embedded_credentials():
    with pytest.raises(ValidationError):
        ModelConfig(base_url="https://user:password@example.com")
    with pytest.raises(ValidationError):
        ModelConfig(base_url="file:///etc/passwd")


def test_voice_never_auto_downloads(monkeypatch):
    monkeypatch.delenv("BLUEY_WHISPER_MODEL", raising=False)
    pipeline = AudioPipeline()
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\0\0" * 1600)
    with pytest.raises(RuntimeError, match="BLUEY_WHISPER_MODEL"):
        pipeline.transcribe(base64.b64encode(b.getvalue()).decode())


def test_stop_cancels_approval_without_execution(api, monkeypatch):
    async def fake_stream(_):
        yield {
            "tools": [
                {
                    "id": "a1",
                    "type": "function",
                    "function": {
                        "name": "desktop_action",
                        "arguments": '{"action":"read_screen"}',
                    },
                }
            ]
        }

    async def fail(_):
        raise AssertionError("Stopped action executed")

    monkeypatch.setattr(server.model, "stream", fake_stream)
    monkeypatch.setattr(server.automation, "run", fail)
    with api.websocket_connect("/api/ws") as ws:
        authenticate(ws)
        ws.send_json(
            {
                "type": "chat",
                "request": "stop-me",
                "messages": [{"role": "user", "content": "Read screen"}],
            }
        )
        receive_type(ws, "approval")
        ws.send_json({"type": "stop"})
        receive_type(ws, "done")
        assert server.approvals == {}
        assert server.automation.stopped.is_set()


def test_phone_voice_transcript_transport(api, monkeypatch):
    code = server.pairing.create()
    token, _ = server.pairing.redeem(code, "Android", "ip")
    monkeypatch.setattr(
        server.audio,
        "transcribe",
        lambda data: "A local transcription" if data == "fixture" else "",
    )
    with api.websocket_connect("/api/ws") as ws:
        authenticate(ws, token)
        ws.send_json({"type": "transcribe", "audio": "fixture"})
        assert receive_type(ws, "transcript")["text"] == "A local transcription"


def test_malformed_first_frame_is_closed(api):
    from starlette.websockets import WebSocketDisconnect

    with api.websocket_connect("/api/ws") as ws:
        ws.send_json(["not", "an", "object"])
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()
