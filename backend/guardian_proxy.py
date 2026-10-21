"""Bounded, child-only HTTPS CONNECT gateway for opt-in approved-sites mode.

No TLS interception or certificate installation. Only hostnames are inspected;
TLS SNI must match CONNECT and ECH is refused. A parent-approved service could
still itself relay content: approval is a trust decision, not content inspection.
"""
import ipaddress
import select
import socket
import socketserver
import struct
import threading
import time
from urllib.parse import urlsplit
from .website_rules import domain, build_rules, matches
from .guardian_network import PORT


def approved_host(host, policy, control_host):
    host = domain(host)
    # Control-plane exception is exact, not a wildcard over all vercel.app sites.
    return host == control_host or any(matches(host, rule) for rule in build_rules(policy)['allowed'])


def public_addresses(host):
    answers = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    addresses = []
    for family, kind, proto, _, address in answers:
        ip = ipaddress.ip_address(address[0])
        if not ip.is_global or ip.is_multicast or (isinstance(ip, ipaddress.IPv6Address) and (ip.ipv4_mapped or ip.sixtofour or ip.teredo)):
            raise ValueError('Private or translated destination refused')
        if family not in (socket.AF_INET, socket.AF_INET6): raise ValueError('Unsupported address')
        addresses.append((family, kind, proto, address))
    if not addresses: raise ValueError('No public destination')
    return addresses


def connect_public(host):
    # Resolve once, validate every answer, connect by IP: no DNS rebinding between
    # validation and connect, no redirects or credentials in this transport.
    for family, kind, proto, address in public_addresses(host):
        sock = socket.socket(family, kind, proto)
        try:
            sock.settimeout(6); sock.connect(address); return sock
        except OSError:
            sock.close()
    raise OSError('Approved site unavailable')


def tls_name(hello):
    """Validate a complete TLS ClientHello handshake, returning its sole DNS SNI."""
    if len(hello) < 42 or hello[0] != 1 or int.from_bytes(hello[1:4], 'big') != len(hello)-4:
        raise ValueError('ClientHello required')
    position = 38
    def take(count):
        nonlocal position
        if count < 0 or position + count > len(hello): raise ValueError('Truncated TLS hello')
        result = hello[position:position+count]; position += count; return result
    take(take(1)[0])  # session id
    take(int.from_bytes(take(2), 'big'))  # cipher suites
    take(take(1)[0])  # compression methods
    length = int.from_bytes(take(2), 'big')
    end = position + length
    if end != len(hello): raise ValueError('Invalid TLS extension length')
    names, seen = [], set()
    while position < end:
        kind, size = struct.unpack('!HH', take(4)); value = take(size)
        if kind in seen: raise ValueError('Duplicate TLS extension')
        seen.add(kind)
        if kind in (0xfe0d, 0xffce): raise ValueError('Encrypted ClientHello is not supported in strict mode')
        if kind == 0:
            if len(value) < 5 or int.from_bytes(value[:2], 'big') != len(value)-2:
                raise ValueError('Invalid TLS server name')
            if value[2] != 0 or int.from_bytes(value[3:5], 'big') != len(value)-5:
                raise ValueError('Exactly one DNS server name required')
            names.append(domain(value[5:].decode('ascii')))
    if len(names) != 1: raise ValueError('TLS server name required')
    return names[0]


def receive_exact(sock, count):
    data = bytearray()
    while len(data) < count:
        part = sock.recv(count-len(data))
        if not part: raise ValueError('Connection closed')
        data.extend(part)
    return bytes(data)


def receive_hello(sock):
    raw, hello = bytearray(), bytearray()
    deadline = time.monotonic() + 8
    for _ in range(16):
        sock.settimeout(max(.01, deadline-time.monotonic()))
        header = receive_exact(sock, 5)
        kind, version, length = struct.unpack('!BHH', header)
        if kind != 22 or not 0x0301 <= version <= 0x0303 or not 0 < length <= 16384:
            raise ValueError('TLS handshake record required')
        if len(raw) + length + 5 > 65536: raise ValueError('TLS hello too large')
        data = receive_exact(sock, length); raw.extend(header+data); hello.extend(data)
        if len(hello) >= 4:
            size = int.from_bytes(hello[1:4], 'big') + 4
            if size > 60000: raise ValueError('TLS hello too large')
            if len(hello) >= size:
                # Do not forward a second, uninspected handshake in the same record.
                if len(hello) != size: raise ValueError('Trailing TLS handshake data')
                return bytes(raw), tls_name(bytes(hello))
    raise ValueError('Fragmented TLS hello limit exceeded')


def windows_peer_sid(connection):
    """Resolve the opposite side of an established IPv4 loopback connection.

A held process handle pins the token identity. Ambiguous or inaccessible socket
ownership is refused, never interpreted as permission to use a SYSTEM proxy.
"""
    import psutil
    import win32api
    import win32security
    peer, local = connection.getpeername(), connection.getsockname()
    candidates = {entry.pid for entry in psutil.net_connections(kind='tcp4')
                  if entry.status == 'ESTABLISHED' and entry.laddr == peer
                  and entry.raddr == local and entry.pid is not None}
    if len(candidates) != 1: raise PermissionError('Unverified local client')
    handle = win32api.OpenProcess(0x1000, False, candidates.pop())
    try:
        token = win32security.OpenProcessToken(handle, 8)
        try: return win32security.ConvertSidToStringSid(win32security.GetTokenInformation(token, win32security.TokenUser)[0])
        finally: token.Close()
    finally: handle.Close()


