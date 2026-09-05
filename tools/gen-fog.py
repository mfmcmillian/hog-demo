"""One shared tileable fog sheet for the questing area: images/fx/fog-b.png.

512x512, white RGB with the alpha carrying three octaves of periodic value
noise, so the sheet wraps seamlessly. overworld.tsx draws it twice at the
realm's `fog` alpha, sliding a 60% window across it on slow sines, so this
one small file fogs every realm.

    python tools/gen-fog.py
"""

import os
import sys

import numpy as np
from PIL import Image

SIZE = 512
SEED = 7
OCTAVES = ((4, 0.5), (8, 0.3), (16, 0.2))


def smooth(t: np.ndarray) -> np.ndarray:
    return t * t * (3 - 2 * t)


def periodic_value_noise(n: int, rng: np.random.Generator) -> np.ndarray:
    lattice = rng.random((n, n))
    coords = np.arange(SIZE) / SIZE * n
    x0 = np.floor(coords).astype(int)
    t = smooth(coords - x0)
    x0 %= n
    x1 = (x0 + 1) % n
    # Bilinear blend of the four wrapped lattice corners.
    a = lattice[np.ix_(x0, x0)]
    b = lattice[np.ix_(x0, x1)]
    c = lattice[np.ix_(x1, x0)]
    d = lattice[np.ix_(x1, x1)]
    ty = t[:, None]
    tx = t[None, :]
    top = a + (b - a) * tx
    bot = c + (d - c) * tx
    return top + (bot - top) * ty


def main() -> None:
    rng = np.random.default_rng(SEED)
    noise = np.zeros((SIZE, SIZE))
    for n, w in OCTAVES:
        noise += w * periodic_value_noise(n, rng)
    # Push the mid-tones apart so it reads as drifting banks, not a flat haze.
    alpha = np.clip((noise - 0.3) * 1.9, 0, 1)
    alpha = smooth(alpha)
    rgba = np.empty((SIZE, SIZE, 4), dtype=np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.round(alpha * 255).astype(np.uint8)
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # -b: the first cut was grey+alpha and got cached by path in the preview
    # explorer; bump the letter again if this is ever regenerated.
    out = os.path.join(root, 'images', 'fx', 'fog-b.png')
    # Plain RGBA: every explorer's texture loader takes it (LA is a gamble).
    Image.fromarray(rgba, 'RGBA').save(out, optimize=True)
    print(f"  'fog-a': {{ src: 'images/fx/fog-b.png', w: {SIZE}, h: {SIZE} }},")
    print(f'wrote {out} ({os.path.getsize(out)} bytes)')


if __name__ == '__main__':
    sys.exit(main())
