"""Deterministic guardian policy evaluation; no OS effects in this module."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from .family_service import Policy


def bedtime(policy, timestamp):
    local = datetime.fromtimestamp(timestamp, ZoneInfo(policy['timezone']))
    current = local.hour * 60 + local.minute
    start, end = [int(v[:2])*60 + int(v[3:]) for v in
                  (policy['bedtime_start'], policy['bedtime_end'])]
    if start == end:
        return False  # Equal times explicitly disable the bedtime window.
    return start <= current < end if start < end else current >= start or current < end


class Budget:
    """Usage survives restart. A day reset requires an authenticated server response.

    Offline midnight cannot create a new allowance, and a stale policy blocks only
    the enrolled child session. The parent administrator is never targeted.
    """
    def __init__(self, state=None):
        self.state = state or {'day': '', 'used_seconds': 0, 'last_wall': 0}
        self.bundle = self.state.get('bundle')
        self.clock_error = False

    def sync(self, bundle, local_wall):
        policy = Policy.model_validate(bundle['policy']).model_dump()
        server_time = float(bundle['server_time'])
        day = datetime.fromtimestamp(server_time, ZoneInfo(policy['timezone'])).date().isoformat()
        if bundle['day'] != day or abs(server_time-local_wall) > 120:
            raise ValueError('Device clock disagrees with the family service.')
        if not 0 <= bundle['extra_minutes_today'] <= 1440:
            raise ValueError('Invalid extra allowance.')
        if not server_time < bundle['valid_until'] <= server_time + 86400:
            raise ValueError('Invalid offline policy lifetime.')
        if self.bundle and policy['version'] < self.bundle['policy']['version']:
            raise ValueError('Policy version moved backwards.')
        # Parent-authorized timezone changes can move the calendar backwards;
        # keep usage instead of gifting a second budget on that transition.
        if day != self.state['day']:
            old_zone = self.bundle['policy']['timezone'] if self.bundle else None
            reset = not self.state['day'] or (day > self.state['day'] and old_zone == policy['timezone'])
            self.state.update(day=day, used_seconds=0 if reset else self.state['used_seconds'])
        self.bundle = {**bundle, 'policy': policy}
        self.state.update(bundle=self.bundle, last_wall=local_wall)
        self.clock_error = False

    def tick(self, wall, elapsed, active):
        last = self.state['last_wall']
        if last and wall < last - 5:
            self.clock_error = True
        self.state['last_wall'] = max(last, wall)
        # Account logged-in session time, not keystrokes or browsing history.
        # Long suspension is not charged as active use.
        if active and 0 < elapsed <= 15:
            self.state['used_seconds'] += elapsed
        if self.clock_error:
            return 'clock_error'
        if not self.bundle:
            return 'awaiting_policy'
        if wall >= self.bundle['valid_until']:
            return 'offline_policy_expired'
        policy = self.bundle['policy']
        if bedtime(policy, wall):
            return 'bedtime'
        allowance = 60 * (policy['daily_minutes'] + self.bundle['extra_minutes_today'])
        return 'time_limit' if self.state['used_seconds'] >= allowance else ''
