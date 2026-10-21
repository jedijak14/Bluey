import json
from datetime import datetime, timezone
from types import SimpleNamespace
import sys
import pytest
from backend.guardian_signin import SignInGate, DENY_RIGHTS, recover_signin
from backend.guardian_screen import SessionWarnings, warning_reason, send_warning
from backend.enforcement_policy import Budget
from backend.family_service import Policy

SID = 'S-1-5-21-11-22-33-1001'


class Rights:
    def __init__(self, initial=()):
        self.values = set(initial)
        self.mutations = []
        self.fail_add = False
        self.fail_remove = False
    def read(self, sid):
        assert sid == SID
        return self.values.copy()
    def add(self, sid, rights):
        assert sid == SID
        if self.fail_add: raise OSError('write failed')
        self.values.update(rights)
        self.mutations.append(('add', set(rights)))
    def remove(self, sid, rights):
        assert sid == SID
        if self.fail_remove: raise OSError('remove failed')
        self.values.difference_update(rights)
        if rights: self.mutations.append(('remove', set(rights)))
    def close(self): pass


def test_persistent_deny_and_owned_only_recovery(tmp_path):
    api = Rights({'SeBatchLogonRight'})
    path = tmp_path/'signin.json'
    gate = SignInGate(SID, path, api)
    assert gate.apply(True) == 'blocked'
    assert api.values == DENY_RIGHTS | {'SeBatchLogonRight'}
    gate = SignInGate(SID, path, api)  # service restart; no in-memory authority
    assert gate.apply(True) == 'blocked'
    assert len(api.mutations) == 1
    assert gate.apply(False) == 'allowed'
    assert api.values == {'SeBatchLogonRight'}
    assert json.loads(path.read_text())['owned'] == []


def test_intent_survives_partial_os_failure(tmp_path):
    api = Rights(); api.fail_add = True
    gate = SignInGate(SID, tmp_path/'signin.json', api)
    with pytest.raises(OSError): gate.apply(True)
    assert set(json.loads(gate.journal.read_text())['owned']) == DENY_RIGHTS
    api.values.add('SeDenyInteractiveLogonRight')  # OS call could be partially applied
    assert SignInGate(SID, gate.journal, api).apply(False) == 'allowed'
    assert api.values == set()


def test_failed_recovery_retains_journal(tmp_path):
    api = Rights(); gate = SignInGate(SID, tmp_path/'signin.json', api)
    gate.apply(True); api.fail_remove = True
    with pytest.raises(OSError): gate.apply(False)
    assert set(json.loads(gate.journal.read_text())['owned']) == DENY_RIGHTS


def test_missing_corrupt_wrong_sid_and_external_policy_never_clear_rights(tmp_path):
    api = Rights(DENY_RIGHTS)
    path = tmp_path/'signin.json'; gate = SignInGate(SID, path, api)
    with pytest.raises(RuntimeError): gate.apply(False)
    for state in ['broken', json.dumps({'version': 1, 'sid': SID+'1', 'owned': list(DENY_RIGHTS)}),
                  json.dumps({'version': 1, 'sid': SID, 'owned': ['SeServiceLogonRight']})]:
        path.write_text(state)
        with pytest.raises(ValueError): gate.apply(False)
    assert api.mutations == []
    path.unlink(); api.values.clear(); gate.prepare()
    api.values.add('SeDenyInteractiveLogonRight')
    with pytest.raises(RuntimeError): gate.apply(True)
    assert gate.apply(False) == 'external_policy'
    assert api.values == {'SeDenyInteractiveLogonRight'}


def test_failed_intent_write_never_changes_windows_rights(tmp_path, monkeypatch):
    api = Rights(); gate = SignInGate(SID, tmp_path/'signin.json', api); gate.prepare()
    monkeypatch.setattr(gate, '_write', lambda _: (_ for _ in ()).throw(OSError('disk full')))
    with pytest.raises(OSError): gate.apply(True)
    assert not api.mutations


