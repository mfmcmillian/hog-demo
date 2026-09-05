# Render a realm's ASCII collision rows as a trail-layout diagram that the
# image model repaints (pale = walkable trail, dark = blocked). Generating
# from the layout instead of free-prompting keeps the painted trails on the
# tile grid, so the art matches where the player can actually walk.
#
# Legend (same chars as owdefs.ts rows):
#   '#' blocked (dark)     '.' trail (pale)
#   'v' '^' '<' '>' ledge: drawn as a cliff lip - a trail cell with a bright
#       edge on the side you land past and chevrons pointing the hop way, so
#       the painter puts a small drop / rock step there.
#   -over rows: cells marked 'o' get a hatched canopy so the painter knows
#       an arch / tree crown / bridge overhangs the trail there (cut later by
#       process-ow-map.ps1 -over).
#
# Usage:
#   powershell -File tools/render-ow-layout.ps1 -name fen -rows '#########','###.###.#',...
#   powershell -File tools/render-ow-layout.ps1 -name crypt -rows ... -over '#########','#ooo.ooo#',...
#
# Writes assets/<name>-layout.png (576x1024 portrait, 9x16 cells of 64px).

param(
  [Parameter(Mandatory = $true)][string]$name,
  [Parameter(Mandatory = $true)][string[]]$rows,
  [string[]]$over = @(),
  [string]$assets = "$env:USERPROFILE\.cursor\projects\c-Users-matth-hog-demo\assets"
)

if ($rows.Count -ne 16) { throw "expected 16 rows, got $($rows.Count)" }
if ($over.Count -gt 0 -and $over.Count -ne 16) { throw "expected 16 -over rows, got $($over.Count)" }

Add-Type -AssemblyName System.Drawing

$cell = 64
$pad = 6 # trail insets from the cell edge; joins bridge the gap between cells
$bmp = New-Object System.Drawing.Bitmap(576, 1024)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(18, 24, 20))
$trail = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(168, 142, 106))
$ledgeFill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(120, 98, 70))
$lip = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(236, 220, 190), 6)
$chevron = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(236, 220, 190), 3)
$ledges = @{ 'v' = @(0, 1); '^' = @(0, -1); '<' = @(-1, 0); '>' = @(1, 0) }

function Is-Open([string]$c) { return $c -eq '.' -or $ledges.ContainsKey($c) }

for ($y = 0; $y -lt 16; $y++) {
  if ($rows[$y].Length -ne 9) { throw "row $y is not 9 chars" }
  for ($x = 0; $x -lt 9; $x++) {
    $c = $rows[$y][$x]
    if (-not (Is-Open $c)) { continue }
    $brush = if ($c -eq '.') { $trail } else { $ledgeFill }
    $g.FillRectangle($brush, $x * $cell + $pad, $y * $cell + $pad, $cell - 2 * $pad, $cell - 2 * $pad)
    if ($x -lt 8 -and (Is-Open $rows[$y][$x + 1])) {
      $g.FillRectangle($brush, $x * $cell + $pad, $y * $cell + $pad, $cell + 2 * $pad, $cell - 2 * $pad)
    }
    if ($y -lt 15 -and (Is-Open $rows[$y + 1][$x])) {
      $g.FillRectangle($brush, $x * $cell + $pad, $y * $cell + $pad, $cell - 2 * $pad, $cell + 2 * $pad)
    }
  }
}

# Cliff lips on top of the joins so they read over the trail.
for ($y = 0; $y -lt 16; $y++) {
  for ($x = 0; $x -lt 9; $x++) {
    $c = $rows[$y][$x]
    if (-not $ledges.ContainsKey([string]$c)) { continue }
    $d = $ledges[[string]$c]
    $cx = $x * $cell + $cell / 2
    $cy = $y * $cell + $cell / 2
    $half = $cell / 2 - 3
    # Lip along the edge you drop past (the far side in the hop direction).
    if ($d[0] -eq 0) {
      $ey = $cy + $d[1] * $half
      $g.DrawLine($lip, $x * $cell + 2, $ey, ($x + 1) * $cell - 2, $ey)
    } else {
      $ex = $cx + $d[0] * $half
      $g.DrawLine($lip, $ex, $y * $cell + 2, $ex, ($y + 1) * $cell - 2)
    }
    # Two chevrons pointing the hop way.
    foreach ($k in @(-8, 6)) {
      $ox = $cx + $d[0] * $k; $oy = $cy + $d[1] * $k
      $tipX = $ox + $d[0] * 9; $tipY = $oy + $d[1] * 9
      $g.DrawLine($chevron, $ox - $d[1] * 9, $oy - $d[0] * 9, $tipX, $tipY)
      $g.DrawLine($chevron, $ox + $d[1] * 9, $oy + $d[0] * 9, $tipX, $tipY)
    }
  }
}

# Hatched canopy for the overhead cells.
if ($over.Count -gt 0) {
  $hatch = New-Object System.Drawing.Drawing2D.HatchBrush(
    [System.Drawing.Drawing2D.HatchStyle]::WideDownwardDiagonal,
    [System.Drawing.Color]::FromArgb(200, 92, 150, 96),
    [System.Drawing.Color]::FromArgb(90, 30, 60, 34))
  $edge = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(150, 210, 150), 2)
  for ($y = 0; $y -lt 16; $y++) {
    if ($over[$y].Length -ne 9) { throw "-over row $y is not 9 chars" }
    for ($x = 0; $x -lt 9; $x++) {
      if ($over[$y][$x] -ne 'o') { continue }
      $g.FillRectangle($hatch, $x * $cell, $y * $cell, $cell, $cell)
      $g.DrawRectangle($edge, $x * $cell + 1, $y * $cell + 1, $cell - 2, $cell - 2)
    }
  }
  $hatch.Dispose(); $edge.Dispose()
}

$trail.Dispose(); $ledgeFill.Dispose(); $lip.Dispose(); $chevron.Dispose()
$g.Dispose()
$out = Join-Path $assets "$name-layout.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "wrote $out"
