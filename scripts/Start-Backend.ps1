[CmdletBinding()]
param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
$pythonPath = Join-Path $backendRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    throw 'The existing backend virtual environment is missing. See backend/README.md for dependency setup.'
}
Push-Location $backendRoot
try {
    Write-Host "EarthTrend API: http://127.0.0.1:$Port | docs: /docs | readiness: /api/v1/health/readiness"
    Write-Host 'Using the existing SQL Server configuration. No migrations or ingestion run at startup. Ctrl+C stops this service.'
    & $pythonPath -m uvicorn app.main:app --host 127.0.0.1 --port $Port --no-access-log
    if ($LASTEXITCODE -ne 0) { throw "Backend exited with code $LASTEXITCODE. Check the error above and whether the port is occupied." }
} finally { Pop-Location }
