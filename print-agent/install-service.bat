@echo off
setlocal EnableDelayedExpansion

title AUTOPRINT Service Installer

:: ============================================================================
:: 1. Check for Administrator Privileges
:: ============================================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo =======================================================================
    echo  [ERROR] Administrator privileges required!
    echo =======================================================================
    echo  This script must be run as Administrator to configure Scheduled Tasks
    echo  and power settings.
    echo.
    echo  Please right-click "install-service.bat" and select "Run as administrator".
    echo =======================================================================
    echo.
    pause
    exit /b 1
)

echo =======================================================================
echo          AUTOPRINT Desktop Agent - Service Installer
echo =======================================================================
echo.

:: ============================================================================
:: 2. Paths and Variables Setup
:: ============================================================================
set "SCRIPT_DIR=%~dp0"
set "WORKING_DIR=%SCRIPT_DIR%"
if "%WORKING_DIR:~-1%"=="\" set "WORKING_DIR=%WORKING_DIR:~0,-1%"
if "%WORKING_DIR%"=="" set "WORKING_DIR=%SCRIPT_DIR%"
if "%WORKING_DIR:~-1%"==":" set "WORKING_DIR=%SCRIPT_DIR%"

set "AGENT_EXE=%SCRIPT_DIR%KluffPrintAgent.exe"
set "WATCHDOG_VBS=%SCRIPT_DIR%watchdog.vbs"
set "AGENT_TASK_NAME=AutoPrintAgent"
set "WATCHDOG_TASK_NAME=AutoPrintWatchdog"

set "TEMP_AGENT_XML=%TEMP%\AutoPrintAgent_task_%RANDOM%.xml"
set "TEMP_WATCHDOG_XML=%TEMP%\AutoPrintWatchdog_task_%RANDOM%.xml"

if not exist "%AGENT_EXE%" (
    echo [WARNING] "KluffPrintAgent.exe" was not found in:
    echo           %SCRIPT_DIR%
    echo           Please ensure KluffPrintAgent.exe is present in this directory.
    echo.
)

if not exist "%WATCHDOG_VBS%" (
    echo [WARNING] "watchdog.vbs" was not found in:
    echo           %SCRIPT_DIR%
    echo           Please ensure watchdog.vbs is present in this directory.
    echo.
)

:: ============================================================================
:: 3. Create AutoPrintAgent Scheduled Task (Startup, Logon, SYSTEM, Auto-restart)
:: ============================================================================
echo [1/4] Creating Scheduled Task "%AGENT_TASK_NAME%" (Startup & Logon trigger)...
(
echo ^<?xml version="1.0" encoding="UTF-16"?^>
echo ^<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"^>
echo   ^<RegistrationInfo^>
echo     ^<Description^>AUTOPRINT Desktop Agent Service^</Description^>
echo     ^<URI^>\%AGENT_TASK_NAME%^</URI^>
echo   ^</RegistrationInfo^>
echo   ^<Triggers^>
echo     ^<BootTrigger^>
echo       ^<Enabled^>true^</Enabled^>
echo     ^</BootTrigger^>
echo     ^<LogonTrigger^>
echo       ^<Enabled^>true^</Enabled^>
echo     ^</LogonTrigger^>
echo   ^</Triggers^>
echo   ^<Principals^>
echo     ^<Principal id="Author"^>
echo       ^<UserId^>S-1-5-18^</UserId^>
echo       ^<RunLevel^>HighestAvailable^</RunLevel^>
echo     ^</Principal^>
echo   ^</Principals^>
echo   ^<Settings^>
echo     ^<MultipleInstancesPolicy^>IgnoreNew^</MultipleInstancesPolicy^>
echo     ^<DisallowStartIfOnBatteries^>false^</DisallowStartIfOnBatteries^>
echo     ^<StopIfGoingOnBatteries^>false^</StopIfGoingOnBatteries^>
echo     ^<AllowHardTerminate^>true^</AllowHardTerminate^>
echo     ^<StartWhenAvailable^>true^</StartWhenAvailable^>
echo     ^<RunOnlyIfNetworkAvailable^>false^</RunOnlyIfNetworkAvailable^>
echo     ^<IdleSettings^>
echo       ^<StopOnIdleEnd^>false^</StopOnIdleEnd^>
echo       ^<RestartOnIdle^>false^</RestartOnIdle^>
echo     ^</IdleSettings^>
echo     ^<AllowStartOnDemand^>true^</AllowStartOnDemand^>
echo     ^<Enabled^>true^</Enabled^>
echo     ^<Hidden^>false^</Hidden^>
echo     ^<RunOnlyIfIdle^>false^</RunOnlyIfIdle^>
echo     ^<WakeToRun^>false^</WakeToRun^>
echo     ^<ExecutionTimeLimit^>PT0S^</ExecutionTimeLimit^>
echo     ^<Priority^>7^</Priority^>
echo     ^<RestartOnFailure^>
echo       ^<Interval^>PT1M^</Interval^>
echo       ^<Count^>999^</Count^>
echo     ^</RestartOnFailure^>
echo   ^</Settings^>
echo   ^<Actions Context="Author"^>
echo     ^<Exec^>
echo       ^<Command^>%AGENT_EXE%^</Command^>
echo       ^<WorkingDirectory^>%WORKING_DIR%^</WorkingDirectory^>
echo     ^</Exec^>
echo   ^</Actions^>
echo ^</Task^>
) > "%TEMP_AGENT_XML%"

