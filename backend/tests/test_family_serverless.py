from fastapi.testclient import TestClient
from backend.family_serverless import FamilyAPI
from backend.family_service import create_app
from backend.family_database import postgres_sql, Row


def test_unconfigured_and_ephemeral_storage_refused():
    client = TestClient(FamilyAPI({}))
    assert client.get('/api/family/status').json()['setup_required'] == 'database'
    assert client.post('/api/family/auth/login', json={}).status_code == 503
    assert TestClient(FamilyAPI({'DATABASE_URL':'/tmp/family.db'})).get('/api/family/status').status_code == 503


def test_public_boundary_preserves_roles_and_old_client_error_shape(tmp_path):
    # SQLite stands in for storage here. PostgreSQL is exercised in its own CI job.
    api = FamilyAPI({'DATABASE_URL':'postgresql://test.invalid/family', 'BLUEY_FAMILY_SETUP_INVITE':'invite-test'},
        factory=lambda location,gateway,invite: create_app(str(tmp_path/'family.db'),gateway,invite))
    client = TestClient(api, base_url='https://bluey.example')
    assert client.get('/api/family/status', headers={'Origin':'https://evil.example'}).status_code == 403
    assert client.get('/api/family/status', headers={'Origin':'https://bluey.example.evil.test'}).status_code == 403
    for origin in ['https://bluey.example','https://localhost']:
        response = client.options('/api/family/kid', headers={'Origin':origin})
        assert response.status_code == 204
        assert response.headers['access-control-allow-origin'] == origin
    assert client.get('/api/family/agent/policy',headers={'X-Bluey-Gateway':'anything'}).status_code == 401
    assert client.get('/api/family/dashboard').json()['error']
    assert client.post('/api/family/status').status_code == 405
    assert client.get('/api/family/../../secrets').status_code == 404
    assert client.post('/api/family/auth/register', content=b'x'*20001).status_code == 413
    assert client.post('/api/family/auth/register', json={'password':'do-not-echo'}).json() == {'error':'Invalid family request. Check the supplied fields.'}
    auth = client.post('/api/family/auth/register', json={'username':'parent','password':'safe-test-password','invite':'invite-test'})
    assert auth.status_code == 200,auth.text
    parent = {'Authorization':'Bearer '+auth.json()['token']}
    child = client.post('/api/family/children', headers=parent, json={'name':'Kid'}).json()
    code = client.post(f"/api/family/children/{child['id']}/enrollment", headers=parent, json={}).json()['code']
    token = client.post('/api/family/enroll', json={'code':code}).json()['token']
    kid = {'Authorization':'Bearer '+token}
    assert client.get('/api/family/dashboard', headers=kid).status_code == 403
    status = client.get('/api/family/kid',headers=kid)
    assert status.headers['cache-control'] == 'no-store'
    assert status.json()['protected'] is False
    assert 'x.com' in status.json()['website_rules']['blocked']
    assert client.post('/api/family/auth/logout',headers=parent,json={}).status_code == 200
    assert client.get('/api/family/dashboard', headers=parent).status_code == 401


def test_failed_database_does_not_leak_and_can_retry(tmp_path):
    calls = []
    def factory(location, gateway, invite):
        calls.append(True)
        if len(calls) == 1: raise RuntimeError('secret-database-password')
        return create_app(str(tmp_path/'retry.db'),gateway,invite)
    client = TestClient(FamilyAPI({'DATABASE_URL':'postgresql://test.invalid/db'},factory=factory))
    failed = client.get('/api/family/status')
    assert failed.status_code == 503
    assert 'secret-database-password' not in failed.text
    assert client.get('/api/family/status').json()['status'] == 'ready'


def test_postgres_translation_and_row_compatibility():
    assert 'DOUBLE PRECISION' in postgres_sql('CREATE TABLE sessions (expires REAL);')
    assert postgres_sql('BEGIN IMMEDIATE') == 'SELECT 1'
    assert postgres_sql('INSERT OR IGNORE INTO events VALUES(?)') == 'INSERT INTO events VALUES(%s) ON CONFLICT DO NOTHING'
    assert Row({'sum':15})[0] == 15
    assert dict(Row({'sum':15})) == {'sum':15}


def test_existing_https_host_mode_keeps_server_secret_private(monkeypatch):
    import httpx
    original = httpx.AsyncClient
    seen = []
    def upstream(request):
        seen.append(request)
        assert request.url == 'https://family.example/api/family/kid'
        assert request.headers['x-bluey-gateway'] == 'server-only-test-secret'
        assert request.headers['authorization'] == 'Bearer kid-token'
        return httpx.Response(200,json={'protected':False})
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kwargs:original(**kwargs,transport=httpx.MockTransport(upstream)))
    api = TestClient(FamilyAPI({'BLUEY_FAMILY_SERVICE_URL':'https://family.example','BLUEY_FAMILY_GATEWAY_TOKEN':'server-only-test-secret'}))
    response = api.get('/api/family/kid',headers={'Authorization':'Bearer kid-token','X-Bluey-Gateway':'forged'})
    assert response.json() == {'protected':False}
    assert 'server-only-test-secret' not in response.text
    assert len(seen) == 1


def test_existing_host_redirects_and_invalid_configuration_fail_closed(monkeypatch):
    import httpx
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kwargs:original(**kwargs,transport=httpx.MockTransport(lambda request:httpx.Response(302,headers={'Location':'https://evil.example'},json={}))))
    for url in ['https://family.example', 'https://[bad', 'http://insecure.example', 'https://user:pass@family.example']:
        api=TestClient(FamilyAPI({'BLUEY_FAMILY_SERVICE_URL':url,'BLUEY_FAMILY_GATEWAY_TOKEN':'test'}))
        assert api.get('/api/family/status').status_code == 503
