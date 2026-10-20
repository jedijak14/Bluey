# Bluey 0.5.1 preview — family branding and Chrome policies

Experimental test-device release, not certified parental protection.

- Selected Bluey Home and original Bluey logos on downloads; Home branding in both account/dashboard headers. Separate Home/Kids Windows icons.
- New Guardian enrollments write both Chrome and Edge URL block/allow lists with child-read-only ACLs. Browser-specific health exposes partial failure; revoked exceptions are cleared before new blocks are written. Existing Edge-only configurations remain Edge-only until administrator recovery/re-enrollment.
- Windows CI gates exercise the real service, standard-child policy ACLs, stop denial, heartbeat and recovery. Separate headless Edge/Chrome checks use harmless local fixtures for blocked navigation, an allowed exception and its revocation; these run as the disposable runner, not an interactive child.
- Vercel family database preparation for Supabase Free: transaction-pooler compatibility, private schema, row-level security on ten tables, and revoked client-role grants. No Supabase account/project is provisioned by this release; server-side configuration is still required. No paid plan is selected or unlimited free uptime promised.

## Important installation and coverage limits

Installing Home/Kids alone does not install Guardian. Use a separate standard child and password-protected parent administrator account on a spare test PC. Recover the previous Guardian before installing/enrolling this release; retain the offline administrator recovery script. Update a self-hosted family API before deploying the new agent's browser-specific reports.

Windows session disconnect is not a non-bypassable logon barrier. Firefox/other browsers, VPNs, Android filtering, physical installer/reboot validation, automatic site-block collection and background push remain unfinished. Browser policy writes and CI fixtures are not proof of tamper resistance or Microsoft Family Safety equivalence. Keep existing parental controls enabled.

Windows binaries are unsigned. Android APKs are debug-signed test builds; signing-key continuity is not guaranteed. No paid hosting, billing upgrade or live database activation is included.
