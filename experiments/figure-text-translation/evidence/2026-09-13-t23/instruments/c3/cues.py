#!/usr/bin/env python3
"""STEP 3 extra cues from SOURCE geometry only (runs' adv, no cairo): sibling edge coincidences.
For each layout block: does its left edge / centre / right edge (per line, along-axis, same rotation within
3 deg) coincide within TOL pt with a line edge of ANOTHER block in the same figure (all 367-population blocks)?"""
import json, sys
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3/scripts')
from c3lib import *
TOL = 0.5
out = {}
for b in names():
    fig = Fig(b)
    ext = {}
    for bi, bl in enumerate(fig.blocks):
        ls = FT.lines(bl)
        ext[bi] = [(min(FT.along(r) for r in l), max(FT.along(r) + r['adv'] for r in l), bl[0]['rot']) for l in ls]
    for bi in fig.layout_blocks():
        mine = ext[bi]; rot = mine[0][2]
        res = {'left': [], 'center': [], 'right': []}
        for oj, oth in ext.items():
            if oj == bi or abs(oth[0][2] - rot) > 3:
                continue
            for (a0, a1, _) in oth:
                for (m0, m1, _) in mine:
                    if abs(a0 - m0) <= TOL: res['left'].append(fig.keys[oj])
                    if abs((a0 + a1) / 2 - (m0 + m1) / 2) <= TOL: res['center'].append(fig.keys[oj])
                    if abs(a1 - m1) <= TOL: res['right'].append(fig.keys[oj])
        out[f'{b}#{bi}'] = {k: sorted(set(v)) for k, v in res.items()}
(C3 / 'cues.json').write_text(json.dumps(out, ensure_ascii=False, indent=0))
print(len(out))
