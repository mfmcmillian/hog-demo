# Renders the events-page daily word strips (login streak + task board) in the
# same style as the other labels: white all-caps Segoe UI on a transparent
# background, rotated 90 CCW so glyphs read bottom-to-top in landscape and
# upright in the portrait grip.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-daily-labels.ps1
# Emits:  images/labels/<key>.png  +  src/ui/labels.daily.gen.ts

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent

# size 30 = panel titles / buttons, 26 = rows and hints, 22 = fine print.
$lines = [ordered]@{
  'daily-rewards'      = @{ text = 'DAILY REWARDS'; size = 30 }
  'daily-tasks'        = @{ text = 'DAILY TASKS'; size = 30 }
  'task-go'            = @{ text = 'GO'; size = 30 }
  'streak'             = @{ text = 'STREAK'; size = 26 }
  'day'                = @{ text = 'DAY'; size = 26 }
  'claim'              = @{ text = 'CLAIM'; size = 30 }
  'claimed'            = @{ text = 'CLAIMED'; size = 26 }
  'come-back-tomorrow' = @{ text = 'COME BACK TOMORROW'; size = 26 }
  'streak-hint'        = @{ text = 'LOG IN EVERY DAY TO GROW YOUR STREAK'; size = 22 }
  'streak-lost'        = @{ text = 'STREAK LOST - START A NEW ONE'; size = 22 }
  'new-tasks-in'       = @{ text = 'NEW TASKS IN'; size = 22 }
  'all-done-bonus'     = @{ text = 'ALL DONE BONUS'; size = 26 }
  'energy-refill'      = @{ text = 'ENERGY REFILL'; size = 22 }
  'hero-card'          = @{ text = 'HERO CARD'; size = 22 }
  'today'              = @{ text = 'TODAY'; size = 22 }
  # the page tabs along the physical top of the events hall
  'page-dailies'       = @{ text = 'DAILIES'; size = 26 }
  'page-realm'         = @{ text = 'THE REALM'; size = 26 }
  # the task pool (see src/game/daily.ts DAILY_TASKS)
  'task-floors'        = @{ text = 'CLEAR 3 ROAD FLOORS'; size = 26 }
  'task-wild'          = @{ text = 'SLAY 2 WILD MONSTERS'; size = 26 }
  'task-pack'          = @{ text = 'OPEN A PACK'; size = 26 }
  'task-fuse'          = @{ text = 'FUSE TWO HEROES'; size = 26 }
  'task-raid'          = @{ text = 'CLEAR A RIFT RAID'; size = 26 }
  'task-duel'          = @{ text = 'FIGHT A DUEL'; size = 26 }
  'task-gift'          = @{ text = 'SEND A DAILY GIFT'; size = 26 }
  'task-trade'         = @{ text = 'COMPLETE A TRADE'; size = 26 }
}

. "$PSScriptRoot\lib-labels.ps1"

$strips = [ordered]@{}
foreach ($kv in $lines.GetEnumerator()) {
  $font = New-LabelFont $kv.Value.size
  $strips[$kv.Key] = New-LabelStrip $kv.Value.text $font
  $font.Dispose()
}
Write-LabelFamily -family 'daily' -strips $strips -root $root -exportName 'DAILY_LABELS' -comment 'Events-page daily word strips (login streak + task board). Importing this module registers them into LABELS.'
