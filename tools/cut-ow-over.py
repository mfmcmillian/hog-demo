"""Cut a realm painting's overhead layer: images/maps/<name>-over-<rev>.png.

Called by process-ow-map.ps1 -over. Takes the resized portrait painting
(648x1152, 9x16 cells of 72px) and the 16 layout rows; every cell marked 'o'
is kept (feathered 6px outward so the seam melts into the backdrop), the
rest goes transparent. The result is rotated 90 CCW like the map itself and
palette-quantized with alpha. The game draws it as the last child of the
map, so arches and canopy are the painting's own pixels drawn over the
avatar: walking under them hides the sprite exactly where the art overhangs.

Inside the 'o' cells, pixels that match the floor are dropped too (the floor
is sampled from the cell given as --floor gx,gy), so an arch over a corridor
keeps only its stonework and the avatar's head slides under the arch while
the feet stay visible on the flagstones. Without --floor the whole cell is
kept.

    python tools/cut-ow-over.py crypt C:/tmp/crypt-portrait.png --floor 4,7 '#########' '#ooo.ooo#' ...
"""

import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL = 72
COLS, ROWS = 9, 16
FEATHER = 6
# Colour distance from the sampled floor where a pixel starts / fully counts
# as "not floor" (0-441 scale).
KEY_LO, KEY_HI = 34, 70


def main() -> int:
    args = sys.argv[1:]
    floor_cell = None
    if '--floor' in args:
        i = args.index('--floor')
        floor_cell = tuple(int(v) for v in args[i + 1].split(','))
        del args[i:i + 2]
    rev = 'a'
    if '--rev' in args:
        i = args.index('--rev')
        rev = args[i + 1]
        del args[i:i + 2]
    name, portrait, *rows = args
    if len(rows) != ROWS:
        print(f'expected {ROWS} rows, got {len(rows)}', file=sys.stderr)
        return 2
    img = Image.open(portrait).convert('RGBA')
    if img.size != (COLS * CELL, ROWS * CELL):
        print(f'expected {COLS * CELL}x{ROWS * CELL} portrait, got {img.size}', file=sys.stderr)
        return 2
    keep = np.zeros((ROWS, COLS), dtype=bool)
    for y, row in enumerate(rows):
        if len(row) != COLS:
            print(f'row {y} is not {COLS} chars', file=sys.stderr)
            return 2
        for x, ch in enumerate(row):
            keep[y, x] = ch == 'o'
    if not keep.any():
        print("no 'o' cells in the rows", file=sys.stderr)
        return 2

    # Distance from each pixel to the nearest kept cell (0 inside), then a
    # linear falloff over FEATHER px so the cut edge is soft.
    h, w = ROWS * CELL, COLS * CELL
    ys = np.arange(h)[:, None]
    xs = np.arange(w)[None, :]
    dist = np.full((h, w), np.inf)
    for cy, cx in zip(*np.nonzero(keep)):
        left, top = cx * CELL, cy * CELL
        dx = np.maximum(np.maximum(left - xs, 0), xs - (left + CELL - 1))
        dy = np.maximum(np.maximum(top - ys, 0), ys - (top + CELL - 1))
        dist = np.minimum(dist, np.sqrt(dx * dx + dy * dy))
    mask = np.clip(1 - dist / FEATHER, 0, 1)

    rgba = np.asarray(img).copy()
    if floor_cell is not None:
        fx, fy = floor_cell
        q = CELL // 4
        patch = rgba[fy * CELL + q:(fy + 1) * CELL - q, fx * CELL + q:(fx + 1) * CELL - q, :3]
        floor_rgb = np.median(patch.reshape(-1, 3), axis=0)
        d = np.sqrt(((rgba[..., :3].astype(float) - floor_rgb) ** 2).sum(axis=-1))
        key = np.clip((d - KEY_LO) / (KEY_HI - KEY_LO), 0, 1)
        # Soften the key so single speckles of floor inside the stone don't
        # punch pinholes, then keep only the 'o' cells.
        key = np.asarray(Image.fromarray((key * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))) / 255
        mask = mask * key
    rgba[..., 3] = np.round(rgba[..., 3] * mask).astype(np.uint8)
    out_img = Image.fromarray(rgba, 'RGBA').transpose(Image.Transpose.ROTATE_90)
    out = os.path.join(ROOT, 'images', 'maps', f'{name}-over-{rev}.png')
    out_img.save(out, optimize=True)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'quantize-images.py'), out], check=False)
    print(f"  'map-{name}-over': {{ src: 'images/maps/{name}-over-{rev}.png', w: {out_img.width}, h: {out_img.height} }},")
    return 0


if __name__ == '__main__':
    sys.exit(main())
