"""Desktop-owned permissions and short-lived screen context. Never writes frames to disk."""
import base64
import io
import json
import os
import secrets
import time
from pathlib import Path

from pydantic import BaseModel, ConfigDict, StrictBool


class PrivacySettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    computer_use: StrictBool = True
    screen_access: StrictBool = False


class PrivacyState:
    def __init__(self, path: Path):
        self.path = path
        self.settings = PrivacySettings()
        self.epoch = 0
        self.lease = ""
        self.lease_expires = 0.0
        self.frame = ""
        self.frame_expires = 0.0
        if path.exists():
            try:
                self.settings = PrivacySettings.model_validate_json(path.read_text())
            except (OSError, ValueError):
                self.settings = PrivacySettings(computer_use=False, screen_access=False)

    def update(self, settings):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix('.tmp')
        with open(tmp, 'w', encoding='utf8') as file:
            os.chmod(tmp, 0o600)
            file.write(settings.model_dump_json())
        os.replace(tmp, self.path)
        self.settings = settings
        self.epoch += 1
        if not settings.screen_access:
            self.clear()

    def check(self, action):
        if action in {'read_screen', 'screenshot'}:
            if not self.settings.screen_access:
                raise RuntimeError('Screen access is disabled in Privacy settings.')
        elif not self.settings.computer_use:
            raise RuntimeError('Computer Use is disabled in Privacy settings.')

    def begin(self):
        if not self.settings.screen_access:
            raise RuntimeError('Enable screen access before sharing.')
        self.clear()
        self.lease = secrets.token_urlsafe(32)
        self.lease_expires = time.monotonic() + 7200
        return self.lease

    def clear(self):
        self.lease = self.frame = ''
        self.lease_expires = self.frame_expires = 0

    def receive(self, lease, image):
        if not self.settings.screen_access or not self.lease or not secrets.compare_digest(lease, self.lease) or time.monotonic() >= self.lease_expires:
            raise RuntimeError('Screen-sharing permission expired or was revoked.')
        from PIL import Image
        data = base64.b64decode(image, validate=True)
        if len(data) > 400_000:
            raise ValueError('Screen frame is too large.')
        with Image.open(io.BytesIO(data)) as photo:
            if photo.format != 'JPEG' or photo.width > 1280 or photo.height > 1280:
                raise ValueError('Use a bounded JPEG screen frame.')
            photo.verify()
        self.frame = image
        self.frame_expires = time.monotonic() + 10

    def current(self):
        if not self.settings.screen_access or time.monotonic() >= min(self.frame_expires, self.lease_expires):
            self.frame = ''
        return self.frame

    def status(self):
        return {**self.settings.model_dump(), 'live_sharing': bool(self.current())}
