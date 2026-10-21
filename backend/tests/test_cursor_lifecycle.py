"""Cursor lifecycle only: all approval and automation activity is fake."""
from types import SimpleNamespace
import threading
import pytest
from backend import server
from backend.automation import DesktopAction


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["success", "failed", "denied"])
async def test_cursor_returns_home_after_coordinate_action(monkeypatch, outcome):
    packets = []
    executed = []
    monkeypatch.setattr(server, "peers", {object(): ("desktop", "fixture")})
    monkeypatch.setattr(server, "approvals", {})
    monkeypatch.setattr(server, "privacy", SimpleNamespace(check=lambda _: None, epoch=0))

    async def broadcast(packet, **kwargs):
        packets.append((packet, kwargs))
        if packet["type"] == "approval":
            server.approvals[packet["id"]].set_result(outcome != "denied")

    async def run(action):
        executed.append(action)
        if outcome == "failed":
            raise RuntimeError("Fixture action failed")
        return {"ok": True}

    monkeypatch.setattr(server, "broadcast", broadcast)
    monkeypatch.setattr(server, "automation", SimpleNamespace(stopped=threading.Event(), run=run))
    action = DesktopAction(action="click", x=500, y=500)
    if outcome == "failed":
        with pytest.raises(RuntimeError, match="Fixture action failed"):
            await server.approved_action(action)
    else:
        await server.approved_action(action)
    movement = [(p["type"], opts) for p, opts in packets if p["type"] in {"pointer", "home"}]
    assert movement == ([] if outcome == "denied" else [("pointer", {}), ("home", {"desktop_only": True})])
    assert len(executed) == (0 if outcome == "denied" else 1)
    assert server.approvals == {}
