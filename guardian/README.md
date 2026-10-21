# Bluey Guardian — experimental Windows enforcement

**Test-PC implementation, not certified parental protection. Do not replace existing family controls.** This source contains real Windows calls, not a simulated fullscreen lock. It has not been validated on a physical Windows machine in this Linux workspace.

Native Windows CI now checks real service start/stop/recovery, a loaded disposable child profile, policy-key write denial, child service-stop denial, and cached-policy heartbeat. A separate CI check exercises real Edge and Chrome navigation against harmless local fixture sites using the runner’s own HKCU policies: block, allowlist exception, and exception revocation. This is not an interactive standard-child browser/login test or validation of the complete PowerShell installer on a physical family PC. Check the current CI result before relying on these checks.

## What it enforces

- A LocalSystem service polls one explicitly enrolled **local standard account SID**. It counts logged-in active-session time (not mouse activity), stores the usage ledger in an administrator-only directory, and disconnects that child's Windows session at the daily allowance or bedtime. Disconnect preserves applications; it does not log off or destroy unsaved work. **New opt-in setup also installs SID-scoped Windows LSA denial for new interactive/RDP logons during a restriction; see below.** Reconnecting is checked on the next loop; this is not a Winlogon credential-provider barrier. Locked-but-connected sessions can count toward the allowance.
- Applies per-user Microsoft Edge and Google Chrome `URLBlocklist` and `URLAllowlist` domains. The default versioned starter blocklist includes x.com, twitter.com and common adult services. Parent allowlisting overrides matching blocks. No AI model decides these rules. Confirm policy loading at `edge://policy` and `chrome://policy`; browsers may require restart/policy refresh. Both browsers are attempted independently and their write results are reported separately. This is **not system-wide DNS filtering**, does not cover other browsers or VPNs, and does not detect every unsafe website. Existing blocklists are refused rather than overwritten. Current blocklist protection has not been penetration-tested against profile/registry tampering.
- Cached rules expire after 24 hours. Offline midnight does not reset the budget. Clock rollback blocks the enrolled child until a successful trusted sync. Pending alerts queue on disk; only an actual server acknowledgement marks them queued in Home. Time requests/approvals need connectivity. Administrator recovery works offline.
- Parent/admin sessions are not targeted. No Task Manager disabling, hidden installation, keystroke capture, browser history collection or remote command execution.

## Before installing

Use a spare Windows 10/11 test PC, create a separate local standard child account, and retain a working, separately password-protected parent administrator account. Log the child in once and keep that profile loaded while setting up from the parent administrator session. Install system-wide Python 3.11+ under Program Files (not a child-writable runtime). Host the persistent family service first; the website alone cannot store/enforce policy.

In signed-in Bluey Home, select the child and create a **Windows agent code**, separate from the Kids phone code. In elevated Windows PowerShell:

```powershell
.\guardian\Install-Guardian.ps1 -ChildAccount ChildTest -Python 'C:\Program Files\Python311\python.exe' -AcceptExperimentalEnforcement
```

For a private deployment pass `-FamilyOrigin https://your-dashboard.example`. The installer prompts locally for the one-use enrollment code, never a parent password. Code/agent credentials are not sent in command-line arguments. Source/runtimes under Program Files and ledger/credentials under ProgramData are restricted to SYSTEM and administrators. Inspect ACLs, service identity, service state, and Windows APIs on the actual target before trusting results. Installer/service are not signed and there is no automatic update mechanism.

### Parent recovery

Keep `guardian/Recover-Guardian.ps1` available to the parent administrator. Run it elevated to stop/remove the service and clear the blocklist and allowlist for its enrolled browsers in a **loaded** child profile. Recovery retains the configuration if the child profile is unloaded. Log in/load it under administrator supervision and remove both `HKEY_USERS\<child SID>\Software\Policies\Microsoft\Edge\URLBlocklist` and `URLAllowlist`, plus the equivalent `Software\Policies\Google\Chrome` lists for a Chrome enrollment, before deleting installation files. Do not delete a running service's configuration. Removing a profile in Home revokes remote access, not the local service; recover locally first. Agent credentials expire in 30 days and require re-enrollment; expired/failed sync eventually blocks the child on cached-policy expiry.

