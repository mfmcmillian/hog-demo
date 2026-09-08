# Renders the card selection marker: a rounded gold frame with a bright inner
# line and a soft light bleeding outward, transparent in the middle so the card
# shows through. Drawn nine-sliced at runtime (see widgets.SelectFrame) so the
# corners stay round on any card size.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-select-frame.ps1
# Emits:  images/hud/select-frame.png

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

$inset = 44.0   # the frame line sits this far in from the texture edge
$radius = 30.0  # corner radius of the frame line
$band = 4.0     # half-thickness of the solid line
$glowOut = 40.0 # how far the light spreads outward
$glowIn = 18.0  # and inward

function Mix([double]$a, [double]$b, [double]$t) { return $a + ($b - $a) * $t }

for ($y = 0; $y -lt $size; $y++) {
  for ($x = 0; $x -lt $size; $x++) {
    # signed distance to the rounded rectangle (negative inside)
    $px = $x + 0.5 - $size / 2.0
    $py = $y + 0.5 - $size / 2.0
    $hx = $size / 2.0 - $inset - $radius
    $hy = $size / 2.0 - $inset - $radius
    $qx = [Math]::Abs($px) - $hx
    $qy = [Math]::Abs($py) - $hy
    $ox = [Math]::Max($qx, 0.0)
    $oy = [Math]::Max($qy, 0.0)
    $d = [Math]::Sqrt($ox * $ox + $oy * $oy) + [Math]::Min([Math]::Max($qx, $qy), 0.0) - $radius

    $a = 0.0; $r = 255; $g = 214; $b = 120
    $ad = [Math]::Abs($d)
    if ($ad -le $band) {
      # the line itself: pale gold core, warm gold edges
      $t = $ad / $band
      $a = 1.0
      $r = 255; $g = [int](Mix 244 206 $t); $b = [int](Mix 205 105 $t)
    }
    elseif ($d -gt 0 -and $d -le $band + $glowOut) {
      # outward light: eased falloff
      $t = ($d - $band) / $glowOut
      $a = 0.7 * [Math]::Pow(1 - $t, 2.2)
      $r = 255; $g = 196; $b = 96
    }
    elseif ($d -lt 0 -and $d -ge -($band + $glowIn)) {
      # a touch of light inside the line so the frame sits on the card
      $t = (-$d - $band) / $glowIn
      $a = 0.45 * [Math]::Pow(1 - $t, 2)
      $r = 255; $g = 224; $b = 150
    }
    $alpha = [int][Math]::Round([Math]::Max(0.0, [Math]::Min(1.0, $a)) * 255)
    $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $r, $g, $b))
  }
}
$out = Join-Path $root 'images\hud\select-frame.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "wrote $out"
