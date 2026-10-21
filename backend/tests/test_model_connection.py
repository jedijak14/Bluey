import json
import os
import httpx
import pytest
from backend.model import Model, ModelConfig
from backend.model_store import ModelStore, protect
from backend import server
from fastapi.testclient import TestClient
from backend.tests.test_backend import headers


def fake_cipher(data, decrypt=False):
    # An injectable fixture, NOT the production encryption implementation.
    return bytes(value ^ 73 for value in data)


def test_persistence_scope_and_no_secret_in_status(tmp_path):
    store = ModelStore(tmp_path/'model.json', cipher=fake_cipher)
    model = Model(store)
    cfg = ModelConfig(base_url='https://ollama.com', model='cloud-model', api_key='test-secret')
    model.configure(cfg)
    assert 'test-secret' not in store.path.read_text()
    restored = Model(store)
    assert restored.config.api_key == 'test-secret'
    assert 'test-secret' not in json.dumps(restored.status())
    restored.configure(ModelConfig(base_url='https://ollama.com/', model='cloud-model'))
    assert restored.config.api_key == 'test-secret'
    restored.configure(ModelConfig(base_url='https://another.example', model='other'))
    assert restored.config.api_key is None


def test_write_failure_keeps_active_key_and_blank_can_clear(tmp_path, monkeypatch):
    model = Model(ModelStore(tmp_path/'model.json', cipher=fake_cipher))
    model.configure(ModelConfig(api_key='original'))
    old = model.store.path.read_bytes()
    def fail(*args): raise OSError('fixture')
    with monkeypatch.context() as m:
        m.setattr(os, 'replace', fail)
        with pytest.raises(OSError): model.configure(ModelConfig(api_key='replacement'))
    assert model.config.api_key == 'original'
    assert model.store.path.read_bytes() == old
    model.configure(ModelConfig(api_key=''))
    assert Model(model.store).config.api_key is None


@pytest.mark.skipif(os.name != 'nt', reason='Real Windows DPAPI only')
def test_actual_windows_dpapi_restart(tmp_path):
    secret = b'fixture-not-a-real-key'
    encrypted = protect(secret)
    assert encrypted != secret and protect(encrypted, decrypt=True) == secret
    model = Model(ModelStore(tmp_path/'model.json'))
    model.configure(ModelConfig(api_key=secret.decode()))
    assert Model(model.store).config.api_key == secret.decode()
    assert secret not in model.store.path.read_bytes()


def test_linux_never_persists_plaintext_key(tmp_path):
    store = ModelStore(tmp_path/'model.json')
    store.cipher = None
    model = Model(store)
    model.configure(ModelConfig(api_key='private-test-key'))
    assert 'private-test-key' not in store.path.read_text()
    assert model.status()['key_storage'] == 'session_or_environment'


def client_with(monkeypatch, handler):
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(handler), **kw))


@pytest.mark.asyncio
async def test_real_auth_probe_and_keyless_local_ollama(monkeypatch, tmp_path):
    requests = []
    def handler(request):
        requests.append(request)
        if request.method == 'GET': return httpx.Response(200, json={'data':[{'id':'llama3.2:latest'}]})
        return httpx.Response(200, json={'choices':[{'message':{'content':'OK'}}]})
    client_with(monkeypatch, handler)
    model = Model(ModelStore(tmp_path/'config'))
    result = await model.test(ModelConfig())
    assert result['inference_checked']
    assert [r.url.path for r in requests] == ['/v1/models', '/v1/chat/completions']
    assert all('authorization' not in r.headers for r in requests)
    assert json.loads(requests[-1].content)['max_tokens'] == 32


@pytest.mark.asyncio
async def test_public_model_list_cannot_hide_bad_cloud_key(monkeypatch, tmp_path):
    def handler(request):
        assert request.headers['authorization'] == 'Bearer cloud-test-key'
        if request.method == 'GET': return httpx.Response(200, json={'data':[{'id':'cloud-model'}]})
        return httpx.Response(401, json={'error':'private provider detail'})
    client_with(monkeypatch, handler)
    model = Model(ModelStore(tmp_path/'config'))
    with pytest.raises(RuntimeError, match='provider rejected authentication'):
        await model.test(ModelConfig(base_url='https://ollama.com', model='cloud-model', api_key='cloud-test-key'))
    assert model.config.api_key is None


@pytest.mark.asyncio
async def test_unsupported_tools_falls_back_once_and_ignores_usage_chunk(monkeypatch, tmp_path):
    requests=[]
    def handler(request):
        body=json.loads(request.content);requests.append(body)
        if 'tools' in body: return httpx.Response(400, json={'error':'model does not support tools'})
        return httpx.Response(200, text='data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[],"usage":{}}\n\ndata: [DONE]\n\n')
    client_with(monkeypatch, handler)
    model=Model(ModelStore(tmp_path/'config'))
    assert [p async for p in model.stream([{'role':'user','content':'Hi'}])] == [{'text':'Hello'}]
    assert len(requests)==2 and 'tools' not in requests[1]
    assert model.tools_supported is False


