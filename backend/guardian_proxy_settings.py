"""Child-hive-only proxy preferences. Refuse existing management; journal ownership."""
import json
import os
from .guardian_signin import validate_sid
from .guardian_network import PORT


def settings():
    proxy = f'127.0.0.1:{PORT}'
    entries = []
    for root in (r'Software\Policies\Microsoft\Edge', r'Software\Policies\Google\Chrome'):
        entries += [(root, 'ProxySettings', json.dumps({'ProxyMode':'fixed_servers', 'ProxyServer':proxy, 'ProxyBypassList':'<-loopback>'}, sort_keys=True)),
                    (root, 'EncryptedClientHelloEnabled', 0)]
    root = r'Software\Policies\Mozilla\Firefox'
    entries += [(root+r'\Proxy', 'Mode', 'manual'), (root+r'\Proxy', 'Locked', 1),
                (root+r'\Proxy', 'HTTPProxy', proxy), (root+r'\Proxy', 'SSLProxy', proxy),
                (root+r'\Proxy', 'UseHTTPProxyForAllProtocols', 1),
                (root+r'\DNSOverHTTPS', 'Enabled', 0), (root+r'\DNSOverHTTPS', 'Locked', 1),
                (root+r'\Preferences\network.dns.echconfig.enabled', 'Value', 0),
                (root+r'\Preferences\network.dns.echconfig.enabled', 'Status', 'locked')]
    return entries


def prepare(sid, journal):
    import winreg
    validate_sid(sid)
    # Do this before enrollment/WFP writes. Do not override another manager.
    with winreg.OpenKey(winreg.HKEY_USERS, sid): pass
    for path, name, _ in settings():
        try:
            with winreg.OpenKey(winreg.HKEY_USERS, sid+'\\'+path, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as key:
                winreg.QueryValueEx(key, name)
        except FileNotFoundError: continue
        raise RuntimeError('Existing proxy/ECH management found; parent review required')
    if journal.exists(): raise RuntimeError('Existing proxy recovery journal found')
    temporary = journal.with_suffix('.new')
    with temporary.open('w') as file:
        json.dump({'version':1, 'sid':sid, 'settings':settings()}, file)
        file.flush(); os.fsync(file.fileno())
    os.replace(temporary, journal)


def owned(sid, journal):
    validate_sid(sid)
    if journal.stat().st_size > 16384: raise ValueError('Invalid proxy journal')
    state = json.loads(journal.read_text())
    if state != {'version':1, 'sid':sid, 'settings':[list(row) for row in settings()]}:
        raise ValueError('Proxy ownership mismatch')
    return state['settings']


def apply(sid, journal):
    import winreg
    entries = owned(sid, journal)
    with winreg.OpenKey(winreg.HKEY_USERS, sid): pass
    for path, name, value in entries:
        with winreg.CreateKeyEx(winreg.HKEY_USERS, sid+'\\'+path, 0, winreg.KEY_SET_VALUE | winreg.KEY_WOW64_64KEY) as key:
            winreg.SetValueEx(key, name, 0, winreg.REG_DWORD if type(value) is int else winreg.REG_SZ, value)


def recover(sid, journal):
    import winreg
    if not journal.exists(): raise RuntimeError('Missing proxy recovery journal')
    entries = owned(sid, journal)
    with winreg.OpenKey(winreg.HKEY_USERS, sid): pass
    for path, name, expected in entries:
        try:
            with winreg.OpenKey(winreg.HKEY_USERS, sid+'\\'+path, 0, winreg.KEY_QUERY_VALUE | winreg.KEY_SET_VALUE | winreg.KEY_WOW64_64KEY) as key:
                value, kind = winreg.QueryValueEx(key, name)
                if value != expected or kind != (winreg.REG_DWORD if type(expected) is int else winreg.REG_SZ):
                    raise RuntimeError('Proxy settings changed externally; parent review required')
                winreg.DeleteValue(key, name)
        except FileNotFoundError: pass
    # Empty keys are harmless; never recursively delete other administrators' values.
