#!/usr/bin/env python3
"""Exact (not linearly scaled) re-measure of OPEN shrink necessity + source-anchor instrument delta.

For every OPEN block drawn below sz0: take the DRAWN partition, re-measure it at every larger 0.25 pt step
up to sz0 (each item size scaled by s'/s, cairo toy advances), and test (i) from-anchor budget and (ii)
whole free width - 2 PAD. If the SAME partition fits at a larger size, the min-max partition fits too, so the
shrink was unnecessary (a D-open order violation). Uses BOTH source-anchor instruments:
  adv  = PDF runs' own advances (independent)
  meas = compose.measure re-measurement of the source text in Liberation Sans (what r2v5.py uses)
Also: census of |adv - meas| source-anchor deltas for every OPEN/cell block with a non-centre anchor.
usage: order_exact.py TAG
"""
import json, math, sys, re, collections
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
from pathlib import Path

R2 = Path('/home/siggi/dev/scratch-c140/r2')
TAG = sys.argv[1]
m = re.match(r'V5_p([\d.]+)_f([\d.]+)', TAG)
PAD, F = float(m.group(1)), float(m.group(2))
CEN = json.loads((R2 / 'census.json').read_text())
ROWS = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'blocks.jsonl'))}
msurf = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); mctx = cairo.Context(msurf)
geo = json.loads((Path('/home/siggi/dev/scratch-c140/r2v-rulings') / f'geo-{TAG}.json').read_text())


def adv(it, scale=1.0):
    return measure_adv(mctx, it['text'], it['size'] * scale, it['bold'], it['italic'])


out = dict(shrink_unnecessary=[], shrink_checked=[], anchor_delta=[])
for b in names():
    fig = Fig(b, items_dir=R2 / 'work' / TAG, diag_dir=R2 / 'work' / TAG)
    for (bb, bi), r in ROWS.items():
        if bb != b:
            continue
        ce = CEN[f'{b}#{bi}']
        # source anchors, both instruments
        ls = FT.lines(fig.blocks[bi])
        starts = [FT.along(l[0]) for l in ls]
        w_adv = [max(FT.along(x) + x['adv'] for x in l) - FT.along(l[0]) for l in ls]
        bold = lambda x: FT.run_face(x, fig.meta['fonts'])[0]
        w_meas = [sum(measure_adv(mctx, x['text'], x['size'], x['font'] in fig.bold_fonts) for x in l) for l in ls]
        anc = {}
        for nm, W in (('adv', w_adv), ('meas', w_meas)):
            anc[nm] = {'left': min(starts), 'right': max(s + w for s, w in zip(starts, W)),
                       'center': sum(s + w / 2 for s, w in zip(starts, W)) / len(ls)}
        al = ce.get('cell_align') if ce['r2cls'] == 'cell' else (ce.get('open_align_r2') if ce['r2cls'] == 'open' else 'center')
        if ce['r2cls'] != 'box':
            out['anchor_delta'].append(dict(key=f'{b}#{bi}', cls=ce['r2cls'], align=al,
                                            meas_minus_adv=round(anc['meas'][al] - anc['adv'][al], 3)))
        if ce['r2cls'] != 'open':
            continue
        items = [it for it in fig.block_items(bi) if it['path'] == 'layout']
        base = max(it['size'] for it in items)
        sz0 = r['src']['sz0']
        if base >= sz0 - 1e-6:
            continue
        # drawn partition by r2line tag (geometry cross-check was 176/176 equal in geo.py)
        byl = collections.defaultdict(list)
        for it in items:
            byl[it['r2line']].append(it)
        FL, FR = ce['FL'], ce['FR']
        rec = dict(key=f'{b}#{bi}', size=base, sz0=sz0, align=al, lines=[''.join(i['text'] for i in v) for _, v in sorted(byl.items())], tries=[])
        s = base + 0.25
        while s <= sz0 + 1e-6:
            sc = s / base
            mw = max(sum(adv(it, sc) for it in v) for v in byl.values())
            for nm in ('adv', 'meas'):
                a = anc[nm][al]
                b_i = {'left': FR - a - PAD, 'right': a - FL - PAD, 'center': 2 * (min(a - FL, FR - a) - PAD)}[al]
                b_ii = (FR - FL) - 2 * PAD
                rec['tries'].append(dict(size=s, anchor=nm, maxw=round(mw, 3), b_i=round(b_i, 3), b_ii=round(b_ii, 3),
                                         fits_i=mw <= b_i + 1e-9, fits_ii=mw <= b_ii + 1e-9))
                if (mw <= b_ii + 1e-9) and nm == 'meas':
                    out['shrink_unnecessary'].append(dict(key=rec['key'], drawn=base, fits_at=s, maxw=round(mw, 3), b_ii=round(b_ii, 3), lines=rec['lines']))
            s += 0.25
        out['shrink_checked'].append(rec)

print(TAG, 'OPEN blocks drawn below sz0:', len(out['shrink_checked']))
for rc in out['shrink_checked']:
    t1 = [t for t in rc['tries'] if t['anchor'] == 'meas']
    print('  ', rc['key'], rc['size'], '<-', rc['sz0'], rc['lines'], [(t['size'], t['maxw'], t['b_ii']) for t in t1][:2])
print('SHRINK UNNECESSARY (same partition fits displaced at a larger size):', out['shrink_unnecessary'])
big = sorted([d for d in out['anchor_delta'] if abs(d['meas_minus_adv']) > 0.3 and d['align'] != 'center' or abs(d['meas_minus_adv']) > 0.3], key=lambda d: -abs(d['meas_minus_adv']))
print('source-anchor instrument |meas-adv| > 0.3 pt:', len(big), 'of', len(out['anchor_delta']))
for d in big:
    print('  ', d)
(Path('/home/siggi/dev/scratch-c140/r2v-rulings') / f'order-{TAG}.json').write_text(json.dumps(out, ensure_ascii=False, indent=0))