@pytest.mark.asyncio
@pytest.mark.parametrize('code, message', [(401,'authentication'),(404,'not found'),(429,'usage limit'),(500,'temporarily unavailable')])
async def test_failures_do_not_clear_key_or_retry(monkeypatch, tmp_path, code, message):
    requests=[]
    def handler(request):
        requests.append(request)
        return httpx.Response(code,json={'error':'do not echo test-secret'})
    client_with(monkeypatch, handler)
    model=Model(ModelStore(tmp_path/'config',cipher=fake_cipher))
    model.configure(ModelConfig(api_key='test-secret'))
    with pytest.raises(RuntimeError, match=message) as error:
        _=[p async for p in model.stream([])]
    assert 'test-secret' not in str(error.value)
    assert model.config.api_key=='test-secret' and len(requests)==1


def test_config_api_is_desktop_only_and_redacted():
    api=TestClient(server.app)
    assert api.get('/api/config').status_code==401
    assert api.post('/api/config/test',json={}).status_code==401
    response=api.post('/api/config',headers=headers(),json={'api_key':'fixture-key'})
    assert response.status_code==200 and response.json()['key_configured']
    assert 'fixture-key' not in response.text
    assert 'fixture-key' not in api.get('/api/config',headers=headers()).text
    assert api.post('/api/config',headers=headers(),json={}).json()['key_configured']


def test_forget_key_requires_auth_and_clears_without_inference():
    api = TestClient(server.app)
    api.post('/api/config', headers=headers(), json={'api_key': 'forget-fixture'})
    assert api.delete('/api/config/key').status_code == 401
    assert api.delete('/api/config/key', headers=headers()).json()['key_configured'] is False
    assert server.model.config.api_key == ''


@pytest.mark.asyncio
@pytest.mark.parametrize('url,path', [('http://localhost:11434','/api/tags'),('https://ollama.com','/api/tags'),('https://ollama.com/v1/','/api/tags'),('https://example.com/proxy/api/chat','/proxy/api/tags')])
async def test_discovery_uses_ollama_catalog_without_model_or_generation(monkeypatch, tmp_path, url, path):
    requests=[]
    def handler(request):
        requests.append(request)
        assert request.method=='GET' and request.url.path==path
        return httpx.Response(200,json={'models':[{'name':'gemma3:1b'},{'name':'other:cloud'},{'name':'gemma3:1b'}]})
    client_with(monkeypatch,handler)
    model=Model(ModelStore(tmp_path/'config'))
    before=model.config.model_dump()
    result=await model.list_models(ModelConfig(base_url=url))
    assert result['models']==['gemma3:1b','other:cloud']
    assert result['inference_checked'] is False
    assert len(requests)==1 and model.config.model_dump()==before
    assert not model.store.path.exists()


@pytest.mark.asyncio
async def test_discovery_reuses_only_same_endpoint_key(monkeypatch,tmp_path):
    seen=[]
    def handler(request):
        seen.append(request.headers.get('authorization'))
        return httpx.Response(200,json={'models':[]})
    client_with(monkeypatch,handler)
    model=Model(ModelStore(tmp_path/'config',cipher=fake_cipher))
    model.configure(ModelConfig(base_url='https://ollama.com',api_key='fixture'))
    assert (await model.list_models(ModelConfig(base_url='https://ollama.com')))['models']==[]
    await model.list_models(ModelConfig(base_url='https://other.example'))
    assert seen==['Bearer fixture',None]
    assert model.config.api_key=='fixture'


@pytest.mark.asyncio
async def test_discovery_openai_and_errors_preserve_config(monkeypatch,tmp_path):
    code=200
    def handler(request):
        assert request.url.path=='/v1/models'
        return httpx.Response(code,json={'data':[{'id':'custom-model'}]})
    client_with(monkeypatch,handler)
    model=Model(ModelStore(tmp_path/'config'))
    config=ModelConfig(provider='openai',base_url='https://example.com/v1')
    assert (await model.list_models(config))['models']==['custom-model']
    code=401
    with pytest.raises(RuntimeError,match='authentication'): await model.list_models(config)
    assert not model.setup_complete


def test_discovery_route_requires_desktop_but_not_model_name(monkeypatch):
    async def catalog(config): return {'models':['actual-model'], 'inference_checked':False}
    monkeypatch.setattr(server.model,'list_models',catalog)
    api=TestClient(server.app)
    assert api.post('/api/models',json={}).status_code==401
    assert api.post('/api/models',headers=headers(),json={'provider':'ollama','base_url':'https://ollama.com'}).json()['models']==['actual-model']


def test_setup_completion_survives_restart_without_secret(tmp_path):
    store=ModelStore(tmp_path/'config',cipher=fake_cipher)
    assert not Model(store).status()['setup_complete']
    model=Model(store)
    model.configure(ModelConfig(model='picked-model'))
    restored=Model(store)
    assert restored.status()['setup_complete']
    assert restored.config.model=='picked-model'


@pytest.mark.asyncio
async def test_inference_probe_rejects_empty_success(monkeypatch,tmp_path):
    def handler(request):
        if request.method=='GET': return httpx.Response(200,json={'data':[{'id':'llama3.2'}]})
        return httpx.Response(200,json={'choices':[{'message':{'content':None}}]})
    client_with(monkeypatch,handler)
    with pytest.raises(RuntimeError,match='returned no text'):
        await Model(ModelStore(tmp_path/'config')).test(ModelConfig())
