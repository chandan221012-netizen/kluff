param (
    [Parameter(Mandatory=$true)][string]$ServerUrl,
    [Parameter(Mandatory=$true)][string]$OutputFile
)

# Get Machine Hardware UUID
$hwId = "UNKNOWN_HW"
try {
    $hwId = (Get-CimInstance Win32_ComputerSystemProduct -ErrorAction SilentlyContinue).UUID
    if (!$hwId) {
        $hwId = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name MachineGuid -ErrorAction SilentlyContinue).MachineGuid
    }
} catch {
    $hwId = [System.Guid]::NewGuid().ToString().ToUpper()
}
if (!$hwId) { $hwId = [System.Guid]::NewGuid().ToString().ToUpper() }
$compName = $env:COMPUTERNAME

$wpfSuccess = $false

# 1. Try WPF GUI first (Clean styling, no raw emojis in XML)
try {
    Add-Type -AssemblyName PresentationFramework -ErrorAction Stop
    Add-Type -AssemblyName WindowsBase -ErrorAction SilentlyContinue
    Add-Type -AssemblyName PresentationCore -ErrorAction SilentlyContinue

    $xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Kluff AutoPrint - Shop Terminal Activation"
        Height="540" Width="510"
        WindowStartupLocation="CenterScreen"
        Background="#FFFFFF"
        ResizeMode="NoResize"
        FontFamily="Segoe UI">
    <Window.Resources>
        <Style TargetType="Button" x:Key="GreenBtn">
            <Setter Property="Background" Value="#10B981"/>
            <Setter Property="Foreground" Value="#FFFFFF"/>
            <Setter Property="FontWeight" Value="Bold"/>
            <Setter Property="FontSize" Value="13"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border Background="{TemplateBinding Background}" CornerRadius="12" Padding="14,12">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
            <Style.Triggers>
                <Trigger Property="IsMouseOver" Value="True">
                    <Setter Property="Background" Value="#059669"/>
                </Trigger>
            </Style.Triggers>
        </Style>
    </Window.Resources>

    <Grid Margin="28,16,28,20">
        <StackPanel VerticalAlignment="Center">
            <!-- Header Badge -->
            <StackPanel Orientation="Horizontal" HorizontalAlignment="Center" Margin="0,0,0,8">
                <Border Background="#FEF3C7" BorderBrush="#FDE68A" BorderThickness="1" CornerRadius="10" Padding="10,4">
                    <TextBlock Text="KLUFF AUTOPRINT TERMINAL" FontSize="11" FontWeight="Black" Foreground="#B45309"/>
                </Border>
            </StackPanel>

            <!-- Main Heading -->
            <TextBlock Text="Activate Shop Terminal" FontSize="20" FontWeight="Black" Foreground="#0F172A" HorizontalAlignment="Center"/>
            <TextBlock Text="Link this Windows computer to your shop counter" FontSize="12" Foreground="#64748B" HorizontalAlignment="Center" Margin="0,3,0,16"/>

            <!-- Error Notice (Hidden by default) -->
            <Border Name="ErrorBanner" Background="#FEF2F2" BorderBrush="#F87171" BorderThickness="1" CornerRadius="8" Padding="10" Margin="0,0,0,12" Visibility="Collapsed">
                <TextBlock Name="ErrorText" Text="Error message" FontSize="11" Foreground="#DC2626" TextWrapping="Wrap"/>
            </Border>

            <!-- Success Notice (Hidden by default) -->
            <Border Name="SuccessBanner" Background="#ECFDF5" BorderBrush="#34D399" BorderThickness="1" CornerRadius="8" Padding="10" Margin="0,0,0,12" Visibility="Collapsed">
                <TextBlock Name="SuccessText" Text="Terminal Activated Successfully!" FontSize="11" FontWeight="SemiBold" Foreground="#059669" TextWrapping="Wrap"/>
            </Border>

            <!-- Token Label -->
            <TextBlock Text="Shop Activation Token (from your Dashboard):" FontSize="12" FontWeight="SemiBold" Foreground="#334155" Margin="0,0,0,4"/>

            <!-- Token Input Box -->
            <Border Background="#F8FAFC" BorderBrush="#CBD5E1" BorderThickness="1.5" CornerRadius="10" Margin="0,0,0,4">
                <TextBox Name="TokenInput" Height="40" FontSize="13" FontWeight="Bold" FontFamily="Consolas"
                         Background="Transparent" Foreground="#0F172A" BorderThickness="0"
                         Padding="10,8" VerticalContentAlignment="Center"/>
            </Border>
            <TextBlock Text="Find this in your Shop Dashboard under Counter QR Token" FontSize="10" Foreground="#94A3B8" Margin="0,0,0,14"/>

            <!-- Server URL Label & Input -->
            <TextBlock Text="Backend Server URL:" FontSize="11" FontWeight="SemiBold" Foreground="#475569" Margin="0,0,0,4"/>
            <Border Background="#F8FAFC" BorderBrush="#E2E8F0" BorderThickness="1" CornerRadius="8" Margin="0,0,0,4">
                <TextBox Name="ServerUrlInput" Height="34" FontSize="12" FontFamily="Consolas"
                         Background="Transparent" Foreground="#334155" BorderThickness="0"
                         Padding="8,6" VerticalContentAlignment="Center"/>
            </Border>
            <TextBlock Text="For LAN/Wi-Fi: use http://(Host-IP):5000. Default: http://localhost:5000" FontSize="10" Foreground="#94A3B8" Margin="0,0,0,16"/>

            <!-- Activate Button -->
            <Button Name="ActivateBtn" Style="{StaticResource GreenBtn}" Content="ACTIVATE THIS TERMINAL" Margin="0,0,0,12"/>

            <!-- Hardware Footnote -->
            <Border Background="#F1F5F9" CornerRadius="8" Padding="10,5" HorizontalAlignment="Center">
                <TextBlock Name="MachineIdText" Text="Machine ID: Locks to this PC" FontSize="10" FontWeight="SemiBold" Foreground="#64748B"/>
            </Border>
        </StackPanel>
    </Grid>
</Window>
"@

    $stringReader = New-Object System.IO.StringReader($xaml)
    $xmlReader = [System.Xml.XmlReader]::Create($stringReader)
    $window = [System.Windows.Markup.XamlReader]::Load($xmlReader)

    $tokenInput = $window.FindName("TokenInput")
    $serverUrlInput = $window.FindName("ServerUrlInput")
    $activateBtn = $window.FindName("ActivateBtn")
    $errorBanner = $window.FindName("ErrorBanner")
    $errorText = $window.FindName("ErrorText")
    $successBanner = $window.FindName("SuccessBanner")
    $successText = $window.FindName("SuccessText")
    $machineIdText = $window.FindName("MachineIdText")

    $serverUrlInput.Text = $ServerUrl
    $machineIdText.Text = "Machine ID: $hwId (Locks to this PC)"

    $activateBtn.Add_Click({
        $token = $tokenInput.Text.Trim()
        $targetServer = $serverUrlInput.Text.Trim().TrimEnd('/')
        if (!$targetServer) { $targetServer = $ServerUrl }

        if (!$token) {
            $errorText.Text = "Please enter your Shop Activation Token."
            $errorBanner.Visibility = [System.Windows.Visibility]::Visible
            $successBanner.Visibility = [System.Windows.Visibility]::Collapsed
            return
        }

        $activateBtn.IsEnabled = $false
        $activateBtn.Content = "Verifying with Cloud Server..."
        $errorBanner.Visibility = [System.Windows.Visibility]::Collapsed

        try {
            $body = @{
                token = $token
                hardwareId = $hwId
                computerName = $compName
            } | ConvertTo-Json

            $url = "$targetServer/api/shops/activate-terminal"
            $res = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10

            if ($res.success) {
                $successText.Text = "Terminal Activated! Linking to $($res.shopName)..."
                $successBanner.Visibility = [System.Windows.Visibility]::Visible
                $errorBanner.Visibility = [System.Windows.Visibility]::Collapsed
                
                # Save token and verified serverUrl to OutputFile
                $outJson = @{
                    serverUrl = $targetServer
                    shopToken = $res.qrToken
                    shopId = $res.shopId
                    shopName = $res.shopName
                    hardwareId = $hwId
                } | ConvertTo-Json

                $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllText($OutputFile, $outJson, $utf8NoBom)

                # Close dialog after 1.5 seconds
                $timer = New-Object System.Windows.Threading.DispatcherTimer
                $timer.Interval = [TimeSpan]::FromSeconds(1.5)
                $timer.Add_Tick({
                    $timer.Stop()
                    $window.Close()
                })
                $timer.Start()
            } else {
                throw $res.message
            }
        } catch {
            $msg = $_.Exception.Message
            if ($_.ErrorDetails.Message) {
                try {
                    $errObj = $_.ErrorDetails.Message | ConvertFrom-Json
                    $msg = $errObj.message
                } catch {}
            }
            if ($msg -like "*Unable to connect*" -or $msg -like "*actively refused*") {
                $msg = "Cannot reach server at $targetServer. Please verify the Server URL or Host Wi-Fi IP."
            }
            $errorText.Text = $msg
            $errorBanner.Visibility = [System.Windows.Visibility]::Visible
            $successBanner.Visibility = [System.Windows.Visibility]::Collapsed
            $activateBtn.IsEnabled = $true
            $activateBtn.Content = "ACTIVATE THIS TERMINAL"
        }
    })

    $window.ShowDialog() | Out-Null
    $wpfSuccess = $true
} catch {
    Write-Warning "WPF UI encountered an issue: $($_.Exception.Message). Falling back to Windows Forms dialog."
}

