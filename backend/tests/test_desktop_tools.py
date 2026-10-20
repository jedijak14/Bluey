import asyncio
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from backend import server, windows_tools
from backend.automation import DesktopAction
from backend.web_research import SearchParser, public_web_url, search_url
from backend.tests.test_backend import authenticate, receive_type


@pytest.mark.parametrize("url", ["javascript:alert(1)", "file:///C:/Windows", "https://user:pass@example.com", "http://localhost/", "http://127.0.0.1/", "http://10.0.0.1/", "https://example.com:8765", "https://example.com/\nheader", "chrome://extensions"])
def test_unsafe_web_targets_rejected(url):
    with pytest.raises((ValueError, ValidationError)):
        DesktopAction(action="open_url", url=url)


def test_action_validation_and_search_encoding():
    assert public_web_url("https://chatgpt.com/") == "https://chatgpt.com/"
    assert "q=a%26b%3F+c" in search_url("a&b? c")
    for action in [dict(action="open_app"), dict(action="research_web"), dict(action="media", command="shutdown"), dict(action="open_extensions", browser="cmd.exe"), dict(action="open_app", app="Calculator", args="/evil")]:
        with pytest.raises(ValidationError): DesktopAction(**action)


def test_snippets_are_bounded_and_do_not_attach_blocked_results_to_a_source():
    parser = SearchParser()
    parser.feed('''<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F">A &amp; B</a><a class="result__snippet">Real <b>snippet</b>.</a><a class="result__a" href="http://127.0.0.1">Private</a><a class="result__snippet">Wrong source</a>''')
    assert parser.sources == [{"title": "A & B", "url": "https://example.com/", "snippet": "Real snippet."}]
    for i in range(20): parser.feed(f'<a class="result__a" href="https://example.com/{i}">Result</a>')
    assert len(parser.sources) == 6


def test_installed_app_open_is_exact_no_shell(monkeypatch):
    opened = []
    items = [SimpleNamespace(Name="Calculator", InvokeVerb=lambda verb: opened.append(verb))]
    monkeypatch.setattr(windows_tools, "installed_apps", lambda: items)
    assert windows_tools.open_app("calculator")["requested_open"] == "Calculator"
    assert opened == ["open"]
    for value in ["calc.exe /danger", "Calculator & cmd", "C:\\Windows\\cmd.exe"]:
        with pytest.raises(RuntimeError): windows_tools.open_app(value)


def test_direct_action_requires_approval_and_reports_actual_result(monkeypatch):
    monkeypatch.setattr(server, "engine_lock", asyncio.Lock())
    executed = []
    async def run(action):
        executed.append(action)
        return {"notice": "Sent media toggle, state unknown."}
    monkeypatch.setattr(server.automation, "run", run)
    with TestClient(server.app).websocket_connect("/api/ws") as ws:
        authenticate(ws)
        ws.send_json({"type": "action", "request": "media-test", "action": {"action": "media", "command": "play_pause"}})
        approval = receive_type(ws, "approval")
        assert not executed
        ws.send_json({"type": "approve", "id": approval["id"], "allow": True})
        result = receive_type(ws, "action_result")
        assert result["result"]["notice"] == "Sent media toggle, state unknown."
        assert executed[0].action == "media"
        receive_type(ws, "done")


def test_research_response_has_real_returned_sources_and_approval(monkeypatch):
    monkeypatch.setattr(server, "engine_lock", asyncio.Lock())
    sources = [{"title": "Test source", "url": "https://example.com/", "snippet": "A fixture fact."}]
    async def execute(action):
        assert action.action == "research_web"
        return {"sources": sources}
    async def stream(messages):
        assert "UNTRUSTED" in messages[-1]["content"]
        yield {"text": "# Findings\n\nA fixture fact. [Source](https://example.com/)"}
    monkeypatch.setattr(server.automation, "run", execute)
    monkeypatch.setattr(server.model, "stream", stream)
    with TestClient(server.app).websocket_connect("/api/ws") as ws:
        authenticate(ws)
        ws.send_json({"type": "chat", "request": "research", "mode": "research", "messages": [{"role": "user", "content": "Find evidence"}]})
        approval = receive_type(ws, "approval")
        assert "DuckDuckGo" in approval["action"]["privacy"]
        ws.send_json({"type": "approve", "id": approval["id"], "allow": True})
        report = receive_type(ws, "response")
        assert report["format"] == "research"
        assert report["sources"] == sources
        assert report["title"] == "Find evidence"
        receive_type(ws, "done")


def test_denied_research_never_invokes_model_or_search(monkeypatch):
    monkeypatch.setattr(server, "engine_lock", asyncio.Lock())
    async def forbidden(*args): raise AssertionError("Denied research executed")
    monkeypatch.setattr(server.automation, "run", forbidden)
    monkeypatch.setattr(server.model, "stream", forbidden)
    with TestClient(server.app).websocket_connect("/api/ws") as ws:
        authenticate(ws)
        ws.send_json({"type": "chat", "request": "denied", "mode": "research", "messages": [{"role": "user", "content": "Private search"}]})
        approval = receive_type(ws, "approval")
        ws.send_json({"type": "approve", "id": approval["id"], "allow": False})
        assert "No web research" in receive_type(ws, "token")["text"]
        receive_type(ws, "done")
