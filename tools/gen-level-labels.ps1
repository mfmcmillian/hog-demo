# Renders the account-level word strips (HUD badge, level-up ceremony, level
# card) in the same style as the other labels: white all-caps Segoe UI on a
# transparent background, rotated 90 CCW so glyphs read bottom-to-top in
# landscape and upright in the portrait grip.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-level-labels.ps1
# Emits:  images/labels/<key>.png  +  src/ui/labels.level.gen.ts

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent

# size 30 = titles, 26 = rows, 22 = fine print.
$lines = [ordered]@{
  # NB: 'xp' and 'level' already exist in the main label set (hero XP on the
  # battle report / rift spoils) - these keys are all prefixed to stay clear.
  'lv'              = @{ text = 'LV'; size = 26 }
  'level-up'        = @{ text = 'LEVEL UP'; size = 30 }
  'acct-level'      = @{ text = 'LEVEL'; size = 26 }
  'max-level'       = @{ text = 'MAX LEVEL'; size = 22 }
  'xp-to-next'      = @{ text = 'XP TO NEXT LEVEL'; size = 22 }
  'energy-refilled' = @{ text = 'ENERGY REFILLED'; size = 22 }
  'max-energy'      = @{ text = 'MAX ENERGY'; size = 22 }
  'new-hero-joins'  = @{ text = 'A NEW HERO JOINS YOU'; size = 22 }
  'free-hero-at'    = @{ text = 'FREE HERO AT LEVEL'; size = 22 }
  'level-hint'      = @{ text = 'EVERY DEED YOU DO EARNS XP'; size = 22 }
  'level-rewards'   = @{ text = 'EACH LEVEL PAYS COINS AND A FULL REFILL'; size = 22 }
}

. "$PSScriptRoot\lib-labels.ps1"

$strips = [ordered]@{}
foreach ($kv in $lines.GetEnumerator()) {
  $font = New-LabelFont $kv.Value.size
  $strips[$kv.Key] = New-LabelStrip $kv.Value.text $font
  $font.Dispose()
}
Write-LabelFamily -family 'level' -strips $strips -root $root -exportName 'LEVEL_LABELS' -comment 'Account-level word strips (HUD badge, level-up ceremony, level card). Importing this module registers them into LABELS.'
