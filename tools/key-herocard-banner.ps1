# One-time processing of the AI-generated HERO CARD title plate: keys out the
# flat #00FF00 chroma background to alpha, despills green fringe on the gold
# edges, crops to the plate silhouette, rotates 90 CCW to match the rest of
# the label pipeline (reads bottom-to-top in landscape, upright in the
# portrait grip), and resizes to the banner set's 512px long side.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/key-herocard-banner.ps1 <raw.png>
# Emits:  images/menus/herocard-banner-a.png (re-quantize with pngquant after)

param(
  [string]$in = (Join-Path $(if ($env:HOG_RAW_ASSETS) { $env:HOG_RAW_ASSETS } else { "$env:USERPROFILE\.cursor\projects\c-Users-${env:USERNAME}-hog-demo\assets" }) 'herocard-banner-raw.png'),
  [string]$name = 'herocard-banner'
)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class ChromaKeyer {
  // Keys green-dominant pixels to alpha, despills the rest, and returns the
  // bounding box of the surviving (opaque) pixels.
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
          // The art is gold/red/black, so any green excess is key bleed.
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
$out = Join-Path $root "images\menus\$name-a.png"

$srcImg = [System.Drawing.Image]::FromFile($in)
$bmp = New-Object System.Drawing.Bitmap($srcImg.Width, $srcImg.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($srcImg, 0, 0, $srcImg.Width, $srcImg.Height)
$g.Dispose()
$srcImg.Dispose()

$bounds = [ChromaKeyer]::KeyAndBounds($bmp)
if ($bounds.IsEmpty) { throw 'chroma key removed every pixel - check the input' }
$crop = $bmp.Clone($bounds, $bmp.PixelFormat)
$bmp.Dispose()

# Same orientation as every other label: 90 CCW, reads bottom-to-top in landscape.
$crop.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)

$h = 512
$w = [int][Math]::Round($crop.Width * ($h / $crop.Height))
$final = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($final)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($crop, 0, 0, $w, $h)
$g.Dispose()
$crop.Dispose()

$final.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  '$name': { src: 'images/menus/$name-a.png', w: $($final.Width), h: $($final.Height) },"
$final.Dispose()
