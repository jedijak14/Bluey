import pytest
from fastapi.testclient import TestClient
from backend.website_rules import decide,build_rules,domain,DEFAULT_BLOCKED_DOMAINS
from backend.family_service import Policy,create_app
from backend.tests.test_family import parent,child,enroll
from backend.tests.test_guardian import agent

@pytest.mark.parametrize('host',['x.com','www.x.com','video.x.com','TWITTER.com.','www.pornhub.com','https://X.COM/'])
def test_defaults_block_without_a_model(host):
    assert decide(host,{})=='blocked'

@pytest.mark.parametrize('host',['notx.com','x.com.example.com','twitter.com.evil.example','example.com'])
def test_label_boundary_and_unlisted_are_not_safety_claims(host):
    assert decide(host,{})=='not_listed'

def test_allowlist_precedence_and_subdomain_scope():
    policy={'allowed_domains':['safe.x.com'],'blocked_domains':['deep.safe.x.com']}
    assert decide('safe.x.com',policy)=='parent_allowed'
    assert decide('deep.safe.x.com',policy)=='parent_allowed'
    assert decide('other.x.com',policy)=='blocked'
    assert 'deep.safe.x.com' not in build_rules(policy)['blocked']
    assert 'x.com' in build_rules(policy)['blocked']
    policy['allowed_domains']=['x.com']
    assert 'x.com' not in build_rules(policy)['blocked']
    assert decide('www.twitter.com',policy)=='blocked'
    assert build_rules(policy)['allowed']==['x.com']

def test_policy_normalization_and_backward_compatibility():
    old=Policy(version=0,blocked_domains=['https://Example.com/'])
    assert old.allowed_domains==[]
    updated=Policy(version=1,allowed_domains=['X.COM','https://x.com/','bücher.de'])
    assert updated.allowed_domains==['x.com','xn--bcher-kva.de']
    assert decide('bücher.de',updated.model_dump())=='parent_allowed'
    for value in ['*','*.com','localhost','127.0.0.1','https://example.com/path','https://u:p@x.com']:
        with pytest.raises(ValueError):domain(value)

def test_parent_only_allowlist_reaches_agent(tmp_path):
    api=TestClient(create_app(str(tmp_path/'f.db'),'gateway-test','invite-test'));api.headers['X-Bluey-Gateway']='gateway-test'
    p=parent(api);c=child(api,p);k,_=enroll(api,p,c);a,_=agent(api,p,c)
    url=f"/api/family/children/{c['id']}/policy"
    policy={**c['policy'],'allowed_domains':['x.com']}
    assert api.put(url,headers=k,json=policy).status_code==403
    saved=api.put(url,headers=p,json=policy)
    assert saved.status_code==200
    assert 'x.com' not in saved.json()['website_rules']['blocked']
    data=api.get('/api/family/agent/policy',headers=a).json()
    assert data['policy']['allowed_domains']==['x.com']
    assert data['website_rules']['allowed']==['x.com']
    assert 'twitter.com' in data['website_rules']['blocked']
    assert not api.get('/api/family/dashboard',headers=p).json()['children'][0]['protected']

def test_edge_adapter_orders_updates_fail_closed(monkeypatch):
    from backend import guardian_windows as windows
    calls=[]
    monkeypatch.setattr(windows,'write_edge_list',lambda sid,values,kind:calls.append((kind,values)))
    assert windows.edge_rules('child-sid',{'allowed_domains':['safe.x.com']})
    assert calls[0]==('URLAllowlist',[])
    assert calls[1][0]=='URLBlocklist' and 'x.com' in calls[1][1]
    assert calls[2]==('URLAllowlist',['safe.x.com'])
    assert windows.edge_path('S-1-5-test','URLAllowlist').endswith('Edge\\URLAllowlist')
