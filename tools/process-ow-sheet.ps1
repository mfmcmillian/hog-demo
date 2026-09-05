# Rotate each cell of a 4x4 character sheet 90 CCW (hog art convention)
# and write a 512x512 palette PNG into images/chars (128px cells; the map
# draws them at 100px, the talk portrait at 140px). Every preloaded sheet
# stays GPU-resident (w*h*4 bytes regardless of file size), so 2048 sheets
# (16 MB each) were pushing mobile over the edge. The final ffmpeg pass
# quantizes to 256 colors: ~40 KB on disk instead of ~800 KB.
#
#   powershell -File tools/process-ow-sheet.ps1 -name elder-walk-a

param(
  [Parameter(Mandatory = $true)][string]$name,
  [string]$assets = "$env:USERPROFILE\.cursor\projects\c-Users-matth-hog-demo\assets"
)

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$srcPath = Join-Path $assets "$name.png"
if (-not (Test-Path $srcPath)) { throw "missing $srcPath" }

$src = [System.Drawing.Image]::FromFile($srcPath)
$cellW = [int]($src.Width / 4)
$cellH = [int]($src.Height / 4)
Write-Host "source $($src.Width)x$($src.Height) cells ${cellW}x${cellH}"

$out = New-Object System.Drawing.Bitmap(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($out)
$g.Clear([System.Drawing.Color]::Black)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$dest = 256

for ($row = 0; $row -lt 4; $row++) {
  for ($col = 0; $col -lt 4; $col++) {
    $cell = New-Object System.Drawing.Bitmap($cellW, $cellH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $cg = [System.Drawing.Graphics]::FromImage($cell)
    $cg.DrawImage(
      $src,
      (New-Object System.Drawing.Rectangle(0, 0, $cellW, $cellH)),
      $col * $cellW, $row * $cellH, $cellW, $cellH,
      [System.Drawing.GraphicsUnit]::Pixel
    )
    $cg.Dispose()
    $cell.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
    $g.DrawImage($cell, $col * $dest, $row * $dest, $dest, $dest)
    $cell.Dispose()
  }
}
$g.Dispose()
$src.Dispose()

$outPath = Join-Path $root "images\chars\$name.png"
# Player-walk uses real alpha (A=0), not painted black. Key out near-black
# backdrop pixels so the new sheets composite the same way on the map.
$rect = New-Object System.Drawing.Rectangle(0, 0, $out.Width, $out.Height)
$data = $out.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = [Math]::Abs($data.Stride) * $out.Height
$buf = New-Object byte[] $bytes
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $bytes)
for ($i = 0; $i -lt $buf.Length; $i += 4) {
  $b = $buf[$i]; $g = $buf[$i + 1]; $r = $buf[$i + 2]
  if ($r -le 8 -and $g -le 8 -and $b -le 8) { $buf[$i + 3] = 0 }
}
[System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $data.Scan0, $bytes)
$out.UnlockBits($data)

$out.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$out.Dispose()

# Shrink to 512 and quantize (area filter keeps pixel edges crisp at 2:1).
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
  $tmp = Join-Path $env:TEMP "$name-q.png"
  $vf = 'scale=512:512:flags=area,split[a][b];[a]palettegen=max_colors=256:reserve_transparent=1:stats_mode=full[p];[b][p]paletteuse=dither=none:alpha_threshold=128'
  & ffmpeg -v error -y -i $outPath -vf $vf $tmp
  if ($LASTEXITCODE -eq 0) { Move-Item -Force $tmp $outPath } else { Write-Warning 'ffmpeg pass failed; left the 1024 RGBA sheet in place' }
} else {
  Write-Warning 'ffmpeg not found; left the 1024 RGBA sheet in place (labels.gen expects 512)'
}
Write-Host "wrote $outPath"
