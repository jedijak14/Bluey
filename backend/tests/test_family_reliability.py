"""Home/Kids day boundaries, transaction races and honest agent evidence."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import sqlite3
import pytest
from backend.family_health import agent_health
from backend.family_service import Policy
from backend.tests.test_family import family, parent, child, enroll
from backend.tests.test_guardian import agent


def stamp(value):
    return datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp()


def test_midnight_request_expires_and_new_request_is_allowed(family, monkeypatch):
    api, _ = family
    # 23:59 in Los Angeles, even though UTC is already the next day.
    now = stamp('2026-10-21T06:59:00')
    monkeypatch.setattr('backend.family_service.time.time', lambda: now)
    p = parent(api); c = child(api, p); k, _ = enroll(api, p, c)
    first = api.post('/api/family/kid/requests', headers=k, json={'minutes': 15}).json()
    now += 120
    dashboard = api.get('/api/family/dashboard', headers=p).json()
    assert dashboard['requests'][0]['status'] == 'expired'
    assert api.post(f"/api/family/requests/{first['id']}/decision", headers=p, json={'decision': 'approve'}).status_code == 409
    second = api.post('/api/family/kid/requests', headers=k, json={'minutes': 30})
    assert second.status_code == 200, second.text
    assert second.json()['id'] != first['id']
    assert api.get('/api/family/kid', headers=k).json()['extra_minutes_today'] == 0


def test_timezone_change_expires_pending_request(family, monkeypatch):
    api, _ = family
    now = stamp('2026-10-21T01:00:00')
    monkeypatch.setattr('backend.family_service.time.time', lambda: now)
    p = parent(api); c = child(api, p); k, _ = enroll(api, p, c)
    api.post('/api/family/kid/requests', headers=k, json={'minutes': 15})
    updated = {**c['policy'], 'timezone': 'UTC'}
    assert api.put(f"/api/family/children/{c['id']}/policy", headers=p, json=updated).status_code == 200
    assert api.get('/api/family/kid', headers=k).json()['requests'][0]['status'] == 'expired'
    assert api.post('/api/family/kid/requests', headers=k, json={'minutes': 15}).status_code == 200


def test_concurrent_code_replacement_leaves_only_one_live_code(family):
    api, path = family
    p = parent(api); c = child(api, p)
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(lambda _: api.post(f"/api/family/children/{c['id']}/enrollment", headers=p), range(2)))
    assert all(r.status_code == 200 for r in responses)
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT count(*) FROM enrollments').fetchone()[0] == 1
    results = [api.post('/api/family/enroll', json={'code': r.json()['code']}).status_code for r in responses]
    assert sorted(results) == [200, 403]


def test_agent_usage_is_reported_not_verified_and_never_faked_as_zero(family, monkeypatch):
    api, _ = family
    now = stamp('2026-10-20T12:00:00')
    monkeypatch.setattr('backend.family_service.time.time', lambda: now)
    p = parent(api); c = child(api, p); k, _ = enroll(api, p, c)
    def profile(): return api.get('/api/family/kid', headers=k).json()
    assert profile()['agent']['state'] == 'not_enrolled'
    a, _ = agent(api, p, c)
    assert profile()['agent']['state'] == 'awaiting_report'
    policy = api.get('/api/family/agent/policy', headers=a).json()
    report = dict(policy_version=0, used_seconds=125, day=policy['day'], time_service=True, edge_rules=True, browser_rules={'edge': True, 'chrome': True})
    assert api.post('/api/family/agent/report', headers=a, json=report).status_code == 200
    result = profile()
    assert result['used_minutes'] == 2 and not result['protected']
    assert result['agent']['state'] == 'reporting'
    assert result['last_seen'] == now
    api.put(f"/api/family/children/{c['id']}/policy", headers=p, json={**c['policy'], 'daily_minutes': 30})
    assert profile()['agent']['state'] == 'policy_pending'
    now += 90
    assert profile()['agent']['state'] == 'stale'
    assert profile()['used_minutes'] is None


@pytest.mark.parametrize('change,state,usage', [
    ({'day': '2026-10-19'}, 'policy_pending', None),
    ({'time_service': False}, 'attention', None),
    ({'browser_rules': {'edge': True, 'chrome': False}}, 'attention', 2),
    ({'error': 'Remote sync failed'}, 'attention', 2),
    ({'policy_version': 0}, 'policy_pending', 2),
    ({'used_seconds': 0}, 'reporting', 0),
])
def test_health_evidence(change, state, usage):
    policy = Policy(version=1).model_dump()
    report = dict(policy_version=1, used_seconds=125, day='2026-10-20', time_service=True, edge_rules=True)
    report.update(change)
    health, minutes = agent_health({'last_seen': 100, 'report': json.dumps(report)}, policy, '2026-10-20', 101)
    assert health['state'] == state
    assert minutes == usage


def test_future_and_stale_heartbeat_are_not_current():
    report = dict(policy_version=0, used_seconds=0, day='2026-10-20', time_service=True, edge_rules=True)
    for seen in (0, 102):
        health, minutes = agent_health({'last_seen': seen, 'report': json.dumps(report)}, Policy(version=0).model_dump(), '2026-10-20', 101)
        assert health['state'] == 'stale'
        assert minutes is None


def test_agent_credential_expiry_is_metadata_not_a_secret(family, monkeypatch):
    api, _ = family
    now = stamp('2026-10-20T12:00:00')
    monkeypatch.setattr('backend.family_service.time.time', lambda: now)
    p = parent(api); c = child(api, p); a, _ = agent(api, p, c)
    profile = api.get('/api/family/dashboard', headers=p).json()['children'][0]
    assert profile['agent']['credential_expires_at'] == now + 30 * 86400
    assert a['Authorization'].removeprefix('Bearer ') not in json.dumps(profile)
    now += 30 * 86400 + 1
    assert api.get('/api/family/agent/policy', headers=a).status_code == 401
