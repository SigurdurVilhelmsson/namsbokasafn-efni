#!/usr/bin/env python3
"""Compare my independent rows (out/mym-TAG.jsonl) with the builder's r2/measure-TAG.jsonl, field by field."""
import json, sys, collections
from pathlib import Path
ROOT = Path('/home/siggi/dev/scratch-c140'); ME = ROOT / 'r2v-numbers'; R2 = ROOT / 'r2'
TAGS = ['V0', 'V5_p2.0_f7.0', 'V5_p2.0_f7.5', 'V5_p2.0_f8.0', 'V5_p2.5_f7.0', 'V5_p2.5_f7.5', 'V5_p2.5_f8.0', 'V5_p2.0_f7.5_dec']
short = lambda k: f"{k[0].replace('CNX_Chem_', '')} b{k[1]}"
for T in TAGS:
    mine = {(r['basename'], r['block']): r for r in map(json.loads, open(ME / 'out' / f'mym-{T}.jsonl'))}
    his = {(r['basename'], r['block']): r for r in map(json.loads, open(R2 / f'measure-{T}.jsonl'))}
    assert set(mine) == set(his) and len(mine) == 176
    diffs = collections.defaultdict(list); maxd = collections.defaultdict(float)
    text_fail = []
    for k in sorted(mine):
        m, h = mine[k], his[k]
        if not m['text_ok']:
            text_fail.append((short(k), m['text'], m['value']))
        for f in ('lines', 'src_lines', 'text', 'size', 'sz0', 'ink_on_dark', 'ink_off_page', 'spill', 'text_coll', 'src_ink_off_page'):
            if m[f] != h[f] and not (isinstance(m[f], float) and abs(m[f] - h[f]) < 1e-6):
                diffs[f].append((short(k), h[f], m[f]))
        if (m['size'] < m['sz0'] - 1e-9) != h['shrunk']:
            diffs['shrunk'].append((short(k), h['shrunk'], m['size'], m['sz0']))
        for s in ('a0', 'a1', 'n0', 'n1'):
            d = abs(m['frame'][s] - h['drawn_frame'][s]); maxd['frame.' + s] = max(maxd['frame.' + s], d)
            if d > 0.011:
                diffs['frame.' + s].append((short(k), h['drawn_frame'][s], round(m['frame'][s], 3)))
        for g, hg in (('container', 'container'), ('free', 'free_dark_or_labels'), ('container_vector', 'container_vector')):
            if g not in m['geo']:
                if hg in h['geometry']:
                    diffs['geo-missing'].append((short(k), g))
                continue
            for s in ('left', 'right', 'up', 'down'):
                d = abs(m['geo'][g][s] - h['geometry'][hg]['drawn'][s]); maxd[f'{g}.{s}'] = max(maxd[f'{g}.{s}'], d)
                if d > 0.021:
                    diffs[f'{g}.{s}'].append((short(k), h['geometry'][hg]['drawn'][s], round(m['geo'][g][s], 3)))
        if abs(m['src_left_edge'] - h['src_left_edge']) > 0.006:
            diffs['src_left_edge'].append((short(k), h['src_left_edge'], m['src_left_edge']))
    print(f'==== {T}: text sentinel fails {len(text_fail)} {text_fail[:3]}')
    print('   max |diff| (pt):', {k: round(v, 4) for k, v in sorted(maxd.items())})
    for f, L in diffs.items():
        print(f'   DIFF {f} ({len(L)}):', L[:12])
