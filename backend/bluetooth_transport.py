"""Opt-in Bluetooth SPP over an OS-created incoming COM port.

The relay never accepts desktop credentials, arbitrary URLs or file paths. OS
pairing is not Bluey authorization: the existing expiring six-digit code is still
required. Only a phone role can cross this transport. No LAN listener is needed.
"""
import asyncio
import base64
import secrets
import json
import os
import re
from pathlib import Path

import httpx
from fastapi import HTTPException

MAX_FRAME = 1_000_000
HTTP_ROUTES = {('GET', '/api/companion/meeting'), ('POST', '/api/companion/notes')}


def decode_frame(raw):
    if len(raw) > MAX_FRAME:
        raise ValueError('Bluetooth frame too large.')
    frame = json.loads(raw)
    if not isinstance(frame, dict) or frame.get('kind') not in {'pair', 'open', 'packet', 'close', 'request', 'hello', 'sealed'}:
        raise ValueError('Invalid Bluetooth frame.')
    if not isinstance(frame.get('id', ''), str) or len(frame.get('id', '')) > 80:
        raise ValueError('Invalid request ID.')
    return frame


def ports():
    if os.name != 'nt':
        return []
    from serial.tools.list_ports import comports
    return [{'port': p.device, 'name': p.description} for p in comports()
            if re.fullmatch(r'COM[1-9][0-9]{0,3}', p.device, re.I)
            and ('BTH' in p.hwid.upper() or 'BLUETOOTH' in p.description.upper())]


