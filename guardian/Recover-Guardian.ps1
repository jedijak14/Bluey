#Requires -RunAsAdministrator
$ErrorActionPreference='Stop'
$root=Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'Bluey Guardian'
$config=Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Bluey Guardian\config.json'
& (Join-Path $root 'runtime\Scripts\python.exe') -I (Join-Path $root 'service_entry.py') recover --config $config
if ($LASTEXITCODE) { throw 'Recovery failed. Stop BlueyGuardian in Services before further changes.' }
Write-Host 'Service removed and loaded-profile Edge rules cleared. Keep the parent administrator account available. Restart Edge to refresh policy.'
