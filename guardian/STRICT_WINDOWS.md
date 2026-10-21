# Strict Windows mode — new source, not a certified protection release

This is **opt-in** for one local standard child account. Existing installations
are not silently changed. Keep a separate working parent administrator account,
existing protections, and offline recovery. First validate on a spare Windows PC.
This mode is not included in the previously published 0.5.7 installers.

## Parent choices implemented

- **Approved HTTPS sites only.** The parent allowlist authorizes a domain and its
  subdomains. Unlisted sites are denied, not assumed safe. The exact configured
  family-service hostname is additionally allowed for enrollment and time requests.
  Because TLS is not decrypted, this exception trusts the entire HTTPS origin,
  not only `/api/family` paths. Do not host untrusted relays at that origin.
- **Warn, then sign out.** With explicit consent, cutoff logs off all bound-child
  sessions, including disconnected sessions, instead of merely disconnecting them.
  Unsaved work can be lost. Existing LSA rights deny new interactive/RDP logons.
  Parent sessions and accounts are not targeted.

## Architecture

Persistent Windows Filtering Platform filters match the validated child's token
SID at ALE_AUTH_CONNECT_V4/V6. All direct TCP/UDP/other outbound connections are
blocked. A higher-weight filter in the same private sublayer allows only IPv4 TCP
to `127.0.0.1:18768`. Filters persist after the Guardian process exits. No global
firewall defaults, DNS configuration, hosts file or other provider's rules change.
A protected ownership journal records random provider/sublayer/filter GUIDs for
bounded offline recovery; ownership conflicts are refused.

The SYSTEM service's local HTTPS gateway verifies the peer process token against
the enrolled child SID. It accepts only approved DNS hostnames on CONNECT port 443,
requires a matching TLS ClientHello SNI, rejects ECH and nonpublic/translated IP
answers, pins the validated DNS address, and closes tunnels when policy/restriction
changes. Plain HTTP requests redirect to HTTPS. No certificate is installed, TLS
is not decrypted, and allowed browsing contents/history are not recorded. Blocked
hostnames produce real `site_blocked` events in the durable queue. The UI says
**queued**, not delivered, until the family API acknowledges the event.

Edge/Chrome and Firefox receive child-hive-only proxy/ECH settings. Existing proxy
management is refused instead of overwritten. Other browsers must support this
HTTP CONNECT proxy and visible TLS SNI; otherwise their network requests fail
closed. Games, non-web apps, private-network sites and unsupported browsers may
stop working. Strict mode is not a compatibility promise for every application.
The Kids desktop control API uses a separate proxied Electron session when the
bound child's Guardian status advertises strict mode.

## Administrator setup

Use the guided Home administrator wizard and explicitly type `STRICT-WEB` and
`SIGN-OUT`, or run:

```powershell
.\Install-Guardian.ps1 -ChildAccount ChildTest -Python 'C:\Program Files\Python311\python.exe' -AcceptExperimentalEnforcement -EnableSignInBlocking -StrictNetwork -SignOutAtCutoff
```

Add approved school sites **and their required resource/login domains** in Home.
Restart browsers after enrollment. Do not add a proxy/VPN/translation service to
the allowlist unless you intend to trust what that service can relay.

Recovery stops Guardian, removes only its journal-owned WFP filters and LSA rights
before requiring a loaded child hive, then removes its proxy/browser settings. It
needs no Internet connection. If a journal is corrupt/missing, or someone else
changed proxy policy, recovery retains configuration rather than guessing or
removing unrelated restrictions. Never delete the journal to “repair” filtering.

## Verification and remaining limits

Unit/integration fixtures cover host validation, exact control exception, private
IP and translation refusal, proxy authentication, TLS SNI/fragment checks, bounded
requests, real denied-host events, live tunnel revocation and ownership validation.
A new isolated Windows CI gate launches actual disposable standard-user processes
to check IPv4/IPv6 TCP and UDP denial, the local-proxy exception, parent isolation,
persistence after closing the WFP engine handle and offline recovery. Consult the
actual run result; code or a heartbeat is not proof that this native gate passed.

Still require interactive device validation: installed browser consumption of all
proxy/ECH policies, Windows Hello/PIN, fast user switching, reboot/sleep/startup,
full installer/UAC/recovery, service failure during active traffic, and delivery
from a real enrolled PC to its parent's inbox. This is not a boot-time filter or
custom credential provider. There can be a startup window before BFE/service
initialization, and previously permitted flows need native reauthorization tests.

A parent-approved HTTPS service can itself serve/proxy unwanted content. SNI checks
do not inspect encrypted HTTP Host/HTTP2 authority or defeat every domain-fronting
arrangement. Privileged SYSTEM services may broker network traffic on a user's
behalf; this does not certify every such path, safe mode, physical access or an
administrator-controlled machine. Do not advertise this as unbypassable Windows
protection or replace established family controls until these gates are tested.
Android OS enforcement is unchanged and excluded.