schtasks /create /tn "%AGENT_TASK_NAME%" /xml "%TEMP_AGENT_XML%" /f >nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to register Scheduled Task "%AGENT_TASK_NAME%".
) else (
    echo [OK] Scheduled Task "%AGENT_TASK_NAME%" registered successfully.
)
if exist "%TEMP_AGENT_XML%" del /f /q "%TEMP_AGENT_XML%" >nul 2>&1
echo.

:: ============================================================================
:: 4. Create AutoPrintWatchdog Scheduled Task (Runs every 5 mins silently)
:: ============================================================================
echo [2/4] Creating Watchdog Scheduled Task "%WATCHDOG_TASK_NAME%" (every 5 mins)...
(
echo ^<?xml version="1.0" encoding="UTF-16"?^>
echo ^<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"^>
echo   ^<RegistrationInfo^>
echo     ^<Description^>AUTOPRINT Desktop Agent Watchdog (checks every 5 minutes)^</Description^>
echo     ^<URI^>\%WATCHDOG_TASK_NAME%^</URI^>
echo   ^</RegistrationInfo^>
echo   ^<Triggers^>
echo     ^<TimeTrigger^>
echo       ^<StartBoundary^>2020-01-01T00:00:00^</StartBoundary^>
echo       ^<Enabled^>true^</Enabled^>
echo       ^<Repetition^>
echo         ^<Interval^>PT5M^</Interval^>
echo         ^<StopAtDurationEnd^>false^</StopAtDurationEnd^>
echo       ^</Repetition^>
echo     ^</TimeTrigger^>
echo     ^<BootTrigger^>
echo       ^<Enabled^>true^</Enabled^>
echo       ^<Repetition^>
echo         ^<Interval^>PT5M^</Interval^>
echo         ^<StopAtDurationEnd^>false^</StopAtDurationEnd^>
echo       ^</Repetition^>
echo     ^</BootTrigger^>
echo   ^</Triggers^>
echo   ^<Principals^>
echo     ^<Principal id="Author"^>
echo       ^<UserId^>S-1-5-18^</UserId^>
echo       ^<RunLevel^>HighestAvailable^</RunLevel^>
echo     ^</Principal^>
echo   ^</Principals^>
echo   ^<Settings^>
echo     ^<MultipleInstancesPolicy^>IgnoreNew^</MultipleInstancesPolicy^>
echo     ^<DisallowStartIfOnBatteries^>false^</DisallowStartIfOnBatteries^>
echo     ^<StopIfGoingOnBatteries^>false^</StopIfGoingOnBatteries^>
echo     ^<AllowHardTerminate^>true^</AllowHardTerminate^>
echo     ^<StartWhenAvailable^>true^</StartWhenAvailable^>
echo     ^<RunOnlyIfNetworkAvailable^>false^</RunOnlyIfNetworkAvailable^>
echo     ^<IdleSettings^>
echo       ^<StopOnIdleEnd^>false^</StopOnIdleEnd^>
echo       ^<RestartOnIdle^>false^</RestartOnIdle^>
echo     ^</IdleSettings^>
echo     ^<AllowStartOnDemand^>true^</AllowStartOnDemand^>
echo     ^<Enabled^>true^</Enabled^>
echo     ^<Hidden^>true^</Hidden^>
echo     ^<RunOnlyIfIdle^>false^</RunOnlyIfIdle^>
echo     ^<WakeToRun^>false^</WakeToRun^>
echo     ^<ExecutionTimeLimit^>PT5M^</ExecutionTimeLimit^>
echo     ^<Priority^>7^</Priority^>
echo   ^</Settings^>
echo   ^<Actions Context="Author"^>
echo     ^<Exec^>
echo       ^<Command^>wscript.exe^</Command^>
echo       ^<Arguments^>//B ^&quot;%WATCHDOG_VBS%^&quot;^</Arguments^>
echo       ^<WorkingDirectory^>%WORKING_DIR%^</WorkingDirectory^>
echo     ^</Exec^>
echo   ^</Actions^>
echo ^</Task^>
) > "%TEMP_WATCHDOG_XML%"