@pytest.mark.parametrize('sid', ['S-1-5-18', 'S-1-5-32-544', 'S-1-5-21-1-2-3-500', 'Administrator', '', None])
def test_non_child_sid_refused(tmp_path, sid):
    with pytest.raises(ValueError): SignInGate(sid, tmp_path/'signin.json', Rights())


def test_promotion_or_account_replacement_restores_owned_denial_before_stop(monkeypatch, tmp_path):
    from backend import guardian_windows as service
    calls = []
    monkeypatch.setattr(service, 'standard_local_user', lambda _: 'different-sid')
    monkeypatch.setattr(service, 'recover_signin', lambda c, p: calls.append((c, p)))
    config = {'username': 'child', 'sid': SID}
    with pytest.raises(ValueError): service.validate_enrolled_identity(config, tmp_path)
    assert calls == [(config, tmp_path)]


def budget():
    now = datetime(2026, 10, 20, 12, tzinfo=timezone.utc).timestamp()
    b = Budget(); b.sync({'policy': Policy(version=1, daily_minutes=2, timezone='UTC').model_dump(),
        'server_time': now, 'valid_until': now+86400, 'day': '2026-10-20', 'extra_minutes_today': 0}, now)
    return b, now


def test_native_warning_is_once_per_child_session_and_cannot_delay_cutoff():
    b, now = budget(); seen = []; warnings = SessionWarnings(lambda sid, why: seen.append((sid, why)))
    assert warnings.update([2], b, now, False) == 'idle'
    b.state['used_seconds'] = 61
    assert warnings.update([2], b, now+61, False) == 'sent'
    warnings.update([2], b, now+62, False)
    assert seen == [(2, 'time_limit')]
    assert b.tick(now+120, 1, True) == ''  # warning never changes the ledger
    b.state['used_seconds'] = 119
    assert b.tick(now+121, 1, True) == 'time_limit'
    assert warnings.update([2], b, now+121, True) == 'idle'


def test_warning_failure_is_bounded_and_bedtime_uses_real_time():
    b, now = budget(); b.state['used_seconds'] = 61
    calls = []
    def fail(*args): calls.append(args); raise OSError('session ended')
    warnings = SessionWarnings(fail)
    assert warnings.update([2], b, now, False) == 'failed'
    warnings.update([2], b, now+1, False)
    assert len(calls) == 1
    warnings.update([2], b, now+11, False)
    assert len(calls) == 2
    b.state['used_seconds'] = 0
    near_bedtime = datetime(2026, 10, 20, 20, 59, 30, tzinfo=timezone.utc).timestamp()
    assert warning_reason(b, near_bedtime) == 'bedtime'
    assert warning_reason(b, near_bedtime+60) == ''


def test_native_dialog_does_not_wait_or_target_session_zero(monkeypatch):
    calls = []
    monkeypatch.setitem(sys.modules, 'win32ts', SimpleNamespace(WTSSendMessage=lambda *a: calls.append(a)))
    monkeypatch.setitem(sys.modules, 'win32con', SimpleNamespace(MB_OK=0, MB_ICONWARNING=48))
    send_warning(7, 'bedtime')
    assert calls[0][1] == 7 and calls[0][-1] is False
    assert 'Save your work' in calls[0][3]
    with pytest.raises(ValueError): send_warning(0, 'bedtime')
    assert len(calls) == 1


def test_signin_report_is_bounded_and_backward_compatible():
    from backend.family_agents import AgentReport
    from pydantic import ValidationError
    data = dict(policy_version=0, used_seconds=0, day='2026-10-20', time_service=True, edge_rules=True)
    assert AgentReport(**data).signin_state == 'disabled'
    assert AgentReport(**data, signin_state='blocked').signin_state == 'blocked'
    for invalid in ['verified', True, {'state': 'blocked'}]:
        with pytest.raises(ValidationError): AgentReport(**data, signin_state=invalid)