### Known gates before a protection release

Physical Windows installation/restart/recovery tests; signed installer/runtime supply-chain review; service watchdog and health monitoring; persistence/clock manipulation testing; enforcement through all supported browsers; Windows lock experience; supervised Android filtering and overlays; trusted site-block event collection; background push. **The browsers’ built-in block screens do not currently send blocked-domain events to Home.** The safety-event API and Kids alert UI support that future integration without claiming a notification was delivered.

## Desktop apps and version 0.5.1

Build `npm run package:win:kids` or `npm run package:win:home` on Windows. Each uses a distinct package identity and per-machine administrator-consented installer. Kids keeps the Bluey mascot but has no ordinary companion automation/terminal bridge. Guardian is a separate administrator setup, not automatically granted by installing the UI. A missing Guardian heartbeat displays **Admin Permissions is needed**. An old/stopped heartbeat displays an attention state instead. The service creates `%ProgramData%\Bluey Guardian Status\status.json` containing only a bound child SID, policy revision, timestamps and rule-application status. Users can read, not write, this directory. Never place credentials there. The administrator-only ledger/configuration stays in the separate Guardian directory. Upgrading a 0.4.0 Guardian requires recovery and installation of 0.5.1; do not point the new UI at a fabricated heartbeat.


## Adding Chrome to an existing installation

Existing configurations without a `browsers` field stay **Edge-only**. This avoids taking over or deleting unrelated Chrome management. From the parent administrator account, recover the old service while the child hive is loaded, install the new release, and enroll with a new Windows agent code. New enrollment refuses any pre-existing Edge or Chrome URL lists before consuming the code. Use the updated family API as well as the updated Guardian; legacy API versions reject new browser-specific reports.

Closing the Kids window cannot stop the separate service, but the service is **not equivalent to Microsoft Family Safety**. It does not disable accounts or install an unvalidated Winlogon blocker. Firefox, portable browsers, VPN bypass and registry/profile tampering require a separate reviewed enforcement architecture. Do not regard a successful registry write or a fresh heartbeat as verified protection.


## Guided local administrator setup (0.5.2)

Install the **Home Windows app on the child's test PC**, then choose **Install or recover Windows Guardian**. This is available before online sign-in so parent recovery remains accessible during a backend outage. A native confirmation and the normal Windows UAC prompt are required. Kids cannot invoke this operation, and the IPC endpoint accepts no commands, account names, enrollment tokens or script paths from the renderer. It launches only the bundled local setup wizard; Windows permissions are never granted from the website or Android Home.

Choose install, enter the local standard Windows child account name (not its Bluey nickname) and the system-wide Python path under Program Files. Create a Windows agent code in authenticated Home and enter it at the installer's hidden prompt. An unavailable family API fails preflight **before** privileged installation directories are created. A successful wizard exit is not proof of protection: test time disconnect, read `edge://policy` / `chrome://policy`, and verify the child cannot stop the service. Keep existing controls enabled.

For reinstall/upgrade, choose recovery in the wizard, or run `Recover-Guardian.ps1 -ArchiveInstallation` elevated. The child profile must be loaded if configuration exists. Only after the service and configuration are removed are the three fixed installation/status directories renamed to `.recovered-<random id>` siblings. This fixes the previous dead end where recovery left directories that blocked reinstall. Archives preserve files and private ACLs, are not automatically executable/restorable installations, and can be reviewed/deleted by the parent later. Incomplete recovery retains configuration. Existing redirected roots are refused; there is no recursive deletion. Partial archive retries are supported. Ordinary recovery without the flag keeps the original directories for compatibility.

