"""Experimental Windows service: session disconnection + per-user Edge policies.

No HTTP listener, arbitrary commands, hidden installation, or child-facing admin
credentials. Install/recover only with the explicit administrator setup script.
"""
import json
import os
from pathlib import Path
import sys
import time
import uuid
from urllib.parse import urlsplit

from .enforcement_policy import Budget
from .website_rules import build_rules, BLOCKLIST_VERSION

SERVICE = 'BlueyGuardian'


def save(path, value):
    temporary = path.with_suffix('.new')
    with temporary.open('w', encoding='utf8') as file:
        json.dump(value, file)
        file.flush()
        os.fsync(file.fileno())
    os.replace(temporary, path)


def standard_local_user(name):
    import win32net
    import win32security
    import win32api
    if not name or any(c in name for c in '\\/@'):
        raise ValueError('Choose a local standard Windows account name.')
    info = win32net.NetUserGetInfo(None, name, 1)
    sid, _, _ = win32security.LookupAccountName(None, win32api.GetComputerName()+'\\'+name)
    groups = win32net.NetUserGetLocalGroups(None, name, 0, 1)
    admin_sid = win32security.ConvertStringSidToSid('S-1-5-32-544')
    for group in groups:
        group_sid, _, _ = win32security.LookupAccountName(None, group)
        if group_sid == admin_sid:
            raise ValueError('The child must NOT be an administrator. Use a separate parent administrator account.')
    if info['priv'] == 2:
        raise ValueError('Administrator accounts cannot be enrolled.')
    return win32security.ConvertSidToStringSid(sid)


def sessions(sid):
    import win32ts
    import win32security
    found = []
    for session in win32ts.WTSEnumerateSessions(None, 1, 0):
        identifier = session['SessionId']
        if identifier == 0 or session['State'] != win32ts.WTSActive:
            continue
        user = win32ts.WTSQuerySessionInformation(None, identifier, win32ts.WTSUserName)
        domain = win32ts.WTSQuerySessionInformation(None, identifier, win32ts.WTSDomainName)
        if not user: continue
        actual, _, _ = win32security.LookupAccountName(None, domain+'\\'+user)
        if win32security.ConvertSidToStringSid(actual) == sid:
            found.append(identifier)
    return found


def edge_path(sid, kind="URLBlocklist"):
    if kind not in {"URLBlocklist", "URLAllowlist"}: raise ValueError("Unsupported policy key.")
    return sid + "\\Software\\Policies\\Microsoft\\Edge\\" + kind


def write_edge_list(sid, domains, kind):
    import winreg
    import win32security
    # Never load an arbitrary hive or apply a machine-wide rule affecting parents.
    # An unloaded child's hive is retried when that child logs in.
    with winreg.OpenKey(winreg.HKEY_USERS, sid): pass
    with winreg.CreateKeyEx(winreg.HKEY_USERS, edge_path(sid, kind), 0, winreg.KEY_ALL_ACCESS) as key:
        system = win32security.ConvertStringSidToSid('S-1-5-18')
        administrators = win32security.ConvertStringSidToSid('S-1-5-32-544')
        child = win32security.ConvertStringSidToSid(sid)
        acl = win32security.ACL()
        for principal, access in [(system,winreg.KEY_ALL_ACCESS),(administrators,winreg.KEY_ALL_ACCESS),(child,winreg.KEY_READ)]:
            acl.AddAccessAllowedAce(win32security.ACL_REVISION, access, principal)
        win32security.SetSecurityInfo(int(key), win32security.SE_REGISTRY_KEY,
            win32security.DACL_SECURITY_INFORMATION | win32security.OWNER_SECURITY_INFORMATION | win32security.PROTECTED_DACL_SECURITY_INFORMATION,
            system, None, acl, None)
        wanted = {str(i+1): name for i,name in enumerate(domains)}
        actual = {}
        for i in range(winreg.QueryInfoKey(key)[1]):
            name, value, kind = winreg.EnumValue(key, i)
            actual[name] = value if kind == winreg.REG_SZ else None
        for name in actual.keys()-wanted.keys(): winreg.DeleteValue(key,name)
        for name,value in wanted.items():
            if actual.get(name)!=value: winreg.SetValueEx(key,name,0,winreg.REG_SZ,value)
        return True


