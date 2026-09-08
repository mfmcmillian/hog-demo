# One-time processing of the AI-generated Hall of Heroes building icon into the
# home-screen POI convention (see process-overworld-art.ps1 for the village
# gate this mirrors): chroma-key the green, crop to the building, rotate 90 CCW
# so it reads upright in the portrait grip, and fit it centered on a 512 square.
# Also renders the 'Hall of Heroes' plate strip like gen-home-label.ps1.
#
#   hall-of-heroes-raw.png -> images/home/hall-a.png
#   hall-interior-raw.png  -> images/maps/hall-of-heroes-a.jpg (screen backdrop)
#   (text render)          -> images/labels/hall-of-heroes.png
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/process-hall-art.ps1
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

public static class HallKeyer {
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

# ---- building icon: key, crop, rotate CCW, fit centered on 512 square ----
$rawIcon = [System.Drawing.Image]::FromFile((Join-Path $assets 'hall-of-heroes-raw.png'))
$icon = New-Object System.Drawing.Bitmap($rawIcon.Width, $rawIcon.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($icon)
$g.DrawImage($rawIcon, 0, 0, $rawIcon.Width, $rawIcon.Height)
$g.Dispose()
$rawIcon.Dispose()
$bounds = [HallKeyer]::KeyAndBounds($icon)
if ($bounds.IsEmpty) { throw 'chroma key removed every pixel - check hall-of-heroes-raw.png' }
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
$iconOut = Join-Path $root 'images\home\hall-a.png'
$final.Save($iconOut, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  'home-hall': { src: 'images/home/hall-a.png', w: 512, h: 512 },"
$final.Dispose()

# ---- hall interior backdrop: portrait render rotated CCW (phone-top = canvas-left),
#      resized to the 768x512 the other screen backdrops use ----
$rawRoom = [System.Drawing.Image]::FromFile((Join-Path $assets 'hall-interior-raw.png'))
$room = New-Object System.Drawing.Bitmap($rawRoom.Width, $rawRoom.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($room)
$g.DrawImage($rawRoom, 0, 0, $rawRoom.Width, $rawRoom.Height)
$g.Dispose()
$rawRoom.Dispose()
$room.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
$back = New-Object System.Drawing.Bitmap(768, 512, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($back)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($room, 0, 0, 768, 512)
$g.Dispose()
$room.Dispose()
$jpgCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]86)
$backOut = Join-Path $root 'images\maps\hall-of-heroes-a.jpg'
$back.Save($backOut, $jpgCodec, $encParams)
Write-Host "  'map-hall-of-heroes': { src: 'images/maps/hall-of-heroes-a.jpg', w: 768, h: 512 },"
$back.Dispose()

# ---- 'Hall of Heroes' plate strip: white Segoe UI, 2x supersample, rotate CCW ----
$scale2 = 2
$font = New-Object System.Drawing.Font('Segoe UI', (39 * $scale2), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$text = 'Hall of Heroes'
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
$lblOut = Join-Path $root 'images\labels\hall-of-heroes.png'
$lbl.Save($lblOut, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  'hall-of-heroes': { src: 'images/labels/hall-of-heroes.png', w: $($lbl.Width), h: $($lbl.Height) },"
$lbl.Dispose()
$font.Dispose()
