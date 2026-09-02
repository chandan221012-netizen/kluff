param (
    [string]$JobId = "JOB_PRINT",
    [string]$Filename = "document.pdf",
    [string]$Price = "5",
    [string]$Pages = "1",
    [string]$ColorMode = "B&W",
    [string]$Copies = "1",
    [string]$PayMode = "Cash Mode - Accepted"
)

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class Win32Helper {
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();
    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
  }
"@ -ErrorAction SilentlyContinue

# Instantly hide PowerShell console window
$cWnd = [Win32Helper]::GetConsoleWindow()
if ($cWnd -ne [IntPtr]::Zero) {
    [Win32Helper]::ShowWindow($cWnd, 0) | Out-Null
}

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Kluff Print Notification"
        Height="500" Width="380"
        WindowStyle="None"
        AllowsTransparency="True"
        Background="Transparent"
        Topmost="True"
        ShowInTaskbar="False"
        ResizeMode="NoResize"
        FontFamily="Segoe UI">
    <Window.Resources>
        <Style TargetType="Button" x:Key="CloseBtn">
            <Setter Property="Background" Value="#F8FAFC"/>
            <Setter Property="Foreground" Value="#334155"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="FontSize" Value="12"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border Background="{TemplateBinding Background}" BorderBrush="#CBD5E1" BorderThickness="1" CornerRadius="12" Padding="14,8">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
            <Style.Triggers>
                <Trigger Property="IsMouseOver" Value="True">
                    <Setter Property="Background" Value="#F1F5F9"/>
                    <Setter Property="Foreground" Value="#0F172A"/>
                </Trigger>
            </Style.Triggers>
        </Style>
    </Window.Resources>

    <Border Background="#FFFFFF" BorderBrush="#E2E8F0" BorderThickness="1.5" CornerRadius="22" Margin="10">
        <Border.Effect>
            <DropShadowEffect Color="#0F172A" BlurRadius="20" ShadowDepth="4" Opacity="0.15"/>
        </Border.Effect>
        <Grid Margin="20,18,20,16">
            <Grid.RowDefinitions>
                <RowDefinition Height="Auto"/> <!-- Header -->
                <RowDefinition Height="Auto"/> <!-- Divider -->
                <RowDefinition Height="*"/>    <!-- Timeline -->
                <RowDefinition Height="Auto"/> <!-- Button -->
                <RowDefinition Height="Auto"/> <!-- Footer status -->
            </Grid.RowDefinitions>

            <!-- 1. Header with Payment & File details -->
            <Grid Grid.Row="0" Margin="0,0,0,12">
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="Auto"/>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>

                <!-- Payment Icon Box -->
                <Border Grid.Column="0" Name="PayIconBorder" Background="#FEF3C7" BorderBrush="#FDE68A" BorderThickness="1" CornerRadius="12" Width="42" Height="42" VerticalAlignment="Top" Margin="0,2,12,0">
                    <TextBlock Name="PayIcon" Text="💳" FontSize="20" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                </Border>

                <!-- Titles & Metadata -->
                <StackPanel Grid.Column="1" VerticalAlignment="Center">
                    <TextBlock Name="PaymentModeTitle" Text="Cash Mode - Accepted" FontWeight="Bold" FontSize="13" Foreground="#92400E"/>
                    <TextBlock Name="JobIdText" Text="JOB_XXXXXX" FontSize="10" Foreground="#94A3B8" Margin="0,1,0,0"/>
                    <TextBlock Name="FilenameText" Text="document.pdf" FontWeight="SemiBold" FontSize="12.5" Foreground="#0F172A" TextTrimming="CharacterEllipsis" Margin="0,2,0,0"/>
                    <TextBlock Name="MetaText" Text="Rs 10 | 2 Page(s) | B&amp;W | Copies: 1" FontSize="10.5" Foreground="#64748B" Margin="0,1,0,0"/>
                </StackPanel>

                <!-- Status Badge -->
                <Border Grid.Column="2" Background="#FEF3C7" CornerRadius="8" Padding="7,4" VerticalAlignment="Top" Margin="4,2,0,0">
                    <StackPanel HorizontalAlignment="Center">
                        <TextBlock Text="ACCEPTED" FontWeight="Bold" FontSize="8.5" Foreground="#B45309" HorizontalAlignment="Center"/>
                        <TextBlock Text="Ho gaya" FontSize="8" Foreground="#B45309" HorizontalAlignment="Center"/>
                    </StackPanel>
                </Border>
            </Grid>

            <!-- Divider -->
            <Separator Grid.Row="1" Background="#F1F5F9" Margin="0,0,0,14"/>

            <!-- 2. Vertical Progress Timeline (5 Steps) -->
            <Grid Grid.Row="2" Margin="4,0,4,12">
                <Grid.RowDefinitions>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="Auto"/>
                </Grid.RowDefinitions>

                <!-- Step 1: File Received -->
                <Grid Grid.Row="0" Margin="0,0,0,10">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="28"/>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="Auto"/>
                    </Grid.ColumnDefinitions>
                    <Border Name="Step1Circle" Grid.Column="0" Width="22" Height="22" CornerRadius="11" Background="#E2E8F0" HorizontalAlignment="Center" VerticalAlignment="Top">
                        <TextBlock Name="Step1Icon" Text="1" FontSize="11" FontWeight="Bold" Foreground="#64748B" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                    </Border>
                    <Border Name="Line1" Width="2" Height="14" Background="#E2E8F0" HorizontalAlignment="Center" Margin="0,22,0,0" VerticalAlignment="Top"/>
                    <TextBlock Text="1. File Received" Grid.Column="1" FontWeight="SemiBold" FontSize="11.5" Foreground="#1E293B" VerticalAlignment="Center" Margin="10,0,0,0"/>
                    <StackPanel Grid.Column="2" Orientation="Horizontal" VerticalAlignment="Center">
                        <TextBlock Name="Step1Time" Text="--:--:--" FontSize="10" Foreground="#64748B" Margin="0,0,4,0"/>
                        <TextBlock Name="Step1Check" Text="" FontSize="11" FontWeight="Bold" Foreground="#10B981"/>
                    </StackPanel>
                </Grid>

                <!-- Step 2: Payment Accepted -->
                <Grid Grid.Row="1" Margin="0,0,0,10">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="28"/>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="Auto"/>
                    </Grid.ColumnDefinitions>
                    <Border Name="Step2Circle" Grid.Column="0" Width="22" Height="22" CornerRadius="11" Background="#E2E8F0" HorizontalAlignment="Center" VerticalAlignment="Top">
                        <TextBlock Name="Step2Icon" Text="2" FontSize="11" FontWeight="Bold" Foreground="#64748B" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                    </Border>
                    <Border Name="Line2" Width="2" Height="14" Background="#E2E8F0" HorizontalAlignment="Center" Margin="0,22,0,0" VerticalAlignment="Top"/>
                    <TextBlock Text="2. Payment Accepted" Grid.Column="1" FontWeight="SemiBold" FontSize="11.5" Foreground="#1E293B" VerticalAlignment="Center" Margin="10,0,0,0"/>
                    <StackPanel Grid.Column="2" Orientation="Horizontal" VerticalAlignment="Center">
                        <TextBlock Name="Step2Time" Text="--:--:--" FontSize="10" Foreground="#64748B" Margin="0,0,4,0"/>
                        <TextBlock Name="Step2Check" Text="" FontSize="11" FontWeight="Bold" Foreground="#10B981"/>
                    </StackPanel>
                </Grid>

                <!-- Step 3: Now Printing -->
                <Grid Grid.Row="2" Margin="0,0,0,10">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="28"/>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="Auto"/>
                    </Grid.ColumnDefinitions>
                    <Border Name="Step3Circle" Grid.Column="0" Width="22" Height="22" CornerRadius="11" Background="#E2E8F0" HorizontalAlignment="Center" VerticalAlignment="Top">
                        <TextBlock Name="Step3Icon" Text="3" FontSize="11" FontWeight="Bold" Foreground="#64748B" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                    </Border>
                    <Border Name="Line3" Width="2" Height="14" Background="#E2E8F0" HorizontalAlignment="Center" Margin="0,22,0,0" VerticalAlignment="Top"/>
                    <TextBlock Text="3. Now Printing" Grid.Column="1" FontWeight="SemiBold" FontSize="11.5" Foreground="#1E293B" VerticalAlignment="Center" Margin="10,0,0,0"/>
                    <StackPanel Grid.Column="2" Orientation="Horizontal" VerticalAlignment="Center">
                        <TextBlock Name="Step3Time" Text="--:--:--" FontSize="10" Foreground="#64748B" Margin="0,0,4,0"/>
                        <TextBlock Name="Step3Check" Text="" FontSize="11" FontWeight="Bold" Foreground="#10B981"/>
                    </StackPanel>
                </Grid>

                <!-- Step 4: Files Erased -->
                <Grid Grid.Row="3" Margin="0,0,0,10">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="28"/>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="Auto"/>
                    </Grid.ColumnDefinitions>
                    <Border Name="Step4Circle" Grid.Column="0" Width="22" Height="22" CornerRadius="11" Background="#E2E8F0" HorizontalAlignment="Center" VerticalAlignment="Top">
                        <TextBlock Name="Step4Icon" Text="🗑️" FontSize="10" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                    </Border>
                    <Border Name="Line4" Width="2" Height="14" Background="#E2E8F0" HorizontalAlignment="Center" Margin="0,22,0,0" VerticalAlignment="Top"/>
                    <TextBlock Text="4. Files Erased" Grid.Column="1" FontWeight="SemiBold" FontSize="11.5" Foreground="#1E293B" VerticalAlignment="Center" Margin="10,0,0,0"/>
                    <StackPanel Grid.Column="2" Orientation="Horizontal" VerticalAlignment="Center">
                        <TextBlock Name="Step4Time" Text="--:--:--" FontSize="10" Foreground="#64748B" Margin="0,0,4,0"/>
                        <TextBlock Name="Step4Check" Text="" FontSize="11" FontWeight="Bold" Foreground="#10B981"/>
                    </StackPanel>
                </Grid>

                <!-- Step 5: Job Completed -->
                <Grid Grid.Row="4">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="28"/>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="Auto"/>
                    </Grid.ColumnDefinitions>
                    <Border Name="Step5Circle" Grid.Column="0" Width="22" Height="22" CornerRadius="11" Background="#E2E8F0" HorizontalAlignment="Center" VerticalAlignment="Top">
                        <TextBlock Name="Step5Icon" Text="☑" FontSize="11" FontWeight="Bold" Foreground="#64748B" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                    </Border>
                    <TextBlock Text="5. Job Completed" Grid.Column="1" FontWeight="SemiBold" FontSize="11.5" Foreground="#1E293B" VerticalAlignment="Center" Margin="10,0,0,0"/>
                    <StackPanel Grid.Column="2" Orientation="Horizontal" VerticalAlignment="Center">
                        <TextBlock Name="Step5Time" Text="--:--:--" FontSize="10" Foreground="#64748B" Margin="0,0,4,0"/>
                        <TextBlock Name="Step5Check" Text="" FontSize="11" FontWeight="Bold" Foreground="#10B981"/>
                    </StackPanel>
                </Grid>
            </Grid>

            <!-- 3. Close Button with Countdown -->
            <Button Grid.Row="3" Name="CloseBtn" Content="Processing..." Style="{StaticResource CloseBtn}" Margin="20,6,20,12" Height="36"/>

            <!-- 4. Footer Status Indicators -->
            <Grid Grid.Row="4" Margin="4,0,4,0">
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="*"/>
                </Grid.ColumnDefinitions>
                <StackPanel Grid.Column="0" Orientation="Horizontal" VerticalAlignment="Center">
                    <TextBlock Text="Agent : Online" FontSize="9.5" Foreground="#64748B"/>
                    <TextBlock Text=" ●" FontSize="9.5" Foreground="#10B981" Margin="2,0,0,0"/>
                </StackPanel>
                <StackPanel Grid.Column="1" Orientation="Horizontal" HorizontalAlignment="Right" VerticalAlignment="Center">
                    <TextBlock Text="Server : Connected" FontSize="9.5" Foreground="#64748B"/>
                    <TextBlock Text=" ●" FontSize="9.5" Foreground="#10B981" Margin="2,0,0,0"/>
                </StackPanel>
            </Grid>
        </Grid>
    </Border>
