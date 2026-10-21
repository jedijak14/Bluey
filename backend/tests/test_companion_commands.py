import asyncio
import pytest
from backend import server

@pytest.mark.asyncio
@pytest.mark.parametrize('text,mood',[('Bluey, go to sleep.','sleepy'),('Okay, go to sleep','sleepy'),('wake up!','listening')])
async def test_explicit_sleep_wake_needs_no_model(monkeypatch,text,mood):
    packets=[];faces=[]
    async def send(ws,p):packets.append(p)
    async def broadcast(p,**kw):packets.append(p)
    async def face(value):faces.append(value)
    monkeypatch.setattr(server,'send',send);monkeypatch.setattr(server,'broadcast',broadcast);monkeypatch.setattr(server,'face',face)
    monkeypatch.setattr(server,'engine_lock',asyncio.Lock())
    def no_model(*a,**kw):raise AssertionError('Sleep/wake should not call a provider')
    monkeypatch.setattr(server.model,'stream',no_model)
    await server.chat(object(),{'request':'r','messages':[{'role':'user','content':text}]})
    assert faces[-1]==mood and {'type':'done','request':'r'} in packets
    assert any(p['type']=='token' for p in packets)
    assert any(p['type']=='companion_sleep' for p in packets) == (mood=='sleepy')

@pytest.mark.asyncio
async def test_quoted_sleep_is_not_a_command(monkeypatch):
    packets=[];called=[]
    async def send(ws,p):packets.append(p)
    async def face(value):pass
    async def broadcast(p,**kw):pass
    async def model(messages):called.append(messages);yield {'text':'Sleep is a natural rest cycle.'}
    monkeypatch.setattr(server,'send',send);monkeypatch.setattr(server,'broadcast',broadcast);monkeypatch.setattr(server,'face',face)
    monkeypatch.setattr(server,'engine_lock',asyncio.Lock());monkeypatch.setattr(server.model,'stream',model)
    await server.chat(object(),{'request':'r','messages':[{'role':'user','content':'Explain the phrase go to sleep.'}]})
    assert called
