# The home screen's questing-area plate: white Segoe UI strip, 2x supersample,
# rotated CCW like every other label (see process-overworld-art.ps1, which
# used to emit the 'village' strip this replaces).
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-home-label.ps1
# Emits:  images/labels/questing.png and prints the labels.gen.ts entry line.

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$scale2 = 2
$font = New-Object System.Drawing.Font('Segoe UI', (39 * $scale2), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$text = 'Questing'
$probe = New-Object System.Drawing.Bitmap(8, 8)
$pg = [System.Drawing.Graphics]::FromImage($probe)
$pg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$size = $pg.MeasureString($text, $font)
$pg.Dispose(); $probe.Dispose()
$w = [int][Math]::Ceiling($size.Width) + 2
$h = [int][Math]::Ceiling($size.Height)
$lbl = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($lbl)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.DrawString($text, $font, [System.Drawing.Brushes]::White, 1, 0)
$g.Dispose()
$lbl.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
$out = Join-Path $root 'images\labels\questing.png'
$lbl.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  questing: { src: 'images/labels/questing.png', w: $($lbl.Width), h: $($lbl.Height) },"
$lbl.Dispose()
$font.Dispose()
