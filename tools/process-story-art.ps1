# One-off: convert the generated story paintings (9:16 portrait sources) into
# the hall convention - 576x1024 then rotated 90 CCW into 1024x576 - matching
# images/intro/*.png. Sources come from the agent assets folder.
Add-Type -AssemblyName System.Drawing

$src = 'C:\Users\matth\.cursor\projects\c-Users-matth-hog-demo\assets'
$dst = Join-Path (Split-Path $PSScriptRoot -Parent) 'images\story'
New-Item -ItemType Directory -Force -Path $dst | Out-Null

Get-ChildItem (Join-Path $src 'story-src-*.png') | ForEach-Object {
  $name = $_.Name -replace '^story-src-', 'story-' # story-q1-1.png etc
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  $bmp = New-Object System.Drawing.Bitmap(576, 1024)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($img, 0, 0, 576, 1024)
  $g.Dispose(); $img.Dispose()
  $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
  $bmp.Save((Join-Path $dst $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "wrote $name"
}
