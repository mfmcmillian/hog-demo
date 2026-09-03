# Render a realm's ASCII collision rows as a trail-layout diagram that the
# image model repaints (pale = walkable trail, dark = blocked). Generating
# from the layout instead of free-prompting keeps the painted trails on the
# tile grid, so the art matches where the player can actually walk.
#
# Usage:
#   powershell -File tools/render-ow-layout.ps1 -name fen -rows '#########','###.###.#',...
#
# Writes assets/<name>-layout.png (576x1024 portrait, 9x16 cells of 64px).

param(
  [Parameter(Mandatory = $true)][string]$name,
  [Parameter(Mandatory = $true)][string[]]$rows,
  [string]$assets = "$env:USERPROFILE\.cursor\projects\c-Users-matth-hog-demo\assets"
)

if ($rows.Count -ne 16) { throw "expected 16 rows, got $($rows.Count)" }

Add-Type -AssemblyName System.Drawing

$cell = 64
$pad = 6 # trail insets from the cell edge; joins bridge the gap between cells
$bmp = New-Object System.Drawing.Bitmap(576, 1024)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(18, 24, 20))
$trail = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(168, 142, 106))
for ($y = 0; $y -lt 16; $y++) {
  if ($rows[$y].Length -ne 9) { throw "row $y is not 9 chars" }
  for ($x = 0; $x -lt 9; $x++) {
    if ($rows[$y][$x] -ne '.') { continue }
    $g.FillRectangle($trail, $x * $cell + $pad, $y * $cell + $pad, $cell - 2 * $pad, $cell - 2 * $pad)
    if ($x -lt 8 -and $rows[$y][$x + 1] -eq '.') {
      $g.FillRectangle($trail, $x * $cell + $pad, $y * $cell + $pad, $cell + 2 * $pad, $cell - 2 * $pad)
    }
    if ($y -lt 15 -and $rows[$y + 1][$x] -eq '.') {
      $g.FillRectangle($trail, $x * $cell + $pad, $y * $cell + $pad, $cell - 2 * $pad, $cell + 2 * $pad)
    }
  }
}
$trail.Dispose()
$g.Dispose()
$out = Join-Path $assets "$name-layout.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "wrote $out"
