"""Pure journal and strict gateway regressions. Windows WFP calls are tested in CI."""
import ctypes
import json
import socket
import ssl
import threading
from types import SimpleNamespace

import pytest
from backend.guardian_network import NetworkGate, Filter, Condition, Value, read_journal
from backend.guardian_proxy import Proxy, approved_host, public_addresses, receive_hello, tls_name

SID = 'S-1-5-21-100-200-300-1001'
POLICY = {'allowed_domains':['example.com'], 'blocked_domains':['x.com']}


def client_hello(host='example.com'):
    incoming, outgoing = ssl.MemoryBIO(), ssl.MemoryBIO()
    context = ssl.create_default_context()
    session = context.wrap_bio(incoming, outgoing, server_hostname=host)
    with pytest.raises(ssl.SSLWantReadError): session.do_handshake()
    return outgoing.read()


def test_journal_sid_binding_and_no_guessing(tmp_path):
    gate = NetworkGate(SID, tmp_path/'network.json', engine=object())
    first = gate.prepare()
    assert len(set(first['keys'].values())) == 5
    assert gate.prepare() == first
    with pytest.raises(ValueError): read_journal(gate.journal, 'S-1-5-21-100-200-300-1002')
    first['keys']['deny_v6'] = first['keys']['deny_v4']
    gate.journal.write_text(json.dumps(first))
    with pytest.raises(ValueError, match='Duplicate'): gate.prepare()
    with pytest.raises(ValueError): NetworkGate('S-1-5-32-544', gate.journal, engine=object())


def test_wfp_x64_layout_matches_sdk():
    if ctypes.sizeof(ctypes.c_void_p) == 8:
        assert ctypes.sizeof(Value) == 16
        assert ctypes.sizeof(Condition) == 40
        assert ctypes.sizeof(Filter) == 200


def test_approved_only_not_merely_not_blocklisted():
    assert approved_host('docs.example.com', POLICY, 'family.example.net')
    assert approved_host('family.example.net', POLICY, 'family.example.net')
    for host in ['x.com','unlisted.org','example.com.evil.net','evil.family.example.net']:
        assert not approved_host(host, POLICY, 'family.example.net')
    with pytest.raises(ValueError): approved_host('127.0.0.1', POLICY, 'family.example.net')


@pytest.mark.parametrize('address', ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:8.8.8.8', '2002:0808:0808::1'])
def test_proxy_refuses_private_or_translation_targets(monkeypatch, address):
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *a, **k: [(socket.AF_INET6 if ':' in address else socket.AF_INET, socket.SOCK_STREAM, 6, '', (address,443))])
    with pytest.raises(ValueError): public_addresses('example.com')


def test_tls_requires_exact_sni_and_rejects_bad_lengths():
    raw = client_hello(); hello = raw[5:]
    assert tls_name(hello) == 'example.com'
    for broken in (b'', hello[:-1], b'\x02'+hello[1:]):
        with pytest.raises(ValueError): tls_name(broken)
    a,b = socket.socketpair()
    try:
        a.sendall(raw)
        packet, host = receive_hello(b)
        assert packet == raw and host == 'example.com'
    finally: a.close(); b.close()


def start_proxy(state, events, peer=SID, connector=None):
    p = Proxy(SID, 'family.example.net', lambda: (POLICY, state['restricted'], state['epoch']),
              events.append, peer_sid=lambda _: peer,
              connector=connector or (lambda host: pytest.fail('Denied request reached upstream')),
              address=('127.0.0.1',0))
    p.start()
    return p


def request(proxy, target, method='CONNECT'):
    sock = socket.create_connection(proxy.server_address, timeout=3)
    sock.sendall(f'{method} {target} HTTP/1.1\r\nHost: ignored\r\n\r\n'.encode())
    return sock


