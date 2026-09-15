#!/usr/bin/env python3
"""Compare two composed figure SVGs, normalising the ONE volatile field on BOTH sides.

A figure-run compose does not pin SOURCE_DATE_EPOCH, so fontTools stamps each embedded subset
font's `head.modified` with the compose time. Everything else is expected to be deterministic.

Reports, as JSON:
  fonts        per @font-face: identical | head.modified-only | OTHER (+ differing tables)
  images       ids of <image> elements whose data URI differs, and ids present on one side only
  remainder    whether the SVG text with every font and image data URI blanked is identical

Usage: FIGTEXT_PYLIBS=<pylibs> python3 svgdelta.py A.svg B.svg
"""
import base64
import io
import json
import os
import re
import sys

sys.path.insert(0, os.environ.get('FIGTEXT_PYLIBS', 'pylibs'))
from fontTools.ttLib import TTFont  # noqa: E402

FONT = re.compile(
    r"font-family:'([^']+)';font-weight:(\d+);font-style:(\w+);src:url\(data:font/woff2;base64,([A-Za-z0-9+/=]+)\)"
)
IMAGE = re.compile(r'<image id="([^"]+)"[^>]*?xlink:href="data:image/png;base64,([A-Za-z0-9+/=]+)"')


def font_verdict(a64, b64):
    if a64 == b64:
        return {'verdict': 'identical'}
    fa, fb = TTFont(io.BytesIO(base64.b64decode(a64))), TTFont(io.BytesIO(base64.b64decode(b64)))
    tags = sorted((set(fa.keys()) | set(fb.keys())) - {'GlyphOrder'})
    other = []
    for tag in tags:
        if tag not in fa or tag not in fb:
            other.append(tag)
            continue
        if tag == 'head':
            # Field by field, so the verdict NAMES what moved. `checkSumAdjustment` is a
            # whole-font checksum, so it moves whenever `modified` does; it is accepted only
            # alongside `modified`, never on its own.
            fields = sorted(set(vars(fa['head'])) | set(vars(fb['head'])))
            moved = [k for k in fields if getattr(fa['head'], k, None) != getattr(fb['head'], k, None)]
            volatile = {'modified', 'checkSumAdjustment'}
            if not set(moved) <= volatile or (moved and 'modified' not in moved):
                other.append('head:' + ','.join(moved))
            continue
        if fa.getTableData(tag) != fb.getTableData(tag):
            other.append(tag)
    return {'verdict': 'head.modified-only' if not other else 'OTHER', 'tables': other}


def main(pa, pb):
    ta, tb = open(pa, encoding='utf-8').read(), open(pb, encoding='utf-8').read()
    fa, fb = FONT.findall(ta), FONT.findall(tb)
    fonts = []
    if [f[:3] for f in fa] != [f[:3] for f in fb]:
        fonts.append({'verdict': 'OTHER', 'reason': 'face lists differ', 'a': [f[:3] for f in fa], 'b': [f[:3] for f in fb]})
    else:
        for x, y in zip(fa, fb):
            fonts.append({'face': '/'.join(x[:3]), **font_verdict(x[3], y[3])})
    ia, ib = dict(IMAGE.findall(ta)), dict(IMAGE.findall(tb))
    images = {
        'differ': sorted(k for k in ia.keys() & ib.keys() if ia[k] != ib[k]),
        'onlyA': sorted(ia.keys() - ib.keys()),
        'onlyB': sorted(ib.keys() - ia.keys()),
        'countA': len(ia),
        'countB': len(ib),
    }
    blank = lambda t: IMAGE.sub(lambda m: m.group(0).replace(m.group(2), ''), FONT.sub('FONT', t))
    ra, rb = blank(ta), blank(tb)
    out = {
        'a': pa, 'b': pb,
        'byteIdentical': ta == tb,
        'fonts': fonts,
        'images': images,
        'remainderIdentical': ra == rb,
    }
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