schtasks /create /tn "%WATCHDOG_TASK_NAME%" /xml "%TEMP_WATCHDOG_XML%" /f >nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to register Scheduled Task "%WATCHDOG_TASK_NAME%".
) else (
    echo [OK] Scheduled Task "%WATCHDOG_TASK_NAME%" registered successfully.
)
if exist "%TEMP_WATCHDOG_XML%" del /f /q "%TEMP_WATCHDOG_XML%" >nul 2>&1
echo.

:: ============================================================================
:: 5. Configure Windows Power Plan (High Performance, Disable Sleep & Hibernate)
:: ============================================================================
echo [3/4] Configuring Windows Power Plan to High Performance...
powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c >nul 2>&1
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change standby-timeout-dc 0 >nul 2>&1
powercfg /change monitor-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1
powercfg /hibernate off >nul 2>&1
echo [OK] High Performance power plan activated (sleep/standby/hibernate disabled).
echo.

:: ============================================================================
:: 6. Launch Agent Service
:: ============================================================================
echo [4/4] Starting "%AGENT_TASK_NAME%" task now...
schtasks /run /tn "%AGENT_TASK_NAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Task start requested (will run automatically at boot/logon or via watchdog).
) else (
    echo [OK] Task "%AGENT_TASK_NAME%" triggered successfully.
)
echo.

:: ============================================================================
:: 7. Summary
:: ============================================================================
echo =======================================================================
echo                     INSTALLATION SUCCESSFUL!
echo =======================================================================
echo  1. AutoPrintAgent Scheduled Task:
echo     - Status: REGISTERED ^& STARTED
echo     - Triggers: At System Startup (Boot) ^& User Logon
echo     - Account: NT AUTHORITY\SYSTEM (Runs without user logged in)
echo     - Execution Limit: Unlimited (PT0S)
echo     - Recovery: Auto-restart on failure every 60s (max 999 attempts)
echo.
echo  2. AutoPrintWatchdog Scheduled Task:
echo     - Status: REGISTERED (Every 5 minutes)
echo     - Action: Silent wscript.exe execution of watchdog.vbs
echo     - Log File: %WORKING_DIR%\watchdog.log
echo.
echo  3. Windows Power Management:
echo     - Mode: High Performance (8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c)
echo     - Sleep / Standby / Hibernate: DISABLED (Continuous 24/7 uptime)
echo =======================================================================
echo.
pause