class BluetoothRelay:
    def __init__(self, pairing, application, port=8765, settings=None):
        self.pairing, self.application, self.port = pairing, application, port
        self.settings = Path(settings or Path.home()/'.bluey'/'bluetooth.json')
        self.serial = self.task = self.socket = self.pump = None
        self.lock, self.write_lock = asyncio.Lock(), asyncio.Lock()
        self.error, self.selected = '', ''
        self.key = None
        self.incoming, self.outgoing = -1, 0
        self.session_token = ''

    def status(self):
        return {'enabled': bool(self.task and not self.task.done()), 'port': self.selected,
                'error': self.error, 'ports': ports(), 'transport': 'bluetooth-spp',
                'hardware_verified': False}

    async def restore(self):
        try:
            if self.settings.exists():
                value = json.loads(self.settings.read_text())
                if value.get('port'): await self.configure(value['port'], persist=False)
        except (OSError, ValueError, RuntimeError):
            self.error = 'Saved Bluetooth port is unavailable. Re-select the incoming port in Connected devices.'

    async def configure(self, port, persist=True):
        async with self.lock:
            if port and port not in {p['port'] for p in ports()}:
                raise ValueError('Select a detected Windows Bluetooth COM port, not a USB/other serial device.')
            await self.stop()
            if port:
                import serial
                self.serial = await asyncio.to_thread(serial.Serial, port, 115200, timeout=.25, write_timeout=3)
                self.selected, self.error = port, ''
                self.task = asyncio.create_task(self.run())
            if persist:
                self.settings.parent.mkdir(parents=True, exist_ok=True)
                temporary = self.settings.with_suffix('.tmp')
                temporary.write_text(json.dumps({'port': port}), encoding='utf-8')
                temporary.replace(self.settings)
        return self.status()

    async def stop(self):
        task, self.task = self.task, None
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        await self.close_socket()
        if self.serial:
            self.serial.close()
            self.serial = None
        self.selected = ''
        self.key = None

    async def close_socket(self):
        self.session_token = ''
        if self.pump:
            self.pump.cancel()
            await asyncio.gather(self.pump, return_exceptions=True)
            self.pump = None
        if self.socket:
            await self.socket.close()
            self.socket = None

    async def accept_frame(self, frame):
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.exceptions import InvalidTag
        if frame['kind'] == 'hello':
            try:
                key = base64.b64decode(frame.get('key', ''), validate=True)
            except (ValueError, TypeError):
                raise ValueError('Invalid Bluetooth handshake.') from None
            if len(key) != 32: raise ValueError('Invalid Bluetooth handshake.')
            # Finish/cancel every old producer BEFORE switching the connection key.
            await self.close_socket()
            self.key, self.incoming, self.outgoing = key, -1, 0
            return
        if frame['kind'] != 'sealed' or self.key is None:
            raise ValueError('Encrypted Bluetooth handshake required.')
        try:
            nonce = base64.b64decode(frame['nonce'], validate=True)
            ciphertext = base64.b64decode(frame['ciphertext'], validate=True)
            if len(nonce) != 12: raise ValueError()
            plain = AESGCM(self.key).decrypt(nonce, ciphertext, b'bluey-bt-v1:client')
            packet = decode_frame(plain)
            if type(packet.get('sequence')) is not int or packet['sequence'] != self.incoming + 1:
                raise ValueError()
            if packet['kind'] in {'hello', 'sealed'}: raise ValueError()
        except (KeyError, ValueError, TypeError, InvalidTag):
            raise ValueError('Invalid or replayed Bluetooth frame.') from None
        self.incoming += 1
        await self.handle(packet)

    async def write(self, frame):
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        async with self.write_lock:
            if not self.serial or self.key is None:
                raise RuntimeError('Bluetooth disconnected.')
            plain = json.dumps({**frame, 'sequence': self.outgoing}, ensure_ascii=True).encode()
            nonce = secrets.token_bytes(12)
            ciphertext = AESGCM(self.key).encrypt(nonce, plain, b'bluey-bt-v1:server')
            data = (json.dumps({'kind':'sealed', 'nonce':base64.b64encode(nonce).decode(),
                               'ciphertext':base64.b64encode(ciphertext).decode()})+'\n').encode()
            if len(data) > MAX_FRAME: raise ValueError('Bluetooth output too large.')
            self.outgoing += 1
            writing = asyncio.create_task(asyncio.to_thread(self.serial.write, data))
            try:
                await asyncio.shield(writing)
            except asyncio.CancelledError:
                await writing  # Do not interleave another writer with a cancelled OS write.
                raise

    async def handle(self, frame):
        kind, identity = frame['kind'], frame.get('id', '')
        try:
            if kind == 'pair':
                code, name = frame.get('code', ''), frame.get('name', 'Android Bluetooth')
                if not isinstance(code, str) or not re.fullmatch(r'\d{6}', code) or not isinstance(name, str):
                    raise ValueError('Enter the six-digit Bluey code.')
                token, device = self.pairing.redeem(code, name, 'bluetooth')
                result = {'token': token, 'device': device}
            elif kind == 'close':
                await self.close_socket()
                result = {}
            elif kind == 'packet':
                if not self.socket or frame.get('token') != self.session_token or self.session_token not in self.pairing.devices:
                    raise ValueError('Pair and connect first.')
                packet = frame.get('packet')
                if not isinstance(packet, dict) or packet.get('type') == 'auth':
                    raise ValueError('Invalid phone packet.')
                await self.socket.send(json.dumps(packet))
                return
            else:
                token = frame.get('token')
                # Explicitly excludes the desktop engine token, even if supplied.
                if not isinstance(token, str) or token not in self.pairing.devices:
                    raise HTTPException(401, 'Pair with a fresh Bluey code first.')
                if kind == 'open':
                    from websockets.asyncio.client import connect
                    await self.close_socket()
                    self.socket = await connect(f'ws://127.0.0.1:{self.port}/api/ws', max_size=MAX_FRAME, proxy=None)
                    await self.socket.send(json.dumps({'type': 'auth', 'token': token}))
                    self.session_token = token
                    self.pump = asyncio.create_task(self.forward())
                    result = {}
                elif kind == 'request':
                    route = (frame.get('method', 'GET'), frame.get('path'))
                    if route not in HTTP_ROUTES: raise ValueError('Route not allowed over Bluetooth.')
                    if token != self.session_token: raise ValueError('Connect this phone session first.')
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.application), base_url='http://bluetooth', timeout=120) as client:
                        response = await client.request(*route, json=frame.get('body'), headers={'Authorization': 'Bearer '+token})
                    if not response.is_success: raise HTTPException(response.status_code, response.json().get('detail', 'Request failed.'))
                    result = response.json()
                else:
                    raise ValueError('Invalid frame.')
            await self.write({'kind': 'reply', 'id': identity, 'data': result})
        except (HTTPException, ValueError) as error:
            await self.write({'kind': 'reply', 'id': identity, 'error': str(error.detail) if isinstance(error, HTTPException) else str(error)})
        except (OSError, RuntimeError):
            await self.write({'kind': 'reply', 'id': identity, 'error': 'Bluetooth relay unavailable. Reconnect from Android.'})

    async def forward(self):
        try:
            async for raw in self.socket:
                await self.write({'kind': 'event', 'packet': json.loads(raw)})
        except Exception:
            pass
        finally:
            await self.write({'kind': 'closed'})

    async def run(self):
        pending = bytearray()
        try:
            while True:
                data = await asyncio.to_thread(self.serial.read, 4096)
                if not data: continue
                pending.extend(data)
                if len(pending) > MAX_FRAME: raise ValueError('Bluetooth frame too large.')
                while b'\n' in pending:
                    raw, _, rest = pending.partition(b'\n'); pending = bytearray(rest)
                    try:
                        await self.accept_frame(decode_frame(raw))
                    except (ValueError, UnicodeError):
                        # Do not expose errors/session data to an unauthenticated new peer.
                        continue
        except asyncio.CancelledError:
            raise
        except Exception:
            self.error = 'Bluetooth connection failed. Disable and re-enable the incoming port.'
        finally:
            await self.close_socket()
