param(
  [Parameter(Mandatory=$true)][string]$ChildAccount,
  [Parameter(Mandatory=$true)][string]$Python,
  [string]$FamilyOrigin = 'https://bluey-plum.vercel.app',
  [switch]$AcceptExperimentalEnforcement
)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (!(New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show('Admin Permissions is needed', 'Bluey for Kids') | Out-Null
  throw 'Admin Permissions is needed'
}
if (!$AcceptExperimentalEnforcement) { throw 'Read guardian/README.md. Use a test PC and pass -AcceptExperimentalEnforcement only after arranging parent recovery.' }
$origin = [Uri]$FamilyOrigin
if ($origin.Scheme -ne 'https' -or $origin.UserInfo -or $origin.AbsolutePath -ne '/' -or $origin.Query -or $origin.Fragment) { throw 'A public HTTPS family origin without a path is required.' }
# Check connectivity before creating privileged directories or installing code.
$health = Invoke-RestMethod -Uri ($FamilyOrigin.TrimEnd('/') + '/api/family/status') -TimeoutSec 12 -MaximumRedirection 0
if ($health.status -ne 'ready') { throw 'Family service is not ready. Connect its database before enrollment. No installation directories were created.' }
if (Get-Service -Name BlueyGuardian -ErrorAction SilentlyContinue) { throw 'Guardian service already exists. Recover it before reinstalling.' }
$programFiles = [Environment]::GetFolderPath('ProgramFiles')
$programData = [Environment]::GetFolderPath('CommonApplicationData')
$Python = (Resolve-Path $Python).Path
if (!$Python.StartsWith($programFiles + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Install a system-wide Python 3.11+ under Program Files. User-writable runtimes cannot run as SYSTEM.' }
$root = Join-Path $programFiles 'Bluey Guardian'
$data = Join-Path $programData 'Bluey Guardian'
$status = Join-Path $programData 'Bluey Guardian Status'
if ((Test-Path $root) -or (Test-Path $data) -or (Test-Path $status)) { throw 'Guardian directory already exists. Recover and remove the previous installation first.' }
New-Item -ItemType Directory -Path $root,$data -Force | Out-Null
foreach ($path in @($root,$data)) {
  & icacls.exe $path /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
  if ($LASTEXITCODE) { throw 'Could not restrict Guardian files to SYSTEM and administrators.' }
}
New-Item -ItemType Directory -Path $status | Out-Null
& icacls.exe $status /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE) { throw 'Could not protect the read-only service status directory.' }
Copy-Item (Join-Path $PSScriptRoot '..\backend') $root -Recurse
Copy-Item (Join-Path $PSScriptRoot 'service_entry.py') $root
& $Python -I -m venv (Join-Path $root 'runtime')
if ($LASTEXITCODE) { throw 'Could not create trusted runtime.' }
$runtime = Join-Path $root 'runtime\Scripts\python.exe'
& $runtime -I -m pip --isolated install --index-url https://pypi.org/simple -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE) { throw 'Runtime dependencies failed; service was not installed.' }
$config = Join-Path $data 'config.json'
& $runtime -I (Join-Path $root 'service_entry.py') enroll --config $config --username $ChildAccount --origin $FamilyOrigin
if ($LASTEXITCODE) { throw 'Enrollment failed; service was not installed.' }
& $runtime -I (Join-Path $root 'service_entry.py') install --config $config
if ($LASTEXITCODE) { throw 'Service startup failed. Run Recover-Guardian.ps1 as the parent administrator.' }
& sc.exe failure BlueyGuardian reset= 86400 actions= restart/5000/restart/15000/restart/30000 | Out-Null
if ($LASTEXITCODE) { throw 'Could not configure service failure recovery.' }
Write-Host 'Guardian installed. Verify time disconnect, edge://policy and chrome://policy on the test child account. This does not mean all browsers or Android are protected.'
