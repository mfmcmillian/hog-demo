# Renders the tutorial dialog line strips in the same style as the original
# gen-labels.ps1 output (which was never committed): white all-caps Segoe UI on
# a transparent background, rotated 90 CCW so glyphs read bottom-to-top in
# landscape and upright in the portrait grip (matches images/labels/fire-line*.png,
# ~34px strip thickness).
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-tut-labels.ps1
# Emits:  images/labels/tut-*.png  +  src/ui/labels.tut.gen.ts

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'images\labels'
$tsPath = Join-Path $root 'src\ui\labels.tut.gen.ts'

# 26px Segoe UI measures ~34px tall with ascent/descent, matching the fire-line strips.
# Supersampled 2x for high-DPR phones; display sizes are stage units and derive
# height from the aspect ratio, so layout is unchanged - strips just stay crisp.
. "$PSScriptRoot\lib-labels.ps1"
$font = New-LabelFont 26

$lines = [ordered]@{
  # party
  'tut-party-1a'      = 'TAP A BENCH HERO'
  'tut-party-1b'      = 'TO SEAT THEM IN YOUR PARTY.'
  'tut-party-1c'      = 'YOUR FOUR SEATS FIGHT THE ROADS.'
  'tut-party-2a'      = 'TAP A SEAT, THEN A HERO, TO SWAP.'
  'tut-party-2b'      = 'TAP THE SAME SEAT TWICE'
  'tut-party-2c'      = 'TO SEND THEM BACK TO THE BENCH.'
  # map
  'tut-map-1a'        = 'TAP A ROAD TO SEE ITS FLOORS.'
  'tut-map-1b'        = 'EACH ROAD CLIMBS TO A BOSS,'
  'tut-map-1c'        = 'AND BOSSES DROP HEROES.'
  'tut-map-2a'        = 'EACH FIGHT COSTS 1 ENERGY.'
  'tut-map-2b'        = 'BEAT THE BOSS TO RAISE ITS STAR.'
  'tut-map-2c'        = 'FIVE STARS MASTERS THE ROAD.'
  # settings
  'tut-settings-1a'   = 'TAP SOUND OR MUSIC'
  'tut-settings-1b'   = 'TO TURN THEM ON OR OFF.'
  'tut-settings-1c'   = 'RESTART WIPES YOUR ACCOUNT - IT ASKS FIRST.'
  # events
  'tut-events-1a'     = 'THE WHOLE REALM FILLS ONE GOAL BAR.'
  'tut-events-1b'     = 'WHEN IT FILLS, ALL WHO HELPED'
  'tut-events-1c'     = 'SHARE THE REWARD.'
  'tut-events-2a'     = 'TAP SEND TO GIFT A PLAYER.'
  'tut-events-2b'     = 'ONE GIFT A DAY - AND THE SENDER'
  'tut-events-2c'     = 'IS BLESSED WITH COINS TOO.'
  # fuse
  'tut-fuse-1a'       = 'TAP A HERO FACE, THEN A STAR RANK'
  'tut-fuse-1b'       = 'WHERE YOU OWN TWO COPIES.'
  'tut-fuse-1c'       = 'BOTH SEATS FILL ON THEIR OWN.'
  'tut-fuse-2a'       = 'TAP ACCEPT TO FUSE THE PAIR'
  'tut-fuse-2b'       = 'INTO ONE HERO, ONE STAR HIGHER.'
  'tut-fuse-2c'       = 'SAME HERO, SAME STARS, TWO COPIES.'
  # shop
  'tut-shop-1a'       = 'TAP A PACK TO BUY IT WITH COINS,'
  'tut-shop-1b'       = 'THEN TAP ACCEPT TO OPEN THE CHEST.'
  'tut-shop-1c'       = 'EVERY CHEST HOLDS A HERO CARD.'
  'tut-shop-2a'       = 'BIGGER PACKS COST MORE COINS'
  'tut-shop-2b'       = 'AND DROP RARER HEROES.'
  'tut-shop-2c'       = 'EARN COINS ON THE ROADS.'
  # trade
  'tut-trade-1a'      = 'TAP A TRAVELER TO INVITE THEM'
  'tut-trade-1b'      = 'TO THE TRADING TABLE.'
  'tut-trade-1c'      = 'THEY MUST ACCEPT TO SIT.'
  'tut-trade-2a'      = 'TAP A CARD TO OFFER IT,'
  'tut-trade-2b'      = 'THEN TAP YOUR LOCK.'
  'tut-trade-2c'      = 'WHEN BOTH SIDES LOCK, CARDS SWAP.'
  # friendzone
  'tut-friendzone-1a' = 'TAP A HERO TO JOIN THE RAID.'
  'tut-friendzone-1b' = 'THE RAID COSTS 5 ENERGY'
  'tut-friendzone-1c' = 'WHEN THE FIGHT BEGINS.'
  'tut-friendzone-2a' = 'TAP ENTER WHEN YOU ARE READY.'
  'tut-friendzone-2b' = 'WHEN ALL WHO JOINED ARE READY, IT BEGINS.'
  'tut-friendzone-2c' = 'EVERY RAIDER SHARES THE SPOILS.'
  'tut-friendzone-3a' = 'DUELS PIT HERO AGAINST HERO.'
  'tut-friendzone-3b' = 'TWO TRAVELERS ENTER THE RING -'
  'tut-friendzone-3c' = 'THE VICTOR TAKES THE PURSE.'
  # shared
  'tut-continue'      = 'TAP TO CONTINUE'
}

$strips = [ordered]@{}
foreach ($kv in $lines.GetEnumerator()) { $strips[$kv.Key] = New-LabelStrip $kv.Value $font }
$font.Dispose()
Write-LabelFamily -family 'tut' -strips $strips -root $root -exportName 'TUT_LABELS' -comment 'Tutorial dialog line strips. Importing this module registers them into LABELS.'
