# Kluff Desktop Toast Preview Runner
Add-Type -AssemblyName PresentationFramework

$stateFile = "$env:LOCALAPPDATA\Temp\toast_preview.json"

# Initialize state
@{
    jobId = "JOB_CAF59C00-9"
    filename = "college_notes.pdf"
    price = 10
    pages = 2
    colorMode = "B&W"
    copies = 1
    paymentMethod = "Cash Mode - Accepted"
    currentStep = 1
    steps = @(
        @{ title = "1. File Received"; time = (Get-Date -Format "h:mm:ss tt"); done = $true },
        @{ title = "2. Payment Accepted"; time = "--:--:--"; done = $false },
        @{ title = "3. Now Printing"; time = "--:--:--"; done = $false },
        @{ title = "4. Files Erased"; time = "--:--:--"; done = $false },
        @{ title = "5. Job Completed"; time = "--:--:--"; done = $false }
    )
} | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$toastScript = Join-Path $scriptDir "toast-ui.ps1"

# Launch Toast Window
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$toastScript`" -StateFile `"$stateFile`""

# Step through each stage over 8 seconds so the user watches the animation live!
Start-Sleep -Milliseconds 1500
$j = Get-Content $stateFile -Raw | ConvertFrom-Json
$j.currentStep = 2
$j.steps[1].done = $true
$j.steps[1].time = (Get-Date -Format "h:mm:ss tt")
$j | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8

Start-Sleep -Milliseconds 1800
$j = Get-Content $stateFile -Raw | ConvertFrom-Json
$j.currentStep = 3
$j.steps[2].done = $true
$j.steps[2].time = (Get-Date -Format "h:mm:ss tt")
$j | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8

Start-Sleep -Milliseconds 1800
$j = Get-Content $stateFile -Raw | ConvertFrom-Json
$j.currentStep = 4
$j.steps[3].done = $true
$j.steps[3].time = (Get-Date -Format "h:mm:ss tt")
$j | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8

Start-Sleep -Milliseconds 1500
$j = Get-Content $stateFile -Raw | ConvertFrom-Json
$j.currentStep = 5
$j.steps[4].done = $true
$j.steps[4].time = (Get-Date -Format "h:mm:ss tt")
$j | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8