def edge_rules(sid, policy):
    rules=build_rules(policy)
    # Clear old exceptions first; a partial failure must not preserve a revoked
    # allowlist exception. Reapply blocks before restoring approved exceptions.
    write_edge_list(sid, [], 'URLAllowlist')
    write_edge_list(sid, rules['blocked'], 'URLBlocklist')
    write_edge_list(sid, rules['allowed'], 'URLAllowlist')
    return True


class Gateway:
    def __init__(self, origin, token=''):
        import httpx
        url=urlsplit(origin)
        if url.scheme!='https' or not url.hostname or url.username or url.password or url.path not in ('','/') or url.query or url.fragment:
            raise ValueError('A public HTTPS dashboard origin is required.')
        self.origin=origin.rstrip('/')
        self.client=httpx.Client(timeout=8, trust_env=False, follow_redirects=False,
            headers={'Authorization':'Bearer '+token} if token else {})
    def call(self,path,body=None):
        response=self.client.request('GET' if body is None else 'POST',self.origin+'/api/family/'+path,json=body)
        response.raise_for_status()
        return response.json()


def run(config_path, stop):
    import win32ts
    config=json.loads(config_path.read_text())
    if standard_local_user(config['username'])!=config['sid']:
        raise RuntimeError('Account identity changed; administrator repair required.')
    gateway=Gateway(config['origin'],config['token'])
    state_path=config_path.parent/'usage.json'
    budget=Budget(json.loads(state_path.read_text()) if state_path.exists() else None)
    event_path=config_path.parent/'events.json'
    events=json.loads(event_path.read_text()) if event_path.exists() else []
    import threading
    lock=threading.RLock()
    previous=time.monotonic(); last_reason=''
    health={'edge_rules':False, 'applied_version':None}
    import win32com.shell.shell as shell
    import win32com.shell.shellcon as shellcon
    status_path=Path(shell.SHGetFolderPath(0,shellcon.CSIDL_COMMON_APPDATA,0,0))/'Bluey Guardian Status'/'status.json'

    def sync_worker():
        # Network failures never block the independent session-enforcement loop.
        while not stop(0):
            error='';edge_ok=False
            try:
                bundle=gateway.call('agent/policy')
                with lock:
                    budget.sync(bundle,time.time());save(state_path,budget.state)
            except Exception:
                error='Remote sync failed; cached policy remains until expiry.'
            with lock:
                policy=dict(budget.bundle['policy']) if budget.bundle else None
            if policy is not None:
                try: edge_ok=edge_rules(config['sid'],policy)
                except OSError: error='Child hive unavailable or Edge policy write failed.'
            with lock:
                health.update(edge_rules=edge_ok,applied_version=policy['version'] if edge_ok and policy else None)
                report={'policy_version':budget.bundle['policy']['version'] if budget.bundle else 0,
                    'day':budget.state['day'] or '1970-01-01','used_seconds':min(172800,int(budget.state['used_seconds'])),
                    'time_service':True,'edge_rules':edge_ok,'blocklist_version':BLOCKLIST_VERSION if edge_ok else '', 'error':error}
                pending=list(events[:10])
            try:
                gateway.call('agent/report',report)
                for item in pending:
                    if stop(0): break
                    gateway.call('agent/events',item)
                    with lock:
                        events[:]=[e for e in events if e['id']!=item['id']];save(event_path,events)
            except Exception: pass
            if stop(30): break
    worker=threading.Thread(target=sync_worker,daemon=True,name='family-sync')
    worker.start()
    while not stop(0):
        now=time.time();mono=time.monotonic()
        active=sessions(config['sid'])
        with lock:
            reason=budget.tick(now,mono-previous,bool(active));previous=mono
            save(state_path,budget.state)
            if reason and reason != last_reason and reason in {'time_limit','bedtime','clock_error','offline_policy_expired'}:
                events[:]=(events+[{'id':str(uuid.uuid4()),'kind':reason}])[-100:];save(event_path,events)
            last_reason=reason
            save(status_path,{'updated_at':time.time(), 'child_sid':config['sid'], 'restriction':reason,
                'edge_rules':health['edge_rules'], 'applied_version':health['applied_version'],
                'blocklist_version':BLOCKLIST_VERSION, 'verified':False})
        if reason:
            for identifier in active: win32ts.WTSDisconnectSession(None,identifier,False)
        if stop(1): break
    worker.join(timeout=2)
    if not worker.is_alive(): gateway.client.close()


