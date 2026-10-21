"""Experimental Windows service: session disconnection + per-user Edge/Chrome policies.

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
from .guardian_signin import SignInGate, recover_signin
from .guardian_screen import SessionWarnings, send_warning
from .guardian_network import NetworkGate, recover_network
from . import guardian_proxy_settings

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
    groups = win32net.NetUserGetLocalGroups(None, name, 1)
    admin_sid = win32security.ConvertStringSidToSid('S-1-5-32-544')
    for group in groups:
        group_sid, _, _ = win32security.LookupAccountName(None, group)
        if group_sid == admin_sid:
            raise ValueError('The child must NOT be an administrator. Use a separate parent administrator account.')
    if info['priv'] == 2:
        raise ValueError('Administrator accounts cannot be enrolled.')
    return win32security.ConvertSidToStringSid(sid)


def sessions(sid, include_disconnected=False):
    import win32ts
    import win32security
    found = []
    for session in win32ts.WTSEnumerateSessions(None, 1, 0):
        identifier = session['SessionId']
        if identifier == 0 or (not include_disconnected and session['State'] != win32ts.WTSActive):
            continue
        user = win32ts.WTSQuerySessionInformation(None, identifier, win32ts.WTSUserName)
        domain = win32ts.WTSQuerySessionInformation(None, identifier, win32ts.WTSDomainName)
        if not user: continue
        actual, _, _ = win32security.LookupAccountName(None, domain+'\\'+user)
        if win32security.ConvertSidToStringSid(actual) == sid:
            found.append(identifier)
    return found


def restrict_sessions(sid, active, signout):
    import win32ts
    targets = sessions(sid, include_disconnected=True) if signout else active
    for identifier in targets:
        try:
            if signout: win32ts.WTSLogoffSession(None, identifier, False)
            else: win32ts.WTSDisconnectSession(None, identifier, False)
        except win32ts.error:
            pass  # A disappearing session cannot prevent restricting the others.


BROWSER_KEYS = {"edge": r"Software\Policies\Microsoft\Edge", "chrome": r"Software\Policies\Google\Chrome"}


def managed_browsers(config):
    names = config.get('browsers', ['edge'])
    if not isinstance(names, list) or not names or any(not isinstance(name, str) or name not in BROWSER_KEYS for name in names) or len(names) != len(set(names)):
        raise ValueError('Unsupported browser configuration; administrator repair required.')
    return names


def browser_path(sid, browser, kind="URLBlocklist"):
    if browser not in BROWSER_KEYS: raise ValueError("Unsupported managed browser.")
    if kind not in {"URLBlocklist", "URLAllowlist"}: raise ValueError("Unsupported policy key.")
    return sid + "\\" + BROWSER_KEYS[browser] + "\\" + kind


def write_browser_list(sid, domains, kind, browser):
    import winreg
    import win32security
    # Never load an arbitrary hive or apply a machine-wide rule affecting parents.
    # An unloaded child's hive is retried when that child logs in.
    with winreg.OpenKey(winreg.HKEY_USERS, sid): pass
    with winreg.CreateKeyEx(winreg.HKEY_USERS, browser_path(sid, browser, kind), 0, winreg.KEY_ALL_ACCESS | winreg.KEY_WOW64_64KEY) as key:
        system = win32security.ConvertStringSidToSid('S-1-5-18')
        administrators = win32security.ConvertStringSidToSid('S-1-5-32-544')
        child = win32security.ConvertStringSidToSid(sid)
        acl = win32security.ACL()
        for principal, access in [(system,winreg.KEY_ALL_ACCESS),(administrators,winreg.KEY_ALL_ACCESS),(child,winreg.KEY_READ)]:
            acl.AddAccessAllowedAce(win32security.ACL_REVISION, access, principal)
        try:
            win32security.SetSecurityInfo(int(key), win32security.SE_REGISTRY_KEY,
                win32security.DACL_SECURITY_INFORMATION | win32security.OWNER_SECURITY_INFORMATION | win32security.PROTECTED_DACL_SECURITY_INFORMATION,
                system, None, acl, None)
        except win32security.error as error:
            raise OSError('Could not secure browser policy key.') from error
        wanted = {str(i+1): name for i,name in enumerate(domains)}
        actual = {}
        for i in range(winreg.QueryInfoKey(key)[1]):
            name, value, kind = winreg.EnumValue(key, i)
            actual[name] = value if kind == winreg.REG_SZ else None
        for name in actual.keys()-wanted.keys(): winreg.DeleteValue(key,name)
        for name,value in wanted.items():
            if actual.get(name)!=value: winreg.SetValueEx(key,name,0,winreg.REG_SZ,value)
        return True


def edge_path(sid, kind="URLBlocklist"):
    return browser_path(sid, "edge", kind)


def write_edge_list(sid, domains, kind):
    return write_browser_list(sid, domains, kind, "edge")


def browser_rules(sid, policy, browser):
    rules = build_rules(policy)
    write_browser_list(sid, [], "URLAllowlist", browser)
    write_browser_list(sid, rules['blocked'], "URLBlocklist", browser)
    write_browser_list(sid, rules['allowed'], "URLAllowlist", browser)
    return True


def apply_browser_rules(sid, policy, browsers):
    results = {}
    for browser in browsers:
        try:
            results[browser] = browser_rules(sid, policy, browser)
        except OSError:
            results[browser] = False
    return results


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


def validate_enrolled_identity(config, directory):
    try:
        if standard_local_user(config['username']) != config['sid']:
            raise ValueError('Enrolled child identity changed.')
    except Exception:
        recover_network(config, directory)
        recover_signin(config, directory)
        raise


def run(config_path, stop):
    from contextlib import ExitStack
    with ExitStack() as resources:
        _run(config_path, stop, resources)


def _run(config_path, stop, resources):
    import win32ts
    config=json.loads(config_path.read_text())
    validate_enrolled_identity(config, config_path.parent)
    if any(type(config.get(key, False)) is not bool for key in ('signin_blocking', 'native_warnings', 'strict_network', 'signout_at_cutoff')):
        raise ValueError('Invalid administrator enforcement configuration.')
    gate = None
    warnings = SessionWarnings(lambda session, reason: send_warning(session, reason, config.get('signout_at_cutoff', False)))
    gateway=Gateway(config['origin'],config['token'])
    state_path=config_path.parent/'usage.json'
    budget=Budget(json.loads(state_path.read_text()) if state_path.exists() else None)
    event_path=config_path.parent/'events.json'
    events=json.loads(event_path.read_text()) if event_path.exists() else []
    import threading
    lock=threading.RLock()
    previous=time.monotonic(); last_reason='awaiting_policy'
    browsers = managed_browsers(config)
    health={'signin_state':'starting' if config.get('signin_blocking') else 'disabled', 'native_warning':'idle', 'edge_rules':False, 'browser_rules':{b:False for b in browsers}, 'applied_version':None, 'network_state':'starting' if config.get('strict_network') else 'disabled'}
    import win32com.shell.shell as shell
    import win32com.shell.shellcon as shellcon
    status_path=Path(shell.SHGetFolderPath(0,shellcon.CSIDL_COMMON_APPDATA,0,0))/'Bluey Guardian Status'/'status.json'

    network = proxy = None
    blocked_recent = {}
    if config.get('strict_network'):
        from .guardian_proxy import Proxy
        network = NetworkGate(config['sid'], config_path.parent/'network.json')
        resources.callback(network.close)
        network.apply(False)  # fail closed BEFORE opening any privileged proxy
        def access():
            with lock:
                policy = dict(budget.bundle['policy']) if budget.bundle else None
                version = policy['version'] if policy else -1
                return policy, bool(last_reason), (version, last_reason)
        def blocked(host):
            with lock:
                now = time.monotonic()
                if now - blocked_recent.get(host, -60) < 60: return
                if len(blocked_recent) >= 256: blocked_recent.pop(next(iter(blocked_recent)))
                blocked_recent[host] = now
                events[:] = (events + [{'id':str(uuid.uuid4()), 'kind':'site_blocked', 'domain':host}])[-100:]
                save(event_path, events)
        proxy = Proxy(config['sid'], urlsplit(config['origin']).hostname, access, blocked)
        proxy.start(); resources.callback(proxy.close)

    def sync_worker():
        # Network failures never block the independent session-enforcement loop.
        while not stop(0):
            error='';results={b:False for b in browsers}
            try:
                bundle=gateway.call('agent/policy')
                with lock:
                    budget.sync(bundle,time.time());save(state_path,budget.state)
            except Exception:
                error='Remote sync failed; cached policy remains until expiry.'
            with lock:
                policy=dict(budget.bundle['policy']) if budget.bundle else None
            if policy is not None:
                results = apply_browser_rules(config['sid'], policy, browsers)
                if not all(results.values()): error='Child hive unavailable or browser policy write failed.'
                if config.get('strict_network'):
                    try: guardian_proxy_settings.apply(config['sid'], config_path.parent/'proxy.json')
                    except (OSError, ValueError): error='Strict browser proxy configuration needs parent attention.'
            with lock:
                health.update(edge_rules=results.get('edge',False), browser_rules=results, applied_version=policy['version'] if all(results.values()) and policy else None)
                report={'policy_version':budget.bundle['policy']['version'] if budget.bundle else 0,
                    'day':budget.state['day'] or '1970-01-01','used_seconds':min(172800,int(budget.state['used_seconds'])),
                    'time_service':True,'signin_state':health['signin_state'],'edge_rules':results.get('edge',False), 'browser_rules':results, 'blocklist_version':BLOCKLIST_VERSION if all(results.values()) else '', 'error':error or ('Strict network policy needs parent attention.' if health['network_state']=='error' else '')}
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
        # Revalidate the binding before ANY session or LSA mutation, not only at
        # startup. A parent-promoted/replaced account must not remain a target.
        validate_enrolled_identity(config, config_path.parent)
        active=sessions(config['sid'])
        with lock:
            reason=budget.tick(now,mono-previous,bool(active));previous=mono
            save(state_path,budget.state)
            if reason and reason != last_reason and reason in {'time_limit','bedtime','clock_error','offline_policy_expired'}:
                events[:]=(events+[{'id':str(uuid.uuid4()),'kind':reason}])[-100:];save(event_path,events)
            if network is not None:
                try:
                    # The control origin remains reachable for extra-time requests;
                    # the proxy itself refuses all other hosts while restricted.
                    health['network_state'] = network.apply(proxy.thread.is_alive())
                    if not proxy.thread.is_alive():
                        health['network_state'] = 'error'; reason = reason or 'network_unavailable'
                except (OSError, ValueError, RuntimeError):
                    health['network_state'] = 'error'; reason = reason or 'network_unavailable'
            last_reason=reason
            if config.get('signin_blocking'):
                try:
                    if gate is None:
                        gate = SignInGate(config['sid'], config_path.parent/'signin.json')
                    health['signin_state'] = gate.apply(bool(reason))
                except (OSError, ValueError, RuntimeError):
                    health['signin_state'] = 'error'
            if config.get('native_warnings'):
                health['native_warning'] = warnings.update(active, budget, now, bool(reason))
            save(status_path,{'updated_at':time.time(), 'child_sid':config['sid'], 'restriction':reason,
                'signin_state':health['signin_state'], 'native_warning':health['native_warning'],
                'network_state':health['network_state'], 'signout_at_cutoff':bool(config.get('signout_at_cutoff')),
                'edge_rules':health['edge_rules'], 'browser_rules':health['browser_rules'], 'applied_version':health['applied_version'],
                'blocklist_version':BLOCKLIST_VERSION, 'verified':False})
        if reason:
            restrict_sessions(config['sid'], active, bool(config.get('signout_at_cutoff')))
        if stop(1): break
    if gate is not None: gate.close()
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
    parser.add_argument('--enable-signin-blocking', action='store_true')
    parser.add_argument('--strict-network', action='store_true')
    parser.add_argument('--signout-at-cutoff', action='store_true')
    args=parser.parse_args()
    import ctypes
    if not ctypes.windll.shell32.IsUserAnAdmin(): raise SystemExit('Admin Permissions is needed')
    if args.command=='enroll':
        import getpass
        import winreg
        if args.config.exists(): raise SystemExit('Already enrolled. Recover/uninstall before changing the child.')
        if args.signout_at_cutoff and not args.enable_signin_blocking:
            raise SystemExit('Sign-out enforcement also requires explicit sign-in blocking consent.')
        sid=standard_local_user(args.username)
        # Child must have logged in once; refuse to overwrite existing managed rules.
        with winreg.OpenKey(winreg.HKEY_USERS,sid): pass
        browsers = list(BROWSER_KEYS)
        for browser in browsers:
            for kind in ['URLBlocklist','URLAllowlist']:
                try:
                    with winreg.OpenKey(winreg.HKEY_USERS,browser_path(sid,browser,kind)): pass
                except FileNotFoundError: pass
                else: raise SystemExit(f'Existing managed {browser} rules found. No settings were changed.')
        if args.enable_signin_blocking:
            gate = SignInGate(sid, args.config.parent/'signin.json')
            try: gate.prepare()
            finally: gate.close()
        if args.strict_network:
            guardian_proxy_settings.prepare(sid, args.config.parent/'proxy.json')
            network = NetworkGate(sid, args.config.parent/'network.json')
            try: network.prepare()
            finally: network.close()
        gateway=Gateway(args.origin)
        try: identity=gateway.call('agent/enroll',{'code':getpass.getpass('One-use WINDOWS enrollment code from Bluey Home: ')})
        finally: gateway.client.close()
        save(args.config,{'sid':sid,'username':args.username,'origin':args.origin,'token':identity['token'],'browsers':browsers,
            'signin_blocking':args.enable_signin_blocking, 'native_warnings':True,
            'strict_network':args.strict_network, 'signout_at_cutoff':args.signout_at_cutoff})
    elif args.command=='install':
        entry=Path(__file__).resolve().parent.parent/'service_entry.py'
        win32serviceutil.InstallService('backend.guardian_windows.Guardian',SERVICE,'Bluey Guardian (experimental)',
            startType=win32service.SERVICE_AUTO_START,exeName=sys.executable,
            exeArgs=f'-I "{entry}" service --config "{args.config}"',
            description='Parent-installed session budget and managed Edge/Chrome rules for one standard child account.')
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
            # LSA recovery does NOT require the child hive to be loaded. Restore
            # sign-in first so the parent can then load that profile for browsers.
            recover_network(config, args.config.parent)
            recover_signin(config, args.config.parent)
            try:
                with winreg.OpenKey(winreg.HKEY_USERS,config['sid']): pass
            except FileNotFoundError:
                raise SystemExit('Child profile is unloaded. Service stopped; configuration retained. Load the child profile under parent supervision and run recovery again.')
            if config.get('strict_network'):
                guardian_proxy_settings.recover(config['sid'], args.config.parent/'proxy.json')
            for browser in managed_browsers(config):
                for kind in ['URLAllowlist','URLBlocklist']:
                    try: winreg.DeleteKeyEx(winreg.HKEY_USERS,browser_path(config['sid'],browser,kind),winreg.KEY_WOW64_64KEY)
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
