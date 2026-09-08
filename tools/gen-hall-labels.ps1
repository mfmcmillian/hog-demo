# Renders the Hall of Heroes (leaderboards) word strips in the same style as
# the other labels: white all-caps Segoe UI on a transparent background,
# rotated 90 CCW so glyphs read bottom-to-top in landscape and upright in the
# portrait grip.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-hall-labels.ps1
# Emits:  images/labels/<key>.png  +  src/ui/labels.hall.gen.ts

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent

# size 34 = the hall title, 26 = board tabs / column units, 22 = fine print.
$lines = [ordered]@{
  'hall-title'    = @{ text = 'HALL OF HEROES'; size = 34 }
  # the four boards (tabs along the physical top; also the value column's unit)
  'board-level'   = @{ text = 'LEVEL'; size = 26 }
  'board-roads'   = @{ text = 'ROADS'; size = 26 }
  'board-raids'   = @{ text = 'RAIDS'; size = 26 }
  'board-duels'   = @{ text = 'DUELS'; size = 26 }
  # the strip under the list: where you stand
  'your-rank'     = @{ text = 'YOUR RANK'; size = 22 }
  'rank-hash'     = @{ text = '#'; size = 30 }
  'unranked'      = @{ text = 'UNRANKED'; size = 22 }
  'hall-empty'    = @{ text = 'NO NAMES ON THIS BOARD YET'; size = 26 }
  'hall-first'    = @{ text = 'BE THE FIRST'; size = 22 }
  'hall-hint'     = @{ text = 'THE REALM REMEMBERS ITS GREATEST'; size = 22 }
}

. "$PSScriptRoot\lib-labels.ps1"

$strips = [ordered]@{}
foreach ($kv in $lines.GetEnumerator()) {
  $font = New-LabelFont $kv.Value.size
  $strips[$kv.Key] = New-LabelStrip $kv.Value.text $font
  $font.Dispose()
}
Write-LabelFamily -family 'hall' -strips $strips -root $root -exportName 'HALL_LABELS' -comment 'Hall of Heroes (leaderboard) word strips. Importing this module registers them into LABELS.'
