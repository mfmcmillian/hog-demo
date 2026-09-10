# Renders the World Boss lair word strips in the same style as the other
# labels: white all-caps Segoe UI on a transparent background, rotated 90 CCW
# so glyphs read bottom-to-top in landscape and upright in the portrait grip.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-boss-labels.ps1
# Emits:  images/labels/<key>.png  +  src/ui/labels.boss.gen.ts

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent

# size 34 = the lair title, 30 = the big plaques / ATTACK, 26 = headings,
# 22 = fine print, 20 = feed verbs and reward lines.
$lines = [ordered]@{
  # the home POI plate (mixed case like the other buildings) and the lair title
  'world-boss'      = @{ text = 'World Boss'; size = 39 }
  'boss-title'      = @{ text = 'WORLD BOSS'; size = 34 }
  'boss-hint'       = @{ text = 'THE WHOLE REALM STRIKES AS ONE'; size = 22 }
  # the two pages along the physical top
  'boss-tab-lair'   = @{ text = 'THE LAIR'; size = 28 }
  'boss-tab-board'  = @{ text = 'DAMAGE BOARD'; size = 28 }
  # the lair: the pool, the clock, the tier
  'world-hp'        = @{ text = 'WORLD HP'; size = 22 }
  'tier'            = @{ text = 'TIER'; size = 22 }
  'boss-kills'      = @{ text = 'FELLED THIS ROUND'; size = 20 }
  'boss-ends-in'    = @{ text = 'ROUND ENDS IN'; size = 22 }
  'boss-fighting'   = @{ text = 'ATTACKING NOW'; size = 20 }
  # your band
  'attack'          = @{ text = 'ATTACK'; size = 30 }
  'attacks-left'    = @{ text = 'ATTACKS LEFT TODAY'; size = 22 }
  'your-best'       = @{ text = 'YOUR BEST HIT'; size = 22 }
  'boss-minute'     = @{ text = 'ONE MINUTE. DEAL ALL YOU CAN.'; size = 22 }
  'no-attacks'      = @{ text = 'NO ATTACKS LEFT - BACK TOMORROW'; size = 22 }
  'boss-busy'       = @{ text = 'YOUR ATTACK IS STILL RUNNING'; size = 22 }
  'boss-party'      = @{ text = 'YOU NEED A HERO TO ATTACK'; size = 22 }
  # the board
  'best-hit'        = @{ text = 'BEST HIT'; size = 26 }
  'dmg'             = @{ text = 'DMG'; size = 22 }
  'boss-empty'      = @{ text = 'NO ONE HAS STRUCK IT YET'; size = 26 }
  'boss-rewards'    = @{ text = 'EVERYONE WHO ATTACKS IS PAID WHEN THE ROUND ENDS'; size = 20 }
  'reward-1'        = @{ text = '#1 - 600 COINS + CROWN CARD'; size = 20 }
  'reward-top3'     = @{ text = 'TOP 3 - 450 COINS + CROWN CARD'; size = 20 }
  'reward-top10'    = @{ text = 'TOP 10 - 320 COINS + VOW CARD'; size = 20 }
  'reward-all'      = @{ text = 'ALL OTHERS - 180 COINS + EMBER CARD'; size = 20 }
  # the fight and its verdict
  'time-left'       = @{ text = 'TIME LEFT'; size = 22 }
  'dealt'           = @{ text = 'DAMAGE DEALT'; size = 26 }
  'party-fell'      = @{ text = 'YOUR PARTY FELL'; size = 26 }
  'new-best'        = @{ text = 'NEW BEST'; size = 22 }
  'boss-felled'     = @{ text = 'BOSS FELLED'; size = 30 }
  'boss-rises'      = @{ text = 'A STRONGER WARLORD RISES'; size = 22 }
  'boss-again'      = @{ text = 'ATTACK AGAIN'; size = 26 }
  # the spoils chest
  'boss-spoils'     = @{ text = 'WORLD BOSS SPOILS'; size = 30 }
  # realm news
  'feed-boss-hit'   = @{ text = 'HIT THE WORLD BOSS FOR'; size = 22 }
  'feed-boss-fell'  = @{ text = 'FELLED THE WORLD BOSS'; size = 22 }
}

. "$PSScriptRoot\lib-labels.ps1"

$strips = [ordered]@{}
foreach ($kv in $lines.GetEnumerator()) {
  $font = New-LabelFont $kv.Value.size
  $strips[$kv.Key] = New-LabelStrip $kv.Value.text $font
  $font.Dispose()
}
Write-LabelFamily -family 'boss' -strips $strips -root $root -exportName 'BOSS_LABELS' -comment 'World Boss lair word strips. Importing this module registers them into LABELS.'
