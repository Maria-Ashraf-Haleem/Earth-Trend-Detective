# Makes the EarthTrend live API run around the clock on this PC.
#
# Run once: it elevates itself, so only a UAC "Yes" click is needed - no
# password is asked anywhere (the scheduled task uses an S4U logon, which
# runs as your account without storing credentials).
#
# What it does:
#   1. Power: never sleep on AC, closing the lid does nothing, hibernation
#      (and fast startup with it) off.
#   2. Probes, headless, that the supervisor stack works without an
#      interactive session: SQL Server access and git credentials.
#   3. If the probe passes, re-registers the "EarthTrend Live API" task to
#      start AT BOOT as an S4U (headless) task - after any reboot the API,
#      tunnel and Pages update come back before anyone logs in. If the
#      probe fails, the existing task is left untouched and the reason is
#      reported here and in backend/.state/live/always-on-setup.json.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $root 'backend\.state\live'
$marker = Join-Path $stateDir 'always-on-setup.json'
$errorMarker = Join-Path $stateDir 'always-on-setup-error.json'
$probeFile = Join-Path $stateDir 's4u-probe.json'
Remove-Item $marker, $errorMarker, $probeFile -ErrorAction SilentlyContinue

function Invoke-Setup {
    $pythonw = Join-Path $root 'backend\.venv\Scripts\pythonw.exe'
    $supervisor = Join-Path $root 'scripts\serve-live.py'
    $probe = Join-Path $root 'scripts\probe-s4u.py'
    $cloudflared = Join-Path $env:LOCALAPPDATA 'EarthTrend\cloudflared.exe'
    $git = 'C:\Mohammed Emad\Git\cmd\git.exe'
    foreach ($required in @($pythonw, $supervisor, $probe, $cloudflared, $git)) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw "Required file is missing: $required"
        }
    }

    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host 'Relaunching as administrator - click Yes on the UAC prompt...' -ForegroundColor Yellow
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
            '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath
        )
        return
    }

    Write-Host '== 1/3 Power settings (AC) ==' -ForegroundColor Cyan
    powercfg /change standby-timeout-ac 0
    powercfg /change hibernate-timeout-ac 0
    powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP UNATTENDSLEEP 0
    # The lid-close action is hidden by default; unhide it, then set "do nothing".
    powercfg /attributes SUB_BUTTONS LIDACTION -ATTRIB_HIDE
    powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
    powercfg /setactive SCHEME_CURRENT
    try { powercfg /hibernate off } catch { Write-Host 'Could not disable hibernation (fast startup stays on).' -ForegroundColor Yellow }
    Write-Host 'Sleep on AC: never. Lid close: do nothing. Hibernation: off.' -ForegroundColor Green

    Write-Host ''
    Write-Host '== 2/3 Headless capability probe (S4U) ==' -ForegroundColor Cyan
    $probeAction = New-ScheduledTaskAction -Execute $pythonw `
        -Argument ('"{0}" "{1}"' -f $probe, $git) -WorkingDirectory $root
    Register-ScheduledTask -TaskName 'EarthTrend Probe' -Action $probeAction `
        -User "$env:COMPUTERNAME\$env:USERNAME" -LogonType S4U -RunLevel Limited -Force | Out-Null
    Start-ScheduledTask -TaskName 'EarthTrend Probe'
    $deadline = (Get-Date).AddSeconds(60)
    while (-not (Test-Path $probeFile) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 3 }
    Unregister-ScheduledTask -TaskName 'EarthTrend Probe' -Confirm:$false
    if (-not (Test-Path $probeFile)) { throw 'The headless probe did not produce a result in 60 seconds.' }
    $probeResult = Get-Content $probeFile -Raw | ConvertFrom-Json
    Write-Host ("Probe: sql_ok={0} git_ok={1} (user {2})" -f $probeResult.sql_ok, $probeResult.git_ok, $probeResult.user)

    $mode = 'interactive-kept'
    if ($probeResult.sql_ok -and $probeResult.git_ok) {
        Write-Host ''
        Write-Host '== 3/3 Registering the headless boot task ==' -ForegroundColor Cyan
        $action = New-ScheduledTaskAction -Execute $pythonw `
            -Argument ('"{0}" --cloudflared "{1}" --git "{2}"' -f $supervisor, $cloudflared, $git) `
            -WorkingDirectory $root
        $boot = New-ScheduledTaskTrigger -AtStartup
        $logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
        $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable `
            -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        Register-ScheduledTask -TaskName 'EarthTrend Live API' -Action $action -Trigger $boot, $logon `
            -User "$env:COMPUTERNAME\$env:USERNAME" -LogonType S4U -RunLevel Limited `
            -Settings $settings -Force | Out-Null
        # The previous interactive instance holds the job with the current backend
        # and tunnel; end it, then the freshly registered task brings it all up.
        try { schtasks /end /tn '\EarthTrend Live API' 2>$null | Out-Null } catch { }
        Start-Sleep -Seconds 2
        Start-ScheduledTask -TaskName 'EarthTrend Live API'
        $mode = 's4u-headless'
        Write-Host 'Task registered headless: starts at boot AND at logon, restarts on failure.' -ForegroundColor Green
    } else {
        Write-Host ''
        Write-Host 'The headless (S4U) mode is not viable on this machine:' -ForegroundColor Yellow
        if (-not $probeResult.sql_ok) { Write-Host ' - SQL Server is not reachable without an interactive session' }
        if (-not $probeResult.git_ok) { Write-Host ' - git credentials are not available without an interactive session' }
        Write-Host 'The existing task was left untouched; the site keeps working as before.' -ForegroundColor Yellow
    }

    New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
    [pscustomobject]@{
        applied_at      = (Get-Date).ToString('s')
        power           = 'never-sleep-on-AC; lid=do-nothing; hibernate=off'
        mode            = $mode
        probe           = $probeResult
        registered_user = "$env:COMPUTERNAME\$env:USERNAME"
    } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $marker -Encoding UTF8

    Write-Host ''
    Write-Host 'DONE. The supervisor is starting: backend + tunnel + Pages update take a' -ForegroundColor Green
    Write-Host 'few minutes. From now on a reboot recovers everything automatically.' -ForegroundColor Green
}

try {
    Invoke-Setup
} catch {
    [pscustomobject]@{
        failed_at = (Get-Date).ToString('s')
        error     = $_.Exception.Message
    } | ConvertTo-Json | Set-Content -LiteralPath $errorMarker -Encoding UTF8
    Write-Host ''
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Nothing is broken - the previous task keeps running.' -ForegroundColor Yellow
}
Write-Host ''
Read-Host 'Press Enter to close this window'