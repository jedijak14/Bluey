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
$Python = (Resolve-Path $Python).Path
if (!$Python.StartsWith($env:ProgramFiles + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Install a system-wide Python 3.11+ under Program Files. User-writable runtimes cannot run as SYSTEM.' }
$root = Join-Path $env:ProgramFiles 'Bluey Guardian'
$data = Join-Path $env:ProgramData 'Bluey Guardian'
$status = Join-Path $env:ProgramData 'Bluey Guardian Status'
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
& $runtime -I -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE) { throw 'Runtime dependencies failed; service was not installed.' }
$config = Join-Path $data 'config.json'
& $runtime -I (Join-Path $root 'service_entry.py') enroll --config $config --username $ChildAccount --origin $FamilyOrigin
if ($LASTEXITCODE) { throw 'Enrollment failed; service was not installed.' }
& $runtime -I (Join-Path $root 'service_entry.py') install --config $config
if ($LASTEXITCODE) { throw 'Service startup failed. Run Recover-Guardian.ps1 as the parent administrator.' }
& sc.exe failure BlueyGuardian reset= 86400 actions= restart/5000/restart/15000/restart/30000 | Out-Null
if ($LASTEXITCODE) { throw 'Could not configure service failure recovery.' }
Write-Host 'Guardian installed. Verify time disconnect and edge://policy on the test child account. This does not mean all browsers or Android are protected.'
