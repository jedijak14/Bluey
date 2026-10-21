import pytest
from backend import server
from backend.privacy import PrivacyState

@pytest.fixture(autouse=True)
def isolated_privacy(tmp_path, monkeypatch):
    state = PrivacyState(tmp_path / 'privacy.json')
    monkeypatch.setattr(server, 'privacy', state)
    monkeypatch.setattr(server.automation, 'permission_check', state.check)

from backend.model import Model
from backend.model_store import ModelStore

@pytest.fixture(autouse=True)
def isolated_model_settings(monkeypatch, tmp_path):
    # Never read/write a developer's real provider settings during API tests.
    monkeypatch.setattr(server, 'model', Model(store=ModelStore(tmp_path / 'model.json')))
