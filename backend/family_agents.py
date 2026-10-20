"""Separate Windows-agent authority. Kids tokens never gain these privileges."""
import json
import secrets
import time
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import Depends, HTTPException
from pydantic import Field, StrictBool
from .family_service import StrictModel, Enrollment, digest

class AgentReport(StrictModel):
    policy_version: int = Field(ge=0, strict=True)
    used_seconds: int = Field(ge=0, le=172800, strict=True)
    day: str = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    time_service: StrictBool
    edge_rules: StrictBool
    blocklist_version: str = Field(default='', max_length=40)
    error: str = Field(default='', max_length=160)

class SafetyEvent(StrictModel):
    id: str = Field(pattern=r'^[a-f0-9-]{36}$')
    kind: str = Field(pattern=r'^(time_limit|bedtime|site_blocked|clock_error|offline_policy_expired)$')
    domain: str = Field(default='', max_length=253)


def install_routes(app, connect, parent, actor, gateway, limited, owned, issue):
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS agent_codes(hash TEXT PRIMARY KEY,child TEXT REFERENCES children(id) ON DELETE CASCADE,expires REAL);
        CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY,child TEXT UNIQUE REFERENCES children(id) ON DELETE CASCADE,last_seen REAL,report TEXT);
        CREATE TABLE IF NOT EXISTS safety_events(id TEXT PRIMARY KEY,agent TEXT REFERENCES agents(id) ON DELETE CASCADE,child TEXT REFERENCES children(id) ON DELETE CASCADE,kind TEXT,domain TEXT,created REAL,seen REAL);
        ''')

    def agent(identity=Depends(actor)):
        if identity['role'] != 'agent': raise HTTPException(403,'Windows agent enrollment required.')
        with connect() as db:
            row=db.execute('SELECT * FROM agents WHERE id=?',(identity['subject'],)).fetchone()
        if not row: raise HTTPException(401,'Agent enrollment revoked.')
        return dict(row)

    @app.post('/api/family/children/{child}/agent-enrollment')
    def code(child: str, owner=Depends(parent)):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE'); owned(db,child,owner)
            db.execute('DELETE FROM agent_codes WHERE child=? OR expires<?',(child,time.time()))
            value=secrets.token_urlsafe(24)
            db.execute('INSERT INTO agent_codes VALUES(?,?,?)',(digest(value),child,time.time()+600))
            return {'code':value,'expires_in':600,'scope':'windows_agent'}

    @app.post('/api/family/agent/enroll',dependencies=[Depends(gateway)])
    def enroll(body: Enrollment):
        limited('agent_enrollment',40)
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT child FROM agent_codes WHERE hash=? AND expires>?',(digest(body.code),time.time())).fetchone()
            if not row: raise HTTPException(403,'Invalid or expired Windows enrollment code.')
            child=row['child']; previous=db.execute('SELECT id FROM agents WHERE child=?',(child,)).fetchone()
            if previous:
                db.execute("DELETE FROM sessions WHERE role='agent' AND subject=?",(previous['id'],))
                db.execute('DELETE FROM agents WHERE id=?',(previous['id'],))
            identifier=str(uuid.uuid4())
            db.execute('INSERT INTO agents VALUES(?,?,NULL,NULL)',(identifier,child))
            db.execute('DELETE FROM agent_codes WHERE hash=?',(digest(body.code),))
            result=issue(db,'agent',identifier)
            # Agent identities require renewal by a parent after 30 days.
            return {**result,'child_id':child,'agent_id':identifier}

    @app.get('/api/family/agent/policy')
    def policy(identity=Depends(agent)):
        with connect() as db:
            row=db.execute('SELECT policy FROM children WHERE id=?',(identity['child'],)).fetchone()
            from .family_service import Policy
            from .website_rules import build_rules
            policy=Policy.model_validate_json(row['policy']).model_dump();now=time.time()
            day=datetime.fromtimestamp(now,ZoneInfo(policy['timezone'])).date().isoformat()
            extra=db.execute('SELECT COALESCE(SUM(minutes),0) FROM grants WHERE child=? AND day=?',(identity['child'],day)).fetchone()[0]
            return {'website_rules':build_rules(policy),'policy':policy,'day':day,'extra_minutes_today':min(extra,1440),'server_time':now,'valid_until':now+86400}

    @app.post('/api/family/agent/report')
    def report(body: AgentReport, identity=Depends(agent)):
        with connect() as db:
            db.execute('UPDATE agents SET last_seen=?,report=? WHERE id=?',(time.time(),body.model_dump_json(),identity['id']))
        return {'accepted':True,'verified_protection':False}

    @app.post('/api/family/agent/events')
    def event(body: SafetyEvent, identity=Depends(agent)):
        limited('events:'+identity['id'],60)
        if body.domain:
            from .family_service import domain
            try: body.domain=domain(body.domain)
            except ValueError: raise HTTPException(422,'A public domain is required, not a full URL.')
        with connect() as db:
            db.execute('DELETE FROM safety_events WHERE created<?',(time.time()-30*86400,))
            previous=db.execute('SELECT agent,seen FROM safety_events WHERE id=?',(body.id,)).fetchone()
            if previous and previous['agent']!=identity['id']: raise HTTPException(409,'Event ID already used.')
            db.execute('INSERT OR IGNORE INTO safety_events VALUES(?,?,?,?,?,?,NULL)',(body.id,identity['id'],identity['child'],body.kind,body.domain,time.time()))
            return {'id':body.id,'notification':'seen' if previous and previous['seen'] else 'inbox_queued','push_delivered':False}

    @app.get('/api/family/alerts')
    def alerts(owner=Depends(parent)):
        with connect() as db:
            return [dict(r) for r in db.execute('SELECT e.*,c.name FROM safety_events e JOIN children c ON c.id=e.child WHERE c.parent=? AND e.created>? ORDER BY created DESC LIMIT 100',(owner,time.time()-30*86400))]

    @app.post('/api/family/alerts/{identifier}/seen')
    def seen(identifier: str, owner=Depends(parent)):
        with connect() as db:
            row=db.execute('SELECT e.id FROM safety_events e JOIN children c ON c.id=e.child WHERE e.id=? AND c.parent=?',(identifier,owner)).fetchone()
            if not row: raise HTTPException(404,'Alert not found.')
            db.execute('UPDATE safety_events SET seen=COALESCE(seen,?) WHERE id=?',(time.time(),identifier))
        return {'seen':True}
