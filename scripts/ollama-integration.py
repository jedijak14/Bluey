"""Real CPU Ollama + real Bluey HTTP/WS (no fixtures, no desktop actions).
Optional second argument runs a frozen Bluey engine instead of system Python.
The small CI-only model is NOT a replacement for the separate Gemma preview.
"""
import asyncio
import json
import os
import secrets
import subprocess
import sys
import tempfile
import time
from pathlib import Path
import httpx
from websockets.asyncio.client import connect


def ready(url, process, seconds=60):
    until=time.monotonic()+seconds
    while time.monotonic()<until:
        if process.poll() is not None:raise RuntimeError('Test service exited before becoming ready.')
        try:
            if httpx.get(url,timeout=2,trust_env=False).is_success:return
        except httpx.HTTPError:pass
        time.sleep(.5)
    raise RuntimeError('Test service startup timed out.')

async def conversation(token):
    async with connect('ws://127.0.0.1:18771/api/ws',proxy=None) as ws:
        await ws.send(json.dumps({'type':'auth','token':token}))
        assert json.loads(await ws.recv())['type']=='ready'
        await ws.send(json.dumps({'type':'chat','request':'real-ollama','messages':[{'role':'user','content':'Reply with one short greeting. Do not use tools.'}]}))
        answer=''
        async with asyncio.timeout(180):
            while True:
                event=json.loads(await ws.recv())
                if event['type']=='error':raise RuntimeError(event.get('text','Inference failed.'))
                if event['type']=='token':answer+=event['text']
                if event['type']=='done':break
        assert answer.strip(), 'Ollama returned no actual reply.'

with tempfile.TemporaryDirectory() as folder:
    base=Path(folder)
    token=secrets.token_hex(32)
    env={k:v for k,v in os.environ.items() if not k.startswith('BLUEY_')}
    env.update(OLLAMA_HOST='127.0.0.1:11435', OLLAMA_MODELS=str(base/'models'),CUDA_VISIBLE_DEVICES='-1',OLLAMA_VULKAN='0',
               BLUEY_TOKEN=token,BLUEY_MODEL_CONFIG=str(base/'model.json'),BLUEY_PRIVACY_PATH=str(base/'privacy.json'))
    processes=[]
    with open(base/'ollama.log','w+') as provider_log, open(base/'engine.log','w+') as engine_log:
        try:
            provider=subprocess.Popen([sys.argv[1],'serve'],env=env,stdout=provider_log,stderr=provider_log);processes.append(provider)
            ready('http://127.0.0.1:11435/api/tags',provider)
            subprocess.run([sys.argv[1],'pull','smollm2:135m'],env=env,check=True,timeout=480)
            engine_command = [sys.argv[2]] if len(sys.argv) > 2 else [sys.executable, '-m', 'backend.server']
            engine=subprocess.Popen([*engine_command,'--port','18771'],env=env,stdout=engine_log,stderr=engine_log);processes.append(engine)
            ready('http://127.0.0.1:18771/api/health',engine)
            with httpx.Client(base_url='http://127.0.0.1:18771',headers={'Authorization':'Bearer '+token},timeout=360,trust_env=False) as api:
                config={'provider':'ollama','base_url':'http://127.0.0.1:11435','model':'smollm2:135m'}
                catalog=api.post('/api/models',json=config);catalog.raise_for_status()
                assert config['model'] in catalog.json()['models']
                saved=api.post('/api/config',json=config);saved.raise_for_status();assert not saved.json()['key_configured']
                reply=api.post('/api/config/test',json=config);reply.raise_for_status();assert reply.json()['inference_checked']
                asyncio.run(conversation(token))
                assert api.get('/api/config').json()['setup_complete']
            print('Real Ollama: keyless catalog, saved selection, real inference probe and streamed Bluey WebSocket reply PASSED. CI-only smollm2:135m; not physical PC/model certification.')
        except Exception:
            for log in (provider_log,engine_log):
                log.flush();log.seek(0);tail=log.read()[-3500:].replace(token,'[redacted]')
                print('::error::'+tail.replace('%','%25').replace('\r','%0D').replace('\n','%0A'))
            raise
        finally:
            for process in reversed(processes):
                process.terminate()
                try:process.wait(timeout=15)
                except subprocess.TimeoutExpired:process.kill();process.wait()
