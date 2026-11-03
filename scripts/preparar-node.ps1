param([string]$Version = '24.22.2')
$ErrorActionPreference = 'Stop'
$projectRootComprobantes = Split-Path -Parent $PSScriptRoot
$toolsRootComprobantes = Join-Path $projectRootComprobantes '.tools'
$archiveNameComprobantes = "node-v$Version-win-x64.zip"
$archiveComprobantes = Join-Path $toolsRootComprobantes $archiveNameComprobantes
$nodeDirectoryComprobantes = Join-Path $toolsRootComprobantes "node-v$Version-win-x64"
New-Item -ItemType Directory -Path $toolsRootComprobantes -Force | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $nodeDirectoryComprobantes 'node.exe'))) {
  Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$Version/$archiveNameComprobantes" -OutFile $archiveComprobantes
  $checksumsComprobantes = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$Version/SHASUMS256.txt").Content
  $checksumLineComprobantes = ($checksumsComprobantes -split "`n" | Where-Object { $_.Trim().EndsWith(" $archiveNameComprobantes") } | Select-Object -First 1)
  if (-not $checksumLineComprobantes) { throw 'No se encontro el checksum oficial del archivo.' }
  $expectedComprobantes = ($checksumLineComprobantes.Trim() -split '\s+')[0]
  $actualComprobantes = (Get-FileHash -LiteralPath $archiveComprobantes -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expectedComprobantes -ne $actualComprobantes) { throw 'El checksum de Node.js no coincide.' }
  Expand-Archive -LiteralPath $archiveComprobantes -DestinationPath $toolsRootComprobantes
}
Write-Output $nodeDirectoryComprobantes
