"""Describe agent evidence without turning a heartbeat into verified protection."""
import json


def agent_health(agent, policy, today, now):
    last_seen = agent['last_seen'] if agent else None
    report = json.loads(agent['report']) if agent and agent['report'] else None
    recent = last_seen is not None and 0 <= now - last_seen < 90
    current = bool(report and report['policy_version'] == policy['version'])
    browsers = (report.get('browser_rules') or {'edge': report['edge_rules']}) if report else {}
    if not agent:
        state = 'not_enrolled'
    elif not report or last_seen is None:
        state = 'awaiting_report'
    elif not recent:
        state = 'stale'
    elif not current or report['day'] != today:
        state = 'policy_pending'
    elif report.get('signin_state') in {'error', 'starting', 'external_policy'} or not report['time_service'] or not browsers or not all(browsers.values()) or report.get('error'):
        state = 'attention'
    else:
        state = 'reporting'
    # Never present an offline/cached previous-day value as today's live usage.
    usage = report['used_seconds'] // 60 if (
        recent and report and report['time_service'] and report['day'] == today
    ) else None
    return {
        'recent': recent, 'state': state, 'report': report,
        'last_seen': last_seen, 'policy_current': current and recent,
    }, usage