</Window>
"@

$reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($xaml))
$window = [System.Windows.Markup.XamlReader]::Load($reader)

# Position in Bottom-Right corner safely above Windows Taskbar
$workArea = [System.Windows.SystemParameters]::WorkArea
$window.Left = [Math]::Max(0, $workArea.Right - 395)
$window.Top = [Math]::Max(0, $workArea.Bottom - 515)

# UI References
$payTitle = $window.FindName("PaymentModeTitle")
$jobIdText = $window.FindName("JobIdText")
$filenameText = $window.FindName("FilenameText")
$metaText = $window.FindName("MetaText")
$closeBtn = $window.FindName("CloseBtn")

$step1Circle = $window.FindName("Step1Circle")
$step1Icon = $window.FindName("Step1Icon")
$step1Time = $window.FindName("Step1Time")
$step1Check = $window.FindName("Step1Check")
$line1 = $window.FindName("Line1")

$step2Circle = $window.FindName("Step2Circle")
$step2Icon = $window.FindName("Step2Icon")
$step2Time = $window.FindName("Step2Time")
$step2Check = $window.FindName("Step2Check")
$line2 = $window.FindName("Line2")

$step3Circle = $window.FindName("Step3Circle")
$step3Icon = $window.FindName("Step3Icon")
$step3Time = $window.FindName("Step3Time")
$step3Check = $window.FindName("Step3Check")
$line3 = $window.FindName("Line3")

