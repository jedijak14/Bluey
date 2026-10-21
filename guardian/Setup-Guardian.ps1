# Interactive local-parent setup. Never accepts a remote command or a password.
$ErrorActionPreference = 'Stop'
$exitCode = 1
try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  if (!(New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Admin Permissions is needed'
  }
  Write-Host 'BLUEY GUARDIAN - PARENT ADMINISTRATOR SETUP'
  Write-Host 'Run on the child Windows PC, not just the parent laptop.'
  Write-Host 'This experimental service manages a separate LOCAL STANDARD child account.'
  Write-Host 'It disconnects over-budget sessions and writes Edge/Chrome policies.'
  Write-Host 'It is NOT all-browser filtering or a non-bypassable login lock.'
  Write-Host 'Keep existing parental controls and a separate parent administrator account.'
  Write-Host ''
  Write-Host '1: Install and enroll Guardian'
  Write-Host '2: Recover/remove Guardian and archive its installation for reinstallation'
  Write-Host '3: Cancel (no changes)'
  $choice = Read-Host 'Choose 1, 2, or 3'
  if ($choice -eq '1') {
    if ((Read-Host 'Use a spare test PC. Type INSTALL to consent') -cne 'INSTALL') { throw 'Installation cancelled.' }
    $child = Read-Host 'Local STANDARD child Windows account name (not the Bluey nickname)'
    $python = Read-Host 'Full path to system-wide Python 3.11+ under Program Files'
    Write-Host 'Keep the child profile loaded. Create a Windows agent code in signed-in Home.'
    Write-Host 'Optional: deny NEW Windows interactive/RDP logons for this child when restricted.'
    Write-Host 'Uses persistent Windows security policy, not a fake fullscreen lock. Existing sessions are disconnected.'
    Write-Host 'Keep a working separate parent administrator account. Offline recovery removes Bluey-owned deny rights.'
    Write-Host 'Hello/PIN unlock, reconnect and reboot behavior still require supervised device testing.'
    $signIn = (Read-Host 'Type BLOCK-SIGNIN to enable this experimental OS policy, or Enter to keep session-only limits') -ceq 'BLOCK-SIGNIN'
    & (Join-Path $PSScriptRoot 'Install-Guardian.ps1') -ChildAccount $child -Python $python -AcceptExperimentalEnforcement -EnableSignInBlocking:$signIn
    Write-Host 'Installer finished. Verify the service and both browser policies on the child account.'
    $exitCode = 0
  } elseif ($choice -eq '2') {
    if ((Read-Host 'This stops Bluey enforcement. Type RECOVER to consent') -cne 'RECOVER') { throw 'Recovery cancelled.' }
    & (Join-Path $PSScriptRoot 'Recover-Guardian.ps1') -ArchiveInstallation
    $exitCode = 0
  } elseif ($choice -eq '3') {
    Write-Host 'Cancelled. No changes made.'
    $exitCode = 2
  } else { throw 'No valid option selected. No changes made.' }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host 'Setup did not complete. Do not treat this PC as protected.'
} finally {
  Read-Host 'Press Enter to close this administrator window' | Out-Null
}
exit $exitCode
