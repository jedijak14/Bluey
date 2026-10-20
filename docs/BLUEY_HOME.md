# Bluey Home / Bluey for Kids — foundation preview

**Not parental protection. Do not replace Microsoft Family Safety or existing controls with this preview.**

Home is an Android parent app **and** web dashboard (`/#home`). Bluey for Kids is a separate Android app (`app.bluey.kids`). The ordinary Bluey Android companion remains `app.bluey.companion`. All three can coexist.

## Implemented

- Parent sign-in and operator-invite registration; separate child profiles (use nicknames).
- Per-child, versioned rule storage: daily minutes, bedtime, timezone, and explicit blocked domains. Saving a rule does **not** enforce it.
- Single-use, ten-minute enrollment codes. Creating a new enrollment and redeeming it revokes the previous Kids session for that profile.
- Kids request extra minutes; parents approve/decline in Home. One pending request per child. Requests expire after an hour; approvals are associated with the child's policy-local day and cannot be applied twice.
- Remote-capable authenticated HTTPS gateway, so devices need not be on the same Wi-Fi **when a persistent backend has been hosted**.
- Refreshing request inbox while Home is foregrounded. **No background push alerts.**
- Responsive, clearly labeled fictional demo; no fabricated device telemetry.
- Kids Android enrollment encrypted with an app-isolated Android Keystore key. Parent sessions stay in memory; closing/reloading Home requires sign-in. Browser Kids enrollment is also memory-only.

## Not implemented

Windows enforcement service, Kids Windows installer, nonclosable Windows lock screen, offline limits, browser/DNS filtering, unsafe-site classification, trusted usage insights, device heartbeats, parent recovery/MFA/account recovery, and push notifications. The time-up screen is **a dismissible design preview**, not a lock. Profiles always say **Not protected**, usage is unknown, and no browsing history/screenshots/conversations are collected by this family API.

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
6. Open Home's **Time requests** section to review requests. Leaving the app may suspend refresh. Approval records an allowance; it does not change OS enforcement in this preview.

Gateway authentication is required even for registration; each user also needs their own role-scoped bearer session. Passwords use salted scrypt. Session/enrollment tokens are hashed in SQLite. Parent sessions expire in 12 hours; Kids sessions in 30 days (re-enroll thereafter). No cookies, plaintext password storage, server-side screen capture, or externally callable desktop automation. Session data is private and no-store. Kid nicknames, policies and request reasons are stored in plaintext within the protected database, so disk/backup encryption and operator access control matter.

Registration/login/enrollment/request rate limits are basic safeguards, not a production abuse-management solution; gateway/WAF protection, account recovery, security review and parental/privacy/legal review remain deployment gates before real-family use. Avoid children's sensitive personal information. Remove a child profile to delete its policy, grants, requests, enrollment and sessions. Requests/grants older than 30 days are cleaned on access; encrypted backups need their own deletion policy.

## Build separate APKs

Java 21 + Android SDK 35:

```sh
npm ci
npm run android:home  # release/family/Bluey-Home-0.4.0-Android.apk
npm run android:kids  # release/family/Bluey-Kids-0.4.0-Android.apk
npm run android:apk   # original companion, separate app ID
```

Each build rebuilds the bundled web UI and syncs Capacitor with its matching variant before Gradle. Do not run these builds concurrently in one checkout. Family apps permit HTTPS only and do not request microphone permission. Preview APKs are debug-signed, not Play Store releases; signing continuity across CI machines is not guaranteed. Uninstalling an old debug build may be necessary and deletes local enrollment.

## Windows microphone and privacy

Use **Settings → Voice → microphone selection** for the Windows microphone (including quiet sessions). Android uses its device recognizer. Replies remain text-only; the optional phone chirp is not speech.

In **Settings → Privacy**, an updated authenticated Windows engine exposes independent **Computer Use** and **Screen access** controls. Computer Use off denies desktop actions even if a phone/model requests them. Screen access defaults off and denies screen reads, screenshots and live frames. Permission changes stop current work and revoke pending approvals. An OS action already delivered cannot be undone.

Enabling Screen access does not start capture. **Choose a screen to share** opens a consent picker. Live sharing sends bounded JPEG frames roughly every three seconds; a frame is eligible as question context for ten seconds. A visible banner stops sharing. Frames are kept in process memory, not written as a video or file by Bluey. They accompany questions sent to the configured model, possibly a cloud provider with its own retention rules. A vision-capable engine model is needed; the exact Gemma 1B BASE preview remains text-only. Stopping/revoking sharing cancels ongoing model requests best-effort; it cannot retract data already sent to a provider. Desktop privacy permissions are separate from family policy and cannot be changed through Home/Kids credentials.
