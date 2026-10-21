import json
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.bluetooth_transport import BluetoothRelay, decode_frame, MAX_FRAME
from backend.security import Pairing

@pytest.mark.parametrize('raw', [b'[]', b'null', b'{"kind":"shell"}', b'{"kind":"open","id":12}', b'x'*(MAX_FRAME+1)])
def test_frame_validation(raw):
    with pytest.raises(ValueError): decode_frame(raw)

@pytest.mark.asyncio
async def test_pairing_is_separate_from_os_pairing_and_desktop_token(tmp_path):
    pairing=Pairing();relay=BluetoothRelay(pairing,FastAPI(),settings=tmp_path/'bt.json')
    sent=[]
    async def write(value): sent.append(value)
    relay.write=write
    await relay.handle({'kind':'open','id':'1','token':'desktop-token'})
    assert 'error' in sent[-1] and relay.socket is None
    await relay.handle({'kind':'pair','id':'2','code':'000000'})
    assert 'error' in sent[-1] and not pairing.devices
    code=pairing.create()
    await relay.handle({'kind':'pair','id':'3','code':code})
    token=sent[-1]['data']['token']
    assert token in pairing.devices
    await relay.handle({'kind':'pair','id':'4','code':code})
    assert 'error' in sent[-1] # one use, no replay
    for path in ['/api/config','/api/pair/create','http://evil.example/api/config','/api/workspace']:
        await relay.handle({'kind':'request','id':'5','token':token,'path':path,'method':'GET'})
        assert 'error' in sent[-1]
    del pairing.devices[token]
    await relay.handle({'kind':'request','id':'6','token':token,'path':'/api/companion/meeting'})
    assert 'error' in sent[-1]

@pytest.mark.asyncio
async def test_companion_only_http_bridge(tmp_path):
    app=FastAPI();pairing=Pairing();pairing.devices['phone-token']={'id':'1','name':'phone'}
    @app.get('/api/companion/meeting')
    def meeting(): return {'active':False,'supported':True}
    relay=BluetoothRelay(pairing,app,settings=tmp_path/'bt.json');sent=[]
    async def write(value): sent.append(value)
    relay.write=write
    await relay.handle({'kind':'request','id':'1','token':'phone-token','path':'/api/companion/meeting'})
    assert sent[-1]['data']=={'active':False,'supported':True}
    assert not relay.settings.exists()

@pytest.mark.asyncio
async def test_unlisted_com_and_path_rejected_before_touching_files(tmp_path,monkeypatch):
    monkeypatch.setattr('backend.bluetooth_transport.ports',lambda:[])
    relay=BluetoothRelay(Pairing(),FastAPI(),settings=tmp_path/'bt.json')
    for port in ['COM1','/etc/passwd','../COM1','\\\\.\\COM1']:
        with pytest.raises(ValueError): await relay.configure(port)
    assert not relay.settings.exists() and relay.serial is None


def test_bluetooth_settings_are_desktop_only():
    from backend import server
    api=TestClient(server.app)
    assert api.get('/api/bluetooth').status_code==401
    assert api.post('/api/bluetooth',json={'port':'COM5'}).status_code==401


def test_bluetooth_code_generation_does_not_require_lan_or_dns(monkeypatch):
    from backend import server
    from backend.tests.test_backend import headers
    class Running:
        def done(self): return False
    monkeypatch.setattr(server,'LAN',False)
    monkeypatch.setattr(server.bluetooth,'task',Running())
    def no_dns(*args):raise AssertionError('Bluetooth must not need LAN DNS')
    monkeypatch.setattr(server.socket,'gethostbyname_ex',no_dns)
    api=TestClient(server.app)
    response=api.post('/api/pair/create',headers=headers())
    assert response.status_code==200 and len(response.json()['code'])==6
    assert 'Bluetooth' in response.json()['addresses'][0]
    # Enabling Bluetooth must NOT enable HTTP pairing on a network interface.
    assert api.post('/api/pair',json={'code':response.json()['code']}).status_code==403
