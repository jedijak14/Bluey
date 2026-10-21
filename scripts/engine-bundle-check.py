"""Boot the frozen engine, verify auth and catalog without a system Python fallback."""
import json, os, secrets, subprocess, tempfile, time, urllib.request
from pathlib import Path
subprocess.run(['artifacts/engine/BlueyEngine/BlueyEngine.exe','--self-check'], check=True, timeout=120)
with tempfile.TemporaryDirectory() as folder:
    token=secrets.token_hex(32)
    env={**os.environ,'BLUEY_TOKEN':token,'BLUEY_MODEL_CONFIG':str(Path(folder)/'model.json'),
         'BLUEY_PRIVACY_PATH':str(Path(folder)/'privacy.json')}
    with open(Path(folder)/'engine.log','w+') as log:
        proc=subprocess.Popen(['artifacts/engine/BlueyEngine/BlueyEngine.exe','--port','18769'],env=env,stdout=log,stderr=log)
        try:
            deadline=time.monotonic()+90
            while True:
                try:
                    data=json.load(urllib.request.urlopen('http://127.0.0.1:18769/api/health',timeout=2))
                    assert data['platform']=='win32';break
                except OSError:
                    if time.monotonic()>deadline or proc.poll() is not None:
                        log.flush();log.seek(0);raise RuntimeError(log.read().replace(token,'[redacted]'))
                    time.sleep(.5)
            try:
                urllib.request.urlopen('http://127.0.0.1:18769/api/config')
                raise AssertionError('Unauthenticated config permitted')
            except urllib.error.HTTPError as e: assert e.code==401
            request=urllib.request.Request('http://127.0.0.1:18769/api/config',headers={'Authorization':'Bearer '+token})
            assert json.load(urllib.request.urlopen(request))['provider']=='ollama'
            print('Frozen Windows engine boot and authentication passed; no system Python required.')
        finally:
            proc.terminate();proc.wait(timeout=15)
