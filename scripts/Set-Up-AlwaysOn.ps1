# Keeps the EarthTrend live API online around the clock on this PC.
#
# Run ONCE, as administrator (the script elevates itself):
#   Right-click > Run with PowerShell, or
#   powershell -ExecutionPolicy Bypass -File scripts\Set-Up-AlwaysOn.ps1
#
# What it does:
#   1. Power: never sleep on AC, closing the lid does nothing on AC,
#      hibernation (and with it fast startup) off.
#   2. Automatic sign-in: after any reboot Windows logs in by itself, so the
#      "EarthTrend Live API" scheduled task starts and the site stays up.

$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host 'Relaunching as administrator...' -ForegroundColor Yellow
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
        '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath
    )
    exit
}

Write-Host '== 1/2 Power settings (AC) ==' -ForegroundColor Cyan
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP UNATTENDSLEEP 0
# The lid-close action is hidden by default; unhide it, then set "do nothing".
powercfg /attributes SUB_BUTTONS LIDACTION -ATTRIB_HIDE
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setactive SCHEME_CURRENT
# Hibernation off also disables fast startup, so a shutdown is a real shutdown.
powercfg /hibernate off
Write-Host 'Never sleep on AC, lid close = do nothing, hibernation off.'

Write-Host ''
Write-Host '== 2/2 Automatic sign-in ==' -ForegroundColor Cyan
Write-Host 'The password is stored in the local registry so Windows can sign in after'
Write-Host 'a reboot. It never leaves this machine. (Sysinternals Autologon stores it'
Write-Host 'in LSA secrets instead, if you prefer that extra protection.)'
$user = $env:USERNAME
$domain = $env:COMPUTERNAME
$secure = Read-Host "Windows password for $domain\$user" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    $winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
    Set-ItemProperty $winlogon AutoAdminLogon 1
    Set-ItemProperty $winlogon DefaultUserName $user
    Set-ItemProperty $winlogon DefaultDomainName $domain
    Set-ItemProperty $winlogon DefaultPassword $plain
    Remove-ItemProperty $winlogon AutoLogonCount -ErrorAction SilentlyContinue
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
Write-Host "Automatic sign-in enabled for $domain\$user." -ForegroundColor Green

Write-Host ''
Write-Host 'Done. On the next reboot: Windows signs in automatically and the'
Write-Host '"EarthTrend Live API" task starts the API + tunnel + Pages update.' -ForegroundColor Green
Write-Host 'Keep the laptop plugged into power; sleep is now disabled on AC.'