"""Native Windows session warnings, not browser overlays or secure-desktop hooks."""
from .enforcement_policy import bedtime


def warning_reason(budget, wall):
    if not budget.bundle or budget.clock_error or wall >= budget.bundle['valid_until']:
        return ''
    policy = budget.bundle['policy']
    remaining = 60 * (policy['daily_minutes'] + budget.bundle['extra_minutes_today']) - budget.state['used_seconds']
    if 0 < remaining <= 60:
        return 'time_limit'
    if not bedtime(policy, wall) and any(bedtime(policy, wall + seconds) for seconds in range(1, 61)):
        return 'bedtime'
    return ''


def send_warning(session_id, reason):
    import win32ts
    import win32con
    if session_id <= 0 or reason not in {'time_limit', 'bedtime'}:
        raise ValueError('A child session and supported warning are required.')
    message = ('Your daily computer time ends in one minute or less.' if reason == 'time_limit'
               else 'Bedtime starts in one minute or less.')
    message += '\nSave your work now. Windows will disconnect this child session. Dismissing this notice does not add time. Ask your parent in Bluey Home for help.'
    # The Windows Terminal Services API displays a real native dialog in the
    # selected session. Never run a SYSTEM process on the child's desktop, and
    # never wait for an OK click in the enforcement loop.
    try:
        win32ts.WTSSendMessage(None, session_id, 'Bluey Guardian - save your work',
            message, win32con.MB_OK | win32con.MB_ICONWARNING, 60, False)
    except Exception as error:
        raise OSError('Windows could not display the session warning.') from error


class SessionWarnings:
    def __init__(self, sender=send_warning):
        self.sender = sender
        self.sent = set()
        self.attempts = {}

    def update(self, active, budget, wall, restricted):
        reason = '' if restricted else warning_reason(budget, wall)
        if not reason:
            return 'idle'
        state = 'sent'
        for session in active:
            key = (session, budget.state['day'], budget.bundle['policy']['version'], reason)
            if key in self.sent:
                continue
            if wall - self.attempts.get(key, float('-inf')) < 10:
                state = 'failed'
                continue
            self.attempts[key] = wall
            try:
                self.sender(session, reason)
                self.sent.add(key)
            except OSError:
                state = 'failed'  # Notification failure never postpones disconnection.
        if len(self.attempts) > 100:
            self.attempts = {k: v for k, v in self.attempts.items() if wall - v < 120}
            self.sent.intersection_update(self.attempts)
        return state if active else 'idle'
