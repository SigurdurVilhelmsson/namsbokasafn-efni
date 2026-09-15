"""Pixel tools (own code).
  pix.py same <a.png> <b.png>                    identical-pixel count over the common area + non-white count of a
  pix.py fid <render.png> <source.png> <cairo_artwork.png> <chromium_artwork.png> [--dil N]
      fidelity of a Chromium render of the reader file against source.png, outside a text-ink mask built
      from (source vs cairo artwork) UNION (render vs chromium artwork): the two places text ink lives.
"""
import sys, json
import numpy as np
from PIL import Image


def load(p):
    return np.asarray(Image.open(p).convert('RGB')).astype(np.int16)


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def crop2(a, b):
    h, w = min(a.shape[0], b.shape[0]), min(a.shape[1], b.shape[1])
    return a[:h, :w], b[:h, :w]


def dilate(m, n):
    out = m.copy()
    for dy in range(-n, n + 1):
        for dx in range(-n, n + 1):
            out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


cmd = sys.argv[1]
if cmd == 'same':
    a, b = load(sys.argv[2]), load(sys.argv[3])
    sa, sb = a.shape, b.shape
    a, b = crop2(a, b)
    eq = np.all(a == b, axis=2)
    nonwhite = int(np.sum(np.any(a < 250, axis=2)))
    d = np.abs(a - b).max(axis=2)
    print(json.dumps({'shapeA': sa, 'shapeB': sb, 'px': int(eq.size), 'identical': int(eq.sum()),
                      'maxChannelDelta': int(d.max()), 'gt8': int((d > 8).sum()), 'nonWhiteA': nonwhite}))
elif cmd == 'fid':
    r, s, ca, cr = (load(p) for p in sys.argv[2:6])
    dil = int(sys.argv[sys.argv.index('--dil') + 1]) if '--dil' in sys.argv else 3
    h = min(x.shape[0] for x in (r, s, ca, cr)); w = min(x.shape[1] for x in (r, s, ca, cr))
    r, s, ca, cr = (x[:h, :w] for x in (r, s, ca, cr))
    en = np.abs(lum(s) - lum(ca)) > 10
    ic = np.abs(lum(r) - lum(cr)) > 10
    mask = dilate(en | ic, dil)
    keep = ~mask
    dl = np.abs(lum(r) - lum(s))[keep]
    print(json.dumps({'hw': [h, w], 'maskedPx': int(mask.sum()), 'N': int(keep.sum()),
                      'meanAbsL': round(float(dl.mean()), 3), 'gt20': int((dl > 20).sum()),
                      'gt20pct': round(100.0 * float((dl > 20).mean()), 3), 'gt8': int((dl > 8).sum())}))
