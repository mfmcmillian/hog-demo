"""Quest marker for the overworld: a pixel-art gold '!' over the NPC who has
something for you (owTalk.npcQuestPending). Drawn from a bitmap so it matches
the chunky prop sprites, outlined in the HUD's dark brown, then rotated 90
CCW like every other hog sprite.

Usage: python tools/gen-ow-marker.py  ->  images/chars/ow-quest-a.png (128x128)
Register in src/ui/labels.gen.ts as 'ow-quest' (w 128, h 128).
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'images', 'chars', 'ow-quest-a.png')

# 7 wide x 12 tall glyph: a tapered bar and a square dot.
GLYPH = [
    '.#####.',
    '#######',
    '#######',
    '#######',
    '.#####.',
    '.#####.',
    '..###..',
    '..###..',
    '.......',
    '.#####.',
    '#######',
    '.#####.',
]
GOLD = (222, 168, 72, 255)
GOLD_HI = (255, 214, 130, 255)
BROWN = (48, 30, 18, 255)
SCALE = 8
SIZE = 128

gw, gh = len(GLYPH[0]), len(GLYPH)
# 1-pixel outline ring around the glyph in the small grid, then scale up.
small = Image.new('RGBA', (gw + 2, gh + 2), (0, 0, 0, 0))
px = small.load()
for y, row in enumerate(GLYPH):
    for x, ch in enumerate(row):
        if ch != '#':
            continue
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                px[x + 1 + dx, y + 1 + dy] = BROWN
for y, row in enumerate(GLYPH):
    for x, ch in enumerate(row):
        if ch == '#':
            # Top-left facing highlight on the bar's first two rows and the dot's crown.
            hi = y in (0, 1, 9) and x in (1, 2, 3)
            px[x + 1, y + 1] = GOLD_HI if hi else GOLD

big = small.resize((small.width * SCALE, small.height * SCALE), Image.NEAREST)
canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
canvas.paste(big, ((SIZE - big.width) // 2, (SIZE - big.height) // 2), big)
# 90 CCW: the same turn GDI's Rotate270FlipNone gives the label strips.
canvas = canvas.rotate(90, expand=False)
canvas.save(OUT, optimize=True)
print('wrote', OUT, canvas.size)
