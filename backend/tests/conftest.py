import pytest
from backend import server
from backend.privacy import PrivacyState

@pytest.fixture(autouse=True)
def isolated_privacy(tmp_path, monkeypatch):
    state = PrivacyState(tmp_path / 'privacy.json')
    monkeypatch.setattr(server, 'privacy', state)
    monkeypatch.setattr(server.automation, 'permission_check', state.check)