def main():
    if sys.platform!='win32': raise SystemExit('Windows administrator setup required.')
    import argparse
    import win32service
    import win32serviceutil
    import win32event
    import servicemanager
    parser=argparse.ArgumentParser()
    parser.add_argument('command',choices=['enroll','install','service','recover'])
    parser.add_argument('--config',required=True,type=Path)
    parser.add_argument('--origin');parser.add_argument('--username')
    args=parser.parse_args()
    import ctypes
    if not ctypes.windll.shell32.IsUserAnAdmin(): raise SystemExit('Admin Permissions is needed')
    if args.command=='enroll':
        import getpass
        import winreg
        if args.config.exists(): raise SystemExit('Already enrolled. Recover/uninstall before changing the child.')
        sid=standard_local_user(args.username)
        # Child must have logged in once; refuse to overwrite existing managed rules.
        with winreg.OpenKey(winreg.HKEY_USERS,sid): pass
        for kind in ['URLBlocklist','URLAllowlist']:
            try:
                with winreg.OpenKey(winreg.HKEY_USERS,edge_path(sid,kind)): pass
            except FileNotFoundError: pass
            else: raise SystemExit('Existing managed Edge rules found. No settings were changed.')
        gateway=Gateway(args.origin)
        try: identity=gateway.call('agent/enroll',{'code':getpass.getpass('One-use WINDOWS enrollment code from Bluey Home: ')})
        finally: gateway.client.close()
        save(args.config,{'sid':sid,'username':args.username,'origin':args.origin,'token':identity['token']})
    elif args.command=='install':
        entry=Path(__file__).resolve().parent.parent/'service_entry.py'
        win32serviceutil.InstallService('backend.guardian_windows.Guardian',SERVICE,'Bluey Guardian (experimental)',
            startType=win32service.SERVICE_AUTO_START,exeName=sys.executable,
            exeArgs=f'-I "{entry}" service --config "{args.config}"',
            description='Parent-installed session budget and managed Edge rules for one standard child account.')
        win32serviceutil.StartService(SERVICE)
    elif args.command=='recover':
        try: win32serviceutil.StopService(SERVICE);win32serviceutil.WaitForServiceStatus(SERVICE,win32service.SERVICE_STOPPED,30)
        except Exception:
            # Never remove policy/state while a live service can reapply it.
            try:
                if win32serviceutil.QueryServiceStatus(SERVICE)[1]!=win32service.SERVICE_STOPPED: raise SystemExit('Stop the service before recovery.')
            except win32service.error as e:
                if e.winerror!=1060: raise
        if args.config.exists():
            import winreg
            config=json.loads(args.config.read_text())
            for kind in ['URLAllowlist','URLBlocklist']:
                try: winreg.DeleteKey(winreg.HKEY_USERS,edge_path(config['sid'],kind))
                except FileNotFoundError: pass
            args.config.unlink()
        try: win32serviceutil.RemoveService(SERVICE)
        except win32service.error as e:
            if e.winerror!=1060: raise
    else:
        class Guardian(win32serviceutil.ServiceFramework):
            _svc_name_=SERVICE
            _svc_display_name_='Bluey Guardian (experimental)'
            def __init__(self,argv):
                super().__init__(argv);self.event=win32event.CreateEvent(None,1,0,None)
            def SvcStop(self):
                self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
                win32event.SetEvent(self.event)
            def SvcDoRun(self):
                try: run(args.config,lambda seconds: win32event.WaitForSingleObject(self.event,int(seconds*1000))==win32event.WAIT_OBJECT_0)
                except Exception:
                    servicemanager.LogErrorMsg('Bluey Guardian stopped: configuration, storage or Windows API failure. Parent repair required.')
                    raise
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(Guardian)
        servicemanager.StartServiceCtrlDispatcher()
