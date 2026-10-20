from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
import uuid
import pytest
from fastapi.testclient import TestClient
from backend.family_service import create_app, Policy
from backend.enforcement_policy import Budget, bedtime
from backend.tests.test_family import parent, child, enroll

def stamp(text): return datetime.fromisoformat(text).replace(tzinfo=timezone.utc).timestamp()

def bundle(now,minutes=60,extra=0,version=0):
    return {'policy':Policy(version=version,daily_minutes=minutes,timezone='UTC',bedtime_start='21:00',bedtime_end='07:00').model_dump(),
            'server_time':now,'valid_until':now+86400,'day':datetime.fromtimestamp(now,timezone.utc).date().isoformat(),'extra_minutes_today':extra}

def test_budget_survives_restart_and_extra_time():
    now=stamp('2026-10-20T12:00:00'); b=Budget();b.sync(bundle(now,1),now)
    for i in range(1,60): assert b.tick(now+i,1,True)==''
    assert b.tick(now+60,1,True)=='time_limit'
    b=Budget(b.state); assert b.tick(now+61,1,True)=='time_limit'
    b.sync(bundle(now+61,1,extra=15,version=1),now+61)
    assert b.tick(now+62,1,True)==''
    assert b.state['used_seconds']==62

def test_bedtime_overnight_same_day_disabled_and_timezone():
    policy=Policy(version=0,timezone='UTC').model_dump()
    assert bedtime(policy,stamp('2026-10-20T21:00:00'))
    assert bedtime(policy,stamp('2026-10-21T06:59:59'))
    assert not bedtime(policy,stamp('2026-10-21T07:00:00'))
    policy.update(bedtime_start='12:00',bedtime_end='13:00')
    assert bedtime(policy,stamp('2026-10-20T12:30:00'))
    policy.update(bedtime_start='12:00',bedtime_end='12:00')
    assert not bedtime(policy,stamp('2026-10-20T12:30:00'))
    policy.update(timezone='America/Los_Angeles',bedtime_start='21:00',bedtime_end='07:00')
    assert bedtime(policy,stamp('2026-10-21T04:00:00'))

def test_offline_restart_clock_and_new_day():
    now=stamp('2026-10-20T12:00:00');b=Budget();assert b.tick(now,0,False)=='awaiting_policy'
    b.sync(bundle(now,0),now);assert b.tick(now+1,1,True)=='time_limit'
    assert b.tick(now+100,100,False)=='time_limit'
    assert b.tick(now-100,1,False)=='clock_error'
    b=Budget(b.state);assert b.tick(now-100,1,False)=='clock_error'
    b.sync(bundle(now+200,60),now+200);assert b.tick(now+201,1,False)==''
    assert b.tick(now+86601,86400,False)=='offline_policy_expired'
    used=b.state['used_seconds'];assert used==1
    b.sync(bundle(now+86602),now+86602);assert b.state['used_seconds']==0

def test_invalid_clock_and_allowances_rejected():
    now=stamp('2026-10-20T12:00:00');b=Budget()
    for candidate in [{**bundle(now),'day':'2026-10-19'},{**bundle(now),'valid_until':now+86401},{**bundle(now),'extra_minutes_today':999999}]:
        with pytest.raises(ValueError):b.sync(candidate,now)
    with pytest.raises(ValueError):b.sync(bundle(now),now-121)

@pytest.fixture
def api(tmp_path):
    client=TestClient(create_app(str(tmp_path/'family.db'),'gateway-test','invite-test'))
    client.headers['X-Bluey-Gateway']='gateway-test'
    return client

def agent(api,p,c):
    code=api.post(f"/api/family/children/{c['id']}/agent-enrollment",headers=p).json()['code']
    response=api.post('/api/family/agent/enroll',json={'code':code});assert response.status_code==200,response.text
    return {'Authorization':'Bearer '+response.json()['token']},code

def test_agent_kid_and_parent_roles_separate(api):
    p=parent(api);c=child(api,p);k,kcode=enroll(api,p,c);a,code=agent(api,p,c)
    assert api.get('/api/family/agent/policy',headers=k).status_code==403
    assert api.get('/api/family/dashboard',headers=a).status_code==403
    assert api.post('/api/family/enroll',json={'code':code}).status_code==403
    assert api.post('/api/family/agent/enroll',json={'code':code}).status_code==403
    assert api.post('/api/family/agent/enroll',json={'code':kcode}).status_code==403
    policy=api.get('/api/family/agent/policy',headers=a).json()
    assert policy['policy']['version']==0 and policy['valid_until']-policy['server_time']==86400
    report={'policy_version':0,'used_seconds':60,'day':policy['day'],'time_service':True,'edge_rules':False}
    assert api.post('/api/family/agent/report',headers=k,json=report).status_code==403
    assert api.post('/api/family/agent/report',headers=a,json=report).status_code==200
    profile=api.get('/api/family/dashboard',headers=p).json()['children'][0]
    assert profile['agent']['recent'] and not profile['protected']
    api.delete(f"/api/family/children/{c['id']}",headers=p)
    assert api.get('/api/family/agent/policy',headers=a).status_code==401

