#Requires -RunAsAdministrator
param([switch]$ArchiveInstallation)
$ErrorActionPreference='Stop'
$root=Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'Bluey Guardian'
$data=Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Bluey Guardian'
$status=Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Bluey Guardian Status'
$config=Join-Path $data 'config.json'
# Failed pre-enrollment installs may have no config/service. They can still be
# archived explicitly; never stop/delete an unrelated service or follow links.
foreach ($folder in @($root,$data,$status)) {
  if ((Test-Path -LiteralPath $folder) -and ((Get-Item -LiteralPath $folder -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Refusing a redirected Guardian directory. Parent inspection required.'
  }
}
if ((Test-Path -LiteralPath $config) -or (Get-Service -Name BlueyGuardian -ErrorAction SilentlyContinue)) {
  $runtime=Join-Path $root 'runtime\Scripts\python.exe'
  $entry=Join-Path $root 'service_entry.py'
  if (!(Test-Path -LiteralPath $runtime) -or !(Test-Path -LiteralPath $entry)) {
    throw 'Guardian runtime is missing. Repair it before recovery; configuration has been retained.'
  }
  & $runtime -I $entry recover --config $config
  if ($LASTEXITCODE) { throw 'Recovery incomplete. Load the child profile under parent supervision and retry; do not delete configuration.' }
}
if ((Test-Path -LiteralPath $config) -or (Get-Service -Name BlueyGuardian -ErrorAction SilentlyContinue)) {
  throw 'Service/configuration still exists. Nothing will be archived.'
}
if ($ArchiveInstallation) {
  $suffix='.recovered-'+[Guid]::NewGuid().ToString('N')
  foreach ($folder in @($data,$status,$root)) {
    if (Test-Path -LiteralPath $folder) {
      # Rename within the same parent/volume: retain ACLs and data, no recursive
      # deletion and no traversal of any nested links. A retry handles leftovers.
      $backup=$folder+$suffix
      Move-Item -LiteralPath $folder -Destination $backup
      Write-Host "Archived: $backup"
    }
  }
}
Write-Host 'Bluey service removed; enrolled-browser rules cleared when configuration was present.'
Write-Host 'Restart Edge and Chrome. Parent administrator recovery does not require an Internet connection.'
if (!$ArchiveInstallation) { Write-Host 'To reinstall, rerun this script with -ArchiveInstallation. This preserves old files in protected sibling folders.' }
