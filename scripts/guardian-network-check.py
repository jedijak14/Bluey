"""Destructive ONLY to a disposable CI account, never run on a family PC.

Actual child processes probe IPv4/IPv6 TCP and UDP, persistent WFP restart,
proxy-only exception, parent isolation and offline recovery. No Internet target.
"""
import ctypes as C
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import time
import traceback

if sys.platform != 'win32' or os.getenv('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Isolated Windows GitHub-hosted CI only')
def failure(kind, value, tb):
    text = ''.join(traceback.format_exception(kind, value, tb))
    print('::error::'+text.replace('%','%25').replace('\r','%0D').replace('\n','%0A'), flush=True)
    sys.__excepthook__(kind, value, tb)
sys.excepthook = failure
import win32api
import win32con
import win32net
import win32netcon
import win32security
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.guardian_network import NetworkGate, PORT
from backend.guardian_windows import standard_local_user

class Startup(C.Structure):
    _fields_ = [('cb', C.c_uint32), ('reserved', C.c_wchar_p), ('desktop', C.c_wchar_p), ('title', C.c_wchar_p),
                ('x', C.c_uint32), ('y', C.c_uint32), ('xs', C.c_uint32), ('ys', C.c_uint32),
                ('xc', C.c_uint32), ('yc', C.c_uint32), ('fill', C.c_uint32), ('flags', C.c_uint32),
                ('show', C.c_uint16), ('cbReserved', C.c_uint16), ('reserved2', C.c_void_p),
                ('stdin', C.c_void_p), ('stdout', C.c_void_p), ('stderr', C.c_void_p)]
class Process(C.Structure):
    _fields_ = [('process', C.c_void_p), ('thread', C.c_void_p), ('pid', C.c_uint32), ('tid', C.c_uint32)]
create = C.WinDLL('advapi32', use_last_error=True).CreateProcessWithLogonW
create.argtypes = [C.c_wchar_p,C.c_wchar_p,C.c_wchar_p,C.c_uint32,C.c_wchar_p,C.c_wchar_p,C.c_uint32,C.c_void_p,C.c_wchar_p,C.POINTER(Startup),C.POINTER(Process)]
create.restype = C.c_int
kernel = C.WinDLL('kernel32', use_last_error=True)
kernel.WaitForSingleObject.argtypes = [C.c_void_p,C.c_uint32]; kernel.WaitForSingleObject.restype=C.c_uint32
kernel.CloseHandle.argtypes=[C.c_void_p]; kernel.CloseHandle.restype=C.c_int
kernel.TerminateProcess.argtypes=[C.c_void_p,C.c_uint32]; kernel.TerminateProcess.restype=C.c_int

