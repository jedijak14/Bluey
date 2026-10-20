import concurrent.futures
import sqlite3
import time
import pytest
from fastapi.testclient import TestClient
from backend.family_service import create_app, digest, Policy, domain

@pytest.fixture
def family(tmp_path):
    path=tmp_path/'family.sqlite'
    api=TestClient(create_app(str(path),'gateway-test','invite-test'))
    api.headers['X-Bluey-Gateway']='gateway-test'
    return api,path

def parent(api,name='parent'):
    r=api.post('/api/family/auth/register',json={'username':name,'password':'safe-test-password','invite':'invite-test'})
    assert r.status_code==200,r.text
    return {'Authorization':'Bearer '+r.json()['token']}

def child(api,auth):
    r=api.post('/api/family/children',headers=auth,json={'name':'Little one'})
    assert r.status_code==200,r.text
    return r.json()

def enroll(api,auth,c):
    code=api.post(f"/api/family/children/{c['id']}/enrollment",headers=auth,json={}).json()['code']
    r=api.post('/api/family/enroll',json={'code':code})
    assert r.status_code==200
    return {'Authorization':'Bearer '+r.json()['token']},code

def test_gateway_and_roles(family):
    api,_=family
    assert api.get('/api/family/status',headers={'X-Bluey-Gateway':'wrong'}).status_code==401
    assert api.post('/api/family/auth/register',json={'username':'wrong','password':'safe-test-password','invite':'wrong'}).status_code==403
    p=parent(api); c=child(api,p); k,_=enroll(api,p,c)
    assert api.get('/api/family/dashboard',headers=k).status_code==403
    assert api.put(f"/api/family/children/{c['id']}/policy",headers=k,json=c['policy']).status_code==403
    assert api.get('/api/family/kid',headers=p).status_code==403
    assert not api.get('/api/family/kid',headers=k).json()['protected']
    assert api.get('/api/family/kid',headers=k).json()['used_minutes'] is None

def test_family_isolation_enrollment_replay_and_revoke(family):
    api,path=family;p=parent(api);other=parent(api,'other');c=child(api,p);k,code=enroll(api,p,c)
    assert api.post('/api/family/enroll',json={'code':code}).status_code==403
    assert not api.get('/api/family/dashboard',headers=other).json()['children']
    for suffix in ['/enrollment','/policy','']:
        method='post' if suffix=='/enrollment' else 'put' if suffix else 'delete'
        kwargs={'json':c['policy']} if suffix=='/policy' else {}
        assert getattr(api,method)(f"/api/family/children/{c['id']}"+suffix,headers=other,**kwargs).status_code==404
    newer,_=enroll(api,p,c)
    assert api.get('/api/family/kid',headers=k).status_code==401
    assert api.delete(f"/api/family/children/{c['id']}",headers=p).status_code==200
    assert api.get('/api/family/kid',headers=newer).status_code==401
    with sqlite3.connect(path) as db: assert not db.execute('SELECT * FROM enrollments').fetchall()

def test_policy_versioning_normalization(family):
    api,_=family;p=parent(api);c=child(api,p);url=f"/api/family/children/{c['id']}/policy"
    policy={**c['policy'],'blocked_domains':['https://Example.com/','example.com'],'daily_minutes':60}
    r=api.put(url,headers=p,json=policy);assert r.status_code==200
    assert r.json()['policy']['blocked_domains']==['example.com']
    assert api.put(url,headers=p,json=policy).status_code==409
    assert api.put(url,headers=p,json={**policy,'version':1,'daily_minutes':-1}).status_code==422
    for value in ['https://example.com/path','localhost','127.0.0.1','https://u:p@example.com','*.example.com']:
        with pytest.raises(ValueError):domain(value)
    with pytest.raises(ValueError):Policy(version=0,timezone='not-a-timezone')

def test_request_approval_single_grant_and_owner(family):
    api,_=family;p=parent(api);other=parent(api,'other');c=child(api,p);k,_=enroll(api,p,c)
    body={'minutes':15,'reason':'Finish a project'}
    r=api.post('/api/family/kid/requests',headers=k,json=body);assert r.status_code==200
    assert api.post('/api/family/kid/requests',headers=k,json=body).status_code==409
    url=f"/api/family/requests/{r.json()['id']}/decision"
    assert api.post(url,headers=k,json={'decision':'approve'}).status_code==403
    assert api.post(url,headers=other,json={'decision':'approve'}).status_code==404
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:api.post(url,headers=p,json={'decision':'approve'}).status_code,range(2)))
    assert sorted(results)==[200,409]
    assert api.get('/api/family/kid',headers=k).json()['extra_minutes_today']==15

def test_enrollment_expiry_hashed_storage_and_login(family):
    api,path=family;p=parent(api);c=child(api,p)
    code=api.post(f"/api/family/children/{c['id']}/enrollment",headers=p,json={}).json()['code']
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT hash FROM enrollments').fetchone()[0]==digest(code)
        assert db.execute('SELECT password FROM parents').fetchone()[0]!='safe-test-password'
        db.execute('UPDATE enrollments SET expires=?',(time.time()-1,))
    assert api.post('/api/family/enroll',json={'code':code}).status_code==403
    assert api.post('/api/family/auth/login',json={'username':'PARENT','password':'safe-test-password'}).status_code==200
    assert api.post('/api/family/auth/login',json={'username':'parent','password':'wrong-test-password'}).status_code==401
    assert api.post('/api/family/auth/logout',headers=p,json={}).status_code==200
    assert api.get('/api/family/dashboard',headers=p).status_code==401

def test_rate_limit_and_request_expiry(family):
    api,path=family;p=parent(api);c=child(api,p);k,_=enroll(api,p,c)
    r=api.post('/api/family/kid/requests',headers=k,json={'minutes':10})
    with sqlite3.connect(path) as db:db.execute('UPDATE requests SET created=?',(time.time()-3601,))
    assert api.post(f"/api/family/requests/{r.json()['id']}/decision",headers=p,json={'decision':'approve'}).status_code==409
    assert api.get('/api/family/dashboard',headers=p).json()['requests'][0]['status']=='expired'
    for _ in range(10):api.post('/api/family/auth/login',json={'username':'parent','password':'wrong-test-password'})
    assert api.post('/api/family/auth/login',json={'username':'parent','password':'safe-test-password'}).status_code==429
