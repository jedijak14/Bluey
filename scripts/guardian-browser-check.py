"""Real Edge/Chrome navigation checks on a disposable Windows CI runner.

Uses the runner's own HKCU to test browser consumption of the same policy adapter.
Separate guardian-windows-check.py tests a standard child's hive and permissions.
This is NOT an interactive child-login or bypass-resistance certification.
"""
import os
from pathlib import Path
import sys
import tempfile
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

def report_error(kind, value, tb):
    text = ''.join(traceback.format_exception(kind, value, tb))
    print('::error::' + text.replace('%','%25').replace('\r','%0D').replace('\n','%0A'), flush=True)
    sys.__excepthook__(kind, value, tb)
sys.excepthook = report_error

if sys.platform != 'win32'  or os.getenv('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Only run on an isolated Windows GitHub-hosted test runner.')
import win32api
import win32con
import win32security
import winreg
from playwright.sync_api import sync_playwright, Error as BrowserError
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.guardian_windows import BROWSER_KEYS, browser_path, browser_rules

token = win32security.OpenProcessToken(win32api.GetCurrentProcess(), win32con.TOKEN_QUERY | win32con.TOKEN_ADJUST_PRIVILEGES)
try:
    sid = win32security.ConvertSidToStringSid(win32security.GetTokenInformation(token, win32security.TokenUser)[0])
    # The adapter sets SYSTEM as owner; a disposable administrator test process
    # needs SeRestorePrivilege. The actual Guardian runs as LocalSystem.
    win32security.AdjustTokenPrivileges(token, False, [(win32security.LookupPrivilegeValue(None, 'SeRestorePrivilege'), win32con.SE_PRIVILEGE_ENABLED)])
finally:
    token.Close()
# Refuse pre-existing management rather than snapshot/overwrite another policy.
for browser in BROWSER_KEYS:
    for kind in ('URLBlocklist', 'URLAllowlist'):
        try:
            with winreg.OpenKey(winreg.HKEY_USERS, browser_path(sid, browser, kind)): pass
        except FileNotFoundError: pass
        else: raise RuntimeError(f'Refusing existing {browser} management.')

requests = []
class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        requests.append(self.headers.get('Host'))
        body = b'<!doctype html><title>Bluey policy fixture</title><p>BLUEY_ALLOWED_FIXTURE</p>'
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
port = server.server_address[1]
try:
    for browser, executable in [('edge', 'Microsoft/Edge/Application/msedge.exe'), ('chrome', 'Google/Chrome/Application/chrome.exe')]:
        candidates = [Path(os.environ[root]) / executable for root in ('ProgramFiles', 'ProgramFiles(x86)') if root in os.environ]
        binary = next((path for path in candidates if path.exists()), None)
        if binary is None: raise RuntimeError(f'{browser} is required for this test.')
        policy = {'blocked_domains': ['bluey.test'], 'allowed_domains': ['allowed.bluey.test']}
        browser_rules(sid, policy, browser)
        def navigate(host, allowed):
            with tempfile.TemporaryDirectory(prefix=f'bluey-{browser}-') as profile:
                with sync_playwright() as playwright:
                    context = playwright.chromium.launch_persistent_context(profile, executable_path=str(binary),
                        headless=True, args=['--no-first-run', '--no-default-browser-check',
                            '--disable-background-networking', '--proxy-server=direct://',
                            '--host-resolver-rules=MAP *.bluey.test 127.0.0.1'])
                    try:
                        page = context.new_page()
                        try:
                            page.goto(f'http://{host}:{port}/', wait_until='domcontentloaded', timeout=20000)
                        except BrowserError as error:
                            assert not allowed, f'{browser}: allowed fixture failed: {error}'
                            assert 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(error), f'{browser}: not a policy block: {error}'
                        else:
                            assert allowed, f'{browser}: blocked URL loaded: {page.url}'
                            assert 'BLUEY_ALLOWED_FIXTURE' in page.content(), f'{browser}: missing local fixture'
                    finally:
                        context.close()
        navigate('denied.bluey.test', False)
        navigate('allowed.bluey.test', True)
        browser_rules(sid, {**policy, 'allowed_domains': []}, browser)
        navigate('allowed.bluey.test', False)
        print(f'{browser}: actual navigation blocked, parent exception loaded, revoked exception blocked.', flush=True)
    assert requests and all(host == f'allowed.bluey.test:{port}' for host in requests), requests
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
    for browser in BROWSER_KEYS:
        for kind in ('URLAllowlist', 'URLBlocklist'):
            try: winreg.DeleteKeyEx(winreg.HKEY_USERS, browser_path(sid, browser, kind), winreg.KEY_WOW64_64KEY)
            except FileNotFoundError: pass
