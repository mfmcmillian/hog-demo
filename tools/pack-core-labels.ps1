# Packs the hand-maintained core labels (the images/labels/*.png entries in
# src/ui/labels.gen.ts) into images/labels/core-atlas-N.png, byte-exact.
# These strips predate the generators (the original gen-labels.ps1 was never
# committed), so they can't be re-rendered from text: the first run moves each
# original to tools/art/core-labels/<key>.png (tools/ is dclignored), and every
# run packs from there and rewrites the entry lines in labels.gen.ts in place.
#
# Anything over 1024px in either dimension (win/lose plaques, the oath banner)
# stays a standalone file; the page cap is 1024.
#
# -Unpack restores one images/labels/<key>.png per label from the kept
# originals and points the entries back at them (no uvs). This is the shipped
# state while the mobile explorer ignores tint on uvs draws; see lib-labels.ps1.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/pack-core-labels.ps1 [-Unpack]

param([switch]$Unpack)

. "$PSScriptRoot\lib-labels.ps1"

$root = Split-Path $PSScriptRoot -Parent
$labelsDir = Join-Path $root 'images\labels'
$srcDir = Join-Path $root 'tools\art\core-labels'
$tsPath = Join-Path $root 'src\ui\labels.gen.ts'
New-Item -ItemType Directory -Force -Path $srcDir | Out-Null

# Matches an entry whether prettier left it on one line or wrapped it, and
# whether it quoted the key (prettier drops quotes on plain identifiers).
$entryRx = [regex]"(?<=[\s{])'?(?<key>[a-z0-9-]+)'?: \{\s*src: 'images/labels/(?<file>[^']+)',\s*w: (?<w>\d+),\s*h: (?<h>\d+)(,\s*uvs: \[[^\]]*\])?\s*\}"

$text = Get-Content $tsPath -Raw -Encoding UTF8

# Step 1: adopt originals. A first run moves images/labels/<file> to
# tools/art/core-labels/<key>.png; later runs find them already there.
foreach ($m in $entryRx.Matches($text)) {
  $key = $m.Groups['key'].Value; $file = $m.Groups['file'].Value
  if ($file -like '*-atlas-*') { continue }
  $orig = Join-Path $labelsDir $file
  $kept = Join-Path $srcDir "$key.png"
  if ((Test-Path $orig) -and -not (Test-Path $kept)) {
    $probe = [System.Drawing.Bitmap]::FromFile($orig)
    $fits = $probe.Width -le $AtlasMax -and $probe.Height -le $AtlasMax
    $probe.Dispose()
    if (-not $fits) { Write-Host "  keep standalone (over $AtlasMax): $file"; continue }
    Copy-Item $orig $kept
    Remove-Item $orig -Force
  }
}

if ($Unpack) {
  Get-ChildItem $labelsDir -Filter 'core-atlas-*.png' -ErrorAction SilentlyContinue | Remove-Item -Force
  $entries = [ordered]@{}
  $written = @()
  foreach ($png in Get-ChildItem $srcDir -Filter '*.png' | Sort-Object Name) {
    $key = [IO.Path]::GetFileNameWithoutExtension($png.Name)
    Copy-Item $png.FullName (Join-Path $labelsDir "$key.png") -Force
    $bmp = [System.Drawing.Bitmap]::FromFile($png.FullName)
    $entries[$key] = "{ src: 'images/labels/$key.png', w: $($bmp.Width), h: $($bmp.Height) }"
    $bmp.Dispose()
    $written += "images/labels/$key.png"
  }
  Quantize-Images $written
  $hit = 0
  $text = $entryRx.Replace($text, {
    param($m)
    $key = $m.Groups['key'].Value
    if (-not $entries.Contains($key)) { return $m.Value }
    $script:hit++
    return "'$key': $($entries[$key])"
  })
  Set-Content -Path $tsPath -Value $text -Encoding UTF8 -NoNewline
  Format-LabelTs $tsPath
  Write-Host "Unpacked $($entries.Count) core labels to per-strip files; rewrote $hit entries in labels.gen.ts"
  exit 0
}

# Step 2: pack everything adopted so far.
$strips = [ordered]@{}
foreach ($png in Get-ChildItem $srcDir -Filter '*.png' | Sort-Object Name) {
  $key = [IO.Path]::GetFileNameWithoutExtension($png.Name)
  # Load via stream so the file handle is released and the bitmap is a plain
  # 32bpp copy (indexed PNGs would otherwise refuse DrawImage compositing).
  $raw = [System.Drawing.Bitmap]::FromFile($png.FullName)
  $bmp = New-Object System.Drawing.Bitmap($raw.Width, $raw.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.DrawImage($raw, 0, 0, $raw.Width, $raw.Height)
  $g.Dispose(); $raw.Dispose()
  $strips[$key] = $bmp
}
if ($strips.Count -eq 0) { Write-Host 'Nothing to pack.'; exit 0 }

$packed = Pack-LabelStrips -family 'core' -strips $strips -root $root

# Step 3: rewrite the entries in place.
$hit = 0
$text = $entryRx.Replace($text, {
  param($m)
  $key = $m.Groups['key'].Value
  if (-not $packed.entries.Contains($key)) { return $m.Value }
  $script:hit++
  return "'$key': $($packed.entries[$key])"
})
Set-Content -Path $tsPath -Value $text -Encoding UTF8 -NoNewline
Format-LabelTs $tsPath
Write-Host "Packed $($strips.Count) core labels into $($packed.pages) page(s); rewrote $hit entries in labels.gen.ts"
