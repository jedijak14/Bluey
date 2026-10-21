"""Remote-ready Bluey Home control plane. NOT a Windows enforcement service.
Run behind HTTPS on a host with persistent storage, separate from the desktop engine.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


from .website_rules import domain, build_rules


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Account(StrictModel):
    username: str = Field(min_length=3, max_length=40, pattern=r'^[a-zA-Z0-9_.-]+$')
    password: str = Field(min_length=12, max_length=128)
    invite: str = Field(default='', max_length=128)


class Child(StrictModel):
    name: str = Field(min_length=1, max_length=40)

    @field_validator('name')
    @classmethod
    def nonempty(cls, value):
        if not value.strip(): raise ValueError('Enter a nickname.')
        return value.strip()


class Policy(StrictModel):
    version: int = Field(ge=0)
    daily_minutes: int = Field(default=120, ge=0, le=720)
    bedtime_start: str = Field(default='21:00', pattern=r'^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
    bedtime_end: str = Field(default='07:00', pattern=r'^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
    timezone: str = Field(default='America/Los_Angeles', max_length=60)
    blocked_domains: list[str] = Field(default_factory=list, max_length=100)

    allowed_domains: list[str] = Field(default_factory=list, max_length=100)

    @field_validator('blocked_domains', 'allowed_domains')
    @classmethod
    def domains(cls, values): return sorted(set(domain(v) for v in values))

    @field_validator('timezone')
    @classmethod
    def zone(cls, value):
        try: ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError): raise ValueError('Choose an IANA timezone.')
        return value


class Enrollment(StrictModel):
    code: str = Field(min_length=12, max_length=100)


class TimeRequest(StrictModel):
    minutes: int = Field(ge=1, le=120)
    reason: str = Field(default='', max_length=240)


class Decision(StrictModel):
    decision: str = Field(pattern=r'^(approve|deny)$')


def create_app(path: str, gateway_token: str, invite: str, *, schema="bluey_family"):
    app = FastAPI(title='Bluey Home foundation', docs_url=None, redoc_url=None)
    from .family_database import Database
    storage = Database(path, schema)
    connect = storage.connect
    from fastapi.responses import JSONResponse
    async def storage_unavailable(request, error):
        return JSONResponse({'error': 'Family storage is temporarily unavailable. Try again shortly.'}, status_code=503, headers={'Cache-Control':'no-store'})
    app.add_exception_handler(sqlite3.OperationalError, storage_unavailable)
    if storage.postgres:
        import psycopg
        app.add_exception_handler(psycopg.Error, storage_unavailable)
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS parents(id TEXT PRIMARY KEY, username TEXT UNIQUE, salt TEXT, password TEXT);
        CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, role TEXT, subject TEXT, expires REAL);
        CREATE TABLE IF NOT EXISTS children(id TEXT PRIMARY KEY, parent TEXT REFERENCES parents(id), name TEXT, policy TEXT);
        CREATE TABLE IF NOT EXISTS enrollments(hash TEXT PRIMARY KEY, child TEXT REFERENCES children(id) ON DELETE CASCADE, expires REAL);
        CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, child TEXT REFERENCES children(id) ON DELETE CASCADE, minutes INTEGER, reason TEXT, day TEXT, created REAL, status TEXT);
        CREATE TABLE IF NOT EXISTS grants(request TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE, child TEXT REFERENCES children(id) ON DELETE CASCADE, day TEXT, minutes INTEGER);
        CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER, reset REAL);
        ''')

    async def gateway(x_bluey_gateway: str = Header(default='')):
        if not gateway_token or not hmac.compare_digest(x_bluey_gateway.encode(), gateway_token.encode()):
            raise HTTPException(401, 'Family gateway authentication required.')

    @app.middleware('http')
    async def no_store(request: Request, call_next):
        if request.headers.get('content-length', '0').isdigit() and int(request.headers.get('content-length', '0')) > 20000:
            from fastapi.responses import JSONResponse
            return JSONResponse({'detail':'Request too large.'}, status_code=413)
        if request.method in {'POST', 'PUT'}:
            from fastapi.responses import JSONResponse
            chunks=[]; size=0
            async for chunk in request.stream():
                size += len(chunk)
                if size > 20000:
                    return JSONResponse({'detail':'Request too large.'},status_code=413,headers={'Cache-Control':'no-store'})
                chunks.append(chunk)
            request._body=b''.join(chunks)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    def limited(key, maximum=10):
        now = time.time()
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM attempts WHERE reset < ?', (now,))
            row = db.execute('SELECT count FROM attempts WHERE key=?', (key,)).fetchone()
            if row and row['count'] >= maximum: raise HTTPException(429, 'Too many attempts. Try again in 15 minutes.')
            db.execute('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=attempts.count+1', (key, now+900))

    def actor(authorization: str = Header(default=''), _=Depends(gateway)):
        token = authorization.removeprefix('Bearer ')
        if len(token) > 200: raise HTTPException(401, 'Sign in again.')
        with connect() as db:
            db.execute('DELETE FROM sessions WHERE expires < ?', (time.time(),))
            row = db.execute('SELECT role,subject FROM sessions WHERE hash=?', (digest(token),)).fetchone()
        if not row: raise HTTPException(401, 'Sign in or enroll again.')
        return dict(row)

    def parent(identity=Depends(actor)):
        if identity['role'] != 'parent': raise HTTPException(403, 'Parent access required.')
        return identity['subject']

    def kid(identity=Depends(actor)):
        if identity['role'] != 'kid': raise HTTPException(403, 'Kids enrollment required.')
        return identity['subject']

    def issue(db, role, subject):
        token = secrets.token_urlsafe(32)
        db.execute('DELETE FROM sessions WHERE expires < ?', (time.time(),))
        db.execute('INSERT INTO sessions VALUES(?,?,?,?)', (digest(token), role, subject, time.time()+(43200 if role=='parent' else 2592000)))
        return {'token':token, 'role':role}

    def owned(db, child, owner):
        row = db.execute('SELECT * FROM children WHERE id=? AND parent=?', (child, owner)).fetchone()
        if not row: raise HTTPException(404, 'Child profile not found.')
        return row

    def day(policy): return datetime.fromtimestamp(time.time(), ZoneInfo(policy['timezone'])).date().isoformat()

    from .family_agents import install_routes
    install_routes(app, connect, parent, actor, gateway, limited, owned, issue)

    def snapshot(db, row):
        policy = Policy.model_validate_json(row['policy']).model_dump()
        extra = db.execute('SELECT COALESCE(SUM(minutes),0) FROM grants WHERE child=? AND day=?', (row['id'], day(policy))).fetchone()[0]
        agent = db.execute('SELECT id,last_seen,report FROM agents WHERE child=?',(row['id'],)).fetchone()
        from .family_health import agent_health
        health, usage = agent_health(agent, policy, day(policy), time.time())
        credential = db.execute("SELECT MAX(expires) FROM sessions WHERE role='agent' AND subject=?", (agent['id'],)).fetchone() if agent else None
        # Expiration metadata is not a credential. Never expose the session hash.
        health['credential_expires_at'] = credential[0] if credential else None
        return {'website_rules': build_rules(policy), 'agent': health,
                'id': row['id'], 'name': row['name'], 'policy': policy,
                'extra_minutes_today': min(extra, 1440), 'used_minutes': usage,
                'protected': False, 'enforcement': 'unverified',
                'last_seen': health['last_seen'],
                'notice': 'Agent reports are not independent proof of protection. Verify Windows session limits and browser policies on the child PC.'}

    def cleanup(db):
        now = time.time()
        db.execute("UPDATE requests SET status='expired' WHERE status='pending' AND created < ?", (now-3600,))
        # Requests belong to a child's calendar day, not just a rolling hour.
        # Otherwise a 23:59 request blocks a new request after midnight even
        # though the parent can no longer approve the old request.
        pending = db.execute("SELECT r.id,r.day,c.policy FROM requests r JOIN children c ON c.id=r.child WHERE r.status='pending'").fetchall()
        days = {}
        for row in pending:
            zone = json.loads(row['policy'])['timezone']
            if zone not in days:
                days[zone] = datetime.fromtimestamp(now, ZoneInfo(zone)).date().isoformat()
            if row['day'] != days[zone]:
                db.execute("UPDATE requests SET status='expired' WHERE id=? AND status='pending'", (row['id'],))
        db.execute('DELETE FROM requests WHERE created < ?', (now-30*86400,))
        db.execute('DELETE FROM enrollments WHERE expires < ?', (now,))

    @app.get('/api/family/status', dependencies=[Depends(gateway)])
    def status():
        with connect() as db: db.execute('SELECT count(*) FROM parents').fetchone()
        return {'status':'ready', 'enforcement_available':False, 'notifications':'in_app_polling', 'registration_available':bool(invite), 'version':3}

    @app.post('/api/family/auth/register', dependencies=[Depends(gateway)])
    def register(body: Account):
        limited('registration', 20)
        if not invite or not hmac.compare_digest(body.invite.encode(), invite.encode()): raise HTTPException(403, 'A valid operator setup invite is required.')
        salt = secrets.token_hex(16); hashed = password_hash(body.password, salt)
        with connect() as db:
            try:
                identifier = str(uuid.uuid4())
                db.execute('INSERT INTO parents VALUES(?,?,?,?)', (identifier, body.username.lower(), salt, hashed))
                return issue(db, 'parent', identifier)
            except sqlite3.IntegrityError: raise HTTPException(409, 'This username cannot be registered.')

    @app.post('/api/family/auth/login', dependencies=[Depends(gateway)])
    def login(body: Account):
        limited('all_logins', 100)
        limited('login:'+body.username.lower())
        with connect() as db:
            row = db.execute('SELECT * FROM parents WHERE username=?', (body.username.lower(),)).fetchone()
            hashed = password_hash(body.password, row['salt'] if row else '00'*16)
            if not row or not hmac.compare_digest(hashed, row['password']): raise HTTPException(401, 'Invalid username or password.')
            return issue(db, 'parent', row['id'])

    @app.post('/api/family/auth/logout')
    def logout(authorization: str=Header(default=''), identity=Depends(actor)):
        with connect() as db: db.execute('DELETE FROM sessions WHERE hash=?', (digest(authorization.removeprefix('Bearer ')),))
        return {'signed_out':True}

    @app.get('/api/family/dashboard')
    def dashboard(owner=Depends(parent)):
        with connect() as db:
            cleanup(db)
            children=[snapshot(db,row) for row in db.execute('SELECT * FROM children WHERE parent=? ORDER BY name,id', (owner,)).fetchall()]
            requests=[dict(r) for r in db.execute('SELECT r.*, c.name FROM requests r JOIN children c ON c.id=r.child WHERE c.parent=? ORDER BY created DESC LIMIT 100', (owner,)).fetchall()]
            return {'children':children, 'requests':requests}

    @app.post('/api/family/children')
    def add_child(body: Child, owner=Depends(parent)):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT COUNT(*) FROM children WHERE parent=?', (owner,)).fetchone()[0] >= 20: raise HTTPException(409, 'At most 20 profiles per family.')
            identifier=str(uuid.uuid4())
            db.execute('INSERT INTO children VALUES(?,?,?,?)', (identifier, owner, body.name, Policy(version=0).model_dump_json()))
            return snapshot(db, owned(db, identifier, owner))

    @app.put('/api/family/children/{child}/policy')
    def put_policy(child: str, body: Policy, owner=Depends(parent)):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row=owned(db,child,owner)
            if json.loads(row['policy'])['version'] != body.version: raise HTTPException(409, 'Rules changed elsewhere. Refresh before saving.')
            body.version += 1
            db.execute('UPDATE children SET policy=? WHERE id=?', (body.model_dump_json(), child))
            return snapshot(db, owned(db,child,owner))

    @app.delete('/api/family/children/{child}')
    def delete_child(child: str, owner=Depends(parent)):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            owned(db,child,owner)
            db.execute("DELETE FROM sessions WHERE role='agent' AND subject IN (SELECT id FROM agents WHERE child=?)", (child,))
            db.execute("DELETE FROM sessions WHERE role='kid' AND subject=?", (child,))
            db.execute('DELETE FROM children WHERE id=?', (child,))
        return {'deleted':True}

    @app.post('/api/family/children/{child}/enrollment')
    def enrollment(child: str, owner=Depends(parent)):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            owned(db,child,owner); cleanup(db)
            db.execute('DELETE FROM enrollments WHERE child=?', (child,))
            code=secrets.token_urlsafe(12)
            db.execute('INSERT INTO enrollments VALUES(?,?,?)', (digest(code),child,time.time()+600))
            return {'code':code, 'expires_in':600}

    @app.post('/api/family/enroll', dependencies=[Depends(gateway)])
    def enroll(body: Enrollment):
        limited('enrollment', 40)
        with connect() as db:
            db.execute('BEGIN IMMEDIATE'); cleanup(db)
            row=db.execute('SELECT child FROM enrollments WHERE hash=?', (digest(body.code),)).fetchone()
            if not row: raise HTTPException(403, 'Invalid or expired enrollment code.')
            db.execute('DELETE FROM enrollments WHERE hash=?', (digest(body.code),))
            db.execute("DELETE FROM sessions WHERE role='kid' AND subject=?", (row['child'],))
            return issue(db,'kid',row['child'])

    @app.get('/api/family/kid')
    def kid_status(child=Depends(kid)):
        with connect() as db:
            cleanup(db)
            row=db.execute('SELECT * FROM children WHERE id=?', (child,)).fetchone()
            if not row: raise HTTPException(401,'Enrollment was removed.')
            return {**snapshot(db,row), 'alerts':[dict(r) for r in db.execute('SELECT id,kind,domain,created,seen FROM safety_events WHERE child=? AND created>? ORDER BY created DESC LIMIT 10',(child,time.time()-86400))], 'requests':[dict(r) for r in db.execute('SELECT * FROM requests WHERE child=? ORDER BY created DESC LIMIT 10',(child,)).fetchall()]}

    @app.post('/api/family/kid/requests')
    def request_time(body: TimeRequest, child=Depends(kid)):
        limited('request:'+child, 10)
        with connect() as db:
            db.execute('BEGIN IMMEDIATE'); cleanup(db)
            row=db.execute('SELECT * FROM children WHERE id=?', (child,)).fetchone()
            if not row: raise HTTPException(401,'Enrollment was removed.')
            if db.execute("SELECT 1 FROM requests WHERE child=? AND status='pending'",(child,)).fetchone(): raise HTTPException(409,'You already have a request waiting for your parent.')
            identifier=str(uuid.uuid4())
            db.execute('INSERT INTO requests VALUES(?,?,?,?,?,?,?)',(identifier,child,body.minutes,body.reason,day(json.loads(row['policy'])),time.time(),'pending'))
            return {'id':identifier, 'status':'pending'}

    @app.post('/api/family/requests/{identifier}/decision')
    def decide(identifier: str, body: Decision, owner=Depends(parent)):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE'); cleanup(db)
            row=db.execute('SELECT r.*, c.policy FROM requests r JOIN children c ON c.id=r.child WHERE r.id=? AND c.parent=?',(identifier,owner)).fetchone()
            if not row: raise HTTPException(404,'Request not found.')
            if row['status'] != 'pending' or row['day'] != day(json.loads(row['policy'])): raise HTTPException(409,'Request already handled or expired. Refresh the dashboard.')
            status='approved' if body.decision=='approve' else 'denied'
            db.execute('UPDATE requests SET status=? WHERE id=?',(status,identifier))
            if status=='approved': db.execute('INSERT INTO grants VALUES(?,?,?,?)',(identifier,row['child'],row['day'],row['minutes']))
            return {'status':status}
    storage.harden()
    return app


def app_factory():
    path=os.getenv('BLUEY_FAMILY_DATABASE_URL') or os.getenv('BLUEY_FAMILY_DB')
    gateway=os.getenv('BLUEY_FAMILY_GATEWAY_TOKEN')
    if not path or not gateway: raise RuntimeError('Configure durable family storage and BLUEY_FAMILY_GATEWAY_TOKEN before hosting Bluey Home.')
    return create_app(path,gateway,os.getenv('BLUEY_FAMILY_SETUP_INVITE',''))


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app_factory(), host='0.0.0.0', port=int(os.getenv('PORT','8767')), access_log=False)
