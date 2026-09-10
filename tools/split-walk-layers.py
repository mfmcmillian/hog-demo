"""Split the player walk sheet into tintable layers for avatar customization.

images/chars/player-walk-a.png is a 4x4 sheet of 128px cells, pre-rotated
90 CCW (the character's head points to stage -x, i.e. LEFT in the file).
Every cell has the same anatomy: head at the left, blue torso in the middle,
boots at the right, hands as small tan clusters between.

Output (same 512x512 grid, so one set of cell uvs draws all layers):
  player-walk-base.png       outline + boots + belt, original colors
  player-walk-fit-<k>.png    the tunic in OUTFITS[k] (0 = the painted blue)
  player-walk-skin-<i>.png   face + hands in SKIN_TONES[i]
  player-walk-hair-<j>.png   short hair in HAIR_COLORS[j]
  player-walk-hair-f-<j>.png the same hair grown past the shoulders (BaseFemale)

The client stacks base, one skin sheet and one hair sheet with the same uvs.
Colors are baked here rather than tinted at runtime because the explorer's
UI does not reliably tint textured backgrounds.

Usage: python tools/split-walk-layers.py
"""

from __future__ import annotations

import colorsys
import os
import sys
from collections import deque

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'images', 'chars', 'player-walk-a.png')
OUT_DIR = os.path.join(ROOT, 'images', 'chars')
CELL = 128
GRID = 4

# How bright the brightest skin / hair pixel becomes in the mask. Tints are
# multiplied in, so this is the ceiling a pale skin or blond hair can reach.
MASK_TOP = 0.96


def classify(p):
    """'clear' | 'line' | 'blue' | 'skin' | 'brown' | 'other' for one RGBA pixel."""
    if p[3] < 40:
        return 'clear'
    h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
    h *= 360
    if v < 0.12:
        return 'line'
    if 190 < h < 240:
        return 'blue'
    if 10 <= h <= 40:
        # Light, low-saturation tan reads as skin; the rest is brown (hair or leather).
        if v > 0.55 and s < 0.62:
            return 'skin'
        return 'brown'
    return 'other'


def components(cells, ok):
    """8-connected components over cell-local coords where ok(x, y) holds."""
    seen = set()
    out = []
    for (x, y) in cells:
        if (x, y) in seen or not ok(x, y):
            continue
        comp = []
        dq = deque([(x, y)])
        seen.add((x, y))
        while dq:
            cx, cy = dq.popleft()
            comp.append((cx, cy))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = cx + dx, cy + dy
                    if (nx, ny) in seen or not (0 <= nx < CELL and 0 <= ny < CELL):
                        continue
                    if ok(nx, ny):
                        seen.add((nx, ny))
                        dq.append((nx, ny))
        out.append(comp)
    return out


