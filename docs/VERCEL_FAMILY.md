# Bluey Home on Vercel + PostgreSQL

Vercel can now run the family API itself. A separate Python server is **not required** in this mode. A persistent PostgreSQL database is required: the API refuses SQLite/temporary files on Vercel. Connecting the database enables accounts and remote policy management, not OS enforcement.

## One-time account setup

1. In the **Bluey** Vercel project, open **Storage** and connect a PostgreSQL provider such as Neon. Review the provider's plan, region, retention and billing before approving. The agent's Vercel connector cannot provision a database. Use a dedicated database; existing unrelated application data should not share these credentials.
2. Connect it to **Production**. The API reads `BLUEY_FAMILY_DATABASE_URL`, `DATABASE_URL`, or `POSTGRES_URL`, in that order. Use the provider's encrypted/pooled connection URL in Vercel's environment settings—not in chat, Git, `VITE_` variables, or the browser. Remote PostgreSQL connections require TLS. A dedicated `bluey_family` schema is initialized transactionally. The database role needs permission to create that schema/tables.
3. Add a private, random `BLUEY_FAMILY_SETUP_INVITE` in the project's Production environment settings. Keep it in your password manager. This is a registration invite, not a default password. Registration stays closed without it; existing account sign-in does not require it. Never paste database credentials or the invite into chat.
4. Redeploy the latest production source so the database/environment connection takes effect. No gateway token is required in the direct PostgreSQL mode: the public API validates requests and retains the separate parent, Kids and Windows-agent bearer sessions.
5. Open `/#account`. Create a parent account using your chosen username, a unique password of at least 12 characters, and the invite. Add a child nickname. Create a Kids enrollment and a **separate Windows agent enrollment**. Test signing in from another device; do not place real child information in a test profile.
6. After intended parents register, clear/rotate the invite and redeploy. Existing accounts continue to work. Configure provider backups and verify restoration before relying on stored rules. Account recovery/MFA/email verification and production security/privacy review are still required before wider use.

`/api/family/status` checks an actual database query. `ready` means the account/control plane is reachable, **not that a device is protected**. `registration_available` reports whether an operator invite is configured. Missing storage returns `setup_required: database`; connection errors return 503, never demo accounts or synthetic success.

## Existing standalone host

The previous `BLUEY_FAMILY_SERVICE_URL` + `BLUEY_FAMILY_GATEWAY_TOKEN` mode remains supported when no PostgreSQL URL is configured. Its persistent SQLite deployment recipe is in `deploy/family/README.md`. Configuring PostgreSQL takes precedence and does **not** migrate existing SQLite data. Back up and explicitly plan a migration before changing storage for an existing family.

## Validation / limits

Tests use an isolated real PostgreSQL service in CI: account/role isolation, persistent sessions across app instances, one-use enrollment races, policy version races, exactly-once time grants, timestamp precision, agent reports and safety inbox acknowledgements. No production test accounts or private user data are created automatically. Transactions serialize per schema with bounded lock/query timeouts; this is an invite-only, modest-scale control plane, not a multi-region high-throughput service. Use a pooled provider URL and monitor capacity.

Guardian remains separate parent-administrator software. Saving policies does not prove they were applied. Edge-only rules, Android enforcement gaps, lack of a non-bypassable logon barrier, no automatic blocked-site collector, and no background push remain unchanged. Keep existing parental controls enabled.
