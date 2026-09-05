"""Palette-quantize the PNGs under images/ where it is visually free.

Uses libimagequant (pip install imagequant pillow numpy), the engine behind
pngquant: full 8-bit alpha in the palette, so antialiased text and soft edges
survive, unlike ffmpeg's palettegen. Each file is converted only if
libimagequant can reach --min-quality (its 0-100 perceptual scale; anything
that would band, like smooth gradients, is refused and left RGBA) and the
result is at least --min-saving smaller. Already-paletted files are skipped,
so re-runs are no-ops.

This is a download-size pass only: GPU memory is set by pixel count, not by
the PNG's palette.

    python tools/quantize-images.py            # do it
    python tools/quantize-images.py --dry-run  # report only
"""

import argparse
import io
import os
import sys
import time

import imagequant
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES = os.path.join(ROOT, "images")


def psnr(a: Image.Image, b: Image.Image) -> float:
    x = np.asarray(a.convert("RGBA"), dtype=np.float64)
    y = np.asarray(b.convert("RGBA"), dtype=np.float64)
    # Compare premultiplied so fully transparent pixels don't count noise.
    xa, ya = x[..., 3:] / 255.0, y[..., 3:] / 255.0
    mse = np.mean((x[..., :3] * xa - y[..., :3] * ya) ** 2) + np.mean((x[..., 3] - y[..., 3]) ** 2)
    return 99.0 if mse < 1e-9 else 10 * np.log10(255.0**2 / mse)


def write_with_retry(path: str, data: bytes, tries: int = 5) -> None:
    # Files just written by the label generators can be briefly locked
    # (Defender scan); back off rather than abort the whole pass.
    for i in range(tries):
        try:
            with open(path, "wb") as out:
                out.write(data)
            return
        except OSError:
            if i == tries - 1:
                raise
            time.sleep(0.2 * (i + 1))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--min-quality", type=int, default=80)
    ap.add_argument("--min-saving", type=float, default=0.2, help="fraction of bytes that must be saved")
    ap.add_argument("paths", nargs="*", help="files or dirs (default: images/)")
    args = ap.parse_args()

    files = []
    for p in args.paths or [IMAGES]:
        p = os.path.abspath(os.path.join(ROOT, p) if not os.path.isabs(p) else p)
        # Never wander outside images/: this rewrites files in place.
        if os.path.commonpath([p, IMAGES]) != IMAGES:
            print(f"refusing path outside images/: {p}", file=sys.stderr)
            return 2
        if os.path.isdir(p):
            for d, _, names in os.walk(p):
                files += [os.path.join(d, n) for n in names if n.lower().endswith(".png")]
        else:
            files.append(p)

    before = after = 0
    converted = kept_quality = kept_size = skipped = 0
    for f in sorted(files):
        rel = os.path.relpath(f, ROOT).replace("\\", "/")
        size = os.path.getsize(f)
        before += size
        img = Image.open(f)
        if img.mode == "P":
            skipped += 1
            after += size
            continue
        src = img.convert("RGBA")
        try:
            q = imagequant.quantize_pil_image(
                src, dithering_level=1.0, max_colors=256, min_quality=args.min_quality, max_quality=100
            )
        except Exception as e:  # libimagequant: quality too low
            kept_quality += 1
            after += size
            print(f"  keep RGBA  {rel:48s} {size // 1024:6d} KB  ({e})")
            continue
        buf = io.BytesIO()
        q.save(buf, format="PNG", optimize=True)
        new = buf.getvalue()
        saving = 1 - len(new) / size
        if saving < args.min_saving:
            kept_size += 1
            after += size
            print(f"  keep size  {rel:48s} {size // 1024:6d} KB  (would save {saving:.0%})")
            continue
        db = psnr(src, q.convert("RGBA"))
        converted += 1
        after += len(new)
        print(f"  quantize   {rel:48s} {size // 1024:6d} -> {len(new) // 1024:5d} KB  psnr {db:5.1f} dB")
        if not args.dry_run:
            write_with_retry(f, new)

    print(
        f"\n{converted} converted, {kept_quality} kept (quality), {kept_size} kept (size), {skipped} already paletted"
        f"\n{before / 2**20:.1f} MB -> {after / 2**20:.1f} MB{'  (dry run)' if args.dry_run else ''}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
