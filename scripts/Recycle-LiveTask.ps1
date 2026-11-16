# Recycles the EarthTrend Live API task: ends it, kills leftover interpreters
# and tunnels the task's job object cannot reach (the venv launcher breaks
# away from the job), and starts the task again with the current code.
#
#   powershell -ExecutionPolicy Bypass -File scripts\Recycle-LiveTask.ps1
# It elevates itself - only a UAC "Yes" click is needed.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $root 'backend\.state\live'
$marker = Join-Path $stateDir 'live-recycle.json'
$errorMarker = Join-Path $stateDir 'live-recycle-error.json'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
        '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath
    )
    exit
}

Remove-Item $marker, $errorMarker -ErrorAction SilentlyContinue
try {
    schtasks /end /tn '\EarthTrend Live API' 2>$null | Out-Null
    Start-Sleep -Seconds 2
    # Old backends and tunnels run in earlier S4U logon sessions and resist
    # termination from other sessions; killing them here, elevated, is the
    # only reliable cleanup.
    Get-CimInstance Win32_Process -Filter "Name='pythonw.exe'" |
        Where-Object { $_.CommandLine -match 'uvicorn' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" |
        Where-Object { $_.ExecutablePath -like '*EarthTrend*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    Start-ScheduledTask -TaskName 'EarthTrend Live API'
    [pscustomobject]@{
        recycled_at = (Get-Date).ToString('s')
        note        = 'task ended, leftovers killed, task restarted with current code'
    } | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding UTF8
    Write-Host 'Recycled. The supervisor is starting with the current code.' -ForegroundColor Green
} catch {
    [pscustomobject]@{
        failed_at = (Get-Date).ToString('s')
        error     = $_.Exception.Message
    } | ConvertTo-Json | Set-Content -LiteralPath $errorMarker -Encoding UTF8
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ''
Read-Host 'Press Enter to close this window'
