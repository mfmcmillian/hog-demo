# Process one overworld realm painting into the game's storage convention.
# Generalizes process-wilds-map.ps1 for the Antrom Reaches build-out (many
# maps): JPG output (~8x smaller than PNG for these night scenes), the 9x16
# collision-authoring grid overlay, and an optional area-name label strip
# for signposts / the realm-entry toast.
#
#   assets/<name>-map-raw.png -> images/maps/<name>-a.jpg (648x1152 resize, rotate 90 CCW)
#                             -> assets/<name>-map-grid.png (9x16 red grid + tile indices)
#   -label 'Crow Road'        -> images/labels/ow-<name>.png (white Segoe UI strip, pre-rotated)
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/process-ow-map.ps1 -name crow
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/process-ow-map.ps1 -name crow -label 'Crow Road'
#
# Prints the labels.gen.ts entry lines to paste.

param(
  [Parameter(Mandatory = $true)][string]$name,
  [string]$label = '',
  [int]$quality = 82,
  [string]$assets = "$env:USERPROFILE\.cursor\projects\c-Users-matth-hog-demo\assets"
)

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$raw = Join-Path $assets "$name-map-raw.png"
if (-not (Test-Path $raw)) { throw "missing $raw" }

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$jpegParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$jpegParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)

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

# ---- map: resize to physical 648x1152 (9x16 tiles of 72 stage px), rotate CCW, JPG ----
$map = Load-Resized $raw 648 1152
$map.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
# JPG has no alpha: flatten onto black so any transparent slop stays night-dark.
$flat = New-Object System.Drawing.Bitmap($map.Width, $map.Height)
$g = [System.Drawing.Graphics]::FromImage($flat)
$g.Clear([System.Drawing.Color]::Black)
$g.DrawImage($map, 0, 0, $map.Width, $map.Height)
$g.Dispose()
$map.Dispose()
$mapOut = Join-Path $root "images\maps\$name-a.jpg"
$flat.Save($mapOut, $jpegCodec, $jpegParams)
Write-Host "  'map-$name': { src: 'images/maps/$name-a.jpg', w: $($flat.Width), h: $($flat.Height) },"
$flat.Dispose()

# ---- collision authoring aid: 9x16 grid + indices over the raw portrait map ----
$rawMap = [System.Drawing.Image]::FromFile($raw)
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
$dbg.Save((Join-Path $assets "$name-map-grid.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$dbg.Dispose()
Write-Host "grid overlay -> assets/$name-map-grid.png"

# ---- optional area-name strip: white Segoe UI, 2x supersample, rotate CCW ----
if ($label -ne '') {
  $scale2 = 2
  $font = New-Object System.Drawing.Font('Segoe UI', (39 * $scale2), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $probe = New-Object System.Drawing.Bitmap(8, 8)
  $pg = [System.Drawing.Graphics]::FromImage($probe)
  $pg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $size = $pg.MeasureString($label, $font)
  $pg.Dispose(); $probe.Dispose()
  $w = [int][Math]::Ceiling($size.Width) + 2
  $h = [int][Math]::Ceiling($size.Height)
  $lbl = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($lbl)
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $g.DrawString($label, $font, [System.Drawing.Brushes]::White, 1, 0)
  $g.Dispose()
  $lbl.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
  $lblOut = Join-Path $root "images\labels\ow-$name.png"
  $lbl.Save($lblOut, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "  'ow-$name': { src: 'images/labels/ow-$name.png', w: $($lbl.Width), h: $($lbl.Height) },"
  $lbl.Dispose()
  $font.Dispose()
}
