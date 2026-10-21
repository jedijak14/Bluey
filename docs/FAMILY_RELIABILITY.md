# Home / Kids reliability audit — 2026-10-20

## Status and scope

This is a tested reliability increment, **not a protection release** and not a claim of twelve hours of unattended work. It changes Home/Kids source and the web family API; the existing 0.5.5 companion download does not acquire these native changes automatically. No older release is recreated. Android OS enforcement is outside the current scope.

The public `/api/family/status` endpoint still reported `setup_required: database` during this audit. A successful website deployment is not evidence of a configured family database. Real family accounts and remote enrollment remain blocked until the production database connection and private setup invite are configured. No production secrets or live child records were read or changed for these tests.

## Fixed in this increment

- **Day-boundary deadlock:** pending time requests now expire when the child's local calendar day changes, including a parent-authorized timezone change. A 23:59 request can no longer block a new request after midnight. Exactly-once approvals remain transactional.
- **Pairing races:** issuing Kids codes and deleting profiles now begin serialized transactions. Only the newest Kids code survives concurrent creation. Home binds displayed codes to the selected child and purpose, removes an old code while its replacement is being created, and stops displaying expired codes. Kids codes are correctly described as app codes (including Windows), not phone-only codes. Codes remain memory-only.
- **Discarded usage evidence:** the API exposes recent, same-day, agent-reported minutes without inventing zero usage. It distinguishes not enrolled, awaiting a first report, stale, awaiting policy sync, attention needed and reporting. No state changes `protected` to true.
- **Credential maintenance:** Home shows the Windows agent's credential expiration date (not a token or hash) and warns about recovery/re-enrollment. Thirty-day agent credentials still expire; this increment does not silently extend them or implement automatic renewal.
- **Stale connection UI:** background refreshes no longer overlap each other, refresh on visibility/online return, and reject stale responses. Home marks failed refreshes offline; Kids keeps enrollment and cached rules during an outage and offers retry. Old data is not labeled current. Unauthorized sessions are cleared separately from connectivity failures.
- **Lost parent edits:** background policy updates preserve an edited form and show a conflict. Parents explicitly load the saved revision before editing again; stale revisions cannot silently overwrite newer rules.
- **False save success:** invalid/non-JSON 200 responses and transport failures are errors, not successful saves. A successful write followed by a failed dashboard refresh explicitly says that the displayed data may be stale.
- **Consumed code / failed vault save:** Kids retains a successfully enrolled in-memory session if encrypted persistence fails, explains that the code was consumed, and offers a save retry. Read/clear failures are visible rather than being silently mistaken for a missing enrollment.
- **Native vault durability:** writes use encrypted temporary files and atomic replacement; reads/writes/clears are serialized. A failed replacement preserves the previous file. There is no plaintext fallback. Missing files and corrupt/unreadable files are different outcomes.
- **Setup clarity:** recovery-before-profile-removal warning, current Windows setup descriptions, child-friendly collapsed administrator details, and a fixed mobile logo layout. The username input pattern is compatible with modern browsers' `v` regex flag.

## Validation

Local checks during this audit:

- Full backend suite with a real disposable PostgreSQL 18 instance: **137 passed, 1 Windows-only skip**.
- Frontend/server unit suite: **61 passed**.
- Electron bridge and filesystem vault regressions: **9 passed**. Encryption in the filesystem tests is a stub, not DPAPI certification.
- Production frontend build and formatting checks passed.
- Existing family browser smoke passed.
- New `scripts/family-integration.mjs` passed against real local APIs with SQLite and PostgreSQL. It covers parent registration, conflicting edits, Kids and agent enrollment, one-use/role restrictions, policy/allowlist delivery, usage reporting, network loss/recovery, extra-time approval reaching the agent, code expiry, encrypted-vault retry UI, replaced Kids enrollment and parent logout. It never invokes Windows enforcement.

CI now runs the real-API browser flow. The Windows packaged-family smoke test additionally checks the actual Electron encrypted vault on an empty test profile, refuses to overwrite an existing enrollment, and clears its synthetic token afterward. Check the CI run for this commit before claiming those new packaged Windows checks have passed. A physical installer/reboot/child-account test is still required.

### Reproduce the real-API browser test

Use an isolated development checkout and disposable storage, never production data. The following credentials are public **test fixtures**, not deployment defaults.

Terminal 1:

```sh
mkdir -p artifacts
BLUEY_FAMILY_DB="$PWD/artifacts/family-integration.sqlite" \
BLUEY_FAMILY_GATEWAY_TOKEN=local-integration-only \
BLUEY_FAMILY_SETUP_INVITE=local-integration-invite \
PORT=18767 python -m backend.family_service
```

Terminal 2:

```sh
BLUEY_FAMILY_SERVICE_URL=http://127.0.0.1:18767 \
BLUEY_FAMILY_GATEWAY_TOKEN=local-integration-only \
npm run dev -- --port 15175 --strictPort
```

Terminal 3:

```sh
npm run test:family:integration
node --test scripts/family-bridge-checks.cjs scripts/family-vault-checks.cjs
```

On minimal Linux environments, unpack the Chromium runtime libraries as in `.github/workflows/build.yml` and set `LD_LIBRARY_PATH`. The browser test refuses non-loopback targets. Each run creates a disposable parent; use fresh storage when repeating enough times to reach the registration rate limit.

For database regression tests, set `BLUEY_TEST_POSTGRES_URL` to a disposable PostgreSQL database and run `python -m pytest backend/tests -q`. Never point it at a production database: the isolation test creates/removes a test role and the fixtures create/drop test schemas.

## Next work, in priority order

1. **Production control plane:** configure the private PostgreSQL URI and setup invite, verify `/api/family/status`, then perform a parent-authorized disposable enrollment and revocation in production. A green deployment alone does not pass this gate. See `VERCEL_FAMILY.md`.
2. **Windows installation and recovery:** remove the separate system-Python prerequisite with a reviewed packaged runtime; test UAC, install, restart, update, loaded/unloaded child profiles and offline administrator recovery on an isolated Windows VM and a physical PC. Preserve a separate administrator account and unsaved child work.
3. **Renewal and identity:** replace disruptive monthly recovery/reinstallation with an explicitly parent-authorized credential-rotation protocol; add parent account recovery, MFA and operator auditing before broader use. Do not turn Kids tokens into agent or parent authority.
4. **Every-browser enforcement:** current Edge/Chrome registry writes are not a universal network filter. Define the supported Windows editions and threat model, then review a per-child-SID network/application-control design. Test Firefox, portable browsers, DoH, VPNs, alternate profiles, child-writable runtimes and parent-session exclusions. Do not substitute a fullscreen window, broad parent-affecting DNS rules, or an untested kernel driver for enforcement.
5. **Windows sign-in limits:** the current service disconnects active sessions on its next loop; it does not prevent initial sign-in. A reviewed Windows-native account/session design and boot/login/fast-user-switching recovery matrix are required before advertising a sign-in barrier. Avoid an unvalidated credential provider that could lock out the parent.
6. **Notifications and release:** collect trustworthy blocked-site events (not AI guesses), acknowledge Home delivery separately from push delivery, complete signed-installer/supply-chain review, and publish new Home/Kids downloads only after the native gates pass. Do not restore the deleted historical downloads.

## Explicitly not completed

Universal browser filtering, a non-bypassable Windows logon barrier, Android enforcement, automatic blocked-site capture, background push, signed installers, automatic agent renewal, account recovery/MFA, and physical-device certification. Existing Microsoft Family Safety or other established parental controls should remain enabled.
