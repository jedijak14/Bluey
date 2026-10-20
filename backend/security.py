import secrets
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import HTTPException


class Pairing:
    def __init__(self):
        self.code = ""
        self.expires = 0.0
        self.devices: dict[str, dict] = {}
        self.attempts = defaultdict(deque)

    def create(self):
        self.code = f"{secrets.randbelow(1_000_000):06d}"
        self.expires = time.monotonic() + 120
        return self.code

    def redeem(self, code: str, name: str, address: str):
        now = time.monotonic()
        # Bounded global rate limit also prevents rotating-source memory exhaustion.
        for key in ("all", address):
            q = self.attempts[key]
            while q and q[0] < now - 60:
                q.popleft()
            if len(q) >= (30 if key == "all" else 5):
                raise HTTPException(429, "Too many pairing attempts. Wait a minute.")
            q.append(now)
        if len(self.attempts) > 1000:
            self.attempts = defaultdict(deque, {"all": self.attempts["all"]})
        if not self.code or now >= self.expires or not secrets.compare_digest(code, self.code):
            raise HTTPException(403, "Invalid or expired pairing code.")
        self.code = ""  # one-time use
        token = secrets.token_urlsafe(32)
        device = {"id": secrets.token_hex(8), "name": name[:60]}
        self.devices[token] = device
        return token, device


class Workspace:
    def __init__(self):
        self.root: Path | None = None

    def path(self, relative: str) -> Path:
        if self.root is None:
            raise HTTPException(409, "Choose a workspace folder first.")
        p = (self.root / relative).resolve()
        if not p.is_relative_to(self.root) or p == self.root:
            raise HTTPException(403, "Path escapes the selected workspace.")
        blocked = {".git", ".ssh", ".env", "node_modules", ".venv"}
        if any(
            part in blocked or part.startswith(".env.") for part in p.relative_to(self.root).parts
        ):
            raise HTTPException(403, "This path is excluded from the workspace.")
        return p
