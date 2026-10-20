"""Disposable CI-only Windows SCM/ACL/recovery checks. Never run on a family PC.
Does not create an interactive child session or disconnect any actual user.
"""
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
import traceback

def report_error(kind, value, tb):
    text=''.join(traceback.format_exception(kind,value,tb))
    print('::error::'+text.replace('%','%25').replace('\r','%0D').replace('\n','%0A'),flush=True)
    sys.__excepthook__(kind,value,tb)
sys.excepthook=report_error

def command(args):
    result=subprocess.run(args,capture_output=True,text=True,timeout=60)
    if result.returncode:
        raise RuntimeError(f'Command failed ({result.returncode}): {result.stdout} {result.stderr}')
    print(result.stdout,flush=True)

if sys.platform != 'win32' or os.getenv('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Only run on an isolated Windows GitHub-hosted test runner.')
import win32api
import win32con
import win32net
import win32netcon
import win32profile
import win32security
import win32service
import win32serviceutil
import winreg

sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from backend.guardian_windows import standard_local_user,edge_rules,edge_path,SERVICE
from backend.enforcement_policy import Budget
from backend.family_service import Policy
from datetime import datetime,timezone

root=Path(os.environ['ProgramFiles'])/'Bluey Guardian CI'
data=Path(os.environ['ProgramData'])/'Bluey Guardian CI'
status=Path(os.environ['ProgramData'])/'Bluey Guardian Status'
if any(p.exists() for p in (root,data,status)):
    raise RuntimeError('Refusing to touch existing Guardian directories.')
try: win32serviceutil.QueryServiceStatus(SERVICE)
except win32service.error as error:
    if error.winerror != 1060: raise
else: raise RuntimeError('Refusing to touch an existing Guardian service.')
name='BlueyGuardianCI';created=False;profile=None;token=None;installed=False
try:
    password='Aa1!'+secrets.token_hex(20)
    win32net.NetUserAdd(None,1,{'name':name,'password':password,'priv':win32netcon.USER_PRIV_USER,
        'home_dir':'','comment':'Disposable Bluey CI account','flags':win32netcon.UF_SCRIPT|win32netcon.UF_DONT_EXPIRE_PASS,'script_path':''})
    created=True
    group,_,_=win32security.LookupAccountSid(None,win32security.ConvertStringSidToSid('S-1-5-32-545'))
    sid,_,_=win32security.LookupAccountName(None,name)
    try:win32net.NetLocalGroupAddMembers(None,group,0,[{'sid':sid}])
    except win32net.error as error:
        if error.winerror!=1378:raise  # Some Windows images already add Users membership.
    sid_text=standard_local_user(name)
    process_token=win32security.OpenProcessToken(win32api.GetCurrentProcess(),win32con.TOKEN_ADJUST_PRIVILEGES|win32con.TOKEN_QUERY)
    for privilege in ('SeBackupPrivilege','SeRestorePrivilege'):
        win32security.AdjustTokenPrivileges(process_token,False,[(win32security.LookupPrivilegeValue(None,privilege),win32con.SE_PRIVILEGE_ENABLED)])
    token=win32security.LogonUser(name,'.',password,win32con.LOGON32_LOGON_INTERACTIVE,win32con.LOGON32_PROVIDER_DEFAULT)
    profile=win32profile.LoadUserProfile(token,{'UserName':name})
    policy=Policy(version=1,daily_minutes=720,timezone='UTC',bedtime_start='00:00',bedtime_end='00:00',allowed_domains=['x.com']).model_dump()
    edge_rules(sid_text,policy)
    with winreg.OpenKey(winreg.HKEY_USERS,edge_path(sid_text,'URLAllowlist')) as key:
        assert winreg.QueryValueEx(key,'1')[0]=='x.com'
    # Prove a standard child cannot edit the managed registry rule itself.
    win32security.ImpersonateLoggedOnUser(token)
    try:
        try:
            key=winreg.OpenKey(winreg.HKEY_USERS,edge_path(sid_text),0,winreg.KEY_SET_VALUE)
        except PermissionError: pass
        else: key.Close();raise AssertionError('Child could write the managed policy key')
    finally: win32security.RevertToSelf()
    root.mkdir();data.mkdir();status.mkdir()
    for folder in (root,data,status):
        grants=['*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']
        if folder==status: grants.append('*S-1-5-32-545:(OI)(CI)RX')
        subprocess.run(['icacls',str(folder),'/inheritance:r','/grant:r',*grants],check=True,stdout=subprocess.DEVNULL)
    repo=Path(__file__).resolve().parent.parent
    shutil.copytree(repo/'backend',root/'backend',ignore=shutil.ignore_patterns('__pycache__'))
    shutil.copy(repo/'guardian'/'service_entry.py',root/'service_entry.py')
    config=data/'config.json'
    config.write_text(json.dumps({'sid':sid_text,'username':name,'origin':'https://127.0.0.1:9','token':'ci-only-invalid-token'}))
    now=time.time();budget=Budget();budget.sync({'policy':policy,'day':datetime.now(timezone.utc).date().isoformat(),'extra_minutes_today':0,'server_time':now,'valid_until':now+86400},now)
    (data/'usage.json').write_text(json.dumps(budget.state))
    installed=True
    command([sys.executable,'-I',str(root/'service_entry.py'),'install','--config',str(config)])
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        try:
            report=json.loads((status/'status.json').read_text())
            if report['edge_rules'] and report['applied_version']==1:break
        except (OSError,ValueError):pass
        time.sleep(.5)
    else:raise AssertionError('No applied policy heartbeat from the actual Windows service')
    assert report['child_sid']==sid_text and report['verified'] is False
    assert win32serviceutil.QueryServiceStatus(SERVICE)[1]==win32service.SERVICE_RUNNING
    win32security.ImpersonateLoggedOnUser(token)
    try:
        manager=win32service.OpenSCManager(None,None,win32service.SC_MANAGER_CONNECT)
        try:
            service=win32service.OpenService(manager,SERVICE,win32service.SERVICE_STOP)
        except win32service.error as error:assert error.winerror==5
        else:win32service.CloseServiceHandle(service);raise AssertionError('Child could open service for stopping')
        finally:win32service.CloseServiceHandle(manager)
    finally:win32security.RevertToSelf()
    print('Windows: real service startup, cached policy, registry ACL, child stop denial and heartbeat passed. No interactive-session disconnect test performed.')
finally:
    win32security.RevertToSelf()
    if installed:
        command([sys.executable,'-I',str(root/'service_entry.py'),'recover','--config',str(data/'config.json')])
        assert not (data/'config.json').exists()
    elif profile:
        for kind in ('URLAllowlist','URLBlocklist'):
            try:winreg.DeleteKey(winreg.HKEY_USERS,edge_path(sid_text,kind))
            except FileNotFoundError:pass
    if profile:win32profile.UnloadUserProfile(token,profile)
    if token:token.Close()
    if created:win32net.NetUserDel(None,name)
    for folder in (root,data,status):
        if folder.exists():shutil.rmtree(folder)
print('Windows parent recovery and cleanup passed.')
