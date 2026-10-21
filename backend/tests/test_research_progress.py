"""Progress follows actual approval/search/model stages; no real web/desktop actions."""
import asyncio
import threading
from types import SimpleNamespace

import pytest
from backend import server


@pytest.mark.asyncio
@pytest.mark.parametrize('outcome,expected', [
    ('success', ['waiting', 'searching', 'writing', 'complete']),
    ('denied', ['waiting', 'cancelled']),
    ('error', ['waiting', 'searching', 'error']),
    ('cancelled', ['waiting', 'searching', 'cancelled']),
])
async def test_research_progress_lifecycle(monkeypatch, outcome, expected):
    packets, searched, model_calls = [], [], []
    monkeypatch.setattr(server, 'engine_lock', asyncio.Lock())
    monkeypatch.setattr(server, 'peers', {object(): ('desktop', 'fixture')})
    monkeypatch.setattr(server, 'approvals', {})
    monkeypatch.setattr(server, 'privacy', SimpleNamespace(check=lambda _: None, current=lambda: None, epoch=0))

    async def broadcast(packet, **options):
        packets.append((packet, options))
        if packet['type'] == 'approval':
            server.approvals[packet['id']].set_result(outcome != 'denied')

    async def send(ws, packet):
        packets.append((packet, {}))

    async def run(action):
        searched.append(action.action)
        assert packets[-1][0]['state'] == 'searching'
        if outcome == 'error':
            raise RuntimeError('Search temporarily unavailable')
        if outcome == 'cancelled':
            raise asyncio.CancelledError()
        return {'sources': [{'title': 'Fixture source', 'url': 'https://example.com', 'snippet': 'Fixture only'}]}

    async def model(messages):
        model_calls.append(messages)
        yield {'text': 'A source-backed summary.'}

    async def face(mood):
        pass

    monkeypatch.setattr(server, 'broadcast', broadcast)
    monkeypatch.setattr(server, 'send', send)
    monkeypatch.setattr(server, 'face', face)
    monkeypatch.setattr(server, 'automation', SimpleNamespace(stopped=threading.Event(), run=run))
    monkeypatch.setattr(server.model, 'stream', model)
    task = server.chat(object(), {'request': 'research-fixture', 'mode': 'research', 'messages': [{'role': 'user', 'content': 'Research project features'}]})
    if outcome == 'cancelled':
        with pytest.raises(asyncio.CancelledError):
            await task
    else:
        await task
    progress = [(p, options) for p, options in packets if p['type'] == 'research_state']
    assert [p['state'] for p, _ in progress] == expected
    assert all(p['request'] == 'research-fixture' and options == {'desktop_only': True} for p, options in progress)
    assert len(searched) == (outcome != 'denied')
    assert bool(model_calls) == (outcome == 'success')
    reports = [p for p, _ in packets if p['type'] == 'response']
    assert bool(reports) == (outcome == 'success')
    if reports:
        assert reports[0]['format'] == 'research'
        assert reports[0]['sources'][0]['url'] == 'https://example.com'
    assert server.approvals == {}
