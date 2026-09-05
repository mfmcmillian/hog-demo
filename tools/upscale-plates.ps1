# One-time 2x resample of hand-painted plates that are drawn well above their
# texture size (you-win / you-lose render at 300 stage units from a 160px-wide
# PNG). No larger source art exists, so this is a HighQualityBicubic upscale:
# the GPU then magnifies a denser texture, which reads noticeably cleaner than
# bilinear-stretching the small one. Plates already at or above their drawn
# size (name-*, select, party-title) are left alone - upscaling those would
# push them into aliasing minification.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/upscale-plates.ps1
# Overwrites the PNGs in place and prints the labels.gen.ts entry lines.
#
# The shipped plates are palette-quantized to keep the deploy payload small,
# and GDI+ saves full 32bpp. After running, re-quantize:
#   npx --yes pngquant-bin --force --strip --quality=70-95 --ext .png <files>

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent

$plates = @(
  'images\labels\you-win-a.png',
  'images\labels\you-lose-a.png',
  'images\labels\swear-your-oath-a.png'
)

foreach ($rel in $plates) {
  $path = Join-Path $root $rel
  $src = [System.Drawing.Image]::FromFile($path)
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
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $name = Split-Path $rel -Leaf
  Write-Host "$name -> ${w}x${h}"
  $bmp.Dispose()
}
