"""Opt-in Windows Filtering Platform containment for ONE standard child SID.

Persistent ALE connect filters block direct IPv4/IPv6 traffic. The only exception
is a local guarded proxy; losing the service does not restore direct Internet.
No machine-wide firewall defaults, hosts-file edits, or third-party filters change.
ABI definitions follow Microsoft's fwpmtypes.h/fwptypes.h (Windows SDK).
"""
import ctypes as C
import json
import os
from pathlib import Path
import uuid
from .guardian_signin import validate_sid

PORT = 18768
U32, U16, U8, U64 = C.c_uint32, C.c_uint16, C.c_uint8, C.c_uint64

class GUID(C.Structure):
    _fields_ = [('a', U32), ('b', U16), ('c', U16), ('d', U8 * 8)]
    @classmethod
    def parse(cls, value):
        return cls.from_buffer_copy(uuid.UUID(value).bytes_le)

class Blob(C.Structure):
    _fields_ = [('size', U32), ('data', C.c_void_p)]
class Display(C.Structure):
    _fields_ = [('name', C.c_wchar_p), ('description', C.c_wchar_p)]
class Number(C.Union):
    _fields_ = [('u8', U8), ('u16', U16), ('u32', U32), ('pointer', C.c_void_p)]
class Value(C.Structure):
    _fields_ = [('type', U32), ('value', Number)]
class Condition(C.Structure):
    _fields_ = [('field', GUID), ('match', U32), ('value', Value)]
class Action(C.Structure):
    _fields_ = [('type', U32), ('key', GUID)]
class Context(C.Union):
    _fields_ = [('raw', U64), ('key', GUID)]
class Filter(C.Structure):
    _fields_ = [('key', GUID), ('display', Display), ('flags', U32),
        ('provider', C.POINTER(GUID)), ('data', Blob), ('layer', GUID),
        ('sublayer', GUID), ('weight', Value), ('count', U32),
        ('conditions', C.POINTER(Condition)), ('action', Action), ('context', Context),
        ('reserved', C.POINTER(GUID)), ('id', U64), ('effective_weight', Value)]
class Provider(C.Structure):
    _fields_ = [('key', GUID), ('display', Display), ('flags', U32), ('data', Blob), ('service', C.c_wchar_p)]
class Sublayer(C.Structure):
    _fields_ = [('key', GUID), ('display', Display), ('flags', U32),
        ('provider', C.POINTER(GUID)), ('data', Blob), ('weight', U16)]

LAYERS = {'v4': 'c38d57d1-05a7-4c33-904f-7fbceee60e82', 'v6': '4a72393b-319f-44bc-84c3-ba54dcb3b6b4'}
USER = 'af043a0a-b34d-4f86-979c-c90371af6e66'
ADDRESS = 'b235ae9a-1d64-49b8-a44c-5ff3d9095045'
REMOTE_PORT = 'c35a604d-d22b-4e1a-91b4-68f674ee674b'
PROTOCOL = '3971ef2b-623e-4f9a-8cb1-6e79b806b9a7'
NOT_FOUND = {0x80320003, 0x80320005, 0x80320007, 0x80320008}  # filter/sublayer/provider/not found

