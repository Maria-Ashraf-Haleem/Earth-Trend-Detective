# Makes the EarthTrend live API run around the clock on this PC.
#
# Run once: it elevates itself, so only a UAC "Yes" click is needed.
#   powershell -ExecutionPolicy Bypass -File scripts\Set-Up-AlwaysOn.ps1
#
# What it does:
#   1. Power: never sleep on AC, closing the lid does nothing, hibernation
#      (and fast startup with it) off.
#   2. Re-registers the "EarthTrend Live API" scheduled task so it starts
#      AT BOOT as your account, headless - the API, tunnel and Pages update
#      run before anyone logs in, so a reboot recovers by itself.
#      Task Scheduler stores the password encrypted (LSA); it is asked here
#      once and never leaves this machine. If you change your Windows
#      password later, run this script again.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $root 'backend\.state\live'
$marker = Join-Path $stateDir 'always-on-setup.json'
$errorMarker = Join-Path $stateDir 'always-on-setup-error.json'
Remove-Item $marker, $errorMarker -ErrorAction SilentlyContinue
try {
    . Invoke-Setup
} catch {
    [pscustomobject]@{
        failed_at = (Get-Date).ToString('s')
        error     = $_.Exception.Message
    } | ConvertTo-Json | Set-Content -LiteralPath $errorMarker -Encoding UTF8
    Write-Host ''
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Nothing is broken - the previous task keeps running. Fix the cause and run again.' -ForegroundColor Yellow
}
Write-Host ''
Read-Host 'Press Enter to close this window'

function Invoke-Setup {
    $pythonw = Join-Path $root 'backend\.venv\Scripts\pythonw.exe'
    $supervisor = Join-Path $root 'scripts\serve-live.py'
    $cloudflared = Join-Path $env:LOCALAPPDATA 'EarthTrend\cloudflared.exe'
    $git = 'C:\Mohammed Emad\Git\cmd\git.exe'
    foreach ($required in @($pythonw, $supervisor, $cloudflared, $git)) {
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
    Write-Host '== 2/3 Headless boot task ==' -ForegroundColor Cyan
    Write-Host "Windows password for $env:COMPUTERNAME\$env:USERNAME (stored encrypted by Task Scheduler):"
    $secure = Read-Host 'Password' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ([string]::IsNullOrEmpty($plain)) { throw 'Password entry was cancelled; nothing was changed.' }

    $action = New-ScheduledTaskAction -Execute $pythonw `
        -Argument ('"{0}" --cloudflared "{1}" --git "{2}"' -f $supervisor, $cloudflared, $git) `
        -WorkingDirectory $root
    $boot = New-ScheduledTaskTrigger -AtStartup
    $logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName 'EarthTrend Live API' -Action $action -Trigger $boot, $logon `
        -User "$env:COMPUTERNAME\$env:USERNAME" -Password $plain -RunLevel Limited `
        -Settings $settings -Force | Out-Null
    Write-Host 'Task registered: starts at boot AND at logon, restarts itself on failure.' -ForegroundColor Green

    Write-Host ''
    Write-Host '== 3/3 Starting the runtime ==' -ForegroundColor Cyan
    # The previous interactive instance holds the job with the current backend and
    # tunnel; end it, then the freshly registered task brings everything up again.
    try { schtasks /end /tn '\EarthTrend Live API' 2>$null | Out-Null } catch { }
    Start-Sleep -Seconds 2
    Start-ScheduledTask -TaskName 'EarthTrend Live API'

    New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
    [pscustomobject]@{
        applied_at      = (Get-Date).ToString('s')
        power           = 'never-sleep-on-AC; lid=do-nothing; hibernate=off'
        task            = 'EarthTrend Live API (boot + logon, headless, self-restarting)'
        registered_user = "$env:COMPUTERNAME\$env:USERNAME"
    } | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding UTF8

    Write-Host ''
    Write-Host 'DONE. The supervisor is starting: backend + tunnel + Pages update take a' -ForegroundColor Green
    Write-Host 'few minutes. From now on a reboot recovers everything automatically.' -ForegroundColor Green
}