# Renders the friendzone duel word strips in the same style as the other
# labels: white all-caps Segoe UI on a transparent background, rotated 90 CCW
# so glyphs read bottom-to-top in landscape and upright in the portrait grip.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-duel-labels.ps1
# Emits:  images/labels/<key>.png  +  src/ui/labels.duel.gen.ts

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'images\labels'
$tsPath = Join-Path $root 'src\ui\labels.duel.gen.ts'

# size 30 = word labels (matches shop/trade/rift strips), 26 = hint lines.
$lines = [ordered]@{
  'raids'            = @{ text = 'RAIDS'; size = 30 }
  'duels'            = @{ text = 'DUELS'; size = 30 }
  'victor'           = @{ text = 'VICTOR'; size = 30 }
  'duel-1v1'         = @{ text = '1 VS 1'; size = 30 }
  'duel-4v4'         = @{ text = '4 VS 4'; size = 30 }
  'leaderboard'      = @{ text = 'LEADERBOARD'; size = 26 }
  'wins'             = @{ text = 'WINS'; size = 22 }
  'player-vs-player' = @{ text = 'PLAYER VS PLAYER'; size = 26 }
  'awaiting-foe'     = @{ text = 'AWAITING A CHALLENGER'; size = 26 }
  'duel-cost'        = @{ text = 'THE DUEL COSTS 2 ENERGY'; size = 26 }
  'duel-cost4'       = @{ text = 'THE DUEL COSTS 4 ENERGY'; size = 26 }
  'need-four'        = @{ text = 'YOU NEED FOUR HEROES IN YOUR PARTY'; size = 26 }
  'join-duel'        = @{ text = 'JOIN THE DUEL'; size = 30 }
  'join-raid'        = @{ text = 'JOIN THE RAID'; size = 30 }
  # step-by-step lobby hints (state-driven, one visible at a time)
  'pick-your-champion' = @{ text = 'TAP A HERO TO PICK YOUR CHAMPION'; size = 26 }
  'tap-join-party'     = @{ text = 'TAP JOIN TO FIELD YOUR PARTY'; size = 26 }
  'tap-enter-ready'    = @{ text = 'TAP ENTER WHEN READY'; size = 26 }
  'foe-not-ready'      = @{ text = 'WAITING ON YOUR FOE'; size = 26 }
}

. "$PSScriptRoot\lib-labels.ps1"

$strips = [ordered]@{}
foreach ($kv in $lines.GetEnumerator()) {
  $font = New-LabelFont $kv.Value.size
  $strips[$kv.Key] = New-LabelStrip $kv.Value.text $font
  $font.Dispose()
}
Write-LabelFamily -family 'duel' -strips $strips -root $root -exportName 'DUEL_LABELS' -comment 'Friendzone duel word strips. Importing this module registers them into LABELS.'
