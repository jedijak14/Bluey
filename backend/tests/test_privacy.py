import asyncio
import base64
import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from pydantic import ValidationError
from backend import server
from backend.privacy import PrivacySettings, PrivacyState
from backend.automation import DesktopAction
from backend.tests.test_backend import headers, authenticate, receive_type

def frame():
    out = io.BytesIO()
    Image.new('RGB',(20,20)).save(out, format='JPEG')
    return base64.b64encode(out.getvalue()).decode()

def test_defaults_persistence_and_corrupt_fail_closed(tmp_path):
    path = tmp_path/'privacy.json'
    state = PrivacyState(path)
    assert not state.settings.screen_access
    state.update(PrivacySettings(computer_use=False, screen_access=True))
    assert PrivacyState(path).settings == state.settings
    path.write_text('broken')
    assert PrivacyState(path).settings == PrivacySettings(computer_use=False)
    with pytest.raises(ValidationError): PrivacySettings(computer_use='false')

def test_screen_lease_revocation_and_ttl(tmp_path):
    state=PrivacyState(tmp_path/'p.json')
    with pytest.raises(RuntimeError): state.begin()
    state.update(PrivacySettings(screen_access=True))
    first=state.begin(); second=state.begin()
    with pytest.raises(RuntimeError): state.receive(first,frame())
    state.receive(second, frame()); assert state.current()
    state.frame_expires=0; assert not state.current()
    state.receive(second, frame())
    state.update(PrivacySettings())
    assert not state.current()
    with pytest.raises(RuntimeError): state.receive(second,frame())
    assert 'image' not in state.path.read_text()

def test_bad_frames_and_size_rejected(tmp_path):
    state=PrivacyState(tmp_path/'p.json');state.update(PrivacySettings(screen_access=True));lease=state.begin()
    with pytest.raises(Exception): state.receive(lease,'not base64')
    out=io.BytesIO(); Image.new('RGB',(1281,1)).save(out,format='JPEG')
    with pytest.raises(ValueError): state.receive(lease,base64.b64encode(out.getvalue()).decode())

def test_permission_switches_independent():
    server.privacy.update(PrivacySettings(computer_use=False,screen_access=True))
    server.privacy.check('read_screen')
    with pytest.raises(RuntimeError): server.privacy.check('click')
    server.privacy.update(PrivacySettings(computer_use=True,screen_access=False))
    server.privacy.check('click')
    with pytest.raises(RuntimeError): server.privacy.check('screenshot')

def test_desktop_only_permissions_and_stop():
    api=TestClient(server.app)
    code=server.pairing.create();token,_=server.pairing.redeem(code,'phone','privacy-test')
    for auth in [{},{'Authorization':f'Bearer {token}'}]:
        assert api.get('/api/privacy',headers=auth).status_code==401
        assert api.post('/api/screen/lease',headers=auth).status_code==401
    assert api.put('/api/privacy',headers=headers(),json={'computer_use':False,'screen_access':True}).status_code==200
    lease=api.post('/api/screen/lease',headers=headers()).json()['lease']
    assert api.put('/api/screen/frame',headers=headers(),json={'lease':lease,'image':frame()}).status_code==200
    api.post('/api/stop',headers=headers())
    assert not server.privacy.current()
    assert api.put('/api/screen/frame',headers=headers(),json={'lease':lease,'image':frame()}).status_code==403

@pytest.mark.asyncio
async def test_disabled_action_never_reaches_approval_or_worker(monkeypatch):
    server.privacy.update(PrivacySettings(computer_use=False))
    with pytest.raises(RuntimeError,match='disabled'): await server.approved_action(DesktopAction(action='click',x=1,y=1))
    with pytest.raises(RuntimeError,match='disabled'): server.automation._execute(DesktopAction(action='click',x=1,y=1))

def test_change_revokes_pending_approval(monkeypatch):
    monkeypatch.setattr(server,'engine_lock',asyncio.Lock())
    async def forbidden(action): pytest.fail('revoked action executed')
    monkeypatch.setattr(server.automation,'run',forbidden)
    api=TestClient(server.app)
    with api.websocket_connect('/api/ws') as ws:
        authenticate(ws)
        ws.send_json({'type':'action','request':'revoked','action':{'action':'click','x':2,'y':2}})
        receive_type(ws,'approval')
        api.put('/api/privacy',headers=headers(),json={'computer_use':False,'screen_access':False})
        receive_type(ws,'stopped')
