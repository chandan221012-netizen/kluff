@echo off
setlocal EnableDelayedExpansion

title AUTOPRINT Service Uninstaller

:: ============================================================================
:: 1. Check for Administrator Privileges
:: ============================================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo =======================================================================
    echo  [ERROR] Administrator privileges required!
    echo =======================================================================
    echo  This script must be run as Administrator to remove Scheduled Tasks
    echo  and restore power settings.
    echo.
    echo  Please right-click "uninstall-service.bat" and select "Run as administrator".
    echo =======================================================================
    echo.
    pause
    exit /b 1
)

echo =======================================================================
echo          AUTOPRINT Desktop Agent - Service Uninstaller
echo =======================================================================
echo.

set "AGENT_TASK_NAME=AutoPrintAgent"
set "WATCHDOG_TASK_NAME=AutoPrintWatchdog"

:: ============================================================================
:: 2. Stop running process
:: ============================================================================
echo [1/4] Stopping KluffPrintAgent process if running...
taskkill /f /im KluffPrintAgent.exe >nul 2>&1
echo [OK] Agent process terminated.
echo.

:: ============================================================================
:: 3. Delete Scheduled Tasks
:: ============================================================================
echo [2/4] Removing Scheduled Tasks...
schtasks /delete /tn "%AGENT_TASK_NAME%" /f >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Scheduled Task "%AGENT_TASK_NAME%" deleted.
) else (
    echo [INFO] Scheduled Task "%AGENT_TASK_NAME%" was not found or already deleted.
)

schtasks /delete /tn "%WATCHDOG_TASK_NAME%" /f >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Scheduled Task "%WATCHDOG_TASK_NAME%" deleted.
) else (
    echo [INFO] Scheduled Task "%WATCHDOG_TASK_NAME%" was not found or already deleted.
)
echo.

:: ============================================================================
:: 4. Restore Balanced Power Plan
:: ============================================================================
echo [3/4] Restoring Balanced Power Plan...
powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e >nul 2>&1
echo [OK] Balanced power plan restored.
echo.

:: ============================================================================
:: 5. Re-enable sleep and hibernate defaults
:: ============================================================================
echo [4/4] Re-enabling standard power and sleep timeouts...
powercfg /hibernate on >nul 2>&1
powercfg /change standby-timeout-ac 30 >nul 2>&1
powercfg /change standby-timeout-dc 15 >nul 2>&1
powercfg /change monitor-timeout-ac 15 >nul 2>&1
powercfg /change monitor-timeout-dc 5 >nul 2>&1
powercfg /change hibernate-timeout-ac 60 >nul 2>&1
echo [OK] Default sleep and display timeouts configured.
echo.

:: ============================================================================
:: 6. Summary Confirmation
:: ============================================================================
echo =======================================================================
echo                    UNINSTALLATION COMPLETE
echo =======================================================================
echo  - AutoPrintAgent scheduled task removed
echo  - AutoPrintWatchdog scheduled task removed
echo  - KluffPrintAgent process stopped
echo  - Balanced power plan and default sleep timeouts restored
echo =======================================================================
echo.
pause
