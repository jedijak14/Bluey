# Bluey Home / Bluey for Kids — foundation preview

**Not parental protection. Do not replace Microsoft Family Safety or existing controls with this preview.**

Home is an Android parent app **and** web dashboard (sign in at `/#account` before accessing `/#home`). Bluey for Kids is a separate Android app (`app.bluey.kids`) and Windows desktop app. Home also has a separate Windows installer. The ordinary Bluey Android companion remains `app.bluey.companion`. All three can coexist.

## Implemented

- Parent sign-in and operator-invite registration; separate child profiles (use nicknames).
- Per-child, versioned rule storage: daily minutes, bedtime, timezone, parent block/allow domains and a versioned default blocklist (including X/Twitter). Saving a rule does **not** enforce it.
- Single-use, ten-minute enrollment codes. Creating a new enrollment and redeeming it revokes the previous Kids session for that profile.
- Kids request extra minutes; parents approve/decline in Home. One pending request per child. Requests expire after an hour; approvals are associated with the child's policy-local day and cannot be applied twice.
- Remote-capable authenticated HTTPS gateway, so devices need not be on the same Wi-Fi **when a persistent backend has been hosted**.
- Refreshing request inbox while Home is foregrounded. **No background push alerts.**
- Account-gated Home; no public demo or fabricated device telemetry.
- Separate Windows-agent enrollment and scoped reports, plus a parent safety inbox. See [Guardian](../guardian/README.md) for experimental enforcement and recovery.
- Kids safety animation uses the selected Bluey Kids logo, blurred app backdrop and surprised mascot. It does not overlay or monitor other Android apps.
- Kids Android enrollment encrypted with an app-isolated Android Keystore key. Parent sessions stay in memory; closing/reloading Home requires sign-in. Browser Kids enrollment is also memory-only.

## Not implemented

A signed Kids Windows installer, tamper-resistant Winlogon lock, all-browser/DNS filtering, unsafe-site classification, trusted usage insights, MFA/account recovery, and background push remain unimplemented. The new **experimental** administrator-installed Guardian service can disconnect the enrolled standard child's session and apply Edge rules, with cached budgets and local administrator recovery. It has not been physically validated here; profiles remain **Not protected** rather than inferring verified protection from an agent's own report. The fullscreen time-up UI remains a dismissible preview, separate from session disconnection. No browser event collector currently sends Edge blocks to the safety inbox.

See [persistent backend setup](../deploy/family/README.md) and [Windows setup/recovery](../guardian/README.md).

A safe Windows implementation needs an independently reviewed, signed administrator-installed service, a standard non-administrator child account, authenticated local UI/service IPC, per-user policy binding, offline policy caching and clock-change handling, controlled browser filtering, tamper resistance, uninstall authorization, and a parent-owned recovery route. Fullscreen Electron alone cannot provide this. No attempt is made here to disable Task Manager or lock a person out.

## Hosted service setup (operator)

No production family backend is provisioned by this source change. The Vercel UI honestly reports that it is unavailable until configured. **Vercel's ephemeral functions/filesystem are not the SQLite host.** Use a private persistent host with TLS termination and firewall restrictions; do not expose the desktop engine to the Internet.

1. Install Python 3.11+ and `pip install -r backend/requirements-family.txt` in a virtual environment.
2. Configure via the host's secret manager (never frontend `VITE_` variables):
   - `BLUEY_FAMILY_DB`: absolute path on a persistent, access-restricted, backed-up volume.
   - `BLUEY_FAMILY_GATEWAY_TOKEN`: a randomly generated long gateway secret, shared only with the Vercel server function.
   - `BLUEY_FAMILY_SETUP_INVITE`: a separate high-entropy operator registration invite. Rotate/disable after intended accounts are registered.
   - `PORT`: defaults to 8767.
