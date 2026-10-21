"""Opt-in, SID-scoped Windows LSA logon denial with an administrator-only journal.

This is not a credential provider. Windows enforces the rights for new logons;
existing sessions still need the independent WTS disconnection loop.
"""
import json
import os
import re

DENY_RIGHTS = frozenset({'SeDenyInteractiveLogonRight', 'SeDenyRemoteInteractiveLogonRight'})


def validate_sid(sid):
    # Never accept a group, SYSTEM, built-in Administrator/Guest or domain name.
    if not isinstance(sid, str) or not re.fullmatch(r'S-1-5-21-\d+-\d+-\d+-\d+', sid):
        raise ValueError('A bound local child account SID is required.')
    if int(sid.rsplit('-', 1)[1]) < 1000:
        raise ValueError('Built-in accounts cannot be managed for sign-in.')


class WindowsRights:
    def __init__(self):
        import win32security
        self.api = win32security
        try:
            self.handle = win32security.LsaOpenPolicy(None,
                win32security.POLICY_LOOKUP_NAMES | win32security.POLICY_CREATE_ACCOUNT)
        except win32security.error as error:
            raise OSError('Could not open Windows sign-in policy.') from error

    def read(self, sid):
        try:
            return set(self.api.LsaEnumerateAccountRights(self.handle, self.api.ConvertStringSidToSid(sid)))
        except self.api.error as error:
            if error.winerror == 2:  # No directly assigned LSA rights, not access denied.
                return set()
            raise OSError('Could not read Windows sign-in policy.') from error

    def add(self, sid, rights):
        try:
            self.api.LsaAddAccountRights(self.handle, self.api.ConvertStringSidToSid(sid), sorted(rights))
        except self.api.error as error:
            raise OSError('Could not apply Windows sign-in denial.') from error

    def remove(self, sid, rights):
        if rights:
            # AllRights=False is essential: never erase another administrator's rights.
            try:
                self.api.LsaRemoveAccountRights(self.handle, self.api.ConvertStringSidToSid(sid), False, sorted(rights))
            except self.api.error as error:
                raise OSError('Could not restore Windows sign-in policy.') from error

    def close(self):
        self.handle.Close()


class SignInGate:
    def __init__(self, sid, journal, rights=None):
        validate_sid(sid)
        self.sid = sid
        self.journal = journal
        self.rights = rights if rights is not None else WindowsRights()

    def close(self):
        self.rights.close()

    def _write(self, owned):
        temporary = self.journal.with_suffix('.new')
        with temporary.open('w', encoding='utf8') as file:
            json.dump({'version': 1, 'sid': self.sid, 'owned': sorted(owned)}, file)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, self.journal)

    def _load(self):
        # Corruption or missing ownership never authorizes clearing Windows rights.
        if not self.journal.exists():
            if self.rights.read(self.sid) & DENY_RIGHTS:
                raise RuntimeError('Existing sign-in restrictions found; parent review required.')
            self._write(set())
        if self.journal.stat().st_size > 4096:
            raise ValueError('Invalid sign-in recovery journal.')
        state = json.loads(self.journal.read_text(encoding='utf8'))
        if not isinstance(state, dict) or state.get('version') != 1 or state.get('sid') != self.sid:
            raise ValueError('Sign-in journal identity mismatch.')
        owned = state.get('owned')
        if not isinstance(owned, list) or any(not isinstance(r, str) or r not in DENY_RIGHTS for r in owned):
            raise ValueError('Invalid sign-in recovery rights.')
        return set(owned)

    def prepare(self):
        self._load()

    def apply(self, restricted):
        owned = self._load()
        actual = self.rights.read(self.sid)
        if restricted:
            # Refuse to take ownership of a deny right added by another manager.
            if (actual & DENY_RIGHTS) - owned:
                raise RuntimeError('External sign-in policy conflicts with Guardian.')
            # Write intent FIRST. Recovery works even after a crash during the OS call.
            if owned != DENY_RIGHTS:
                self._write(DENY_RIGHTS)
            missing = DENY_RIGHTS - actual
            if missing:
                self.rights.add(self.sid, missing)
            if not DENY_RIGHTS <= self.rights.read(self.sid):
                raise RuntimeError('Windows sign-in denial could not be confirmed.')
            return 'blocked'
        self.rights.remove(self.sid, owned & actual)
        remaining = self.rights.read(self.sid)
        if remaining & owned:
            raise RuntimeError('Windows sign-in recovery could not be confirmed.')
        if owned:
            self._write(set())
        return 'external_policy' if remaining & DENY_RIGHTS else 'allowed'


def recover_signin(config, directory):
    journal = directory / 'signin.json'
    if not journal.exists():
        # A configured gate with a lost journal is not safe to guess at.
        if config.get('signin_blocking') is True:
            gate = SignInGate(config['sid'], journal)
            try:
                gate.prepare()  # Refuses unowned deny rights, even without a loaded hive.
            finally:
                gate.close()
        else:
            return
    gate = SignInGate(config['sid'], journal)
    try:
        gate.apply(False)
    finally:
        gate.close()
