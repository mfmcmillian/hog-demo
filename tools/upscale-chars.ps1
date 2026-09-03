# One-time 2x resample of the standalone character portraits (chars/*-b.png,
# 512x512), which the hero card draws at 560 stage units — well past their
# texture size on any high-DPR screen. Same treatment as upscale-plates.ps1:
# no larger source art exists, so HighQualityBicubic doubles the texture and
# the GPU minifies a denser image instead of bilinear-stretching a small one.
# The battle sheets stay untouched; the hero card switches to these via the
# Face widget's `hi` path.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/upscale-chars.ps1
# Overwrites the PNGs in place. labels.gen.ts dims are aspect-only (square
# stays square), so no entry updates are needed.
#
# GDI+ saves full 32bpp; re-quantize after running to keep the payload small:
#   npx --yes pngquant-bin --force --strip --quality=70-95 --ext .png images/chars/*-b.png

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$files = Get-ChildItem (Join-Path $root 'images\chars') -Filter '*-b.png'

foreach ($file in $files) {
  $src = [System.Drawing.Image]::FromFile($file.FullName)
  if ($src.Width -ge 1024) {
    Write-Host "$($file.Name) already $($src.Width)px, skipped"
    $src.Dispose()
    continue
  }
  $w = $src.Width * 2
  $h = $src.Height * 2
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($src, 0, 0, $w, $h)
  $g.Dispose()
  $src.Dispose()
  $bmp.Save($file.FullName, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "$($file.Name) -> ${w}x${h}"
  $bmp.Dispose()
}
