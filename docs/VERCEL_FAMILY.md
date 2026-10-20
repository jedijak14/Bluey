# Bluey Home on Vercel + Supabase

The family API runs on Vercel; a separate Python host is not required. Supabase provides persistent PostgreSQL storage. Connecting storage enables accounts and remote management, **not device protection**. Until it is connected, Bluey deliberately returns `setup_required: database`, not a fake working account.

## No-paid-plan setup

1. Connect your Supabase account privately in Arena when ready. No password, database URL, API key or registration invite belongs in chat. No account/project has been provisioned by these code changes.
2. Create a **dedicated project on the Free plan**, only if that option is available to your account. Do not select Pro, paid compute, paid add-ons or a billing upgrade. Review the current limits in your own dashboard before confirming. Free-tier capacity, inactivity pauses, backup availability and uptime restrictions still apply; this is not a promise of unlimited free hosting. Do not run artificial keep-alive traffic to evade provider restrictions.
3. In the Supabase project's **Connect** panel, choose a PostgreSQL **transaction-pooler** connection string suitable for serverless/IPv4 clients. Copy the exact host, port and username shown there. Bluey supports transaction pooling with prepared statements disabled. A Supabase project HTTPS URL or `anon`/publishable key is **not** a database connection string.
4. In the Bluey Vercel project's **Settings → Environment Variables**, privately set `BLUEY_FAMILY_DATABASE_URL` for **Production** to that PostgreSQL URL with TLS (`sslmode=require`). Use the database-owner credentials only on the server. Never use a `VITE_` variable, commit a `.env` file, or put credentials in a browser. URL-encode special characters in the password if constructing a URL yourself; prefer the provider's generated connection string. Existing `DATABASE_URL` / `POSTGRES_URL` are fallbacks, in that order, when the Bluey-specific variable is absent.
5. Set a private random `BLUEY_FAMILY_SETUP_INVITE` in Vercel Production; keep it in your password manager. This gates parent registration, not existing-account sign-in. No invite means registration remains closed. Redeploy the latest source after setting variables.
6. Check `/api/family/status`: it must return `ready` after an actual database query. Open `/#account`, register with a unique password of at least 12 characters and the private invite, then create a test child nickname. Sign out and sign in from another device to check persistence. Create separate **Kids** and **Windows agent** enrollment codes. Do not add real child information before validation.
7. Clear/rotate the invite and redeploy after the intended parents register. Inspect the provider's current free backup/export options and test restoring a backup. Never approve a paid upgrade automatically if quotas or inactivity prevent access. Vercel also has its own plan limits; no hosting plan is changed by this implementation.

## Private database, not public Supabase tables

Bluey initializes the dedicated `bluey_family` schema transactionally. Keep it out of Supabase's exposed Data API schemas. The connection role must own/create this schema and its tables. Do not reuse an unrelated application's database owner credentials.

At initialization Bluey enables row-level security on all ten account/control-plane tables and revokes schema/table access from `PUBLIC` and any Supabase `anon`, `authenticated` and `service_role` roles present. There are **no browser-facing RLS policies**. The server database owner performs queries; the API enforces parent, Kids and agent scope. This is deliberately not Supabase Auth: keep using Bluey's existing scoped accounts and sessions. Never ship the owner connection string or service-role key to the frontend.

Cold starts reapply these safeguards. If initialization or a database query fails, the API returns an unavailable response; it never falls back to ephemeral SQLite or synthetic success. `ready` describes storage reachability, not OS enforcement. `registration_available` reports whether an invite is configured.

## Existing standalone host

`BLUEY_FAMILY_SERVICE_URL` + `BLUEY_FAMILY_GATEWAY_TOKEN` still supports a separate HTTPS family host when no PostgreSQL URL is configured. Its persistent SQLite deployment recipe is in `deploy/family/README.md`. PostgreSQL takes precedence and does **not** migrate SQLite automatically. Back up and explicitly plan any migration before changing an existing family's storage.

## Validation and remaining limits

CI uses disposable real PostgreSQL for role isolation, restart persistence, enrollment/policy races, exactly-once time grants, timestamp precision, agent reports, safety acknowledgements, and the private schema/RLS boundary. No live Supabase account or production test family is created automatically. Transactions serialize per schema with bounded timeouts: this is an invite-only, modest-scale control plane. Account recovery, MFA, email verification and production security/privacy review remain required before wider use.

Windows Guardian is separate administrator-installed software. New enrollments support Edge and Chrome registry policies; existing Edge-only enrollments require parent recovery and re-enrollment to add Chrome. Other browsers, Android filtering, a non-bypassable Windows logon barrier, automatic site-block collection and background push are **not implemented**. Keep existing parental controls enabled.
