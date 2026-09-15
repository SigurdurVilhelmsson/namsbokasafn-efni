#!/usr/bin/env python3
"""Longest single word of each translated value at sz0 (compose's measure: family, weight of the block's
first run, size*S, x_advance/S) + control: natural width re-measured here == diag natural_w_sz0."""
import json, sys
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3/scripts')
from c3lib import *
surf = cairo.ImageSurface(cairo.FORMAT_RGB24, 8, 8); ctx = cairo.Context(surf)
out = {}; bad = []
for b in names():
    fig = Fig(b)
    for bi in fig.layout_blocks():
        d = fig.diag[bi]; ref = fig.blocks[bi][0]; bold = ref['font'] in fig.bold_fonts
        v = ' '.join(' '.join(d['value']).split())
        nat = measure_adv(ctx, v, d['sz0'], bold)
        if abs(nat - d['natural_w_sz0']) > 1e-6: bad.append((b, bi, nat, d['natural_w_sz0']))
        words = v.split()
        ws = [(measure_adv(ctx, w, d['sz0'], bold), w) for w in words]
        lw = max(ws)
        out[f'{b}#{bi}'] = dict(longest_word=lw[1], longest_word_w_sz0=round(lw[0], 2), n_words=len(words))
(C3 / 'words.json').write_text(json.dumps(out, ensure_ascii=False, indent=0))
print('blocks', len(out), 'natural-width mismatches vs diag', len(bad), bad[:3])