name = 'BlueyNet' + secrets.token_hex(4)
password = 'Aa1!' + secrets.token_hex(20)
root = Path(os.environ['ProgramData']) / name
created = False; gate = None; listeners=[]
try:
    win32net.NetUserAdd(None,1,{'name':name,'password':password,'priv':win32netcon.USER_PRIV_USER,
        'home_dir':'','comment':'Disposable Bluey network CI','flags':win32netcon.UF_SCRIPT,'script_path':''})
    created=True
    group,_,_=win32security.LookupAccountSid(None,win32security.ConvertStringSidToSid('S-1-5-32-545'))
    sid_obj,_,_=win32security.LookupAccountName(None,name)
    try: win32net.NetLocalGroupAddMembers(None,group,0,[{'sid':sid_obj}])
    except win32net.error as error:
        if error.winerror != 1378: raise
    sid = standard_local_user(name)
    token = win32security.OpenProcessToken(win32api.GetCurrentProcess(),win32con.TOKEN_ADJUST_PRIVILEGES|win32con.TOKEN_QUERY)
    try:
        win32security.AdjustTokenPrivileges(token, False, [(win32security.LookupPrivilegeValue(None,'SeRestorePrivilege'),win32con.SE_PRIVILEGE_ENABLED)])
    finally: token.Close()
    root.mkdir()
    subprocess.run(['icacls',str(root),'/inheritance:r','/grant:r','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F',f'*{sid}:(OI)(CI)M'],check=True,capture_output=True)
    private = root/'private'; private.mkdir()
    subprocess.run(['icacls',str(private),'/inheritance:r','/grant:r','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F'],check=True,capture_output=True)
    fixture = root/'probe.py'; result = root/'result.json'
    fixture.write_text('''import json,socket,sys
host,port,kind,out=sys.argv[1:]
s=socket.socket(socket.AF_INET6 if ':' in host else socket.AF_INET, socket.SOCK_DGRAM if kind=='udp' else socket.SOCK_STREAM)
s.settimeout(2)
try:
 s.connect((host,int(port)))
 if kind=='udp': s.send(b'child-network-fixture')
 answer={'connected':True}
except OSError as e: answer={'connected':False,'error':e.winerror}
finally:s.close()
open(out,'w').write(json.dumps(answer))
''')
    def probe(host, port, kind='tcp'):
        result.unlink(missing_ok=True)
        startup=Startup(); startup.cb=C.sizeof(startup); startup.flags=1; startup.show=0
        process=Process()
        command=C.create_unicode_buffer(subprocess.list2cmdline([sys.executable,'-I',str(fixture),host,str(port),kind,str(result)]))
        if not create(name,'.',password,1,sys.executable,command,0x08000000,None,str(root),C.byref(startup),C.byref(process)):
            raise C.WinError(C.get_last_error())
        try:
            if kernel.WaitForSingleObject(process.process,30000) != 0:
                kernel.TerminateProcess(process.process,1); raise TimeoutError('Child network probe timed out')
        finally: kernel.CloseHandle(process.thread); kernel.CloseHandle(process.process)
        return json.loads(result.read_text())
    def listen(host,port=0,udp=False):
        s=socket.socket(socket.AF_INET6 if ':' in host else socket.AF_INET, socket.SOCK_DGRAM if udp else socket.SOCK_STREAM)
        listeners.append(s);s.bind((host,port));s.settimeout(2)
        if not udp:s.listen(64)
        return s
    allowed=listen('127.0.0.1',PORT); other=listen('127.0.0.1'); ipv6=listen('::1'); udp=listen('127.0.0.1',udp=True)
    assert probe('127.0.0.1',other.getsockname()[1])['connected']
    assert probe('::1',ipv6.getsockname()[1])['connected']
    gate=NetworkGate(sid,private/'network.json');gate.apply(False)
    assert not probe('127.0.0.1',PORT)['connected']
    assert not probe('127.0.0.1',other.getsockname()[1])['connected']
    assert not probe('::1',ipv6.getsockname()[1])['connected']
    probe('127.0.0.1',udp.getsockname()[1],'udp')
    try: udp.recvfrom(1024)
    except socket.timeout: pass
    else: raise AssertionError('Child UDP escaped WFP')
    with socket.create_connection(other.getsockname(),timeout=2): pass  # parent unchanged
    gate.apply(True)
    assert probe('127.0.0.1',PORT)['connected']
    assert not probe('127.0.0.1',other.getsockname()[1])['connected']
    assert not probe('::1',ipv6.getsockname()[1])['connected']
    gate.close();gate=None
    assert not probe('127.0.0.1',other.getsockname()[1])['connected']  # persistent, not dynamic filters
    gate=NetworkGate(sid,private/'network.json');gate.recover()
    assert probe('127.0.0.1',other.getsockname()[1])['connected']
    assert probe('::1',ipv6.getsockname()[1])['connected']
    print('Actual standard-child IPv4/IPv6 TCP and UDP denial, proxy-only exception, parent isolation, persistent engine-close containment and offline recovery passed.',flush=True)
finally:
    # Remove filters before deleting the identity or its ownership journal.
    if gate is not None:
        try: gate.recover()
        finally: gate.close()
    elif created and (root/'private/network.json').exists():
        gate=NetworkGate(sid,private/'network.json')
        try: gate.recover()
        finally: gate.close()
    for listener in listeners:listener.close()
    if created:win32net.NetUserDel(None,name)
    if root.exists():shutil.rmtree(root)
