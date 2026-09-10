# Renders the tailor's word strips (the wardrobe screen behind the weaver's
# cottage NPC) in the same style as the other labels: white all-caps Segoe UI
# on a transparent background, rotated 90 CCW so glyphs read bottom-to-top in
# landscape and upright in the portrait grip.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen-wardrobe-labels.ps1
# Emits:  images/labels/<key>.png  +  src/ui/labels.wardrobe.gen.ts

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent

# size 26 = titles, tabs and talk lines (same as gen-ow-labels), 22 = fine print.
$lines = [ordered]@{
  'wardrobe-title' = @{ text = 'THE TAILOR''S RACK'; size = 26 }
  'tab-colors'     = @{ text = 'COLORS'; size = 26 }
  'tab-clothes'    = @{ text = 'CLOTHES'; size = 26 }
  # the rack, in OUTFITS order (src/mp/protocol.ts)
  'fit-villager'   = @{ text = 'VILLAGER BLUE'; size = 22 }
  'fit-ranger'     = @{ text = 'RANGER GREEN'; size = 22 }
  'fit-crimson'    = @{ text = 'CRIMSON'; size = 22 }
  'fit-royal'      = @{ text = 'ROYAL VIOLET'; size = 22 }
  'fit-gilded'     = @{ text = 'GILDED'; size = 22 }
  'fit-shadow'     = @{ text = 'SHADOW GREY'; size = 22 }
  'fit-hint'       = @{ text = 'PICK A TUNIC. THE DYE TAKES AT ONCE.'; size = 22 }
  # the armor stand, in ARMORS order (src/mp/protocol.ts); suits cost coins
  'tab-armor'      = @{ text = 'ARMOR'; size = 26 }
  'arm-leather'    = @{ text = 'LEATHER JERKIN'; size = 22 }
  'arm-chain'      = @{ text = 'CHAINMAIL'; size = 22 }
  'arm-steel'      = @{ text = 'STEEL PLATE'; size = 22 }
  'arm-shadow'     = @{ text = 'SHADOW PLATE'; size = 22 }
  'arm-royal'      = @{ text = 'ROYAL KNIGHT'; size = 22 }
  'armor-hint'     = @{ text = 'MAIL, PLATE AND HELM FOR GOLD, WORN OVER YOUR TUNIC'; size = 22 }
  'armor-none'     = @{ text = 'NO ARMOR'; size = 22 }
  'armor-owned'    = @{ text = 'OWNED'; size = 20 }
  'armor-worn'     = @{ text = 'WORN'; size = 20 }
  'armor-buy'      = @{ text = 'BUY FOR'; size = 22 }
  'armor-poor'     = @{ text = 'NOT ENOUGH GOLD'; size = 22 }
  # the tailor's walk-up talk (owTalk.ts 'tailor')
  'ow-tailor-1a'   = @{ text = 'DYES FROM THE CAPITAL, CLOTH FROM HER LOOM.'; size = 26 }
  'ow-tailor-1b'   = @{ text = 'STEP UP AND LET ME FIT YOU.'; size = 26 }
}

. "$PSScriptRoot\lib-labels.ps1"

$strips = [ordered]@{}
foreach ($kv in $lines.GetEnumerator()) {
  $font = New-LabelFont $kv.Value.size
  $strips[$kv.Key] = New-LabelStrip $kv.Value.text $font
  $font.Dispose()
}
Write-LabelFamily -family 'wardrobe' -strips $strips -root $root -exportName 'WARDROBE_LABELS' -comment 'Tailor / wardrobe word strips and the tailor''s talk lines. Importing this module registers them into LABELS.'
