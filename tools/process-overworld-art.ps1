# One-time processing of the AI-generated overworld placeholder art into the
# game's storage convention (everything pre-rotated 90 CCW so it reads upright
# in the portrait grip; see gen-core-labels.ps1 / key-herocard-banner.ps1):
#
#   overworld-map-raw.png  -> images/maps/overworld-a.png   (648x1152 resize, whole-image rotate)
#   player-walk-raw.png    -> images/chars/player-walk-a.png (2048 sheet, chroma key, PER-CELL rotate
#                             so row=facing / col=frame indexing survives for cellUvs)
#   village-icon-raw.png   -> images/home/village-a.png     (chroma key, crop, rotate, fit 512 square)
#   (text render)          -> images/labels/village.png     (white Segoe UI strip like gen-core-labels)
#
# Also emits assets/overworld-map-grid.png: the raw portrait map with a 9x16
# red grid + indices overlay, used once to hand-author the collision rows in
# src/game/overworld.ts.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/process-overworld-art.ps1
# Prints the labels.gen.ts entry lines to paste.

param(
  [string]$assets = $(if ($env:HOG_RAW_ASSETS) { $env:HOG_RAW_ASSETS } else { "$env:USERPROFILE\.cursor\projects\c-Users-${env:USERNAME}-hog-demo\assets" })
)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class OverworldKeyer {
  // Keys green-dominant pixels to alpha, despills the rest, and returns the
  // bounding box of the surviving (opaque) pixels. Same logic as the
  // herocard banner keyer.
  public static Rectangle KeyAndBounds(Bitmap bmp) {
    var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
    var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    var bytes = new byte[data.Stride * data.Height];
    Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
    int minX = bmp.Width, minY = bmp.Height, maxX = -1, maxY = -1;
    for (int y = 0; y < bmp.Height; y++) {
      int row = y * data.Stride;
      for (int x = 0; x < bmp.Width; x++) {
        int i = row + x * 4;
        byte b = bytes[i], g = bytes[i + 1], r = bytes[i + 2];
        int m = r > b ? r : b;
        if (g > 90 && g > m * 1.5) {
          bytes[i + 3] = 0;
        } else {
          if (g > m) bytes[i + 1] = (byte)m;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    Marshal.Copy(bytes, 0, data.Scan0, bytes.Length);
    bmp.UnlockBits(data);
    if (maxX < 0) return Rectangle.Empty;
    int pad = 4;
    minX = Math.Max(0, minX - pad); minY = Math.Max(0, minY - pad);
    maxX = Math.Min(bmp.Width - 1, maxX + pad); maxY = Math.Min(bmp.Height - 1, maxY + pad);
    return new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1);
  }
}
"@

$root = Split-Path $PSScriptRoot -Parent

function Load-Resized([string]$path, [int]$w, [int]$h) {
  $src = [System.Drawing.Image]::FromFile($path)
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $w, $h)
  $g.Dispose()
  $src.Dispose()
  return $bmp
}

# ---- map: resize to physical 648x1152 (9x16 tiles of 72 stage px), rotate CCW ----
$map = Load-Resized (Join-Path $assets 'overworld-map-raw.png') 648 1152
$map.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
$mapOut = Join-Path $root 'images\maps\overworld-a.png'
$map.Save($mapOut, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  'map-overworld': { src: 'images/maps/overworld-a.png', w: $($map.Width), h: $($map.Height) },"
$map.Dispose()

# ---- walk sheet: 2048 square, key green, rotate each 512 cell in place ----
$sheet = Load-Resized (Join-Path $assets 'player-walk-raw.png') 2048 2048
[void][OverworldKeyer]::KeyAndBounds($sheet)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
for ([int]$r = 0; $r -lt 4; $r++) {
  for ([int]$c = 0; $c -lt 4; $c++) {
    [int]$cx = 512 * $c
    [int]$cy = 512 * $r
    $rect = [System.Drawing.Rectangle]::new($cx, $cy, 512, 512)
    $cell = $sheet.Clone($rect, $sheet.PixelFormat)
    $cell.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
    $g.DrawImage($cell, $cx, $cy, 512, 512)
    $cell.Dispose()
  }
}
$g.Dispose()
$sheetOut = Join-Path $root 'images\chars\player-walk-a.png'
$sheet.Save($sheetOut, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  'player-walk': { src: 'images/chars/player-walk-a.png', w: 2048, h: 2048 },"
$sheet.Dispose()

# ---- village gate icon: key, crop, rotate CCW, fit centered on 512 square ----
$rawIcon = [System.Drawing.Image]::FromFile((Join-Path $assets 'village-icon-raw.png'))
$icon = New-Object System.Drawing.Bitmap($rawIcon.Width, $rawIcon.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($icon)
$g.DrawImage($rawIcon, 0, 0, $rawIcon.Width, $rawIcon.Height)
$g.Dispose()
$rawIcon.Dispose()
$bounds = [OverworldKeyer]::KeyAndBounds($icon)
if ($bounds.IsEmpty) { throw 'chroma key removed every pixel - check village-icon-raw.png' }
$crop = $icon.Clone($bounds, $icon.PixelFormat)
$icon.Dispose()
$crop.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
$scale = [Math]::Min(512 / $crop.Width, 512 / $crop.Height)
$w = [int][Math]::Round($crop.Width * $scale)
$h = [int][Math]::Round($crop.Height * $scale)
$final = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($final)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($crop, [int](256 - $w / 2), [int](256 - $h / 2), $w, $h)
$g.Dispose()
$crop.Dispose()
$iconOut = Join-Path $root 'images\home\village-a.png'
$final.Save($iconOut, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  'home-overworld': { src: 'images/home/village-a.png', w: 512, h: 512 },"
$final.Dispose()

# ---- 'village' label strip: white Segoe UI, 2x supersample, rotate CCW ----
$scale2 = 2
$font = New-Object System.Drawing.Font('Segoe UI', (39 * $scale2), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$text = 'Village'
$probe = New-Object System.Drawing.Bitmap(8, 8)
$pg = [System.Drawing.Graphics]::FromImage($probe)
$pg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$size = $pg.MeasureString($text, $font)
$pg.Dispose(); $probe.Dispose()
$w = [int][Math]::Ceiling($size.Width) + 2
$h = [int][Math]::Ceiling($size.Height)
$lbl = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($lbl)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.DrawString($text, $font, [System.Drawing.Brushes]::White, 1, 0)
$g.Dispose()
$lbl.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
$lblOut = Join-Path $root 'images\labels\village.png'
$lbl.Save($lblOut, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  'village': { src: 'images/labels/village.png', w: $($lbl.Width), h: $($lbl.Height) },"
$lbl.Dispose()
$font.Dispose()

# ---- collision authoring aid: 9x16 grid + indices over the raw portrait map ----
$rawMap = [System.Drawing.Image]::FromFile((Join-Path $assets 'overworld-map-raw.png'))
$dbg = New-Object System.Drawing.Bitmap($rawMap.Width, $rawMap.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($dbg)
$g.DrawImage($rawMap, 0, 0, $rawMap.Width, $rawMap.Height)
$rawMap.Dispose()
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Red, 2)
$dbgFont = New-Object System.Drawing.Font('Consolas', 16, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$cw = $dbg.Width / 9.0
$ch = $dbg.Height / 16.0
for ($i = 1; $i -lt 9; $i++) { $g.DrawLine($pen, [int]($i * $cw), 0, [int]($i * $cw), $dbg.Height) }
for ($i = 1; $i -lt 16; $i++) { $g.DrawLine($pen, 0, [int]($i * $ch), $dbg.Width, [int]($i * $ch)) }
for ($y = 0; $y -lt 16; $y++) {
  for ($x = 0; $x -lt 9; $x++) {
    $g.DrawString("$x,$y", $dbgFont, [System.Drawing.Brushes]::Yellow, [int]($x * $cw) + 3, [int]($y * $ch) + 3)
  }
}
$pen.Dispose(); $dbgFont.Dispose(); $g.Dispose()
$dbg.Save((Join-Path $assets 'overworld-map-grid.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$dbg.Dispose()
Write-Host 'grid overlay -> assets/overworld-map-grid.png'
