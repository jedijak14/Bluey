"""Disposable Windows CI checks for local parent recovery and setup preflight.
Does not automate or approve UAC, install on a family PC, or contact production.
"""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import traceback

if sys.platform != 'win32' or os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Only run on an isolated Windows GitHub-hosted runner.')
def error(kind, value, tb):
    text = ''.join(traceback.format_exception(kind, value, tb))
    print('::error::'+text.replace('%','%25').replace('\r','%0D').replace('\n','%0A'), flush=True)
    sys.__excepthook__(kind, value, tb)
sys.excepthook = error
repo = Path(__file__).resolve().parent.parent
ps = str(Path(os.environ['SystemRoot'])/'System32/WindowsPowerShell/v1.0/powershell.exe')
root = Path(os.environ['ProgramFiles'])/'Bluey Guardian'
data = Path(os.environ['ProgramData'])/'Bluey Guardian'
status = Path(os.environ['ProgramData'])/'Bluey Guardian Status'
folders = [root, data, status]
assert not any(folder.exists() for folder in folders), 'Refusing existing installation'
assert subprocess.run([ps,'-NoProfile','-Command',"if(Get-Service BlueyGuardian -ErrorAction SilentlyContinue){exit 1}"],timeout=20).returncode == 0

def invoke(script, *args):
    return subprocess.run([ps,'-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',str(repo/'guardian'/script),*args],capture_output=True,text=True,timeout=45)

def acl(folder):
    return subprocess.check_output([ps,'-NoProfile','-Command',f"(Get-Acl -LiteralPath '{folder}').Sddl"],text=True,timeout=20).strip()

# Parse the interactive wizard without ever starting it in unattended CI.
parse = subprocess.run([ps,'-NoProfile','-Command',f"$e=$null; $t=$null; [System.Management.Automation.Language.Parser]::ParseFile('{repo / 'guardian' / 'Setup-Guardian.ps1'}',[ref]$t,[ref]$e)|Out-Null; if($e.Count){{$e|Out-String|Write-Host;exit 1}}"],capture_output=True,text=True,timeout=20)
assert parse.returncode == 0, parse.stdout + parse.stderr
result = invoke('Install-Guardian.ps1','-ChildAccount','CI-no-such-child','-Python','C:\\no-such-python.exe','-FamilyOrigin','https://127.0.0.1:9','-AcceptExperimentalEnforcement')
assert result.returncode != 0 and not any(folder.exists() for folder in folders), 'Failed preflight left privileged directories'
created = []
backups = []
before = {folder: set(folder.parent.glob(folder.name+'.recovered-*')) for folder in folders}
try:
    for folder in folders:
        folder.mkdir(); created.append(folder)
        subprocess.run(['icacls',str(folder),'/inheritance:r','/grant:r','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F'],check=True,capture_output=True)
        (folder/'ci-sentinel.txt').write_text('owned-by-disposable-ci')
    expected = {folder: acl(folder) for folder in folders}
    config = data/'config.json'; config.write_text('{"ci":true}')
    result = invoke('Recover-Guardian.ps1','-ArchiveInstallation')
    assert result.returncode != 0 and config.exists(), 'Recovery discarded unresolved enrollment'
    assert all(folder.exists() for folder in folders)
    config.unlink()  # Only our intentionally incomplete fixture.
    result = invoke('Recover-Guardian.ps1','-ArchiveInstallation')
    assert result.returncode == 0, result.stdout + result.stderr
    for folder in folders:
        matches = set(folder.parent.glob(folder.name+'.recovered-*')) - before[folder]
        backups.extend(matches)
        assert len(matches) == 1 and not folder.exists()
        backup = next(iter(matches))
        assert (backup/'ci-sentinel.txt').read_text() == 'owned-by-disposable-ci'
        assert acl(backup) == expected[folder], 'Archive changed private directory ACL'
    result = invoke('Recover-Guardian.ps1','-ArchiveInstallation')
    assert result.returncode == 0, 'Recovery retry was not idempotent'
finally:
    for folder in folders:
        backups.extend(set(folder.parent.glob(folder.name+'.recovered-*')) - before[folder])
    for folder in set(created + backups):
        if folder.exists(): shutil.rmtree(folder)
print('Setup parser, unavailable-service preflight, unresolved-config retention, protected archive and retry passed. Interactive UAC/installer not tested.')