$step4Circle = $window.FindName("Step4Circle")
$step4Icon = $window.FindName("Step4Icon")
$step4Time = $window.FindName("Step4Time")
$step4Check = $window.FindName("Step4Check")
$line4 = $window.FindName("Line4")

$step5Circle = $window.FindName("Step5Circle")
$step5Icon = $window.FindName("Step5Icon")
$step5Time = $window.FindName("Step5Time")
$step5Check = $window.FindName("Step5Check")

# Green Color Brushes
$greenBg = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromArgb(255, 16, 185, 129))
$greenLine = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromArgb(255, 16, 185, 129))
$whiteFg = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromArgb(255, 255, 255, 255))

# Populate Metadata Immediately from CLI Arguments
$payTitle.Text = $PayMode
$jobIdText.Text = $JobId
$filenameText.Text = $Filename
$metaText.Text = "Rs $Price | $Pages Page(s) | $ColorMode | Copies: $Copies"

# Step 1 is immediately active on launch
$step1Circle.Background = $greenBg
$step1Icon.Text = "✓"
$step1Icon.Foreground = $whiteFg
$step1Time.Text = (Get-Date -Format "h:mm:ss tt")
$step1Check.Text = "✓"
$line1.Background = $greenLine

$closeBtn.Add_Click({
    $window.Close()
})

