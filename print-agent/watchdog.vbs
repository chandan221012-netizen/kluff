' ==============================================================================
' AUTOPRINT Desktop Agent - Silent Watchdog Script
' Checks if KluffPrintAgent.exe is running. If not, relaunches it in background.
' ==============================================================================
Option Explicit

On Error Resume Next

Dim objFSO, objShell, strScriptDir, strExePath, strLogPath
Dim objWMIService, colProcesses, bIsRunning

Set objFSO = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")

' Determine the directory where this script is located
strScriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
If Right(strScriptDir, 1) <> "\" Then
    strScriptDir = strScriptDir & "\"
End If

strExePath = strScriptDir & "KluffPrintAgent.exe"
strLogPath = strScriptDir & "watchdog.log"

' Check if KluffPrintAgent.exe process is running
bIsRunning = False
Set objWMIService = GetObject("winmgmts:{impersonationLevel=impersonate}!\\.\root\cimv2")
If Err.Number = 0 Then
    Set colProcesses = objWMIService.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'KluffPrintAgent.exe'")
    If Err.Number = 0 Then
        If colProcesses.Count > 0 Then
            bIsRunning = True
        End If
    End If
End If

' If the agent is not running, attempt relaunch
If Not bIsRunning Then
    If objFSO.FileExists(strExePath) Then
        ' Set working directory to the agent folder
        objShell.CurrentDirectory = Left(strScriptDir, Len(strScriptDir) - 1)
        ' Run hidden (0) and without blocking (False)
        objShell.Run """" & strExePath & """", 0, False
        If Err.Number = 0 Then
            AppendLog "Agent was not running. Relaunched."
        Else
            AppendLog "ERROR: Failed to launch agent. Error code: " & Hex(Err.Number) & " - " & Err.Description
        End If
    Else
        AppendLog "ERROR: KluffPrintAgent.exe not found at: " & strExePath
    End If
End If

' Cleanup COM objects
Set colProcesses = Nothing
Set objWMIService = Nothing
Set objShell = Nothing
Set objFSO = Nothing

' ==============================================================================
' Helper Subroutines and Functions
' ==============================================================================
Sub AppendLog(strText)
    On Error Resume Next
    Dim objLocalFSO, objLogFile
    Set objLocalFSO = CreateObject("Scripting.FileSystemObject")
    Set objLogFile = objLocalFSO.OpenTextFile(strLogPath, 8, True) ' 8 = ForAppending, True = Create if not exists
    If Err.Number = 0 Then
        objLogFile.WriteLine "[" & GetFormattedTimestamp() & "] " & strText
        objLogFile.Close
    End If
    Set objLogFile = Nothing
    Set objLocalFSO = Nothing
End Sub

Function GetFormattedTimestamp()
    Dim dt, y, m, d, h, min, s
    dt = Now
    y = Year(dt)
    m = Right("0" & Month(dt), 2)
    d = Right("0" & Day(dt), 2)
    h = Right("0" & Hour(dt), 2)
    min = Right("0" & Minute(dt), 2)
    s = Right("0" & Second(dt), 2)
    GetFormattedTimestamp = y & "-" & m & "-" & d & " " & h & ":" & min & ":" & s
End Function
