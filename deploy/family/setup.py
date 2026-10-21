"""Prepare a persistent, self-hosted family service. No Supabase account required.

Run on the host, not in a browser. Secrets are written only to a new private .env.
This does not provision a machine, change DNS, start containers or modify Vercel.
"""
import argparse
import ipaddress
import os
from pathlib import Path
import re
import secrets


def prepare(directory: Path, hostname: str) -> Path:
    hostname = hostname.lower().strip()
    labels = hostname.split('.')
    if (len(hostname) > 253 or len(labels) < 2 or
            any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', part) for part in labels) or
            labels[-1] in {'localhost', 'local', 'test', 'invalid', 'example'}):
        raise ValueError('Use a public DNS hostname you control, without a scheme, port, path or credentials.')
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        raise ValueError('Use a DNS hostname, not an IP address, for automatic HTTPS.')
    # Never overwrite an existing gateway/invite: that could strand deployed clients.
    destination = directory / '.env'
    content = (f'BLUEY_FAMILY_HOST={hostname}\n'
               f'BLUEY_FAMILY_GATEWAY_TOKEN={secrets.token_urlsafe(48)}\n'
               f'BLUEY_FAMILY_SETUP_INVITE={secrets.token_urlsafe(48)}\n')
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
        output.write(content)
        output.flush()
        os.fsync(output.fileno())
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hostname', required=True, help='Public family API DNS name pointing to this Linux Docker host.')
    args = parser.parse_args()
    try:
        prepare(Path(__file__).resolve().parent, args.hostname)
    except (ValueError, OSError) as error:
        parser.exit(1, f'Setup not changed: {error}\n')
    print('Created a private .env; no secret values were printed. Keep a secure backup.')
    print('After pointing DNS to this host and allowing inbound TCP 80/443:')
    print('  docker compose -f compose.yaml -f compose.https.yaml up -d --build')
    print('In Vercel Production set BLUEY_FAMILY_SERVICE_URL to https://' + args.hostname.lower().strip())
    print('Privately copy BLUEY_FAMILY_GATEWAY_TOKEN from this host .env to Vercel, then redeploy.')
    print('Use BLUEY_FAMILY_SETUP_INVITE from this host .env when registering the parent account.')
    print('The host must stay running for remote management. Accounts persist in the family-data volume.')


if __name__ == '__main__':
    main()