def luminance(p):
    return (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255


def split_cell(px, ox, oy):
    """Return dicts of cell-local (x, y) -> RGBA for base, skin, hair, hair_f."""
    cls = {}
    for y in range(CELL):
        for x in range(CELL):
            c = classify(px[ox + x, oy + y])
            if c != 'clear':
                cls[(x, y)] = c
    cells = list(cls.keys())
    if not cells:
        return {}, {}, {}, {}

    # Brown + skin pixels (everything that is not blue/line/other) form the
    # head, the hands and the boots. Split them into blobs and sort by x.
    warm = lambda x, y: cls.get((x, y)) in ('brown', 'skin')
    blobs = components(cells, warm)
    blobs.sort(key=lambda b: sum(p[0] for p in b) / len(b))
    xs = [p[0] for p in cells]
    x_lo, x_hi = min(xs), max(xs)
    span = max(1, x_hi - x_lo)

    # Head: the one big warm blob at the head end. Hands: the bright tan blobs
    # beside the torso (mean value well above the dark-leather belt and boots,
    # which share the hue but sit around v 0.25-0.37). Everything else warm -
    # belt, boots, straps - stays in the base layer untinted.
    head = set()
    hands = set()
    for blob in blobs:
        mx = sum(p[0] for p in blob) / len(blob)
        rel = (mx - x_lo) / span
        if rel < 0.42 and len(blob) > 60:
            head.update(blob)
            continue
        if len(blob) < 8 or not (0.42 <= rel < 0.82):
            continue
        v_mean = sum(colorsys.rgb_to_hsv(*(c / 255 for c in px[ox + x, oy + y][:3]))[2] for x, y in blob) / len(blob)
        if v_mean > 0.48:
            hands.update(blob)

    # Inside the head, skin-class pixels in a big enough cluster are the face;
    # lone bright pixels are hair highlights and stay hair.
    face = set()
    head_skin = lambda x, y: (x, y) in head and cls.get((x, y)) == 'skin'
    for blob in components(sorted(head), head_skin):
        if len(blob) >= 6:
            face.update(blob)
    hair = head - face
    skin = face | hands

    base, skin_l, hair_l = {}, {}, {}
    for (x, y), c in cls.items():
        p = px[ox + x, oy + y]
        if (x, y) in skin:
            skin_l[(x, y)] = p
        elif (x, y) in hair:
            hair_l[(x, y)] = p
        else:
            base[(x, y)] = p

    # Long hair: the hair mask grown toward the torso (+x) along the sides of
    # the head (top and bottom thirds of its y-extent), never over the face.
    hair_f = dict(hair_l)
    if hair:
        ys = [p[1] for p in hair]
        y_lo, y_hi = min(ys), max(ys)
        side = max(2, int((y_hi - y_lo) * 0.34))
        for dx in (5, 10, 15):
            for (x, y) in hair:
                if not (y < y_lo + side or y > y_hi - side):
                    continue
                nx = x + dx
                if nx >= CELL or (nx, y) in face or (nx, y) in hair_f:
                    continue
                # Falls over shoulders and into the open: grow only where there is
                # something to fall past (torso) or empty air right beside it.
                hair_f[(nx, y)] = px[ox + x, oy + y]
        # A dark rim where new hair meets open air, so it keeps the sprite's outline.
        grown = set(hair_f) - set(hair_l)
        for (x, y) in list(grown):
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (x + dx, y + dy)
                    if n in hair_f or n in cls or not (0 <= n[0] < CELL and 0 <= n[1] < CELL):
                        continue
                    hair_f[n] = (12, 8, 6, 255)
    return base, skin_l, hair_l, hair_f


def to_mask(layer, top):
    """Shaded near-white mask: luminance scaled so the brightest pixel hits `top`."""
    if not layer:
        return {}
    lum_max = max(luminance(p) for p in layer.values()) or 1.0
    out = {}
    for k, p in layer.items():
        v = int(round(255 * min(1.0, top * luminance(p) / lum_max)))
        # Keep the odd outline pixel that lands in a mask genuinely dark.
        if luminance(p) < 0.12:
            v = 18
        out[k] = (v, v, v, p[3])
    return out


def main():
    im = Image.open(SRC).convert('RGBA')
    if im.size != (CELL * GRID, CELL * GRID):
        sys.exit(f'unexpected sheet size {im.size}')
    px = im.load()
    layers = {name: Image.new('RGBA', im.size, (0, 0, 0, 0)) for name in ('base', 'skin', 'hair', 'hair-f')}
    outs = {name: layers[name].load() for name in layers}
    stats = {name: 0 for name in layers}
    for row in range(GRID):
        for col in range(GRID):
            ox, oy = col * CELL, row * CELL
            base, skin, hair, hair_f = split_cell(px, ox, oy)
            for (x, y), p in base.items():
                outs['base'][ox + x, oy + y] = p
            for (x, y), p in to_mask(skin, MASK_TOP).items():
                outs['skin'][ox + x, oy + y] = p
            for (x, y), p in to_mask(hair, MASK_TOP).items():
                outs['hair'][ox + x, oy + y] = p
            for (x, y), p in to_mask(hair_f, MASK_TOP).items():
                outs['hair-f'][ox + x, oy + y] = p
            stats['base'] += len(base)
            stats['skin'] += len(skin)
            stats['hair'] += len(hair)
            stats['hair-f'] += len(hair_f)
    # The tunic leaves the base too: outfit 0 is the original blue, the rest
    # are the same shading in other dyes (player-walk-fit-<k>.png).
    body = Image.new('RGBA', im.size, (0, 0, 0, 0))
    tunic = Image.new('RGBA', im.size, (0, 0, 0, 0))
    body_px, tunic_px, base_px = body.load(), tunic.load(), layers['base'].load()
    tunic_cells: dict[tuple[int, int], tuple[int, int, int, int]] = {}
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            p = base_px[x, y]
            if p[3] == 0:
                continue
            if classify(p) == 'blue':
                tunic_px[x, y] = p
                tunic_cells[(x, y)] = p
            else:
                body_px[x, y] = p
    path = os.path.join(OUT_DIR, 'player-walk-base.png')
    body.save(path)
    print(f'{path}: {stats["base"] - len(tunic_cells)} px (tunic {len(tunic_cells)} px split off)')
    tunic.save(os.path.join(OUT_DIR, 'player-walk-fit-0.png'))
    tunic_mask = Image.new('RGBA', im.size, (0, 0, 0, 0))
    mask_px = tunic_mask.load()
    for (x, y), p in to_mask(tunic_cells, MASK_TOP).items():
        mask_px[x, y] = p
    for k, hex_color in enumerate(OUTFITS[1:], start=1):
        bake(tunic_mask, hex_color, FIT_FLOOR, os.path.join(OUT_DIR, f'player-walk-fit-{k}.png'))
    # Armor: a suit over the tunic and a helm over the hair, drawn last
    # (player-walk-arm-<k>.png, 1-based).
    for k, (hex_color, style, plume) in enumerate(ARMORS, start=1):
        bake_armor(tunic_mask, layers['hair'], hex_color, style, os.path.join(OUT_DIR, f'player-walk-arm-{k}.png'), plume)
    # The masks themselves never ship: the explorer's UI does not tint
    # textures reliably, so every palette color is baked into its own sheet
    # (player-walk-skin-<i>.png, player-walk-hair-<j>.png, player-walk-hair-f-<j>.png).
    for i, hex_color in enumerate(SKIN_TONES):
        bake(layers['skin'], hex_color, SKIN_FLOOR, os.path.join(OUT_DIR, f'player-walk-skin-{i}.png'))
    for j, hex_color in enumerate(HAIR_COLORS):
        bake(layers['hair'], hex_color, HAIR_FLOOR, os.path.join(OUT_DIR, f'player-walk-hair-{j}.png'))
        bake(layers['hair-f'], hex_color, HAIR_FLOOR, os.path.join(OUT_DIR, f'player-walk-hair-f-{j}.png'))
    for name in ('skin', 'hair', 'hair-f'):
        stale = os.path.join(OUT_DIR, f'player-walk-{name}.png')
        if os.path.exists(stale):
            os.remove(stale)


# Keep in step with SKIN_TONES / HAIR_COLORS in src/mp/protocol.ts (index = file suffix).
SKIN_TONES = ['f6dcc8', 'edbd94', 'e0a877', 'c68642', 'a56a3a', '8d5524', '5c3a1e', '3b2314']
HAIR_COLORS = ['1a1210', '4a2c17', '8c5429', 'b8763a', 'd9a441', 'ece0b8', 'b0342a', '9a9fa8', '3b6fd6', 'a83fb8']
# Keep in step with OUTFITS in src/mp/protocol.ts (index = file suffix).
# Entry 0 is the painted blue and is copied, not baked.
OUTFITS = ['2d4d71', '3f7a3a', 'a8322b', '6a3aa8', 'c9962e', '3a3a42']
# Keep in step with ARMORS in src/mp/protocol.ts (index + 1 = file suffix).
# (color, style, plume): 'leather' = matte, 'chain' = a dithered mail weave,
# 'plate' = hard metallic contrast with glints. The royal knight's gold helm
# carries a crimson crest.
ARMORS = [
    ('7a5230', 'leather', None),
    ('8a8f99', 'chain', None),
    ('c4ccd8', 'plate', None),
    ('4a3a5e', 'plate', None),
    ('d9a83a', 'plate', 'b0342a'),
]
# Lift the tint off the floor so black hair / deep skin keep their shading.
SKIN_FLOOR = 0.06
HAIR_FLOOR = 0.1
FIT_FLOOR = 0.08


def bake(mask: Image.Image, hex_color: str, floor: float, path: str) -> None:
    """Multiply a shaded mask by a lifted color and write the result."""
    r, g, b = (int(hex_color[k:k + 2], 16) / 255 for k in (0, 2, 4))
    tint = tuple(floor + c * (1 - floor) for c in (r, g, b))
    out = Image.new('RGBA', mask.size, (0, 0, 0, 0))
    src = mask.load()
    dst = out.load()
    w, h = mask.size
    for y in range(h):
        for x in range(w):
            p = src[x, y]
            if p[3] == 0:
                continue
            dst[x, y] = (int(round(p[0] * tint[0])), int(round(p[1] * tint[1])), int(round(p[2] * tint[2])), p[3])
    out.save(path)


def shade(rgb, s: float, white: float = 0.0):
    """Material color at brightness s, pulled toward white by `white` (glints)."""
    return tuple(int(round(255 * min(1.0, max(0.0, c * s * (1 - white) + white)))) for c in rgb)


def material(style: str, v: float, x: int, y: int) -> tuple[float, float]:
    """Brightness and glint for one pixel of a material from the mask's shading."""
    if style == 'leather':
        return 0.2 + 0.8 * v, 0.0
    if style == 'chain':
        s = 0.22 + 0.78 * v
        if (x + y) % 2 == 0:
            return s * 0.66, 0.0  # the weave
        return s, 0.25 if v > 0.85 else 0.0
    c = min(1.0, max(0.0, (v - 0.5) * 1.7 + 0.5))
    return 0.14 + 0.86 * c, 0.45 if v > 0.82 else 0.0


def bake_armor(
    tunic_mask: Image.Image,
    hair_mask: Image.Image,
    hex_color: str,
    style: str,
    path: str,
    plume: str | None = None,
) -> None:
    """A suit of armor over the tunic's pixels, and a helm over the hair's.

    The sheet is pre-rotated, so within a cell the body runs along x (head at
    low x, boots at high x) and shoulder-to-shoulder is y. On top of the
    material's shading the suit gets a dark collar, pauldrons that bulge two
    pixels past the shoulders, a bright breastplate with a center seam, a
    belt with a buckle, and tassets (alternating plates) below the belt. The
    helm is the short-hair shape in the same material with a dark rim along
    the brow; `plume` adds a crest above it."""
    rgb = tuple(int(hex_color[k:k + 2], 16) / 255 for k in (0, 2, 4))
    plume_rgb = tuple(int(plume[k:k + 2], 16) / 255 for k in (0, 2, 4)) if plume else None
    out = Image.new('RGBA', tunic_mask.size, (0, 0, 0, 0))
    dst = out.load()
    t_px = tunic_mask.load()
    h_px = hair_mask.load()
    dark = shade(rgb, 0.18)
    for row in range(GRID):
        for col in range(GRID):
            ox, oy = col * CELL, row * CELL
            torso = {}
            for y in range(CELL):
                for x in range(CELL):
                    p = t_px[ox + x, oy + y]
                    if p[3] > 0:
                        torso[(x, y)] = p[0] / 255
            if not torso:
                continue
            xs = [x for x, _ in torso]
            x0, x1 = min(xs), max(xs)
            height = x1 - x0 + 1
            span = {}
            for (x, y) in torso:
                lo, hi = span.get(x, (CELL, -1))
                span[x] = (min(lo, y), max(hi, y))
            belt_x = x0 + int(round(height * 0.62))
            chest_x1 = x0 + int(round(height * 0.5))
            plates = {}  # (x, y) -> (s, white) with features applied
            for (x, y), v in torso.items():
                s, white = material(style, v, x, y)
                lo, hi = span[x]
                yc = (lo + hi) / 2
                width = hi - lo + 1
                if x <= x0 + 1:
                    s *= 0.45  # collar / gorget
                elif x < chest_x1 and abs(y - yc) <= width * 0.34:
                    if abs(y - yc) < 0.6:
                        s *= 0.45  # breastplate center seam
                    elif style == 'leather' and abs(abs(y - yc) - width * 0.22) < 0.6:
                        s *= 0.5  # shoulder straps
                    else:
                        s = min(1.0, s * 1.3)  # the breastplate catches the light
                        if style == 'plate':
                            white = max(white, 0.3 if x <= x0 + 4 else 0.12)
                elif belt_x <= x <= belt_x + 1:
                    if abs(y - yc) <= 1:
                        s, white = 0.95, (0.6 if style == 'plate' else 0.25)  # buckle
                    else:
                        s *= 0.28  # belt
                elif x > belt_x + 1 and style != 'chain':
                    if (int(y - lo) // 3) % 2 == 1:
                        s *= 0.72  # tassets: alternating plates
                    if x == x1:
                        s *= 0.6  # hem
                plates[(x, y)] = (s, white)
            # Pauldrons: bulge past each shoulder on the upper torso rows.
            for x in range(x0 + 1, min(x1, x0 + 6)):
                if x not in span:
                    continue
                lo, hi = span[x]
                dome = 1.0 if x <= x0 + 3 else 0.8
                glint = 0.45 if style == 'plate' else 0.1
                for dy, s in ((1, dome), (2, dome * 0.8)):
                    for y in (lo - dy, hi + dy):
                        if 0 <= y < CELL:
                            plates[(x, y)] = (s, glint if dy == 1 else 0.0)
                for y in (lo - 3, hi + 3):
                    if 0 <= y < CELL:
                        plates[(x, y)] = (0.12, 0.0)  # pauldron outline
                plates[(x, lo)] = (dome, glint)
                plates[(x, hi)] = (dome, glint)
            for (x, y), (s, white) in plates.items():
                a = t_px[ox + x, oy + y][3] if (x, y) in torso else 255
                dst[ox + x, oy + y] = shade(rgb, s, white) + (a,)
            # The helm: the short hair's shape, with a rim along the brow.
            hair = {}
            for y in range(CELL):
                for x in range(CELL):
                    p = h_px[ox + x, oy + y]
                    if p[3] > 0:
                        hair[(x, y)] = p[0] / 255
            if not hair:
                continue
            brow = {}
            crown = {}
            for (x, y) in hair:
                brow[y] = max(brow.get(y, -1), x)
                crown[y] = min(crown.get(y, CELL), x)
            hx0 = min(x for x, _ in hair)
            hx1 = max(x for x, _ in hair)
            # The fringe hangs over the eyes; the helm stops at the brow line
            # and lets the hair below it show.
            brow_line = hx0 + int(round((hx1 - hx0) * 0.58))
            brow = {y: min(bx, brow_line) for y, bx in brow.items() if crown[y] <= brow_line}
            hys = sorted(y for _, y in hair)
            hyc = (hys[0] + hys[-1]) / 2
            half = max(1.0, (hys[-1] - hys[0]) / 2)
            # Solid from crown to brow in every column: the hair's stray
            # highlight pixels (classified elsewhere) must not show through.
            for y, bx in brow.items():
                for x in range(crown[y], bx + 1):
                    # A smooth dome instead of the hair's strands: lit at the
                    # middle, falling off toward the sides and the crown.
                    t = abs(y - hyc) / half
                    dome = 0.95 - 0.55 * t * t - 0.25 * max(0.0, (hx0 + 3 - x) / 3)
                    s, white = material(style, dome, x, y)
                    if x == bx:
                        s, white = 0.25, 0.0  # rim
                    elif x == bx - 1:
                        s, white = (0.95, 0.5) if style == 'plate' else (s * 0.75, 0.0)  # rim band
                    elif x == crown[y]:
                        s *= 0.65  # rounded crown edge
                    a = h_px[ox + x, oy + y][3] if (x, y) in hair else 255
                    dst[ox + x, oy + y] = shade(rgb, s, white) + (a,)
            if plume_rgb:
                # A crest: three rows above the crown's middle, tapering.
                ys = sorted(y for _, y in hair if crown[y] <= hx0 + 1)
                if ys:
                    yc = ys[len(ys) // 2]
                    for dx, half in ((1, 4), (2, 4), (3, 3), (4, 2), (5, 1)):
                        x = hx0 - dx
                        if x < 0:
                            break
                        for y in range(yc - half, yc + half + 1):
                            edge = abs(y - yc) == half
                            dst[ox + x, oy + y] = shade(plume_rgb, 0.45 if edge else 0.95) + (255,)
                    for y in (yc - 5, yc + 5):
                        for dx in (1, 2):
                            dst[ox + hx0 - dx, oy + y] = dark + (255,)
    out.save(path)


if __name__ == '__main__':
    main()
