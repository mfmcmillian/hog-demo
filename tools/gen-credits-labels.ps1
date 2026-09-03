# Renders the credits-roll line strips in the same style as the other label
# generators: white all-caps Segoe UI on a transparent background, rotated 90
# CCW so glyphs read bottom-to-top in landscape and upright in the portrait
# grip (same convention as gen-tut-labels.ps1).
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-credits-labels.ps1
# Emits:  images/labels/credits-*.png  +  src/ui/labels.credits.gen.ts

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'images\labels'
$tsPath = Join-Path $root 'src\ui\labels.credits.gen.ts'

# 26px Segoe UI measures ~34px tall with ascent/descent, matching the fire-line strips.
# Supersampled 2x for high-DPR phones; display sizes are stage units and derive
# height from the aspect ratio, so layout is unchanged - strips just stay crisp.
. "$PSScriptRoot\lib-labels.ps1"
$font = New-LabelFont 26

$lines = [ordered]@{
  'credits-created'    = 'CREATED BY'
  'credits-matt'       = 'MATT'
  'credits-role'       = 'STORY, ART DIRECTION AND DESIGN'
  'credits-voice'      = 'NARRATOR VOICE'
  'credits-eleven'     = 'ELEVENLABS'
  'credits-art'        = 'ARTWORK'
  'credits-art2'       = 'GENERATED AND HAND FINISHED'
  'credits-built'      = 'BUILT WITH'
  'credits-sdk'        = 'DECENTRALAND SDK7'
  'credits-for'        = 'BUILT FOR'
  'credits-regenesis'  = 'REGENESIS LABS'
  'credits-buildathon' = 'FRIENDZONE BUILDATHON'
  'credits-starring'   = 'STARRING'
  'credits-warlords'   = 'THE FOUR WARLORDS'
  'credits-tale'       = 'A GENESIS CITY TALE'
  'credits-thanks'     = 'THANKS FOR PLAYING'
  'credits-fire'       = 'ANTROM STANDS - THE FIRE BURNS ON'
}

$strips = [ordered]@{}
foreach ($kv in $lines.GetEnumerator()) { $strips[$kv.Key] = New-LabelStrip $kv.Value $font }
$font.Dispose()
Write-LabelFamily -family 'credits' -strips $strips -root $root -exportName 'CREDITS_LABELS' -comment 'Credits-roll line strips. Importing this module registers them into LABELS.'