# Independent Animation Sequencer (zero file contention!)
$script:animStep = 1
$script:countdownSeconds = 15

$animTimer = New-Object System.Windows.Threading.DispatcherTimer
$animTimer.Interval = [TimeSpan]::FromMilliseconds(1300)
$animTimer.Add_Tick({
    $script:animStep++

    if ($script:animStep -eq 2) {
        # Step 2: Payment Accepted
        $step2Circle.Background = $greenBg
        $step2Icon.Text = "✓"
        $step2Icon.Foreground = $whiteFg
        $step2Time.Text = (Get-Date -Format "h:mm:ss tt")
        $step2Check.Text = "✓"
        $line2.Background = $greenLine
    }
    elseif ($script:animStep -eq 3) {
        # Step 3: Now Printing
        $step3Circle.Background = $greenBg
        $step3Icon.Text = "✓"
        $step3Icon.Foreground = $whiteFg
        $step3Time.Text = (Get-Date -Format "h:mm:ss tt")
        $step3Check.Text = "✓"
        $line3.Background = $greenLine
    }
    elseif ($script:animStep -eq 4) {
        # Step 4: Files Erased
        $step4Circle.Background = $greenBg
        $step4Icon.Text = "✓"
        $step4Icon.Foreground = $whiteFg
        $step4Time.Text = (Get-Date -Format "h:mm:ss tt")
        $step4Check.Text = "✓"
        $line4.Background = $greenLine
    }
    elseif ($script:animStep -eq 5) {
        # Step 5: Job Completed
        $step5Circle.Background = $greenBg
        $step5Icon.Text = "✓"
        $step5Icon.Foreground = $whiteFg
        $step5Time.Text = (Get-Date -Format "h:mm:ss tt")
        $step5Check.Text = "✓"

        # Stop animation timer and switch to countdown timer
        $animTimer.Stop()
        $closeBtn.Content = "Close ($($script:countdownSeconds))"
        $countdownTimer.Start()
    }
})

$countdownTimer = New-Object System.Windows.Threading.DispatcherTimer
$countdownTimer.Interval = [TimeSpan]::FromSeconds(1)
$countdownTimer.Add_Tick({
    $script:countdownSeconds--
    if ($script:countdownSeconds -le 0) {
        $countdownTimer.Stop()
        $window.Close()
    } else {
        $closeBtn.Content = "Close ($($script:countdownSeconds))"
    }
})

# Window Loaded Hook: Force HWND_TOPMOST, Foreground Activation & Play Sound Chime
$window.Add_Loaded({
    try {
        $helper = New-Object System.Windows.Interop.WindowInteropHelper($window)
        [Win32Helper]::ShowWindow($helper.Handle, 5) | Out-Null # 5 = SW_SHOW (Force Visible!)
        [Win32Helper]::SetForegroundWindow($helper.Handle) | Out-Null
        [Win32Helper]::SetWindowPos($helper.Handle, [Win32Helper]::HWND_TOPMOST, 0, 0, 0, 0, 0x0043) | Out-Null
        $window.Activate()
        [System.Media.SystemSounds]::Asterisk.Play()
    } catch {}
    $animTimer.Start()
})

$window.ShowDialog() | Out-Null