class Engine:
    def __init__(self):
        if os.name != 'nt':
            raise OSError('Windows administrator WFP access required')
        self.dll = C.WinDLL('fwpuclnt.dll')
        self.handle = C.c_void_p()
        def api(name, args):
            f = getattr(self.dll, name); f.argtypes = args; f.restype = U32
        api('FwpmEngineOpen0', [C.c_wchar_p, U32, C.c_void_p, C.c_void_p, C.POINTER(C.c_void_p)])
        api('FwpmEngineClose0', [C.c_void_p])
        for kind, structure in [('Provider', Provider), ('SubLayer', Sublayer), ('Filter', Filter)]:
            args = [C.c_void_p, C.POINTER(structure), C.c_void_p]
            if kind == 'Filter': args.append(C.POINTER(U64))
            api('Fwpm' + kind + 'Add0', args)
            api('Fwpm' + kind + 'DeleteByKey0', [C.c_void_p, C.POINTER(GUID)])
        api('FwpmProviderGetByKey0', [C.c_void_p, C.POINTER(GUID), C.POINTER(C.POINTER(Provider))])
        api('FwpmTransactionBegin0', [C.c_void_p, U32])
        api('FwpmTransactionCommit0', [C.c_void_p])
        api('FwpmTransactionAbort0', [C.c_void_p])
        self.dll.FwpmFreeMemory0.argtypes = [C.POINTER(C.c_void_p)]
        self.dll.FwpmFreeMemory0.restype = None
        self.check(self.dll.FwpmEngineOpen0(None, 10, None, None, C.byref(self.handle)))

    @staticmethod
    def check(code):
        if code: raise OSError(f'Windows network policy failed: 0x{code:08x}')

    def close(self):
        if self.handle:
            self.check(self.dll.FwpmEngineClose0(self.handle)); self.handle = C.c_void_p()

    def delete(self, kind, key):
        code = getattr(self.dll, 'Fwpm' + kind + 'DeleteByKey0')(self.handle, C.byref(GUID.parse(key)))
        if code not in NOT_FOUND: self.check(code)

    def provider_data(self, key):
        result = C.POINTER(Provider)()
        code = self.dll.FwpmProviderGetByKey0(self.handle, C.byref(GUID.parse(key)), C.byref(result))
        if code in NOT_FOUND: return None
        self.check(code)
        try:
            blob = result.contents.data
            if blob.size > 4096: raise RuntimeError('Unrecognized network provider')
            return C.string_at(blob.data, blob.size)
        finally:
            pointer = C.cast(result, C.c_void_p)
            self.dll.FwpmFreeMemory0(C.byref(pointer))

class Descriptor:
    def __init__(self, sddl):
        self.pointer = C.c_void_p(); self.size = U32()
        api = C.WinDLL('advapi32.dll', use_last_error=True).ConvertStringSecurityDescriptorToSecurityDescriptorW
        api.argtypes = [C.c_wchar_p, U32, C.POINTER(C.c_void_p), C.POINTER(U32)]
        api.restype = C.c_int
        if not api(sddl, 1, C.byref(self.pointer), C.byref(self.size)):
            raise C.WinError(C.get_last_error())
    def close(self):
        api = C.WinDLL('kernel32.dll').LocalFree
        api.argtypes = [C.c_void_p]; api.restype = C.c_void_p
        api(self.pointer)


def read_journal(path, sid):
    validate_sid(sid)
    if path.stat().st_size > 8192: raise ValueError('Invalid network recovery journal')
    data = json.loads(path.read_text())
    keys = {'provider', 'sublayer', 'deny_v4', 'deny_v6', 'proxy_v4'}
    if data.get('version') != 1 or data.get('sid') != sid or set(data.get('keys', {})) != keys:
        raise ValueError('Network journal identity mismatch')
    values = list(data['keys'].values())
    if len(set(values)) != len(values): raise ValueError('Duplicate network keys')
    for value in values:
        if str(uuid.UUID(value)) != value: raise ValueError('Invalid network key')
    return data

