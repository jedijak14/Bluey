# Durable family backend

The account UI needs this separate persistent service. Vercel does not supply a SQLite disk. No server has been provisioned automatically.

On a Linux host with Docker, from this directory:

1. Create a private `.env` (chmod 600) containing separate randomly generated `BLUEY_FAMILY_GATEWAY_TOKEN` and `BLUEY_FAMILY_SETUP_INVITE` values. Use the host secret manager for production. Do not commit or paste these secrets into chat.
2. `docker compose up -d --build`. The service binds only host loopback; its database persists in the named `family-data` volume. Do not use `down -v` unless intentionally deleting all accounts.
3. Put an HTTPS reverse proxy in front of `127.0.0.1:8767`. Set a 20 KB request-body limit and upstream/IP rate limits. Firewall the raw service port; no direct public database access.
4. Configure Vercel **server-only** `BLUEY_FAMILY_SERVICE_URL=https://your-family-api.example` and `BLUEY_FAMILY_GATEWAY_TOKEN` with the same gateway secret, then redeploy. Never put the secret in a VITE variable.
5. Open `/#account`, register using the operator invite, and sign in. Create a nickname, phone enrollment, and separate Windows agent enrollment. Verify role rejection with backend tests before use.

The backend deliberately fails at startup without required configuration. Requests carry both gateway authorization and scoped end-user tokens. Unknown service/network failures must not produce green protection indicators. Use encrypted host disks/backups, monitor disk space and service errors, and test restoring a consistent SQLite backup. No email verification, password recovery, MFA, background push provider, or full parental enforcement service is provisioned by this compose file. This is a deployable development candidate, not a security-reviewed hosted product.