# 2. Universal Windows Forms Fallback (Guaranteed to work on all Windows systems)
if (!$wpfSuccess) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing

        $form = New-Object System.Windows.Forms.Form
        $form.Text = "Kluff AutoPrint - Shop Terminal Activation"
        $form.Size = New-Object System.Drawing.Size(460, 370)
        $form.StartPosition = "CenterScreen"
        $form.FormBorderStyle = "FixedDialog"
        $form.MaximizeBox = $false
        $form.BackColor = [System.Drawing.Color]::White

        $lblTitle = New-Object System.Windows.Forms.Label
        $lblTitle.Text = "Activate Shop Terminal"
        $lblTitle.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
        $lblTitle.Location = New-Object System.Drawing.Point(30, 18)
        $lblTitle.Size = New-Object System.Drawing.Size(400, 30)
        $form.Controls.Add($lblTitle)

        $lblToken = New-Object System.Windows.Forms.Label
        $lblToken.Text = "Shop Activation Token (from Dashboard):"
        $lblToken.Location = New-Object System.Drawing.Point(30, 60)
        $lblToken.Size = New-Object System.Drawing.Size(380, 20)
        $lblToken.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
        $form.Controls.Add($lblToken)

        $txtToken = New-Object System.Windows.Forms.TextBox
        $txtToken.Location = New-Object System.Drawing.Point(30, 82)
        $txtToken.Size = New-Object System.Drawing.Size(380, 26)
        $txtToken.Font = New-Object System.Drawing.Font("Consolas", 11)
        $form.Controls.Add($txtToken)

        $lblServer = New-Object System.Windows.Forms.Label
        $lblServer.Text = "Backend Server URL:"
        $lblServer.Location = New-Object System.Drawing.Point(30, 120)
        $lblServer.Size = New-Object System.Drawing.Size(380, 20)
        $form.Controls.Add($lblServer)

        $txtServer = New-Object System.Windows.Forms.TextBox
        $txtServer.Text = $ServerUrl
        $txtServer.Location = New-Object System.Drawing.Point(30, 140)
        $txtServer.Size = New-Object System.Drawing.Size(380, 24)
        $form.Controls.Add($txtServer)

        $lblStatus = New-Object System.Windows.Forms.Label
        $lblStatus.Location = New-Object System.Drawing.Point(30, 175)
        $lblStatus.Size = New-Object System.Drawing.Size(380, 40)
        $lblStatus.ForeColor = [System.Drawing.Color]::Red
        $form.Controls.Add($lblStatus)

        $btnActivate = New-Object System.Windows.Forms.Button
        $btnActivate.Text = "ACTIVATE THIS TERMINAL"
        $btnActivate.Location = New-Object System.Drawing.Point(30, 230)
        $btnActivate.Size = New-Object System.Drawing.Size(380, 42)
        $btnActivate.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129)
        $btnActivate.ForeColor = [System.Drawing.Color]::White
        $btnActivate.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
        $btnActivate.FlatStyle = "Flat"
        $form.Controls.Add($btnActivate)

        $btnActivate.Add_Click({
            $token = $txtToken.Text.Trim()
            $srv = $txtServer.Text.Trim().TrimEnd('/')
            if (!$token) {
                $lblStatus.Text = "Please enter your Shop Activation Token."
                return
            }
            $btnActivate.Enabled = $false
            $btnActivate.Text = "Verifying..."
            try {
                $body = @{ token = $token; hardwareId = $hwId; computerName = $compName } | ConvertTo-Json
                $res = Invoke-RestMethod -Uri "$srv/api/shops/activate-terminal" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
                if ($res.success) {
                    $lblStatus.ForeColor = [System.Drawing.Color]::Green
                    $lblStatus.Text = "Activated! Linking to $($res.shopName)..."
                    $outJson = @{
                        serverUrl = $srv
                        shopToken = $res.qrToken
                        shopId = $res.shopId
                        shopName = $res.shopName
                        hardwareId = $hwId
                    } | ConvertTo-Json
                    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                    [System.IO.File]::WriteAllText($OutputFile, $outJson, $utf8NoBom)
                    $form.Close()
                } else {
                    throw $res.message
                }
            } catch {
                $lblStatus.ForeColor = [System.Drawing.Color]::Red
                $lblStatus.Text = $_.Exception.Message
                $btnActivate.Enabled = $true
                $btnActivate.Text = "ACTIVATE THIS TERMINAL"
            }
        })

        $form.ShowDialog() | Out-Null
    } catch {
        Write-Error "Windows Forms fallback error: $($_.Exception.Message)"
    }
}
