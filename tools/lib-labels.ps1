# Shared label-strip rendering + atlas packing. Dot-source from gen-*-labels.ps1:
#   . "$PSScriptRoot\lib-labels.ps1"
#
# Strips are white all-caps Segoe UI on transparent, rotated 90 CCW (glyphs
# read bottom-to-top in landscape, upright in the portrait grip), tinted at
# draw time via uiBackground.color.
#
# Two output modes:
#   per-file (default): images/labels/<key>.png, one texture per strip.
#   atlas   (HOG_LABEL_ATLAS=1): a family packs into 1024-tall pages and each
#           LabelInfo carries `uvs` into its page (200 files -> ~9).
# Atlas is off because the mobile (Godot) explorer drops uiBackground.color
# whenever `uvs` are set: its dcl_ui_background_uv.gdshader ends in
# `COLOR = texture(TEXTURE, uv);` without multiplying by the modulate, so gold
# stars and green online dots render white. The desktop Unity explorer tints
# correctly. Flip the switch once that shader multiplies by COLOR.

Add-Type -AssemblyName System.Drawing

$LabelAtlas = $env:HOG_LABEL_ATLAS -eq '1'

# 1.5x supersample: strips draw ~21 stage px wide, so a 39px font is still
# ~2.7x oversampled, and the longest lines stay under Decentraland's 1024px
# texture cap (2x pushed them to ~1280, which the asset pipeline downscaled).
$LabelScale = 1.5
$AtlasMax = 1024

