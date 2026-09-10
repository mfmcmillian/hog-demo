# One-time processing of the AI-generated World Boss war-altar icon into the
# home-screen POI convention (see process-hall-art.ps1, which this mirrors):
# chroma-key the green, crop to the altar, rotate 90 CCW so it reads upright
# in the portrait grip, and fit it centered on a 512 square.
#
#   world-boss-raw.png -> images/home/boss-a.png
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/process-boss-art.ps1
# Prints the labels.gen.ts entry line to paste.

param(
  [string]$assets = $(if ($env:HOG_RAW_ASSETS) { $env:HOG_RAW_ASSETS } else { "$env:USERPROFILE\.cursor\projects\c-Users-${env:USERNAME}-hog-demo\assets" })
)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class BossKeyer {
  // Keys green-dominant pixels to alpha, despills the rest, and returns the
  // bounding box of the surviving (opaque) pixels. The generator's green is a
  // muted one, so the test is on green dominance rather than saturation.
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
        if (g > 80 && g > m * 1.35) {
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

$rawIcon = [System.Drawing.Image]::FromFile((Join-Path $assets 'world-boss-raw.png'))
$icon = New-Object System.Drawing.Bitmap($rawIcon.Width, $rawIcon.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($icon)
$g.DrawImage($rawIcon, 0, 0, $rawIcon.Width, $rawIcon.Height)
$g.Dispose()
$rawIcon.Dispose()
$bounds = [BossKeyer]::KeyAndBounds($icon)
if ($bounds.IsEmpty) { throw 'chroma key removed every pixel - check world-boss-raw.png' }
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
$iconOut = Join-Path $root 'images\home\boss-a.png'
$final.Save($iconOut, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  'home-boss': { src: 'images/home/boss-a.png', w: 512, h: 512 },"
$final.Dispose()
