[CmdletBinding()]
param([int]$Port = 5173, [string]$ApiBaseUrl = 'http://127.0.0.1:8000', [string]$NodePath = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $NodePath) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCommand) { $NodePath = $nodeCommand.Source }
    else {
        $portableNode = Join-Path $env:TEMP 'earthtrend-tools\node-v24.22.3-win-x64\node.exe'
        if (Test-Path -LiteralPath $portableNode -PathType Leaf) { $NodePath = $portableNode }
    }
}
if (-not $NodePath -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
    throw 'Node.js 24 is required. Supply -NodePath with the full path to your existing node.exe.'
}
$vitePath = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $vitePath -PathType Leaf)) {
    throw 'Vite is missing. Restore dependencies with npm ci using the existing package-lock.json; startup never installs packages.'
}
$previousApi = $env:VITE_API_BASE_URL
$previousDemo = $env:VITE_DEMO_MODE
Push-Location $projectRoot
try {
    $env:VITE_API_BASE_URL = $ApiBaseUrl
    $env:VITE_DEMO_MODE = 'false'
    Write-Host "EarthTrend frontend: http://localhost:$Port | API: $ApiBaseUrl"
    Write-Host 'Start the backend independently with scripts/Start-Backend.ps1. Ctrl+C stops this service.'
    & $NodePath $vitePath --host localhost --port $Port --strictPort
    if ($LASTEXITCODE -ne 0) { throw "Frontend exited with code $LASTEXITCODE. Check the error above and whether the port is occupied." }
} finally {
    $env:VITE_API_BASE_URL = $previousApi
    $env:VITE_DEMO_MODE = $previousDemo
    Pop-Location
}
