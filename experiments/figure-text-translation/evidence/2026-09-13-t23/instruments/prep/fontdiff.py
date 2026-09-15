#!/usr/bin/env python3
"""Decode the embedded woff2 @font-face subsets of two SVGs and compare them table by table,
reporting head.modified separately. Read-only."""
import re, sys, base64, io
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
from fontTools.ttLib import TTFont
def faces(p):
    s = open(p, encoding='utf-8').read()
    return re.findall(r"font-weight:(\d+);font-style:(\w+);src:url\(data:font/woff2;base64,([A-Za-z0-9+/=]+)\)", s)
for (wa, sa, ba), (wb, sb, bb) in zip(faces(sys.argv[1]), faces(sys.argv[2])):
    fa, fb = TTFont(io.BytesIO(base64.b64decode(ba))), TTFont(io.BytesIO(base64.b64decode(bb)))
    ta, tb = sorted(fa.keys()), sorted(fb.keys())
    diff = []
    for t in ta:
        if t in ('GlyphOrder',):
            continue
        if t == 'head':
            ha, hb = fa['head'], fb['head']
            other = [k for k in ha.__dict__ if k not in ('modified', 'checkSumAdjustment') and getattr(ha, k, None) != getattr(hb, k, None)]
            if other: diff.append(('head', other))
            continue
        if fa.getTableData(t) != fb.getTableData(t):
            diff.append(t)
    print(wa, sa, 'tables equal:', ta == tb, 'differing tables (excl head.modified/checksum):', diff,
          'head.modified:', fa['head'].modified, fb['head'].modified)
