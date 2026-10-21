"""Per-user model settings. Windows credentials use DPAPI, never plaintext JSON."""
import base64
import ctypes
import json
import os
import tempfile
from pathlib import Path


def protect(data: bytes, decrypt=False) -> bytes:
    if os.name != 'nt':
        raise OSError('Encrypted credential storage is only available on Windows.')
    from ctypes import wintypes
    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]
    buf = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_ubyte)))
    target = Blob()
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    fn = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    fn.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    fn.restype = wintypes.BOOL
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    # UI_FORBIDDEN; encryption is bound to this Windows user, not all machine users.
    if not fn(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target)):
        raise OSError('Windows could not unlock the saved model credential.')
    try:
        return ctypes.string_at(target.data, target.size)
    finally:
        kernel.LocalFree(target.data)


class ModelStore:
    def __init__(self, path=None, cipher=None):
        self.path = Path(path or os.getenv('BLUEY_MODEL_CONFIG', str(Path.home() / '.bluey' / 'model.json')))
        self.cipher = cipher if cipher is not None else (protect if os.name == 'nt' else None)

    def read(self):
        if not self.path.exists():
            return {}
        data = json.loads(self.path.read_text(encoding='utf-8'))
        if not isinstance(data, dict): raise ValueError('Invalid settings file.')
        config = {k: data[k] for k in ('provider', 'model', 'base_url') if k in data}
        if data.get('encrypted_key'):
            if not self.cipher:
                raise OSError('Cannot unlock this Windows credential on this operating system.')
            config['api_key'] = self.cipher(base64.b64decode(data['encrypted_key'], validate=True), decrypt=True).decode()
        return config

    def save(self, config):
        data = config.model_dump(exclude={'api_key'})
        if config.api_key and self.cipher:
            data['encrypted_key'] = base64.b64encode(self.cipher(config.api_key.encode())).decode()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(dir=self.path.parent, prefix='.model-', suffix='.tmp')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as out:
                json.dump(data, out)
                out.flush()
                os.fsync(out.fileno())
            os.replace(name, self.path)
        finally:
            if os.path.exists(name): os.unlink(name)
        return bool(config.api_key and self.cipher)
