"""Real PostgreSQL checks; CI provisions an isolated PostgreSQL service."""
import concurrent.futures
import os
import time
import uuid

import pytest
from fastapi.testclient import TestClient
from backend.family_database import Database
from backend.family_service import create_app
from backend.family_serverless import FamilyAPI
from backend.tests import test_family as cases

URL = os.getenv('BLUEY_TEST_POSTGRES_URL')
if os.getenv('BLUEY_REQUIRE_POSTGRES_TESTS') == '1' and not URL:
    raise RuntimeError('PostgreSQL validation was required but no test database was supplied.')
pytestmark = pytest.mark.skipif(not URL, reason='Dedicated PostgreSQL CI job supplies disposable storage')


@pytest.fixture
def store():
    import psycopg
    from psycopg import sql
    schema = 'bluey_test_' + uuid.uuid4().hex
    db = Database(URL, schema)
    def worker():
        client = TestClient(create_app(URL, 'gateway-test', 'invite-test', schema=schema))
        client.headers['X-Bluey-Gateway'] = 'gateway-test'
        return client
    yield db, worker, schema
    with psycopg.connect(URL, autocommit=True) as conn:
        conn.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(schema)))


@pytest.mark.parametrize('scenario', [cases.test_gateway_and_roles, cases.test_policy_versioning_normalization, cases.test_request_approval_single_grant_and_owner])
def test_existing_family_contract_on_postgres(store, scenario):
    db, worker, _ = store
    scenario((worker(), None))


def test_restart_persistence_cross_worker_races_and_precision(store):
    db, worker, _ = store
    first = worker()
    parent = cases.parent(first)
    child = cases.child(first,parent)
    second = worker()  # New app / connection factory, same durable database.
    assert second.get('/api/family/dashboard',headers=parent).json()['children'][0]['id'] == child['id']
    enrollment = first.post(f"/api/family/children/{child['id']}/enrollment",headers=parent,json={}).json()['code']
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda api:api.post('/api/family/enroll',json={'code':enrollment}),[first,second]))
    assert sorted(r.status_code for r in responses) == [200,403]
    with db.connect() as connection:
        expires = connection.execute("SELECT expires FROM sessions WHERE role='parent'").fetchone()[0]
        assert abs(expires-time.time()-43200) < 10  # float4 would lose ~minutes.
    policy = {**child['policy'], 'allowed_domains':['x.com'], 'daily_minutes':45}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda api:api.put(f"/api/family/children/{child['id']}/policy",headers=parent,json=policy).status_code,[first,second]))
    assert sorted(results) == [200,409]
    assert worker().get('/api/family/dashboard',headers=parent).json()['children'][0]['policy']['allowed_domains'] == ['x.com']
    assert first.post('/api/family/auth/register', json={'username':'parent','password':'safe-test-password','invite':'invite-test'}).status_code == 409


def test_hosted_api_full_agent_and_parent_inbox_flow(store):
    db, _, schema = store
    def worker():
        return TestClient(FamilyAPI({'DATABASE_URL':URL, 'BLUEY_FAMILY_SETUP_INVITE':'invite-test'},
            factory=lambda url,key,invite:create_app(url,key,invite,schema=schema)),base_url='https://bluey.example')
    first = worker()
    parent = cases.parent(first)
    child = cases.child(first,parent)
    code = first.post(f"/api/family/children/{child['id']}/agent-enrollment", headers=parent, json={}).json()['code']
    second = worker()
    enrolled = second.post('/api/family/agent/enroll',json={'code':code})
    assert enrolled.status_code == 200,enrolled.text
    agent = {'Authorization':'Bearer '+enrolled.json()['token']}
    assert second.get('/api/family/dashboard',headers=agent).status_code == 403
    policy = second.get('/api/family/agent/policy',headers=agent).json()
    assert 'x.com' in policy['website_rules']['blocked']
    assert second.post('/api/family/agent/report', headers=agent, json={'policy_version':0,'used_seconds':120,'day':policy['day'],'time_service':True,'edge_rules':True}).status_code == 200
    event = {'id':str(uuid.uuid4()), 'kind':'site_blocked', 'domain':'x.com'}
    for _ in range(2):
        assert second.post('/api/family/agent/events',headers=agent,json=event).status_code == 200
    inbox = first.get('/api/family/alerts',headers=parent).json()
    assert len(inbox) == 1
    assert first.post(f"/api/family/alerts/{event['id']}/seen",headers=parent,json={}).status_code == 200
    assert second.post('/api/family/agent/events',headers=agent,json=event).json()['notification'] == 'seen'
    other = cases.parent(first,'other')
    assert first.get('/api/family/alerts',headers=other).json() == []
    assert first.delete(f"/api/family/children/{child['id']}",headers=parent).status_code == 200
    assert second.get('/api/family/agent/policy',headers=agent).status_code == 401


def test_private_schema_and_rls_deny_supabase_client_roles(store):
    import psycopg
    from psycopg import sql
    db, worker, schema = store
    api = worker()
    parent = cases.parent(api)
    cases.child(api, parent)
    # This fixture is disposable PostgreSQL CI, never the live Supabase project.
    with psycopg.connect(URL, autocommit=True) as admin:
        if admin.execute("SELECT 1 FROM pg_roles WHERE rolname='anon'").fetchone():
            pytest.skip('Refusing to modify a pre-existing client role')
        admin.execute('CREATE ROLE anon NOLOGIN NOSUPERUSER')
    try:
        with db.connect() as connection:
            raw = connection.db
            raw.execute(sql.SQL('GRANT USAGE ON SCHEMA {} TO anon').format(sql.Identifier(schema)))
            raw.execute(sql.SQL('GRANT SELECT ON TABLE {} TO anon').format(sql.Identifier(schema,'parents')))
            raw.execute('SET LOCAL ROLE anon')
            # Even an accidental SELECT grant cannot expose password/session rows.
            assert raw.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(schema,'parents'))).fetchall() == []
        restarted = worker()  # Idempotently removes accidental client grants.
        assert len(restarted.get('/api/family/dashboard', headers=parent).json()['children']) == 1
        with db.connect() as connection:
            raw = connection.db
            assert not raw.execute('SELECT has_schema_privilege(%s,%s,%s) AS granted',('anon',schema,'USAGE')).fetchone()['granted']
            rows = raw.execute('SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relkind=%s',(schema,'r')).fetchall()
            assert len(rows) == 10 and all(row['relrowsecurity'] for row in rows)
    finally:
        with psycopg.connect(URL, autocommit=True) as admin:
            admin.execute('DROP OWNED BY anon')
            admin.execute('DROP ROLE anon')


@pytest.mark.parametrize('scenario', [
    'test_midnight_request_expires_and_new_request_is_allowed',
    'test_timezone_change_expires_pending_request',
    'test_agent_usage_is_reported_not_verified_and_never_faked_as_zero',
    'test_agent_credential_expiry_is_metadata_not_a_secret',
])
def test_reliability_contract_on_postgres(store, monkeypatch, scenario):
    from backend.tests import test_family_reliability as reliability
    _, worker, _ = store
    getattr(reliability, scenario)((worker(), None), monkeypatch)
