"""Supabase-free host bootstrap: private credentials, no overwrite or injection."""
import importlib.util
import os
from pathlib import Path
import stat

import pytest

spec = importlib.util.spec_from_file_location('family_host_setup', Path(__file__).resolve().parents[2] / 'deploy/family/setup.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


def test_private_distinct_secrets_and_no_overwrite(tmp_path, capsys):
    path = setup.prepare(tmp_path, 'Family.My-Domain.com')
    content = path.read_text()
    values = dict(line.split('=', 1) for line in content.splitlines())
    assert values['BLUEY_FAMILY_HOST'] == 'family.my-domain.com'
    assert len(values['BLUEY_FAMILY_GATEWAY_TOKEN']) >= 64
    assert len(values['BLUEY_FAMILY_SETUP_INVITE']) >= 64
    assert values['BLUEY_FAMILY_GATEWAY_TOKEN'] != values['BLUEY_FAMILY_SETUP_INVITE']
    if os.name != 'nt':
        assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert capsys.readouterr().out == ''
    with pytest.raises(FileExistsError):
        setup.prepare(tmp_path, 'another.my-domain.com')
    assert path.read_text() == content


@pytest.mark.parametrize('hostname', [
    'http://family.host.com', 'host.com:443', 'localhost', '127.0.0.1',
    'host.com/path', 'user:password@host.com', 'host.com\nEVIL=value',
    '-host.com', 'host..com', '*.host.com', 'private.local', 'host.invalid',
])
def test_rejects_unsafe_or_nonpublic_hostnames(tmp_path, hostname):
    with pytest.raises(ValueError):
        setup.prepare(tmp_path, hostname)
    assert not (tmp_path / '.env').exists()


def test_existing_symlink_is_not_followed(tmp_path):
    if os.name == 'nt':
        pytest.skip('Symlink creation privileges vary on Windows.')
    target = tmp_path / 'existing-secret'
    target.write_text('preserve')
    (tmp_path / '.env').symlink_to(target)
    with pytest.raises(FileExistsError):
        setup.prepare(tmp_path, 'family.host.com')
    assert target.read_text() == 'preserve'
