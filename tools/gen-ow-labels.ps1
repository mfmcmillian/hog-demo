# Overworld walk-up dialog strips. Same style as gen-tut-labels.ps1.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-ow-labels.ps1
# Emits:  images/labels/ow-*.png, images/labels/need-item.png
#         src/ui/labels.ow.gen.ts

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'images\labels'
$tsPath = Join-Path $root 'src\ui\labels.ow.gen.ts'

. "$PSScriptRoot\lib-labels.ps1"
$font = New-LabelFont 26

$lines = [ordered]@{
  # First landing on the plaza: the elder's three-page welcome (page 2 reuses intro-d1).
  'ow-guide-1a'       = 'HOLD THE PAD TO WALK.'
  'ow-guide-1b'       = 'FOLLOW THE LIGHT.'
  'ow-guide-2b'       = 'THE INN KEEPS IT. GO THERE FIRST.'
  'ow-guide-3a'       = 'THE BACK BUTTON OPENS YOUR CAMP.'
  'ow-guide-3b'       = 'THEN TAKE THE ROAD SOUTH.'
  'ow-elder-hint-1a'  = 'THE REED LAMP SLEEPS'
  'ow-elder-hint-1b'  = 'IN THE BONE GLADE.'
  'ow-elder-hint-1c'  = 'BRING IT BACK AND THE FEN WILL OPEN.'
  'ow-elder-lamp-1a'  = 'THE LAMP IS YOURS.'
  'ow-elder-lamp-1b'  = 'THE FEN WILL TAKE YOU NOW.'
  'ow-elder-lamp-1c'  = 'KEEP TO THE BOARDS.'
  'ow-sign-wilds-1a'  = 'THE WILDS -'
  'ow-sign-wilds-1b'  = 'KEEP TO THE BOARDS.'
  'ow-chest-coins-1a' = 'YOU FOUND 20 COINS.'
  'ow-chest-lamp-1a'  = 'THE REED LAMP.'
  'ow-chest-lamp-1b'  = 'THE FEN''S MIST WILL PART.'
  'ow-crypt'          = 'THE CRYPT'
  'ow-sign-crypt-1a'  = 'PUSH THE ROCK'
  'ow-sign-crypt-1b'  = 'INTO THE HOLE.'
  'ow-chest-key-1a'   = 'A GATE SIGIL.'
  'ow-chest-key-1b'   = 'THE NORTH DOOR WILL KNOW IT.'
  'need-item'         = 'YOU NEED THE REED LAMP'
  'ow-fisher-1a'      = 'THE LAKE GIVES NOTHING THESE NIGHTS.'
  'ow-fisher-1b'      = 'THE BOARDS SOUTH STILL HOLD. MOSTLY.'
  'ow-boy-1a'         = 'CROWS ON THE WEST ROAD!'
  'ow-boy-1b'         = 'MOTHER SAYS NOT TILL THE MOOR IS SAFE.'
  'ow-weaver-1a'      = 'I WOVE THE REED LAMP''S WICK MYSELF.'
  'ow-weaver-1b'      = 'IT WAS LOST IN THE BONE GLADE.'
  'ow-hunter-1a'      = 'ASH HOUNDS HUNT IN PAIRS.'
  'ow-hunter-1b'      = 'BRING FOUR. NEVER WALK ALONE.'
  'ow-mother-1a'      = 'HAVE YOU SEEN MY BOY?'
  'ow-mother-1b'      = 'HE RUNS OFF TO THE GREEN.'
  'ow-inn-1a'         = 'AN OGRE HOLDS THE ROAD TO THE MOOR GATE.'
  'ow-inn-1b'         = 'REST FIRST. THE CHEST IS YOURS.'
  # Hosts whose homes are the menu: invitation page + shared "go" lines.
  'ow-weaver-2a'      = 'I CAN WEAVE TWO CARDS INTO ONE.'
  'ow-weaver-2b'      = 'SHOW ME YOUR PAIR.'
  'ow-hunter-2a'      = 'PELTS FOR CARDS, CARDS FOR PELTS.'
  'ow-trade-go'       = 'LET''S TRADE.'
  'ow-merchant-1a'    = 'PACKS FROM THE CAPITAL, FRESH SEALED.'
  'ow-shop-go'        = 'HAVE A LOOK.'
  'ow-inn-2a'         = 'YOUR COMPANY CAN REST UPSTAIRS.'
  'ow-party-go'       = 'WHO RIDES WITH YOU?'
  # Lost-boy side quest.
  'ow-mother-2a'      = 'YOU FOUND HIM? BLESS YOU.'
  'ow-mother-2b'      = 'TAKE THIS. IT WAS HIS FATHER''S.'
  'ow-mother-3a'      = 'HE''S HOME. THANK YOU, TRAVELER.'
  # Rookhaven.
  'ow-rook-fisher-1a' = 'THE LAKE HERE FREEZES BY DUSK.'
  'ow-rook-fisher-1b' = 'NOTHING BITES. NOTHING HAS FOR YEARS.'
  'ow-rook-boy-1a'    = 'I SAW A CROW AS BIG AS A HOUSE!'
  'ow-rook-boy-1b'    = 'IT HAD EYES LIKE LANTERNS.'
  'ow-rook-widow-1a'  = 'MY HUSBAND RODE FOR THE CROW LORD.'
  'ow-rook-widow-1b'  = 'HE NEVER CAME BACK DOWN THE ROAD.'
  'ow-rook-warden-1a' = 'THE ROOKERY WATCHES THE ROAD.'
  'ow-rook-warden-1b' = 'FELL THE ORACLE AND THE CROWS SCATTER.'
  'ow-rook-merchant-1a' = 'FAR FROM THE CAPITAL, BUT I HAVE PACKS.'
  'ow-rook-seer-1a'   = 'THE MIST NORTH IS NOT WEATHER.'
  'ow-rook-seer-1b'   = 'IT IS THE WARLORD BREATHING.'
  'ow-rook-inn-1a'    = 'COLD ROAD. REST YOUR COMPANY HERE.'
}

$strips = [ordered]@{}
foreach ($kv in $lines.GetEnumerator()) { $strips[$kv.Key] = New-LabelStrip $kv.Value $font }
$font.Dispose()
Write-LabelFamily -family 'ow' -strips $strips -root $root -exportName 'OW_LABELS' -comment 'Overworld walk-up dialog strips (NPCs, signs, chests, need-item notice).'
