# Re-renders the handful of core text strips from the original gen-labels.ps1
# (never committed) that ship with the game: white mixed-case Segoe UI on a
# transparent background, rotated 90 CCW so glyphs read bottom-to-top in
# landscape and upright in the portrait grip.
#
# 39px Segoe UI measures ~51px tall with ascent/descent, matching the original
# continue.png / skip.png strips exactly. Supersampled 2x for high-DPR phones;
# display sizes are stage units, so layout is unchanged - strips just stay crisp.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-core-labels.ps1
# Emits:  images/labels/<key>.png and prints the labels.gen.ts entry lines
#         (these keys live in the hand-maintained labels.gen.ts - paste dims there).

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'images\labels'

$scale = 2
$fontPx = 39 * $scale
$font = New-Object System.Drawing.Font('Segoe UI', $fontPx, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

$lines = [ordered]@{
  'continue' = 'Tap to continue'
  'skip'     = 'Tap to skip'
}

foreach ($kv in $lines.GetEnumerator()) {
  $key = $kv.Key
  $text = $kv.Value

  $probe = New-Object System.Drawing.Bitmap(8, 8)
  $pg = [System.Drawing.Graphics]::FromImage($probe)
  $pg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $size = $pg.MeasureString($text, $font)
  $pg.Dispose(); $probe.Dispose()

  $w = [int][Math]::Ceiling($size.Width) + 2
  $h = [int][Math]::Ceiling($size.Height)

  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $g.DrawString($text, $font, [System.Drawing.Brushes]::White, 1, 0)
  $g.Dispose()

  # Same orientation as every other label: 90 CCW, reads bottom-to-top in landscape.
  $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
  $file = Join-Path $outDir "$key.png"
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "  '$key': { src: 'images/labels/$key.png', w: $($bmp.Width), h: $($bmp.Height) },"
  $bmp.Dispose()
}

$font.Dispose()
