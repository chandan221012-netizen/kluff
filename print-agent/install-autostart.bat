@echo off
title Kluff AutoPrint - Enable Auto-Start on Windows Boot
echo ========================================================
echo     Kluff AutoPrint - Windows Startup Registration
echo ========================================================
echo.
powershell.exe -NoProfile -Command "Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'KluffAutoPrint' -Value '\"%~dp0KluffPrintAgent.exe\"'"
echo.
echo Setting Windows power policy: Never sleep CPU or Wi-Fi on AC power...
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1
echo.
echo [SUCCESS] Kluff AutoPrint is now configured for Zero-Touch Auto-Start!
echo The agent will automatically launch in the background whenever this PC boots up.
echo Counter staff will NEVER need to click start-agent.bat.
echo.
pause
