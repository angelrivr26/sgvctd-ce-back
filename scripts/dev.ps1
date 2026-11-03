param([switch]$Frontend)
$ErrorActionPreference = 'Stop'
$backendRootComprobantes = Split-Path -Parent $PSScriptRoot
$runtimeRootComprobantes = Join-Path $backendRootComprobantes '.tools/node-v24.22.2-win-x64'
$nodeExeComprobantes = Join-Path $runtimeRootComprobantes 'node.exe'
if (-not (Test-Path -LiteralPath $nodeExeComprobantes)) { & (Join-Path $PSScriptRoot 'preparar-node.ps1') | Out-Null }
$env:PATH = "$runtimeRootComprobantes;$env:PATH"
if ($Frontend) {
  Push-Location (Join-Path (Split-Path -Parent $backendRootComprobantes) 'frontend-comprobantes')
  try { & $nodeExeComprobantes 'node_modules/@angular/cli/bin/ng.js' serve --host localhost --port 4205 }
  finally { Pop-Location }
} else {
  Push-Location $backendRootComprobantes
  try { & $nodeExeComprobantes 'src/index.js' }
  finally { Pop-Location }
}