def test_events_idempotent_and_notifications_honest(api):
    p=parent(api);other=parent(api,'other');c=child(api,p);a,_=agent(api,p,c);k,_=enroll(api,p,c)
    event={'id':str(uuid.uuid4()),'kind':'site_blocked','domain':'example.com'}
    assert api.post('/api/family/agent/events',headers=k,json=event).status_code==403
    for _ in range(2):
        response=api.post('/api/family/agent/events',headers=a,json=event).json()
        assert response['notification']=='inbox_queued' and not response['push_delivered']
    assert len(api.get('/api/family/alerts',headers=p).json())==1
    assert api.get('/api/family/alerts',headers=other).json()==[]
    path=f"/api/family/alerts/{event['id']}/seen"
    assert api.post(path,headers=other).status_code==404
    assert api.post(path,headers=k).status_code==403
    assert api.post(path,headers=p).status_code==200
    assert api.get('/api/family/kid',headers=k).json()['alerts'][0]['seen']
    assert api.post('/api/family/agent/events',headers=a,json=event).json()['notification']=='seen'

def test_one_time_agent_enrollment_under_concurrency(api):
    p=parent(api);c=child(api,p)
    code=api.post(f"/api/family/children/{c['id']}/agent-enrollment",headers=p).json()['code']
    with ThreadPoolExecutor(2) as pool:
        results=list(pool.map(lambda _:api.post('/api/family/agent/enroll',json={'code':code}).status_code,range(2)))
    assert sorted(results)==[200,403]

def test_windows_session_selection_never_targets_parent(monkeypatch):
    import sys
    from types import SimpleNamespace
    from backend.guardian_windows import sessions
    names={1:'child',2:'parent',3:'child'}
    monkeypatch.setitem(sys.modules,'win32ts',SimpleNamespace(WTSActive=0,WTSUserName=1,WTSDomainName=2,
        WTSEnumerateSessions=lambda *a:[{'SessionId':0,'State':0},{'SessionId':1,'State':0},{'SessionId':2,'State':0},{'SessionId':3,'State':4}],
        WTSQuerySessionInformation=lambda _,sid,field:names[sid] if field==1 else 'LOCAL'))
    monkeypatch.setitem(sys.modules,'win32security',SimpleNamespace(
        LookupAccountName=lambda _,name:('CHILD-SID' if name.endswith('child') else 'PARENT-SID',None,None),
        ConvertSidToStringSid=lambda sid:sid))
    assert sessions('CHILD-SID')==[1]


def test_agent_reenrollment_revokes_previous_and_extra_allowance_reaches_agent(api):
    p=parent(api);c=child(api,p);old,_=agent(api,p,c);new,_=agent(api,p,c)
    assert api.get('/api/family/agent/policy',headers=old).status_code==401
    k,_=enroll(api,p,c)
    request=api.post('/api/family/kid/requests',headers=k,json={'minutes':15}).json()
    api.post(f"/api/family/requests/{request['id']}/decision",headers=p,json={'decision':'approve'})
    assert api.get('/api/family/agent/policy',headers=new).json()['extra_minutes_today']==15

def test_policy_rollback_rejected_and_timezone_edit_keeps_usage():
    now=stamp('2026-10-20T01:00:00');b=Budget();b.sync(bundle(now,version=2),now)
    b.state['used_seconds']=100
    with pytest.raises(ValueError): b.sync(bundle(now+1,version=1),now+1)
    updated=bundle(now+1,version=3);updated['policy']['timezone']='America/Los_Angeles';updated['day']='2026-10-19'
    b.sync(updated,now+1)
    assert b.state['used_seconds']==100

def test_chunked_request_limit_cannot_be_bypassed(api):
    response=api.post('/api/family/auth/login',content=iter([b'{"username":"',b'a'*21000,b'"}']),headers={'Content-Type':'application/json'})
    assert response.status_code==413


def test_agent_browser_report_is_strict_and_legacy_compatible():
    from backend.family_agents import AgentReport
    from pydantic import ValidationError
    report = dict(policy_version=1, used_seconds=0, day='2026-10-20', time_service=True, edge_rules=True)
    assert AgentReport(**report).browser_rules == {}
    assert AgentReport(**report,browser_rules={'edge':True,'chrome':False}).browser_rules == {'edge':True,'chrome':False}
    for invalid in [{'chrome':'true'},{'firefox':True}]:
        with pytest.raises(ValidationError): AgentReport(**report,browser_rules=invalid)