class Proxy(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = False
    request_queue_size = 16
    def __init__(self, sid, control_host, access, blocked, peer_sid=windows_peer_sid, connector=connect_public, address=('127.0.0.1', PORT)):
        self.sid, self.control_host, self.access, self.blocked = sid, domain(control_host), access, blocked
        self.peer_sid, self.connector = peer_sid, connector
        self.slots = threading.BoundedSemaphore(32)
        self.active = set(); self.active_lock = threading.Lock()
        super().__init__(address, Handler, bind_and_activate=False)
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try: self.server_bind(); self.server_activate()
        except BaseException: self.server_close(); raise
        self.thread = threading.Thread(target=self.serve_forever, daemon=True, name='guardian-https')

    def process_request(self, request, address):
        if not self.slots.acquire(False): self.shutdown_request(request); return
        try: super().process_request(request, address)
        except BaseException: self.slots.release(); raise

    def process_request_thread(self, request, address):
        with self.active_lock: self.active.add(request)
        try: super().process_request_thread(request, address)
        finally:
            with self.active_lock: self.active.discard(request)
            self.slots.release()

    def start(self): self.thread.start()
    def close(self):
        self.shutdown(); self.server_close(); self.thread.join(timeout=2)
        with self.active_lock:
            for request in self.active:
                try: request.shutdown(socket.SHUT_RDWR)
                except OSError: pass


class Handler(socketserver.BaseRequestHandler):
    def response(self, status, text, extra=''):
        body = text.encode('utf8')
        self.request.sendall((f'HTTP/1.1 {status}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {len(body)}\r\n{extra}\r\n').encode('ascii') + body)

    def allowed(self, host):
        policy, restricted, epoch = self.server.access()
        # Extra-time requests/control sync remain possible, even when time is up.
        return (host == self.server.control_host or (not restricted and policy is not None
                and approved_host(host, policy, self.server.control_host))), epoch

    def deny(self, host):
        self.server.blocked(host)
        self.response('403 Forbidden', 'This website has been blocked due to parental settings. A notification is queued for your parent; delivery requires a connection.')

    def handle(self):
        sock = self.request; upstream = None; tunnel = False
        try:
            sock.settimeout(8)
            if self.server.peer_sid(sock) != self.server.sid:
                self.response('403 Forbidden', 'This proxy is reserved for its enrolled child account.'); return
            header = bytearray(); deadline = time.monotonic() + 8
            while not header.endswith(b'\r\n\r\n'):
                sock.settimeout(max(.01, deadline-time.monotonic()))
                header.extend(receive_exact(sock, 1))
                if len(header) > 16384: raise ValueError('Header too large')
            lines = header[:-4].decode('ascii').split('\r\n')
            if any(any(ord(c) < 32 or ord(c) == 127 for c in line) for line in lines): raise ValueError('Invalid request')
            method, target, version = lines[0].split(' ')
            if version not in ('HTTP/1.0', 'HTTP/1.1'): raise ValueError('Unsupported proxy protocol')
            if method == 'CONNECT':
                host, separator, port = target.rpartition(':')
                if separator != ':' or port != '443': raise ValueError('Only HTTPS port 443 is allowed')
                host = domain(host)
            else:
                url = urlsplit(target)
                if method not in ('GET', 'HEAD') or url.scheme != 'http' or url.username or url.password or url.port not in (None, 80):
                    raise ValueError('Use approved HTTPS sites')
                host = domain(url.hostname or '')
            allowed, epoch = self.allowed(host)
            if not allowed: self.deny(host); return
            if method != 'CONNECT':
                location = 'https://' + host + (url.path or '/') + ('?' + url.query if url.query else '')
                self.response('307 Temporary Redirect', 'Use HTTPS.', 'Location: ' + location + '\r\n'); return
            sock.sendall(b'HTTP/1.1 200 Connection Established\r\n\r\n'); tunnel = True
            hello, name = receive_hello(sock)
            if name != host:
                self.server.blocked(host); raise ValueError('TLS name must match approved destination')
            if not self.allowed(host)[0]: return
            upstream = self.server.connector(host); upstream.sendall(hello)
            sock.settimeout(2); upstream.settimeout(2)
            idle = time.monotonic()
            while time.monotonic() - idle < 120:
                allowed, current = self.allowed(host)
                if not allowed or current != epoch: return  # revoke existing tunnels too
                readable, _, _ = select.select([sock, upstream], [], [], .5)
                for source in readable:
                    data = source.recv(32768)
                    if not data: return
                    (upstream if source is sock else sock).sendall(data)
                    idle = time.monotonic()
        except (OSError, ValueError, UnicodeError, PermissionError):
            if not tunnel:
                try: self.response('502 Bad Gateway', 'Strict web access is unavailable or the request was refused.')
                except OSError: pass
        finally:
            if upstream is not None: upstream.close()
