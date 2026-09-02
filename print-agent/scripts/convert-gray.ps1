param (
    [Parameter(Mandatory=$true)][string]$InputPath,
    [Parameter(Mandatory=$true)][string]$OutputPath
)

try {
    Add-Type -AssemblyName System.Drawing

    # Read bytes into memory stream to prevent file locking
    $bytes = [System.IO.File]::ReadAllBytes($InputPath)
    $ms = New-Object System.IO.MemoryStream(,$bytes)
    $src = [System.Drawing.Image]::FromStream($ms)

    # Create target bitmap
    $bmp = New-Object System.Drawing.Bitmap($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $gr = [System.Drawing.Graphics]::FromImage($bmp)
    $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gr.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # BT.601 perceptual grayscale matrix (standard for photographic depth)
    $cm = New-Object System.Drawing.Imaging.ColorMatrix
    $cm.Matrix00 = 0.299; $cm.Matrix01 = 0.299; $cm.Matrix02 = 0.299
    $cm.Matrix10 = 0.587; $cm.Matrix11 = 0.587; $cm.Matrix12 = 0.587
    $cm.Matrix20 = 0.114; $cm.Matrix21 = 0.114; $cm.Matrix22 = 0.114
    $cm.Matrix33 = 1.0;   $cm.Matrix44 = 1.0

    $ia = New-Object System.Drawing.Imaging.ImageAttributes
    $ia.SetColorMatrix($cm, [System.Drawing.Imaging.ColorMatrixFlag]::Default, [System.Drawing.Imaging.ColorAdjustType]::Bitmap)

    $rect = New-Object System.Drawing.Rectangle(0, 0, $src.Width, $src.Height)
    $gr.DrawImage($src, $rect, 0, 0, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel, $ia)

    # Save as high-quality JPEG (95% quality)
    $jpegEnc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 95L)

    $bmp.Save($OutputPath, $jpegEnc, $encParams)

    $gr.Dispose()
    $bmp.Dispose()
    $src.Dispose()
    $ms.Dispose()
    exit 0
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
