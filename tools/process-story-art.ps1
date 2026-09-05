# One-off: convert the generated story paintings (9:16 portrait sources) into
# the hall convention - 576x1024 then rotated 90 CCW into 1024x576 - matching
# images/intro/*.jpg. Saved as JPEG q80: these are opaque full-frame
# cinematics, so truecolor PNG is ~10x the bytes for no visible gain.
# Sources come from the agent assets folder.
Add-Type -AssemblyName System.Drawing

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]80)

$src = $(if ($env:HOG_RAW_ASSETS) { $env:HOG_RAW_ASSETS } else { "$env:USERPROFILE\.cursor\projects\c-Users-${env:USERNAME}-hog-demo\assets" })
$dst = Join-Path (Split-Path $PSScriptRoot -Parent) 'images\story'
New-Item -ItemType Directory -Force -Path $dst | Out-Null

Get-ChildItem (Join-Path $src 'story-src-*.png') | ForEach-Object {
  $name = $_.Name -replace '^story-src-', 'story-' -replace '\.png$', '.jpg' # story-q1-1.jpg etc
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  $bmp = New-Object System.Drawing.Bitmap(576, 1024)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($img, 0, 0, 576, 1024)
  $g.Dispose(); $img.Dispose()
  $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
  $bmp.Save((Join-Path $dst $name), $jpegCodec, $encParams)
  $bmp.Dispose()
  Write-Host "wrote $name"
}
