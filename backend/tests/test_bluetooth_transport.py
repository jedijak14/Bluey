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
    relay=BluetoothRelay(pairing,app,settings=tmp_path/'bt.json');relay.session_token='phone-token';sent=[]
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


@pytest.mark.asyncio
async def test_reconnect_encryption_and_replay_isolation(tmp_path):
    import base64
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.exceptions import InvalidTag
    import os
    relay=BluetoothRelay(Pairing(),FastAPI(),settings=tmp_path/'bt.json')
    class Serial:
        def __init__(self): self.frames=[]
        def write(self,data):self.frames.append(json.loads(data));return len(data)
    relay.serial=Serial()
    old_key=os.urandom(32);new_key=os.urandom(32)
    def hello(key):return {'kind':'hello','key':base64.b64encode(key).decode()}
    def seal(key,packet):
        nonce=os.urandom(12)
        return {'kind':'sealed','nonce':base64.b64encode(nonce).decode(),'ciphertext':base64.b64encode(AESGCM(key).encrypt(nonce,json.dumps(packet).encode(),b'bluey-bt-v1:client')).decode()}
    await relay.accept_frame(hello(old_key))
    await relay.write({'kind':'event','packet':{'text':'private old reply'}})
    old_reply=relay.serial.frames[-1]
    assert 'private old reply' not in json.dumps(old_reply)
    await relay.accept_frame(hello(new_key))
    assert relay.session_token=='' and relay.socket is None
    with pytest.raises(InvalidTag):
        AESGCM(new_key).decrypt(base64.b64decode(old_reply['nonce']),base64.b64decode(old_reply['ciphertext']),b'bluey-bt-v1:server')
    with pytest.raises(ValueError):
        await relay.accept_frame(seal(old_key,{'kind':'pair','code':'000000','sequence':0}))
    frame=seal(new_key,{'kind':'pair','id':'new','code':relay.pairing.create(),'sequence':0})
    await relay.accept_frame(frame)
    assert len(relay.pairing.devices)==1
    with pytest.raises(ValueError):await relay.accept_frame(frame)
    with pytest.raises(ValueError):await relay.accept_frame({'kind':'packet','packet':{'type':'chat'}})

@pytest.mark.asyncio
async def test_each_phone_packet_must_match_current_session(tmp_path):
    relay=BluetoothRelay(Pairing(),FastAPI(),settings=tmp_path/'bt.json');replies=[];forwarded=[]
    class Socket:
        async def send(self,packet):forwarded.append(packet)
    relay.socket=Socket();relay.session_token='first';relay.pairing.devices['first']={'id':'1'}
    relay.pairing.devices['other']={'id':'2'}
    async def write(value):replies.append(value)
    relay.write=write
    for token in [None,'desktop-token','other']:
        await relay.handle({'kind':'packet','token':token,'packet':{'type':'chat'}})
        assert 'error' in replies[-1] and not forwarded
    await relay.handle({'kind':'packet','token':'first','packet':{'type':'chat'}})
    assert len(forwarded)==1
    del relay.pairing.devices['first']
    await relay.handle({'kind':'packet','token':'first','packet':{'type':'chat'}})
    assert len(forwarded)==1


@pytest.mark.asyncio
async def test_radio_loss_expires_stale_phone_without_serial_eof(tmp_path):
    import time
    relay=BluetoothRelay(Pairing(),FastAPI(),settings=tmp_path/'bt.json')
    closed=[]
    class Socket:
        async def close(self):closed.append(True)
    relay.socket=Socket();relay.session_token='phone';relay.last_seen=time.monotonic()-16
    await relay.expire_connection()
    assert closed and relay.socket is None and not relay.session_token