function New-LabelFont([double]$px) {
  New-Object System.Drawing.Font('Segoe UI', [single]($px * $LabelScale), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
}

function New-LabelStrip([string]$text, [System.Drawing.Font]$font) {
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
  $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
  return $bmp
}

function Get-Pow2([int]$n) {
  $p = 64
  while ($p -lt $n) { $p *= 2 }
  return $p
}

# Packs $strips ([ordered]@{ key = Bitmap }) into images/labels/<family>-atlas-N.png,
# disposing the bitmaps. Returns @{ entries = [ordered]@{ key = "{ src, w, h, uvs }" };
# pages = N }. Keys matching -priority (wildcard) pack first so they land on
# page 0 (boot-critical strips; see preload.ts INTRO).
function Pack-LabelStrips {
  param(
    [Parameter(Mandatory)][string]$family,
    [Parameter(Mandatory)]$strips,
    [Parameter(Mandatory)][string]$root,
    [string]$priority = '',
    [int]$pad = 2
  )
  $outDir = Join-Path $root 'images\labels'
  Get-ChildItem $outDir -Filter "$family-atlas-*.png" -ErrorAction SilentlyContinue | Remove-Item -Force

  # Tallest-first packs tightest. Keys matching -priority (wildcard) go before
  # everything else so they land on page 0.
  $ordered = $strips.GetEnumerator() | Sort-Object -Property @{ Expression = { if ($priority -and $_.Key -like $priority) { 0 } else { 1 } } }, @{ Expression = { $_.Value.Height }; Descending = $true }

  # Column packing: rotated text is narrow and tall, so strips stack top-down
  # in columns. First-fit: a strip goes into the first column on the current
  # page with room below (so short lines fill under long ones); otherwise it
  # opens a new column, or a new page when the row of columns is full.
  $pages = New-Object System.Collections.Generic.List[object]
  $page = $null
  foreach ($kv in $ordered) {
    $bmp = $kv.Value
    if ($bmp.Height + 2 * $pad -gt $AtlasMax) { throw "$($kv.Key) is $($bmp.Height)px tall; over the $AtlasMax page. Shorten the line." }
    if ($null -eq $page) {
      $page = @{ items = New-Object System.Collections.Generic.List[object]; cols = New-Object System.Collections.Generic.List[object]; nextX = $pad }
      $pages.Add($page)
    }
    $col = $null
    foreach ($c in $page.cols) {
      if ($bmp.Width -le $c.w -and $c.y + $bmp.Height + $pad -le $AtlasMax) { $col = $c; break }
    }
    if ($null -eq $col) {
      if ($page.nextX + $bmp.Width + $pad -gt $AtlasMax) {
        $page = @{ items = New-Object System.Collections.Generic.List[object]; cols = New-Object System.Collections.Generic.List[object]; nextX = $pad }
        $pages.Add($page)
      }
      $col = @{ x = $page.nextX; y = $pad; w = $bmp.Width }
      $page.cols.Add($col)
      $page.nextX += $bmp.Width + $pad
    }
    $page.items.Add(@{ key = $kv.Key; bmp = $bmp; x = $col.x; y = $col.y })
    $col.y += $bmp.Height + $pad
  }

  $entries = [ordered]@{}
  for ($i = 0; $i -lt $pages.Count; $i++) {
    $items = $pages[$i].items
    $usedW = ($items | ForEach-Object { $_.x + $_.bmp.Width + $pad } | Measure-Object -Maximum).Maximum
    $usedH = ($items | ForEach-Object { $_.y + $_.bmp.Height + $pad } | Measure-Object -Maximum).Maximum
    $W = Get-Pow2 $usedW
    $H = Get-Pow2 $usedH
    $atlas = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($atlas)
    $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $src = "images/labels/$family-atlas-$i.png"
    foreach ($it in $items) {
      $g.DrawImage($it.bmp, $it.x, $it.y, $it.bmp.Width, $it.bmp.Height)
      $u0 = [Math]::Round($it.x / $W, 5)
      $u1 = [Math]::Round(($it.x + $it.bmp.Width) / $W, 5)
      $vT = [Math]::Round(1 - $it.y / $H, 5)
      $vB = [Math]::Round(1 - ($it.y + $it.bmp.Height) / $H, 5)
      # A(bottom-left) B(top-left) C(top-right) D(bottom-right), same as cellUvs.
      $uvs = "[$u0, $vB, $u0, $vT, $u1, $vT, $u1, $vB]"
      $entries[$it.key] = "{ src: '$src', w: $($it.bmp.Width), h: $($it.bmp.Height), uvs: $uvs }"
      $it.bmp.Dispose()
    }
    $g.Dispose()
    $atlas.Save((Join-Path $root ($src -replace '/', '\')), [System.Drawing.Imaging.ImageFormat]::Png)
    $atlas.Dispose()
  }
  Quantize-Images @(0..($pages.Count - 1) | ForEach-Object { "images/labels/$family-atlas-$_.png" })
  return @{ entries = $entries; pages = $pages.Count }
}

# Generated families: packs, deletes the per-strip PNGs the keys used to be,
# and writes src/ui/labels.<family>.gen.ts.
function Write-LabelFamily {
  param(
    [Parameter(Mandatory)][string]$family,
    [Parameter(Mandatory)]$strips,
    [Parameter(Mandatory)][string]$root,
    [Parameter(Mandatory)][string]$exportName,
    [Parameter(Mandatory)][string]$comment,
    [string]$priority = '',
    [int]$pad = 2
  )
  $outDir = Join-Path $root 'images\labels'
  $tsPath = Join-Path $root "src\ui\labels.$family.gen.ts"
  $lines = New-Object System.Collections.Generic.List[string]
  if ($LabelAtlas) {
    $packed = Pack-LabelStrips -family $family -strips $strips -root $root -priority $priority -pad $pad
    foreach ($key in $strips.Keys) {
      $lines.Add("  '$key': $($packed.entries[$key]),")
      $old = Join-Path $outDir "$key.png"
      if (Test-Path $old) { Remove-Item $old -Force }
    }
    $where = "into $($packed.pages) atlas page(s)"
    $note = "Strips are packed into images/labels/$family-atlas-*.png; w/h are the`n// strip's own pixel size (for aspect), uvs its rect in the page."
  } else {
    Get-ChildItem $outDir -Filter "$family-atlas-*.png" -ErrorAction SilentlyContinue | Remove-Item -Force
    $written = @()
    foreach ($key in $strips.Keys) {
      $bmp = $strips[$key]
      $bmp.Save((Join-Path $outDir "$key.png"), [System.Drawing.Imaging.ImageFormat]::Png)
      $lines.Add("  '$key': { src: 'images/labels/$key.png', w: $($bmp.Width), h: $($bmp.Height) },")
      $written += "images/labels/$key.png"
      $bmp.Dispose()
    }
    Quantize-Images $written
    $where = 'as per-strip files'
    $note = 'One PNG per strip (see lib-labels.ps1 for why not an atlas).'
  }
  $body = ($lines -join "`n").TrimEnd(',')
  $ts = @"
// AUTO-GENERATED by tools/gen-$family-labels.ps1 -- do not edit by hand.
// $comment
// $note
import { LABELS, LabelInfo } from './labels.gen'

export const $exportName`: Record<string, LabelInfo> = {
$body
}

Object.assign(LABELS, $exportName)
"@
  Set-Content -Path $tsPath -Value $ts -Encoding UTF8
  Format-LabelTs $tsPath
  Write-Host "Wrote $($strips.Count) strips $where + $tsPath"
}

# The repo is prettier-clean; keep generated modules that way.
function Format-LabelTs([string]$tsPath) {
  try { & npx --no-install prettier --write $tsPath | Out-Null } catch { Write-Warning "prettier skipped: $_" }
}

# White-on-alpha text palettizes losslessly at about half the bytes.
function Quantize-Images([string[]]$paths) {
  if ($paths.Count -eq 0) { return }
  try { & python (Join-Path $PSScriptRoot 'quantize-images.py') @paths | Out-Null } catch { Write-Warning "quantize skipped: $_" }
}
