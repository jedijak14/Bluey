"""Versioned deterministic domain rules. No model is involved in enforcement."""
import re
from urllib.parse import urlsplit

def domain(value):
    value = value.strip().lower().rstrip('.')
    if '://' in value:
        parsed = urlsplit(value)
        if parsed.scheme not in {'http', 'https'} or parsed.username or parsed.password or parsed.port or parsed.path not in {'', '/'} or parsed.query or parsed.fragment:
            raise ValueError('Enter a domain, not a URL path or credentials.')
        value = parsed.hostname or ''
    value = value.encode('idna').decode('ascii')
    if len(value) > 253 or '.' not in value or value.endswith(('.local', '.localhost')) or not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', p) for p in value.split('.')) or re.fullmatch(r'[0-9.]+', value):
        raise ValueError('Use a public website domain such as example.com.')
    return value


BLOCKLIST_VERSION = '2026-10-20.1'
# Curated starting set, not a comprehensive classification feed. X/Twitter are
# mixed-content services restricted by product policy, not labeled adult-only.
DEFAULT_BLOCKED_DOMAINS = frozenset({
    'x.com', 'twitter.com', 'pornhub.com', 'xvideos.com', 'xnxx.com',
    'xhamster.com', 'redtube.com', 'youporn.com', 'onlyfans.com',
    'livejasmin.com', 'chaturbate.com', 'stripchat.com',
})

def matches(host, rule):
    return host == rule or host.endswith('.' + rule)

def build_rules(policy):
    allowed = sorted({domain(v) for v in policy.get('allowed_domains', [])})
    blocked = DEFAULT_BLOCKED_DOMAINS | {domain(v) for v in policy.get('blocked_domains', [])}
    # Explicit parent allowlisting wins, including over more-specific custom
    # blocks. Keep ancestor blocks when only a subdomain is allowed.
    blocked = sorted(b for b in blocked if not any(matches(b, a) for a in allowed))
    return {'version': BLOCKLIST_VERSION, 'blocked': blocked, 'allowed': allowed}

def decide(host, policy):
    host = domain(host)
    rules = build_rules(policy)
    if any(matches(host,a) for a in rules['allowed']): return 'parent_allowed'
    if any(matches(host,b) for b in rules['blocked']): return 'blocked'
    return 'not_listed'  # Never claim an unlisted site is safe.
