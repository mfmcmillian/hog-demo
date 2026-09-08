# Renders a soft white radial glow (opaque centre fading to transparent) that
# the UI tints per rarity behind hero faces. White so runtime `color` gives the
# hue; the falloff is eased so it reads as light, not a disc with an edge.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-aura.ps1
# Emits:  images/hud/aura.png

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$c = $size / 2.0
for ($y = 0; $y -lt $size; $y++) {
  for ($x = 0; $x -lt $size; $x++) {
    $d = [Math]::Sqrt(($x - $c) * ($x - $c) + ($y - $c) * ($y - $c)) / $c
    if ($d -ge 1) { $a = 0 }
    else {
      # flat core, then a smooth (1-d^2)^2 falloff to the rim
      $t = [Math]::Max(0.0, ($d - 0.18) / 0.82)
      $a = [int](255 * [Math]::Pow(1 - $t * $t, 2))
    }
    $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, 255, 255, 255))
  }
}
$out = Join-Path $root 'images\hud\aura.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "wrote $out"
