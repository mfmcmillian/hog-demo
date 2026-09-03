# One-time processing of the AI-generated wilds realm map (see
# process-overworld-art.ps1 for the pipeline conventions):
#
#   wilds-map-raw.png -> images/maps/wilds-a.png (648x1152 resize, rotate 90 CCW)
#
# Also emits assets/wilds-map-grid.png: the raw portrait map with the 9x16
# red grid + indices overlay, used to hand-author the collision rows in
# src/game/overworld.ts.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/process-wilds-map.ps1

param(
  [string]$assets = "$env:USERPROFILE\.cursor\projects\c-Users-matth-hog-demo\assets"
)

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent

function Load-Resized([string]$path, [int]$w, [int]$h) {
  $src = [System.Drawing.Image]::FromFile($path)
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $w, $h)
  $g.Dispose()
  $src.Dispose()
  return $bmp
}

# ---- map: resize to physical 648x1152 (9x16 tiles of 72 stage px), rotate CCW ----
$map = Load-Resized (Join-Path $assets 'wilds-map-raw.png') 648 1152
$map.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
$mapOut = Join-Path $root 'images\maps\wilds-a.png'
$map.Save($mapOut, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  'map-wilds': { src: 'images/maps/wilds-a.png', w: $($map.Width), h: $($map.Height) },"
$map.Dispose()

# ---- collision authoring aid: 9x16 grid + indices over the raw portrait map ----
$rawMap = [System.Drawing.Image]::FromFile((Join-Path $assets 'wilds-map-raw.png'))
$dbg = New-Object System.Drawing.Bitmap($rawMap.Width, $rawMap.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($dbg)
$g.DrawImage($rawMap, 0, 0, $rawMap.Width, $rawMap.Height)
$rawMap.Dispose()
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Red, 2)
$dbgFont = New-Object System.Drawing.Font('Consolas', 16, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$cw = $dbg.Width / 9.0
$ch = $dbg.Height / 16.0
for ($i = 1; $i -lt 9; $i++) { $g.DrawLine($pen, [int]($i * $cw), 0, [int]($i * $cw), $dbg.Height) }
for ($i = 1; $i -lt 16; $i++) { $g.DrawLine($pen, 0, [int]($i * $ch), $dbg.Width, [int]($i * $ch)) }
for ($y = 0; $y -lt 16; $y++) {
  for ($x = 0; $x -lt 9; $x++) {
    $g.DrawString("$x,$y", $dbgFont, [System.Drawing.Brushes]::Yellow, [int]($x * $cw) + 3, [int]($y * $ch) + 3)
  }
}
$pen.Dispose(); $dbgFont.Dispose(); $g.Dispose()
$dbg.Save((Join-Path $assets 'wilds-map-grid.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$dbg.Dispose()
Write-Host 'grid overlay -> assets/wilds-map-grid.png'
