#!/usr/bin/env python3
"""Stage 4 - the oracle.  Diff a composed image against the published OpenStax raster.

    FIGTEXT_PYLIBS=./pylibs python3 check.py <published.jpg> [--control]

The published jpg is a 200 dpi render of the figure PDF, so with --control (English
re-injected) it is a TRUE ORACLE: any disagreement is our defect, not a translation.
Writes an overlay to out/overlay.png - red = original only, green = ours only.

!! Read the overlay, not the percentage.  Antialiasing between two rasterisers
   swamps layout error: fixing four real placement bugs moved the scalar
   3.00% -> 2.70% while the overlay changed completely.
"""
import sys
import _deps
from _deps import OUT
from PIL import Image, ImageChops, ImageOps


def main(published, control):
    ours = OUT / ('control.png' if control else 'translated.png')
    o = Image.open(published).convert('L')
    c = Image.open(ours).convert('L')
    if o.size != c.size:
        sys.exit(f"size mismatch {o.size} vs {c.size} - re-render at the jpg's dpi")

    d = ImageChops.difference(o, c)
    h = d.histogram(); n = sum(h)
    over = sum(h[40:])
    print(f"{ours.name} vs {published}")
    print(f"  mean |diff|          = {sum(i*c_ for i, c_ in enumerate(h))/n:.2f}")
    print(f"  pixels differing >40 = {over} ({100*over/n:.2f}%)")

    ov = ImageOps.invert(Image.merge('RGB', (ImageOps.invert(o), ImageOps.invert(c),
                                             Image.new('L', o.size, 0))))
    ov.save(OUT / 'overlay.png')
    print("  overlay -> out/overlay.png  (red = original only, green = ours only)")
    if not control:
        print("\n  NOTE: without --control the text differs by design; the overlay only\n"
              "        tells you the ARTWORK still registers.")


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit(__doc__)
    main(args[0], '--control' in sys.argv)
