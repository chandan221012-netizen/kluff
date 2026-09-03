param (
    [Parameter(Mandatory=$true)][string]$ServerUrl,
    [Parameter(Mandatory=$true)][string]$OutputFile
)

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName System.Windows.Forms

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
$compName = $env:COMPUTERNAME

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Kluff AutoPrint — Shop Terminal Activation"
        Height="470" Width="490"
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

    <Grid Margin="28,20,28,24">
        <StackPanel VerticalAlignment="Center">
            <!-- Crown & Header Badge -->
            <StackPanel Orientation="Horizontal" HorizontalAlignment="Center" Margin="0,0,0,10">
                <Border Background="#FEF3C7" BorderBrush="#FDE68A" BorderThickness="1" CornerRadius="10" Padding="8,4">
                    <StackPanel Orientation="Horizontal">
                        <TextBlock Text="👑" FontSize="14" Margin="0,0,6,0"/>
                        <TextBlock Text="KLUFF AUTOPRINT" FontSize="11" FontWeight="Black" Foreground="#B45309"/>
                    </StackPanel>
                </Border>
            </StackPanel>

            <!-- Main Heading -->
            <TextBlock Text="Activate Shop Terminal" FontSize="20" FontWeight="Black" Foreground="#0F172A" HorizontalAlignment="Center"/>
            <TextBlock Text="Link this Windows computer to your shop counter" FontSize="12" Foreground="#64748B" HorizontalAlignment="Center" Margin="0,4,0,22"/>

            <!-- Error Notice (Hidden by default) -->
            <Border Name="ErrorBanner" Background="#FEF2F2" BorderBrush="#F87171" BorderThickness="1" CornerRadius="8" Padding="10" Margin="0,0,0,14" Visibility="Collapsed">
                <TextBlock Name="ErrorText" Text="Error message" FontSize="11" Foreground="#DC2626" TextWrapping="Wrap"/>
            </Border>

            <!-- Success Notice (Hidden by default) -->
            <Border Name="SuccessBanner" Background="#ECFDF5" BorderBrush="#34D399" BorderThickness="1" CornerRadius="8" Padding="10" Margin="0,0,0,14" Visibility="Collapsed">
                <TextBlock Name="SuccessText" Text="Terminal Activated Successfully!" FontSize="11" FontWeight="SemiBold" Foreground="#059669" TextWrapping="Wrap"/>
            </Border>

            <!-- Token Label -->
            <TextBlock Text="Enter Activation Token (from your Shop Dashboard):" FontSize="12" FontWeight="SemiBold" Foreground="#334155" Margin="0,0,0,6"/>

            <!-- Token Input Box -->
            <Border Background="#F8FAFC" BorderBrush="#CBD5E1" BorderThickness="1.5" CornerRadius="10" Margin="0,0,0,6">
                <TextBox Name="TokenInput" Height="42" FontSize="14" FontWeight="Bold" FontFamily="Consolas"
                         Background="Transparent" Foreground="#0F172A" BorderThickness="0"
                         Padding="12,10" VerticalContentAlignment="Center"/>
            </Border>
            <TextBlock Text="Found in your Shop Dashboard under Counter QR Token" FontSize="10" Foreground="#94A3B8" Margin="0,0,0,20"/>

            <!-- Activate Button -->
            <Button Name="ActivateBtn" Style="{StaticResource GreenBtn}" Content="ACTIVATE THIS TERMINAL" Margin="0,0,0,16"/>

            <!-- Hardware Footnote -->
            <Border Background="#F1F5F9" CornerRadius="8" Padding="10,6" HorizontalAlignment="Center">
                <TextBlock Name="MachineIdText" Text="🔒 Machine ID: $hwId" FontSize="10" FontWeight="SemiBold" Foreground="#64748B"/>
            </Border>
        </StackPanel>
    </Grid>
</Window>
"@

$reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($xaml))
$window = [System.Windows.Markup.XamlReader]::Load($reader)

$tokenInput = $window.FindName("TokenInput")
$activateBtn = $window.FindName("ActivateBtn")
$errorBanner = $window.FindName("ErrorBanner")
$errorText = $window.FindName("ErrorText")
$successBanner = $window.FindName("SuccessBanner")
$successText = $window.FindName("SuccessText")
$machineIdText = $window.FindName("MachineIdText")

$machineIdText.Text = "🔒 Machine ID: $hwId (Locks to this PC)"

$activateBtn.Add_Click({
    $token = $tokenInput.Text.Trim()
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

        $url = "$ServerUrl/api/shops/activate-terminal"
        $res = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10

        if ($res.success) {
            $successText.Text = "Terminal Activated Successfully! Linking to $($res.shopName)..."
            $successBanner.Visibility = [System.Windows.Visibility]::Visible
            $errorBanner.Visibility = [System.Windows.Visibility]::Collapsed
            
            # Save token to OutputFile
            $outJson = @{
                shopToken = $res.qrToken
                shopId = $res.shopId
                shopName = $res.shopName
                hardwareId = $hwId
            } | ConvertTo-Json
            [System.IO.File]::WriteAllText($OutputFile, $outJson, [System.Text.UTF8Encoding]::new($false))

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
        $errorText.Text = $msg
        $errorBanner.Visibility = [System.Windows.Visibility]::Visible
        $successBanner.Visibility = [System.Windows.Visibility]::Collapsed
        $activateBtn.IsEnabled = $true
        $activateBtn.Content = "ACTIVATE THIS TERMINAL"
    }
})

$window.ShowDialog() | Out-Null
