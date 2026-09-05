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
  # First step onto the map: the elder's two-page welcome.
  'ow-guide-1a'       = 'HOLD THE PAD TO WALK.'
  'ow-guide-1b'       = 'FOLLOW THE LIGHT.'
  'ow-guide-2a'       = 'FIGHT WHAT YOU MEET ON THE ROAD SOUTH.'
  'ow-guide-2b'       = 'THE BACK BUTTON TAKES YOU HOME.'
  'ow-elder-hint-1a'  = 'THE REED LAMP SLEEPS'
  'ow-elder-hint-1b'  = 'IN THE BONE GLADE.'
  'ow-elder-hint-1c'  = 'BRING IT BACK AND THE FEN WILL OPEN.'
  'ow-elder-lamp-1a'  = 'THE LAMP IS YOURS.'
  'ow-elder-lamp-1b'  = 'THE FEN WILL TAKE YOU NOW.'
  'ow-elder-lamp-1c'  = 'KEEP TO THE BOARDS.'
  # Quest 'gate' paid, then the elder points west.
  'ow-elder-thanks-1a' = 'THE GATE THAT WALKED HAS FALLEN.'
  'ow-elder-thanks-1b' = 'TAKE ITS CARD. THE WEST ROAD IS YOURS.'
  'ow-elder-done-1a'  = 'THE MOOR SLEEPS. THE CROWS DO NOT.'
  'ow-elder-done-1b'  = 'ROOKHAVEN LIES UP THE WEST ROAD.'
  # Quest 'hall': the last warlord, through the Moor Gate's door.
  'ow-elder-hall-1a'  = 'THE ABBOT IS DOWN. ONE WARLORD REMAINS.'
  'ow-elder-hall-1b'  = 'THE MOOR GATE STANDS OPEN. GO THROUGH.'
  'ow-elder-crown-1a' = 'THE REGENT HAS FALLEN. ANTROM IS FREE.'
  'ow-elder-crown-1b' = 'HIS CARD IS YOURS. THEY WILL RISE AGAIN.'
  'ow-elder-again-1a' = 'THEY ALWAYS COME BACK.'
  'ow-elder-again-1b' = 'SO DO YOU. THE ROADS ARE OPEN.'
  # Area names for the corner badge (the rest live in gen-labels.ps1).
  'ow-antrom'         = 'ANTROM GREEN'
  # The Veiled Well.
  'ow-well'           = 'THE VEILED WELL'
  'ow-sign-well-1a'   = 'THE VEILED WELL -'
  'ow-sign-well-1b'   = 'WHAT GOES DOWN COMES BACK RED.'
  'ow-hall'           = 'THE OATH HALL'
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
  # Dungeon puzzles: keyed doors and the rule signs.
  'ow-chest-bone-1a'  = 'A BONE KEY.'
  'ow-chest-bone-1b'  = 'THE ABBOT''S DOOR WILL KNOW IT.'
  'ow-chest-oath-1a'  = 'THE OATH KEY.'
  'ow-chest-oath-1b'  = 'THE REGENT''S DOOR WILL KNOW IT.'
  'ow-sign-deep-1a'   = 'TWO STONES. TWO MARKS.'
  'ow-sign-deep-1b'   = 'THE WEST TRAIL CLIMBS.'
  'ow-sign-well-door-1a' = 'THE DOOR WANTS A KEY.'
  'ow-sign-well-door-1b' = 'THE LEECH KEEPS IT.'
  'ow-sign-hall-1a'   = 'THE OATH IS SWORN WESTWARD.'
  'ow-sign-hall-1b'   = 'THE KEY WAITS WEST TOO.'
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
  'ow-merchant-1a'    = 'PACKS FROM THE CAPITAL, FRESH SEALED.'
  # Lost-boy side quest.
  'ow-mother-2a'      = 'YOU FOUND HIM? BLESS YOU.'
  'ow-mother-2b'      = 'TAKE THIS. IT WAS HIS FATHER''S.'
  'ow-mother-3a'      = 'HE''S HOME. THANK YOU, TRAVELER.'
  # The boy, home again (hut-mother once 'boy-reward' is set).
  'ow-boy-2a'         = 'I DIDN''T EVEN CRY.'
  'ow-boy-2b'         = 'MUCH.'
  # Rookhaven.
  'ow-rook-fisher-1a' = 'THE LAKE HERE FREEZES BY DUSK.'
  'ow-rook-fisher-1b' = 'NOTHING BITES. NOTHING HAS FOR YEARS.'
  'ow-rook-boy-1a'    = 'I SAW A CROW AS BIG AS A HOUSE!'
  'ow-rook-boy-1b'    = 'IT HAD EYES LIKE LANTERNS.'
  'ow-rook-widow-1a'  = 'MY HUSBAND RODE FOR THE CROW LORD.'
  'ow-rook-widow-1b'  = 'HE NEVER CAME BACK DOWN THE ROAD.'
  # Quest 'widow': fell the Thorn Queen north of the circle.
  'ow-rook-widow-2a'  = 'HER COURT LIES NORTH OF THE STONE CIRCLE.'
  'ow-rook-widow-2b'  = 'IF HE IS THERE, BRING ME WORD.'
  'ow-widow-thanks-1a' = 'THE QUEEN IS DEAD? THEN HE CAN REST.'
  'ow-widow-thanks-1b' = 'TAKE HIS OATH. RIDE BETTER THAN HE DID.'
  'ow-widow-done-1a'  = 'GO WELL. HE WOULD HAVE LIKED YOU.'
  'ow-rook-warden-1a' = 'THE ROOKERY WATCHES THE ROAD.'
  'ow-rook-warden-1b' = 'FELL THE ORACLE AND THE CROWS SCATTER.'
  'ow-rook-merchant-1a' = 'FAR FROM THE CAPITAL, BUT I HAVE PACKS.'
  'ow-rook-seer-1a'   = 'THE MIST NORTH IS NOT WEATHER.'
  'ow-rook-seer-1b'   = 'IT IS THE WARLORD BREATHING.'
  # Quest 'well': the seer sends you down the west road.
  'ow-seer-ask-1a'    = 'THE QUEEN IS DOWN. THE MIST IS NOT.'
  'ow-seer-ask-1b'    = 'IT RISES FROM THE WELL ON THE WEST ROAD.'
  'ow-seer-thanks-1a' = 'THE WELL RUNS CLEAR. I CAN SEE AGAIN.'
  'ow-seer-thanks-1b' = 'TAKE THE ABBOT''S CARD. YOU EARNED IT.'
  'ow-seer-done-1a'   = 'GO HOME. THE ELDER WILL WANT YOU.'
  'ow-rook-inn-1a'    = 'COLD ROAD. REST YOUR COMPANY HERE.'
}

$strips = [ordered]@{}
foreach ($kv in $lines.GetEnumerator()) { $strips[$kv.Key] = New-LabelStrip $kv.Value $font }
$font.Dispose()
Write-LabelFamily -family 'ow' -strips $strips -root $root -exportName 'OW_LABELS' -comment 'Overworld walk-up dialog strips (NPCs, signs, chests, need-item notice).'
