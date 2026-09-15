#!/usr/bin/env python3
"""P4 — what the heal changed, in the raster and in the reader's renderer.

    FIGTEXT_PYLIBS=../../../pylibs python3 p4_pixels.py GOLDEN.svg HEALED.svg BEFORE.png AFTER.png

GOLDEN/HEALED are the committed brain _IS.svg before and after the run; BEFORE/AFTER are
render-check.mjs renders of them at 200 dpi (975 x 483.33, scale 1). Prints:
  1. source-29 (the mask raster): interior px changed, edge px changed, and whether HEALED's raster
     equals figrings.heal's documented edit applied to GOLDEN's (columns, then rows).
  2. the Chromium renders: changed px, their bbox, and changed px OUTSIDE a +-4 px band around
     mask-2's clip rect (from the census: 227.7656 93.2383 316.293 116.1328, user units).
"""
import base64, io, os, re, sys
sys.path.insert(0, os.environ.get('FIGTEXT_PYLIBS', 'pylibs'))
import numpy as np
from PIL import Image

golden, healed, before, after = sys.argv[1:5]

def raster(p):
    t = open(p, encoding='utf-8').read()
    m = re.search(r'<image id="source-29" x="0" y="0" width="(\d+)" height="(\d+)" '
                  r'xlink:href="data:image/png;base64,([A-Za-z0-9+/=]+)"', t)
    return np.array(Image.open(io.BytesIO(base64.b64decode(m.group(3)))).convert('RGBA'))

a, b = raster(golden), raster(healed)
d = (a != b).any(axis=2)
e = a.copy(); e[:, 0] = e[:, 1]; e[:, -1] = e[:, -2]; e[0, :] = e[1, :]; e[-1, :] = e[-2, :]
h, w = d.shape
print('1. source-29 raster', a.shape)
print('   interior px', (h - 2) * (w - 2), 'changed', int(d[1:-1, 1:-1].sum()))
print('   edge px', 2 * w + 2 * h - 4, 'changed', int(d.sum() - d[1:-1, 1:-1].sum()))
print('   healed raster == heal(golden):', bool((e == b).all()))
print('   mean alpha on edges top/bottom/left/right  golden', [round(float(x), 1) for x in (a[0, :, 3].mean(), a[-1, :, 3].mean(), a[:, 0, 3].mean(), a[:, -1, 3].mean())],
      ' healed', [round(float(x), 1) for x in (b[0, :, 3].mean(), b[-1, :, 3].mean(), b[:, 0, 3].mean(), b[:, -1, 3].mean())])

nb = np.asarray(Image.open(before).convert('RGB')).astype(int)
na = np.asarray(Image.open(after).convert('RGB')).astype(int)
dd = np.abs(nb - na).sum(axis=2) > 0
k = 200 / 72
x0, y0, x1, y1 = 227.7656 * k, 93.2383 * k, 316.293 * k, 116.1328 * k
band = np.zeros_like(dd)
band[int(y0) - 4:int(y1) + 5, int(x0) - 4:int(x1) + 5] = True
band[int(y0) + 4:int(y1) - 3, int(x0) + 4:int(x1) - 3] = False
ys, xs = np.nonzero(dd)
print('2. Chromium renders', nb.shape[:2])
print('   changed px', int(dd.sum()), 'bbox', (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())) if len(xs) else None)
print('   changed px outside the +-4 px band around mask-2:', int((dd & ~band).sum()))
