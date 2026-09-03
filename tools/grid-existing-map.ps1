# Overlay a 9x16 grid on an already-processed (rotated) map JPG by
# rotating it back to portrait, then writing assets/<name>-map-grid.png.
param(
  [Parameter(Mandatory = $true)][string]$src,
  [Parameter(Mandatory = $true)][string]$name,
  [string]$assets = "$env:USERPROFILE\.cursor\projects\c-Users-matth-hog-demo\assets"
)

Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile((Resolve-Path $src))
$img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone)
$dbg = New-Object System.Drawing.Bitmap($img.Width, $img.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($dbg)
$g.DrawImage($img, 0, 0, $img.Width, $img.Height)
$img.Dispose()
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Red, 2)
$font = New-Object System.Drawing.Font('Consolas', 14, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$cw = $dbg.Width / 9.0
$ch = $dbg.Height / 16.0
for ($i = 1; $i -lt 9; $i++) { $g.DrawLine($pen, [int]($i * $cw), 0, [int]($i * $cw), $dbg.Height) }
for ($i = 1; $i -lt 16; $i++) { $g.DrawLine($pen, 0, [int]($i * $ch), $dbg.Width, [int]($i * $ch)) }
for ($y = 0; $y -lt 16; $y++) {
  for ($x = 0; $x -lt 9; $x++) {
    $g.DrawString("$x,$y", $font, [System.Drawing.Brushes]::Yellow, [int]($x * $cw) + 2, [int]($y * $ch) + 2)
  }
}
$pen.Dispose(); $font.Dispose(); $g.Dispose()
$out = Join-Path $assets "$name-map-grid.png"
$dbg.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$dbg.Dispose()
Write-Host "wrote $out"
