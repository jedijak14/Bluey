# Family accounts without Supabase

Supabase is **not required**. This deployment runs Bluey's account API with SQLite on a persistent Docker volume. Vercel serves the website and forwards authenticated requests to it. It supports the existing Home/Kids login, enrollment, policies and extra-time requests without changing account formats.

**This needs an always-on host and a public DNS name you control.** This repository and Vercel's ephemeral filesystem are not durable database hosting. No machine, domain or paid plan is provisioned by these scripts. Do not use the temporary Arena development sandbox as a production account host.

## Prepare the host

On a Linux Docker host, from `deploy/family`:

```sh
python3 setup.py --hostname family.your-domain.com
# Point that hostname's DNS at this host; allow inbound TCP 80 and 443.
docker compose -f compose.yaml -f compose.https.yaml up -d --build
```

Setup writes fresh, distinct gateway and registration secrets to a private `.env` without displaying them, and refuses to overwrite existing credentials. The optional Caddy entry point obtains HTTPS certificates, limits request bodies to 20 KB, and exposes only the family API. The database is in the named `family-data` volume; the raw API binds host loopback only. Family health checks query the actual database before the HTTPS proxy starts.

In **Vercel Production**, privately configure:
- `BLUEY_FAMILY_SERVICE_URL`: `https://family.your-domain.com` (no path).
- `BLUEY_FAMILY_GATEWAY_TOKEN`: the matching value from the host's private `.env`.

Remove a stale `BLUEY_FAMILY_DATABASE_URL`, `DATABASE_URL` or `POSTGRES_URL` only if deliberately switching away from that database; PostgreSQL configuration takes precedence and **data is not migrated automatically**. Redeploy the website. Do not put either secret in a `VITE_` variable or chat. The registration invite stays on the family host, not in Vercel in this mode.

## Verify before real-family use

1. `/api/family/status` on the public **website** must return `ready` and `registration_available: true` after a real database query. A running container alone is insufficient.
2. Register using the host's private `BLUEY_FAMILY_SETUP_INVITE`. Use a test nickname, not sensitive child information.
3. Sign out, restart the family container **without deleting its volume**, and sign in again from another device. Check that the child and policy persist.
4. Test separate Kids and Windows agent enrollment codes, extra-time requests and role rejection. Storage readiness does not certify OS protection.
5. Rotate/clear the host's setup invite after intended parent registration, then recreate the container with the updated environment. Keep encrypted backups and test a consistent SQLite restore. Never run `docker compose down -v` unless intentionally deleting all account data.

The host must remain powered and reachable for away-from-home management. If it goes offline, accounts must report unavailable; they must not silently switch to an empty local database. Existing Guardian offline rules remain separate.

## Existing reverse proxy

If you already have HTTPS and request/IP limits, use `docker compose up -d --build` without the HTTPS override, and proxy `/api/family/*` to `127.0.0.1:8767`. Keep port 8767 firewalled. The gateway secret is required in addition to end-user role authentication.

## Limits

This is a self-hosting option, not a claim that production sign-in has been activated. It does not provide account recovery, MFA, email verification, push notifications or universal browser filtering. Free hosting availability is not guaranteed, and no paid services are authorized automatically. See [the PostgreSQL alternative](../../docs/VERCEL_FAMILY.md) if you later choose a managed persistent database.
