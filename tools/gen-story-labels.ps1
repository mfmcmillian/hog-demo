# Renders the road-story / final-battle / epilogue narrator line strips in the
# same style as the other label generators: white all-caps Segoe UI on a
# transparent background, rotated 90 CCW so glyphs read bottom-to-top in
# landscape and upright in the portrait grip (matches gen-intro-labels.ps1).
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-story-labels.ps1
# Emits:  images/labels/story-*.png  +  src/ui/labels.story.gen.ts

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'images\labels'
$tsPath = Join-Path $root 'src\ui\labels.story.gen.ts'

# Supersampled 2x for high-DPR phones; display sizes are stage units and derive
# height from the aspect ratio, so layout is unchanged - strips just stay crisp.
. "$PSScriptRoot\lib-labels.ps1"
$font = New-LabelFont 26

$lines = [ordered]@{
  # --- q1 The Moor Gate ------------------------------------------------------
  'story-q1-1a' = 'THE FIRST ROAD RUNS THROUGH THE MOOR,'
  'story-q1-1b' = 'WHERE THE OGRE HAS TAKEN THE GATE.'
  'story-q1-1c' = 'HIS HOUNDS AND WIGHTS HUNT THE CROSSING.'
  'story-q1-2a' = 'NO GRAIN, NO WORD, NO HELP PASSES HIM.'
  'story-q1-2b' = 'ANTROM STARVES BEHIND ITS WALLS.'
  'story-q1-2c' = 'BREAK THE GATE. FELL THE OGRE.'
  # --- q3 Crow Road ----------------------------------------------------------
  'story-q3-1a' = 'THE CROW ROAD CARRIED OUR MESSENGERS.'
  'story-q3-1b' = 'NOW THE THORN QUEEN''S BRIARS STRANGLE IT,'
  'story-q3-1c' = 'AND HER CROWS PICK THE SILENCE CLEAN.'
  'story-q3-2a' = 'NO WARNING CAN REACH THE OTHER KINGDOMS.'
  'story-q3-2b' = 'SHE WILL BURY THEM BLIND, ONE BY ONE.'
  'story-q3-2c' = 'CUT THE BRIAR. TAKE BACK OUR VOICE.'
  # --- q4 The Veiled Well ----------------------------------------------------
  'story-q4-1a' = 'THE WELL BENEATH THE VEIL FED OUR FLAME -'
  'story-q4-1b' = 'EVERY OATH DRAWN FROM ITS WATER.'
  'story-q4-1c' = 'THE CRIMSON ABBOT BLEEDS IT DRY.'
  'story-q4-2a' = 'WITH EVERY DROP HE DRINKS, OUR FIRE DIMS.'
  'story-q4-2b' = 'WHEN THE WELL RUNS RED, THE FLAME DIES.'
  'story-q4-2c' = 'SPILL THE ABBOT BEFORE HE SPILLS US.'
  # --- q6 The Oath Hall ------------------------------------------------------
  'story-q6-1a' = 'THE OLD OATH HALL, WHERE HEROES SWORE,'
  'story-q6-1b' = 'NOW SEATS A KING OF CINDERS.'
  'story-q6-1c' = 'THE ASHEN REGENT TURNS OATHS TO ASH.'
  'story-q6-2a' = 'EVERY BROKEN OATH SWELLS HIS RANKS.'
  'story-q6-2b' = 'HIS ARMY IS NEARLY RISEN.'
  'story-q6-2c' = 'UNSEAT HIM, OR KNEEL TO ASH.'
  # --- final battle prelude: the Gates of Antrom -----------------------------
  'story-final-1a' = 'YOU BROKE THEM EACH ALONE, HERO.'
  'story-final-1b' = 'SO THE DEMON KING PLAYED HIS LAST CARD:'
  'story-final-1c' = 'ALL FOUR, RISEN, MARCHING AS ONE.'
  'story-final-2a' = 'THERE ARE NO MORE ROADS. NO MORE TIME.'
  'story-final-2b' = 'THEY COME FOR THE FLAME ITSELF.'
  'story-final-2c' = 'STAND AT THE GATE. END THIS WAR.'
  # --- victory epilogue ------------------------------------------------------
  'story-epilogue-1a' = 'THE WARLORDS LIE BROKEN AT OUR GATE.'
  'story-epilogue-1b' = 'THE DEMON KING''S REACH ENDS HERE -'
  'story-epilogue-1c' = 'HE DARES NOT FACE WHAT FELLED THEM.'
  'story-epilogue-2a' = 'THE FLAME BURNS TALLER THAN EVER,'
  'story-epilogue-2b' = 'FED BY THE OATH YOU KEPT.'
  'story-epilogue-2c' = 'ANTROM REMEMBERS ITS HERO.'
  # --- map row name plate ----------------------------------------------------
  'story-final-name' = 'THE GATES OF ANTROM'
}

$strips = [ordered]@{}
foreach ($kv in $lines.GetEnumerator()) { $strips[$kv.Key] = New-LabelStrip $kv.Value $font }
$font.Dispose()
Write-LabelFamily -family 'story' -strips $strips -root $root -exportName 'STORY_LABELS' -comment 'Road-story / final-battle / epilogue narrator strips. Importing this module registers them into LABELS.'
