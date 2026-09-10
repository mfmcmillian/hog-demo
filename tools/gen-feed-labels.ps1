# Renders the realm feed / ghost / free-social word strips in the same style
# as the other labels: white all-caps Segoe UI on a transparent background,
# rotated 90 CCW so glyphs read bottom-to-top in landscape and upright in the
# portrait grip.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-feed-labels.ps1
# Emits:  images/labels/<key>.png  +  src/ui/labels.feed.gen.ts

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent

# size 30 = word labels, 26 = board tab / verbs, 22 = fine print.
$lines = [ordered]@{
  # the hall's fifth page + toast verbs (name | verb | subject)
  'feed-title'       = @{ text = 'REALM NEWS'; size = 26 }
  'feed-entered'     = @{ text = 'ENTERED'; size = 22 }
  'feed-found'       = @{ text = 'FOUND'; size = 22 }
  'feed-cleared'     = @{ text = 'CLEARED'; size = 22 }
  'feed-raid-won'    = @{ text = 'WON A RIFT RAID'; size = 22 }
  'feed-defeated'    = @{ text = 'DEFEATED'; size = 22 }
  'feed-felled'      = @{ text = 'FELLED THE WARLORD'; size = 22 }
  'feed-reached'     = @{ text = 'REACHED LEVEL'; size = 22 }
  'feed-streak'      = @{ text = 'KEPT A SEVEN-DAY STREAK'; size = 22 }
  'feed-beat-ghost'  = @{ text = 'BEAT THE GHOST OF'; size = 22 }
  # personal lines (hall pushes, ghost news)
  'feed-ghost-fell'  = @{ text = 'YOUR GHOST FELL TO'; size = 22 }
  'feed-raided-with' = @{ text = 'YOUR HEROES RAIDED WITH'; size = 22 }
  'feed-passed-you'  = @{ text = 'PASSED YOU ON'; size = 22 }
  'feed-empty'       = @{ text = 'THE REALM IS QUIET FOR NOW'; size = 26 }
  'feed-hint'        = @{ text = 'WHAT TRAVELERS DID HERE LATELY'; size = 22 }
  'feed-yours'       = @{ text = 'FOR YOU'; size = 22 }
  # relative time
  'feed-now'         = @{ text = 'JUST NOW'; size = 20 }
  'feed-ago-m'       = @{ text = 'MIN AGO'; size = 20 }
  'feed-ago-h'       = @{ text = 'HR AGO'; size = 20 }
  'feed-ago-d'       = @{ text = 'DAYS AGO'; size = 20 }
  # ghosts
  'ghost'            = @{ text = 'GHOST'; size = 22 }
  'fight-a-ghost'    = @{ text = 'FIGHT A GHOST'; size = 30 }
  'ghost-hint'       = @{ text = 'AN ABSENT RIVAL''S HEROES, FOUGHT FOR HALF THE PURSE'; size = 22 }
  'ghost-allies'     = @{ text = 'GHOST ALLIES FILL EMPTY SEATS WHEN THE RAID STARTS'; size = 22 }
  'ghost-called'     = @{ text = 'A GHOST ANSWERS YOUR CALL'; size = 26 }
  # free social
  'raid-free'        = @{ text = 'RAIDS ARE FREE'; size = 26 }
  'spoils-left'      = @{ text = 'PAYING WINS LEFT TODAY'; size = 22 }
  'spoils-spent'     = @{ text = 'SPOILS SPENT TODAY - XP AND GLORY ONLY'; size = 22 }
  'duel-free'        = @{ text = 'DUELS COST NO ENERGY'; size = 26 }
  # settings > appearance
  'set-appearance'   = @{ text = 'APPEARANCE'; size = 26 }
  'look-skin'        = @{ text = 'SKIN'; size = 22 }
  'look-hair'        = @{ text = 'HAIR'; size = 22 }
  'look-short'       = @{ text = 'SHORT HAIR'; size = 22 }
  'look-long'        = @{ text = 'LONG HAIR'; size = 22 }
  'look-avatar'      = @{ text = 'USE MY DECENTRALAND AVATAR'; size = 22 }
  'look-hint'        = @{ text = 'YOUR WALKER ON THE MAP, YOUR SEAT, YOUR NEWS'; size = 22 }
}

. "$PSScriptRoot\lib-labels.ps1"

$strips = [ordered]@{}
foreach ($kv in $lines.GetEnumerator()) {
  $font = New-LabelFont $kv.Value.size
  $strips[$kv.Key] = New-LabelStrip $kv.Value.text $font
  $font.Dispose()
}
Write-LabelFamily -family 'feed' -strips $strips -root $root -exportName 'FEED_LABELS' -comment 'Realm feed, ghost and free-social word strips. Importing this module registers them into LABELS.'
