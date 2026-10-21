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
from backend.guardian_windows import standard_local_user,apply_browser_rules,browser_path,SERVICE
from backend.guardian_signin import WindowsRights, DENY_RIGHTS
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
name='BlueyGuardianCI';control='BlueyParentCI';control_created=False;created=False;profile=None;token=None;installed=False
runtime_python=sys.executable
try:
    password='Aa1!'+secrets.token_hex(20)
    win32net.NetUserAdd(None,1,{'name':name,'password':password,'priv':win32netcon.USER_PRIV_USER,
        'home_dir':'','comment':'Disposable Bluey CI account','flags':win32netcon.UF_SCRIPT,'script_path':''})
    created=True
    control_password='Aa1!'+secrets.token_hex(20)
    win32net.NetUserAdd(None,1,{'name':control,'password':control_password,'priv':win32netcon.USER_PRIV_USER,
        'home_dir':'','comment':'Disposable Bluey parent control','flags':win32netcon.UF_SCRIPT,'script_path':''})
    control_created=True
    admin_group,_,_=win32security.LookupAccountSid(None,win32security.ConvertStringSidToSid('S-1-5-32-544'))
    control_sid,_,_=win32security.LookupAccountName(None,control)
    win32net.NetLocalGroupAddMembers(None,admin_group,0,[{'sid':control_sid}])
    try: standard_local_user(control)
    except ValueError: pass
    else: raise AssertionError('Parent administrator accepted for enrollment')
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
    assert apply_browser_rules(sid_text,policy,['edge','chrome']) == {'edge':True,'chrome':True}
    for browser in ['edge','chrome']:
        with winreg.OpenKey(winreg.HKEY_USERS,browser_path(sid_text,browser,'URLAllowlist')) as key:
            assert winreg.QueryValueEx(key,'1')[0]=='x.com'
        # Prove a standard child cannot edit either managed registry rule.
        win32security.ImpersonateLoggedOnUser(token)
        try:
            try:
                key=winreg.OpenKey(winreg.HKEY_USERS,browser_path(sid_text,browser),0,winreg.KEY_SET_VALUE)
            except PermissionError: pass
            else: key.Close();raise AssertionError(f'Child could write {browser} policy')
        finally: win32security.RevertToSelf()
    root.mkdir();data.mkdir();status.mkdir()
    for folder in (root,data,status):
        grants=['*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']
        if folder==status: grants.append('*S-1-5-32-545:(OI)(CI)RX')
        subprocess.run(['icacls',str(folder),'/inheritance:r','/grant:r',*grants],check=True,stdout=subprocess.DEVNULL)
    repo=Path(__file__).resolve().parent.parent
    shutil.copytree(repo/'backend',root/'backend',ignore=shutil.ignore_patterns('__pycache__'))
    shutil.copy(repo/'guardian'/'service_entry.py',root/'service_entry.py')
    # Exercise Windows' venv redirector as used by the real installer; reuse CI
    # dependencies to avoid a second network install, not a different interpreter.
    command([sys.executable,'-I','-m','venv','--system-site-packages',str(root/'runtime')])
    runtime_python=str(root/'runtime'/'Scripts'/'python.exe')
    config=data/'config.json'
    config.write_text(json.dumps({'sid':sid_text,'username':name,'origin':'https://127.0.0.1:9','token':'ci-only-invalid-token','browsers':['edge','chrome'],'signin_blocking':True,'native_warnings':True}))
    now=time.time();budget=Budget();budget.sync({'policy':policy,'day':datetime.now(timezone.utc).date().isoformat(),'extra_minutes_today':0,'server_time':now,'valid_until':now+86400},now)
    (data/'usage.json').write_text(json.dumps(budget.state))
    installed=True
    command([runtime_python,'-I',str(root/'service_entry.py'),'install','--config',str(config)])
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        try:
            report=json.loads((status/'status.json').read_text())
            if report.get('browser_rules') == {'edge':True,'chrome':True} and report['applied_version']==1 and report.get('signin_state')=='allowed':break
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
    def await_signin(expected):
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            try:
                value=json.loads((status/'status.json').read_text())
                if value.get('signin_state')==expected and time.time()-value['updated_at']<3:
                    return value
            except (OSError,ValueError):pass
            time.sleep(.25)
        raise AssertionError('Windows sign-in state did not become '+expected)

    def restart_with_usage(seconds, extra=0):
        win32serviceutil.StopService(SERVICE)
        win32serviceutil.WaitForServiceStatus(SERVICE,win32service.SERVICE_STOPPED,30)
        state=json.loads((data/'usage.json').read_text())
        state['used_seconds']=seconds
        state['bundle']['extra_minutes_today']=extra
        (data/'usage.json').write_text(json.dumps(state))
        # Delete only the disposable public heartbeat so a previous state cannot
        # satisfy the assertion before the restarted service has performed work.
        (status/'status.json').unlink(missing_ok=True)
        win32serviceutil.StartService(SERVICE)

    def logon_denied():
        try:
            unexpected=win32security.LogonUser(name,'.',password,win32con.LOGON32_LOGON_INTERACTIVE,win32con.LOGON32_PROVIDER_DEFAULT)
        except win32security.error as error:
            assert error.winerror==1385, error  # ERROR_LOGON_TYPE_NOT_GRANTED
        else:
            unexpected.Close()
            raise AssertionError('Restricted child could perform a new interactive Windows logon')

    restart_with_usage(720*60)
    await_signin('blocked')
    logon_denied()
    rights=WindowsRights()
    try:
        assert DENY_RIGHTS <= rights.read(sid_text)
        assert not DENY_RIGHTS & rights.read(win32security.ConvertSidToStringSid(control_sid))
    finally:rights.close()
    parent_token=win32security.LogonUser(control,'.',control_password,win32con.LOGON32_LOGON_INTERACTIVE,win32con.LOGON32_PROVIDER_DEFAULT)
    parent_token.Close()
    restart_with_usage(720*60)  # persisted deny survives service restart
    await_signin('blocked');logon_denied()
    restart_with_usage(720*60, extra=15)
    await_signin('allowed')
    restored=win32security.LogonUser(name,'.',password,win32con.LOGON32_LOGON_INTERACTIVE,win32con.LOGON32_PROVIDER_DEFAULT)
    restored.Close()
    restart_with_usage(720*60)
    await_signin('blocked');logon_denied()
    win32serviceutil.StopService(SERVICE)
    win32serviceutil.WaitForServiceStatus(SERVICE,win32service.SERVICE_STOPPED,30)
    win32profile.UnloadUserProfile(token,profile);profile=None
    # Recovery must unblock LSA BEFORE demanding a loaded child browser hive.
    incomplete=subprocess.run([runtime_python,'-I',str(root/'service_entry.py'),'recover','--config',str(config)],capture_output=True,text=True,timeout=60)
    assert incomplete.returncode != 0 and config.exists()
    assert 'profile is unloaded' in incomplete.stdout+incomplete.stderr
    restored=win32security.LogonUser(name,'.',password,win32con.LOGON32_LOGON_INTERACTIVE,win32con.LOGON32_PROVIDER_DEFAULT)
    restored.Close()
    profile=win32profile.LoadUserProfile(token,{'UserName':name})
    print('Windows: real LSA new-logon denial, restart persistence, parent logon isolation, extra-time unlock and offline unloaded-hive recovery passed. Interactive Hello/PIN/reconnect and screen rendering are not tested.')
    print('Windows: real service startup, cached policy, registry ACL, child stop denial and heartbeat passed. No interactive-session disconnect test performed.')
finally:
    win32security.RevertToSelf()
    if installed:
        command([runtime_python,'-I',str(root/'service_entry.py'),'recover','--config',str(data/'config.json')])
        assert not (data/'config.json').exists()
        for browser in ['edge','chrome']:
            for kind in ('URLAllowlist','URLBlocklist'):
                try:
                    with winreg.OpenKey(winreg.HKEY_USERS,browser_path(sid_text,browser,kind)): pass
                except FileNotFoundError: pass
                else: raise AssertionError(f'Recovery left {browser} rules installed')
    elif profile:
        for browser in ['edge','chrome']:
            for kind in ('URLAllowlist','URLBlocklist'):
                try:winreg.DeleteKeyEx(winreg.HKEY_USERS,browser_path(sid_text,browser,kind),winreg.KEY_WOW64_64KEY)
                except FileNotFoundError:pass
    if profile:win32profile.UnloadUserProfile(token,profile)
    if token:token.Close()
    if created:win32net.NetUserDel(None,name)
    if control_created:win32net.NetUserDel(None,control)
    for folder in (root,data,status):
        if folder.exists():shutil.rmtree(folder)
print('Windows parent recovery and cleanup passed.')
