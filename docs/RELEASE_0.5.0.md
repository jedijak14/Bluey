# Bluey 0.5.0 — deterministic Kids rules and separate Windows family apps

Supersedes the 0.4.0 family preview; this is still an **experimental prerelease, not verified all-device parental protection**. Keep existing family controls enabled.

- Curated, versioned domain blocklist includes X/Twitter and common adult services. Parent block/allow lists are deterministic; no AI classifier can allow a blocked site. Allowlisting overrides matching blocks and includes subdomains. Unlisted does not mean safe. This starter list is not exhaustive or a maintained threat-intelligence feed.
- Separate Bluey for Kids and Bluey Home Windows installers, alongside companion Windows and the three Android APK variants. The blueberry mascot remains in Kids. The Kids desktop does not expose the ordinary companion's automation/terminal IPC or start its engine. General child-focused AI chat remains unavailable; it is not silently connected to unrestricted adult AI.
- Kids desktop reads a minimal read-only Guardian heartbeat. Missing installation shows **Admin Permissions is needed**; stale/mismatched reports do not show protection. Closing Kids does not stop Guardian. Family Windows installs request administrator consent; children use the app without administrator privileges.
- Guardian applies Edge URLBlocklist and parent URLAllowlist, clearing revoked exceptions before installing replacements. The service's credentials/ledger remain administrator-only; the public heartbeat contains no token. Administrator recovery clears both policy lists.

## Checks

Release is gated on backend/client/browser regressions, actual Windows SCM service start/stop/recovery and permission checks, packaged Home/Kids desktop launch tests, and Android emulator tests. Native service validation caught and fixed the Windows account-group API signature; it does not prove interactive logon blocking or real Edge navigation filtering.

## Not finished / do not rely on it alone

A persistent production family backend must still be hosted and connected. Desktop installation does not automatically enroll/install the Python Guardian service: parent administrator setup is documented in guardian/README.md and bundled with each family Windows installer. Guardian still needs physical Windows install/reboot/recovery and adversarial testing. Session disconnection is not a non-bypassable Winlogon barrier. No all-browser/network filter, Android Device Owner enforcement, automatic Edge blocked-site event collector, background push, comprehensive unsafe-site detection, signed Guardian installer, or independently verified protection exists. Alert/preview dismissal does not control policy, but a dismissible companion is not itself a security boundary.

Unsigned Windows builds / debug-signed Android packages may produce OS warnings. New CI builds may not share Android signing keys with earlier previews. Never disable existing safety controls to install these previews.