3. Run `python -m backend.family_service` as a restricted service user. Put behind HTTPS with a **20 KB request-body limit**, upstream timeouts and IP-level rate limiting. Prefer one instance with local durable SQLite storage; this is not a multi-region database architecture. Enable encrypted volumes/backups and test restore. Do not put the database inside the Git checkout.
4. Configure Vercel server-only `BLUEY_FAMILY_SERVICE_URL=https://your-service-origin` (no URL path) and the same `BLUEY_FAMILY_GATEWAY_TOKEN`. Redeploy. Native apps use the published `https://bluey-plum.vercel.app` gateway by default; operators can build with `VITE_BLUEY_FAMILY_ORIGIN` set to their HTTPS dashboard origin. That origin is public configuration, never a secret.
5. Register a parent with a username, 12+ character password and operator invite. Add nicknames, save rules, and create an enrollment code. Enter it in the separate Kids app, not the ordinary companion pairing screen.
6. Open Home's **Time requests** section to review requests. Leaving the app may suspend refresh. Approval records an allowance for the enrolled Guardian to fetch on its next successful sync. Without that service, nothing changes on the PC.

Gateway authentication is required even for registration; each user also needs their own role-scoped bearer session. Passwords use salted scrypt. Session/enrollment tokens are hashed in SQLite. Parent sessions expire in 12 hours; Kids sessions in 30 days (re-enroll thereafter). No cookies, plaintext password storage, server-side screen capture, or externally callable desktop automation. Session data is private and no-store. Kid nicknames, policies and request reasons are stored in plaintext within the protected database, so disk/backup encryption and operator access control matter.

Registration/login/enrollment/request rate limits are basic safeguards, not a production abuse-management solution; gateway/WAF protection, account recovery, security review and parental/privacy/legal review remain deployment gates before real-family use. Avoid children's sensitive personal information. Remove a child profile to delete its policy, grants, requests, enrollment and sessions. Requests/grants older than 30 days are cleaned on access; encrypted backups need their own deletion policy.

## Build separate APKs

Java 21 + Android SDK 35:

```sh
npm ci
npm run android:home  # release/family/Bluey-Home-0.5.0-Android.apk
npm run android:kids  # release/family/Bluey-Kids-0.5.0-Android.apk
npm run android:apk   # original companion, separate app ID
```

Each build rebuilds the bundled web UI and syncs Capacitor with its matching variant before Gradle. Do not run these builds concurrently in one checkout. Family apps permit HTTPS only and do not request microphone permission. Preview APKs are debug-signed, not Play Store releases; signing continuity across CI machines is not guaranteed. Uninstalling an old debug build may be necessary and deletes local enrollment.

## Windows Home and Kids

On Windows, run `npm run package:win:home` or `npm run package:win:kids`. These produce separate per-machine, administrator-consented installers in `release/home` and `release/kids`. Kids keeps the blueberry mascot and uses an isolated family-only bridge, not the normal desktop automation engine. General Kids AI chat is not implemented. The Guardian service requires separate parent setup; installing or closing the companion does not install or stop enforcement. Missing Guardian displays **Admin Permissions is needed**. Setup/recovery instructions are bundled as a plain-text file.

## Windows microphone and privacy

Use **Settings → Voice → microphone selection** for the Windows microphone (including quiet sessions). Android uses its device recognizer. Replies remain text-only; the optional phone chirp is not speech.

In **Settings → Privacy**, an updated authenticated Windows engine exposes independent **Computer Use** and **Screen access** controls. Computer Use off denies desktop actions even if a phone/model requests them. Screen access defaults off and denies screen reads, screenshots and live frames. Permission changes stop current work and revoke pending approvals. An OS action already delivered cannot be undone.

Enabling Screen access does not start capture. **Choose a screen to share** opens a consent picker. Live sharing sends bounded JPEG frames roughly every three seconds; a frame is eligible as question context for ten seconds. A visible banner stops sharing. Frames are kept in process memory, not written as a video or file by Bluey. They accompany questions sent to the configured model, possibly a cloud provider with its own retention rules. A vision-capable engine model is needed; the exact Gemma 1B BASE preview remains text-only. Stopping/revoking sharing cancels ongoing model requests best-effort; it cannot retract data already sent to a provider. Desktop privacy permissions are separate from family policy and cannot be changed through Home/Kids credentials.
