@echo off
title Kluff AutoPrint - Disable Auto-Start on Windows Boot
powershell.exe -NoProfile -Command "Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'KluffAutoPrint' -ErrorAction SilentlyContinue"
echo.
echo [SUCCESS] Auto-start has been removed from Windows boot.
echo.
pause
