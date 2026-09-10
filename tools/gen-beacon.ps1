# Renders the quest beacon - the burst of light that marks the next place to
# go on the overworld - with its colour BAKED IN. The old light was a white
# sparks flipbook tinted gold at runtime, and on the mobile explorer that tint
# (and the faint halo) got lost, leaving a small white sparkle. These read
# gold on every renderer:
#
#   images/hud/beacon.png        256x256  white-hot core -> gold -> orange rim -> clear
#   images/hud/beacon-shaft.png  256x96   a soft beam, bright at the right end fading left
#                                         (physically: rising from the tile), for beacon mode
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-beacon.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent

function Mix([double]$a, [double]$b, [double]$t) { return $a + ($b - $a) * $t }
function Clamp01([double]$v) { return [Math]::Max(0.0, [Math]::Min(1.0, $v)) }

# --- the burst -------------------------------------------------------------------
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$c = $size / 2.0
for ($y = 0; $y -lt $size; $y++) {
  for ($x = 0; $x -lt $size; $x++) {
    $d = [Math]::Sqrt(($x + 0.5 - $c) * ($x + 0.5 - $c) + ($y + 0.5 - $c) * ($y + 0.5 - $c)) / $c
    if ($d -ge 1) { $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 255, 140, 40)); continue }
    if ($d -lt 0.14) {
      # white-hot core
      $t = $d / 0.14
      $r = 255; $g = [int](Mix 250 220 $t); $b = [int](Mix 225 110 $t); $a = 1.0
    }
    elseif ($d -lt 0.42) {
      # gold body
      $t = ($d - 0.14) / 0.28
      $r = 255; $g = [int](Mix 220 172 $t); $b = [int](Mix 110 36 $t); $a = Mix 1.0 0.85 $t
    }
    else {
      # orange rim fading out
      $t = ($d - 0.42) / 0.58
      $r = 255; $g = [int](Mix 172 105 $t); $b = [int](Mix 36 8 $t); $a = 0.85 * [Math]::Pow(1 - $t, 2.2)
    }
    $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb([int][Math]::Round((Clamp01 $a) * 255), $r, $g, $b))
  }
}
$out = Join-Path $root 'images\hud\beacon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "wrote $out"

# --- the shaft --------------------------------------------------------------------
$w = 256; $h = 96
$bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$cy = $h / 2.0
for ($y = 0; $y -lt $h; $y++) {
  # soft across the beam
  $v = [Math]::Abs(($y + 0.5 - $cy) / $cy)
  $across = [Math]::Pow((Clamp01 (1 - $v * $v)), 1.6)
  for ($x = 0; $x -lt $w; $x++) {
    # bright at the right end (the tile), fading toward the left (physically up)
    $u = ($x + 0.5) / $w
    $along = [Math]::Pow($u, 1.8)
    $a = 0.85 * $along * $across
    $r = 255; $g = [int](Mix 160 215 $u); $b = [int](Mix 30 100 $u)
    $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb([int][Math]::Round((Clamp01 $a) * 255), $r, $g, $b))
  }
}
$out = Join-Path $root 'images\hud\beacon-shaft.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "wrote $out"