Windows CI parses the wizard and verifies failed connectivity preflight, unresolved configuration retention, archive ACL/data preservation and repeat recovery on disposable directories. Packaged app tests verify the Home button, bundled script and Kids IPC denial. **Interactive UAC approval and a full installer/reboot on physical hardware still require parent-supervised testing.** Administrator approval does not add all-browser filtering or Android enforcement. The new optional LSA gate below is not a custom Winlogon credential provider.


## Optional Windows new-logon blocking and native screen warnings

New source builds support **explicit administrator opt-in** with `-EnableSignInBlocking`, or type `BLOCK-SIGNIN` in the guided installer. Existing configurations default to session-only enforcement; they are not silently upgraded. Recover the old service and reinstall/re-enroll to use this source. Update the family API first so it accepts `signin_state` in agent reports.

```powershell
.\guardian\Install-Guardian.ps1 -ChildAccount ChildTest -Python 'C:\Program Files\Python311\python.exe' -AcceptExperimentalEnforcement -EnableSignInBlocking
```

This is actual Windows Local Security Authority policy: `SeDenyInteractiveLogonRight` and `SeDenyRemoteInteractiveLogonRight`, assigned **only** to the validated local standard child SID. It covers new logons evaluated against those rights, not a fake fullscreen window. At time limit, bedtime, invalid clock, absent policy or expired offline policy, the service applies both rights before disconnecting existing child sessions. With an allowed policy/extra time it removes only Bluey's owned rights. It does not disable accounts or change passwords, parent rights, global logon policies, network/service logon rights, credential providers, or the secure desktop.

`signin.json` is an administrator-only write-ahead ownership journal alongside `config.json`. Missing/corrupt/mismatched journals never authorize removing existing Windows restrictions. Existing directly assigned deny rights are refused instead of adopted. Do not co-manage the same rights through another tool or Group Policy: Windows does not identify who last assigned an identical right. A changed or promoted child identity stops enforcement after attempting to release Bluey's owned denial. Stopping the service while restricted does **not** automatically clear persistent rights.

**Offline parent recovery is mandatory:** keep a separate, working parent administrator account. Recovery removes Bluey-owned sign-in rights *before* checking whether the child profile is loaded. If browser cleanup then reports an unloaded profile, configuration is retained: the restored child sign-in lets the parent load that profile and rerun recovery. If the journal is damaged, retain all files and repair with administrator help; do not guess which external policies should be removed. In an emergency an administrator can inspect the child's direct Local Security Policy user-right assignments; never clear rights for a whole group or parent account.

New enrollments also enable native `WTSSendMessage` save-your-work warnings, sent to the bound child's active sessions at one minute or less before allowance/bedtime. They use a Windows-native dialog, work without the Kids app running, do not launch SYSTEM code on the child's desktop, and never wait for an OK click. Dismissing or failing to display a warning cannot extend the budget. At cutoff the WTS service disconnects the child to the actual Windows sign-in screen. This does **not** replace Windows' secure lock screen with Bluey graphics; warnings may be unavailable when the desktop is locked.

### What still needs interactive device testing

The native CI check exercises real LSA deny/add/remove, a failed new `LogonUser` call, persisted denial across service restart, successful parent administrator logon, extra-time restoration and offline recovery with an unloaded child profile. Check the current CI run before treating these as passed. The CI runner does not display the warning in an interactive child desktop or certify Hello/PIN unlock, reconnection to an existing session, fast user switching, sleep, cold boot or safe-mode behavior. A service startup delay can leave a gap when the last persisted state was allowed. Existing disconnected sessions still depend on the running WTS loop. Do not advertise this as a universal/non-bypassable sign-in barrier or replace established family controls.

API references reviewed: [Microsoft account-right constants](https://github.com/MicrosoftDocs/win32/blob/docs/desktop-src/SecAuthZ/account-rights-constants.md), [pywin32 LSA bindings](https://github.com/mhammond/pywin32/blob/main/win32/src/win32security.i), and [pywin32 native WTS message binding](https://github.com/mhammond/pywin32/blob/main/win32/src/win32tsmodule.cpp).
