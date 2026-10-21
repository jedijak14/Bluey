"""Public Vercel ASGI boundary. Never uses ephemeral SQLite or demo identities."""
import asyncio
import os
import re
import secrets
import threading
from urllib.parse import urlsplit

import httpx
from starlette.responses import JSONResponse, Response

from .family_database import is_postgres
from .family_service import create_app

# Preserve the existing standalone HTTPS service mode during migration.
ROUTES = [
    (r'status', {'GET'}), (r'auth/(register|login|logout)', {'POST'}),
    (r'dashboard', {'GET'}), (r'children', {'POST'}),
    (r'children/[a-f0-9-]{36}', {'DELETE'}),
    (r'children/[a-f0-9-]{36}/policy', {'PUT'}),
    (r'children/[a-f0-9-]{36}/(enrollment|agent-enrollment)', {'POST'}),
    (r'enroll', {'POST'}), (r'kid', {'GET'}), (r'kid/requests', {'POST'}),
    (r'requests/[a-f0-9-]{36}/decision', {'POST'}),
    (r'agent/enroll', {'POST'}), (r'agent/policy', {'GET'}),
    (r'agent/(report|events)', {'POST'}), (r'alerts', {'GET'}),
    (r'alerts/[a-f0-9-]{36}/seen', {'POST'}),
]


class FamilyAPI:
    def __init__(self, env=None, factory=create_app):
        self.env = os.environ if env is None else env
        self.factory = factory
        self.app = None
        self.guard = threading.Lock()
        # Internal only: the public boundary injects this after origin/body checks.
        # End-user parent/kid/agent bearer authentication remains mandatory.
        self.gateway = secrets.token_urlsafe(32)

    def initialize(self, database):
        with self.guard:
            if self.app is None:
                built = self.factory(database, self.gateway, self.env.get('BLUEY_FAMILY_SETUP_INVITE', ''))
                from starlette.exceptions import HTTPException
                from fastapi.exceptions import RequestValidationError
                async def http_error(request, error):
                    return JSONResponse({'error': error.detail if isinstance(error.detail, str) else 'The family service rejected this request.'}, status_code=error.status_code)
                async def invalid(request, error):
                    return JSONResponse({'error':'Invalid family request. Check the supplied fields.'}, status_code=422)
                built.add_exception_handler(HTTPException, http_error)
                built.add_exception_handler(RequestValidationError, invalid)
                self.app = built

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return
        headers = {k.decode().lower(): v.decode('latin1') for k, v in scope['headers']}
        output_headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}

        async def reply(status, data):
            await JSONResponse(data, status_code=status, headers=output_headers)(scope, receive, send)

        origin = headers.get('origin')
        if origin:
            try:
                parsed = urlsplit(origin)
            except ValueError:
                return await reply(403, {"error": "Invalid origin."})
            native = self.env.get('BLUEY_FAMILY_NATIVE_ORIGIN', 'https://localhost')
            same = parsed.scheme == 'https' and parsed.netloc == headers.get('host') and not parsed.path and not parsed.query and not parsed.fragment and not parsed.username
            if not same and origin != native:
                return await reply(403, {'error': 'This origin is not permitted.'})
            output_headers.update({'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'})
        path = scope.get('path', '')
        relative = path.removeprefix('/api/family/')
        allowed = next((methods for pattern, methods in ROUTES if re.fullmatch(pattern, relative)), None)
        if not path.startswith('/api/family/') or not allowed:
            return await reply(404, {'error': 'Not found.'})
        if scope['method'] == 'OPTIONS':
            return await Response(status_code=204, headers=output_headers)(scope, receive, send)
        if scope['method'] not in allowed:
            return await reply(405, {'error': 'Method not allowed.'})
        body = bytearray()
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            body.extend(message.get('body', b''))
            if len(body) > 20000:
                return await reply(413, {'error': 'Request too large.'})
            if not message.get('more_body'):
                break

        database = self.env.get('BLUEY_FAMILY_DATABASE_URL') or self.env.get('DATABASE_URL') or self.env.get('POSTGRES_URL')
        external = self.env.get('BLUEY_FAMILY_SERVICE_URL')
        if not database and external:
            try:
                parsed = urlsplit(external)
            except ValueError:
                return await reply(503, {"error": "Family service configuration is invalid."})
            secret = self.env.get('BLUEY_FAMILY_GATEWAY_TOKEN', '')
            if not secret or parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
                return await reply(503, {'error': 'Family service configuration is invalid.'})
            try:
                async with httpx.AsyncClient(timeout=10, trust_env=False, follow_redirects=False) as client:
                    async with client.stream(scope['method'], external.rstrip('/') + path,
                        headers={'X-Bluey-Gateway': secret, 'Authorization': headers.get('authorization', '')[:210], 'Content-Type': 'application/json'}, content=bytes(body)) as response:
                        if 300 <= response.status_code < 400:
                            raise ValueError("Redirects are not accepted")
                        data = bytearray()
                        async for chunk in response.aiter_bytes():
                            data.extend(chunk)
                            if len(data) > 200000:
                                raise ValueError('Oversized response')
                        import json
                        result = json.loads(data)
                        status = response.status_code
                        if status >= 400:
                            detail = result.get('detail')
                            result = {'error': detail if isinstance(detail, str) else 'The family service rejected this request.'}
                            status = status if status in {400,401,403,404,409,422,429} else 503
                        return await reply(status, result)
            except Exception:
                return await reply(503, {'error': 'The family service could not be reached.'})
        if not database:
            return await reply(200 if relative == 'status' else 503, {
                'status': 'unavailable', 'setup_required': 'database',
                'enforcement_available': False, 'notifications': 'unavailable',
                'error': 'Configure a persistent family database or a hosted Bluey family server. Supabase is not required. Accounts cannot be stored until a service is connected.'})
        if not is_postgres(database):
            return await reply(503, {'error': 'Vercel family storage requires PostgreSQL; temporary files are not supported.'})
        try:
            if self.app is None:
                await asyncio.to_thread(self.initialize, database)
        except Exception:
            return await reply(503, {'error': 'The family database could not be reached. Check its connection and permissions.'})
        forwarded = dict(scope)
        forwarded['headers'] = [(k,v) for k,v in scope['headers'] if k.lower() != b'x-bluey-gateway'] + [(b'x-bluey-gateway', self.gateway.encode())]
        delivered = False
        started = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
            return await receive()

        async def secured_send(message):
            nonlocal started
            if message['type'] == 'http.response.start':
                started = True
                clean = [(k,v) for k,v in message.get('headers', []) if k.decode().lower() not in {name.lower() for name in output_headers}]
                message = {**message, 'headers': clean + [(k.encode(), v.encode()) for k,v in output_headers.items()]}
            await send(message)
        try:
            await self.app(forwarded, replay, secured_send)
        except Exception:
            # Never return credentials, SQL or a raw database exception.
            if not started:
                await reply(503, {'error': 'Family storage is temporarily unavailable. Try again shortly.'})