@pytest.mark.parametrize('host', ['x.com:443','unlisted.org:443','example.com:8443','127.0.0.1:443'])
def test_denied_requests_never_connect(host):
    events = []; p = start_proxy({'restricted':False,'epoch':0}, events)
    try:
        with request(p,host) as sock:
            result = sock.recv(4096)
            assert result.startswith((b'HTTP/1.1 403',b'HTTP/1.1 502'))
        if host in ('x.com:443','unlisted.org:443'): assert events == [host.split(':')[0]]
    finally: p.close()


def test_parent_or_unknown_client_cannot_use_privileged_proxy():
    p = start_proxy({'restricted':False,'epoch':0}, [], peer='S-1-5-18')
    try:
        with request(p,'example.com:443') as sock:
            assert b'reserved' in sock.recv(4096)
    finally: p.close()


def test_existing_tunnel_revoked_and_sni_mismatch_refused():
    state = {'restricted':False,'epoch':0}; events=[]; connected=[]
    upstream, fixture = socket.socketpair()
    def connect(host): connected.append(host); return upstream
    p = start_proxy(state, events, connector=connect)
    try:
        with request(p,'example.com:443') as client:
            assert client.recv(4096).startswith(b'HTTP/1.1 200')
            hello = client_hello()
            client.sendall(hello)
            fixture.settimeout(3)
            assert fixture.recv(65536) == hello
            assert connected == ['example.com']
            state['epoch'] = 1
            assert client.recv(4096) == b''
        with request(p,'example.com:443') as client:
            assert client.recv(4096).startswith(b'HTTP/1.1 200')
            client.sendall(client_hello('x.com'))
            assert client.recv(4096) == b''
            assert connected == ['example.com']
            assert events == ['example.com']
    finally: p.close(); fixture.close(); upstream.close()


def test_restricted_child_web_denied_but_control_origin_available():
    p = start_proxy({'restricted':True,'epoch':0}, [])
    try:
        with request(p,'example.com:443') as client: assert client.recv(4096).startswith(b'HTTP/1.1 403')
        with request(p,'family.example.net:443') as client: assert client.recv(4096).startswith(b'HTTP/1.1 200')
    finally: p.close()


def test_cutoff_signs_out_all_child_sessions_not_just_active(monkeypatch):
    import sys
    from backend import guardian_windows as guardian
    records = [dict(SessionId=i, State=state) for i, state in [(0,0),(1,0),(2,4),(3,0)]]
    calls = []
    ts = SimpleNamespace(WTSActive=0, WTSUserName=5, WTSDomainName=7, error=OSError,
        WTSEnumerateSessions=lambda *a: records,
        WTSQuerySessionInformation=lambda _, i, field: 'PC' if field==7 else ('Child' if i in (1,2) else 'Parent'),
        WTSLogoffSession=lambda *a: calls.append(('signout',a)),
        WTSDisconnectSession=lambda *a: calls.append(('disconnect',a)))
    security = SimpleNamespace(LookupAccountName=lambda _, name: (SID if name.endswith('Child') else SID+'0',None,None),
        ConvertSidToStringSid=lambda value:value)
    monkeypatch.setitem(sys.modules, 'win32ts', ts)
    monkeypatch.setitem(sys.modules, 'win32security', security)
    assert guardian.sessions(SID) == [1]
    guardian.restrict_sessions(SID,[1],True)
    assert calls == [('signout',(None,1,False)),('signout',(None,2,False))]
    calls.clear()
    guardian.restrict_sessions(SID,[1],False)
    assert calls == [('disconnect',(None,1,False))]


def test_signout_warning_discloses_unsaved_work_loss(monkeypatch):
    import sys
    from backend.guardian_screen import send_warning
    calls=[]
    monkeypatch.setitem(sys.modules,'win32ts',SimpleNamespace(WTSSendMessage=lambda *a:calls.append(a)))
    monkeypatch.setitem(sys.modules,'win32con',SimpleNamespace(MB_OK=0,MB_ICONWARNING=48))
    send_warning(4,'time_limit',True)
    assert 'SIGN OUT' in calls[0][3] and 'Unsaved work may be lost' in calls[0][3]
    assert calls[0][-1] is False