class NetworkGate:
    def __init__(self, sid, journal, engine=None):
        validate_sid(sid)
        self.sid, self.journal = sid, Path(journal)
        self.engine = engine or Engine()
        self.mode = None

    def prepare(self):
        if not self.journal.exists():
            state = {'version': 1, 'sid': self.sid, 'keys': {k: str(uuid.uuid4()) for k in
                     ('provider', 'sublayer', 'deny_v4', 'deny_v6', 'proxy_v4')}}
            temporary = self.journal.with_suffix('.new')
            with temporary.open('w') as file:
                json.dump(state, file); file.flush(); os.fsync(file.fileno())
            os.replace(temporary, self.journal)
        return read_journal(self.journal, self.sid)

    def apply(self, proxy_allowed):
        state = self.prepare()
        if self.mode is proxy_allowed: return 'filtered' if proxy_allowed else 'blocked'
        keys = state['keys']
        metadata = json.dumps({'owner': 'BlueyGuardian', 'sid': self.sid, 'installation': keys['provider']}, sort_keys=True).encode()
        existing = self.engine.provider_data(keys['provider'])
        if existing is not None and existing != metadata:
            raise RuntimeError('Network ownership conflict; parent repair required')
        e = self.engine; dll = e.dll
        provider = GUID.parse(keys['provider']); sublayer = GUID.parse(keys['sublayer'])
        buffer = C.create_string_buffer(metadata); blob = Blob(len(metadata), C.cast(buffer, C.c_void_p))
        # SD on policy objects only grants mutation to SYSTEM/admins. The match SD
        # is separate and matches the child's token, never Users or Administrators.
        security = Descriptor('O:SYG:SYD:P(A;;GA;;;SY)(A;;GA;;;BA)')
        user = Descriptor(f'D:(A;;CC;;;{self.sid})')
        sd_blob = Blob(user.size.value, user.pointer)
        begun = False
        try:
            e.check(dll.FwpmTransactionBegin0(e.handle, 0)); begun = True
            if existing is None:
                p = Provider(provider, Display('Bluey Guardian child network', 'Administrator-installed child-only containment'), 1, blob, None)
                e.check(dll.FwpmProviderAdd0(e.handle, C.byref(p), security.pointer))
                s = Sublayer(sublayer, Display('Bluey Guardian', 'Child-only proxy gate'), 1, C.pointer(provider), blob, 0x8000)
                e.check(dll.FwpmSubLayerAdd0(e.handle, C.byref(s), security.pointer))
            for name in ('deny_v4', 'deny_v6', 'proxy_v4'): e.delete('Filter', keys[name])
            for name in ('deny_v4', 'deny_v6', *(['proxy_v4'] if proxy_allowed else [])):
                permit = name == 'proxy_v4'
                conditions = [Condition(GUID.parse(USER), 0, Value(14, Number(pointer=C.cast(C.pointer(sd_blob), C.c_void_p))))]
                if permit:
                    conditions += [Condition(GUID.parse(ADDRESS), 0, Value(3, Number(u32=0x7f000001))),
                                   Condition(GUID.parse(REMOTE_PORT), 0, Value(2, Number(u16=PORT))),
                                   Condition(GUID.parse(PROTOCOL), 0, Value(1, Number(u8=6)))]
                array = (Condition * len(conditions))(*conditions)
                weight = U64(100 if permit else 1)
                f = Filter(); f.key = GUID.parse(keys[name]); f.display = Display('Bluey Guardian ' + name, self.sid)
                f.flags = 1; f.provider = C.pointer(provider); f.data = blob
                f.layer = GUID.parse(LAYERS['v6' if name.endswith('v6') else 'v4']); f.sublayer = sublayer
                f.weight = Value(4, Number(pointer=C.cast(C.pointer(weight), C.c_void_p)))
                f.count = len(conditions); f.conditions = array; f.action.type = 0x1002 if permit else 0x1001
                identifier = U64()
                e.check(dll.FwpmFilterAdd0(e.handle, C.byref(f), security.pointer, C.byref(identifier)))
            e.check(dll.FwpmTransactionCommit0(e.handle)); begun = False
            self.mode = proxy_allowed
            return 'filtered' if proxy_allowed else 'blocked'
        finally:
            if begun: dll.FwpmTransactionAbort0(e.handle)
            security.close(); user.close()

    def recover(self):
        state = read_journal(self.journal, self.sid)
        keys = state['keys']
        metadata = json.dumps({'owner': 'BlueyGuardian', 'sid': self.sid, 'installation': keys['provider']}, sort_keys=True).encode()
        existing = self.engine.provider_data(keys['provider'])
        if existing is not None and existing != metadata: raise RuntimeError('Network ownership conflict')
        e = self.engine
        e.check(e.dll.FwpmTransactionBegin0(e.handle, 0))
        try:
            for name in ('proxy_v4', 'deny_v4', 'deny_v6'): e.delete('Filter', keys[name])
            e.delete('SubLayer', keys['sublayer']); e.delete('Provider', keys['provider'])
            e.check(e.dll.FwpmTransactionCommit0(e.handle))
        except BaseException:
            e.dll.FwpmTransactionAbort0(e.handle); raise
        # Keep the ownership journal until configuration removal succeeds.
        self.mode = None

    def close(self): self.engine.close()


def recover_network(config, directory):
    path = directory / 'network.json'
    if not path.exists():
        if config.get('strict_network'): raise RuntimeError('Missing network ownership journal; retain configuration for parent repair')
        return
    gate = NetworkGate(config['sid'], path)
    try: gate.recover()
    finally: gate.close()
