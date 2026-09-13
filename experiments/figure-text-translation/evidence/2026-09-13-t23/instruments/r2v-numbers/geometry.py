#!/usr/bin/env python3
"""Rulings geometry (d) with MY line extents (cairo advance of items) and my own source anchors.
box : every line centre vs (L+R)/2 (census L/R, inherited).
cell: my own alignment from inherited c3 source margins (ratio far/tight >= 20 -> flush to tight side, else centre;
      multi-line -> c3 FT verdict) and displacement = drawn alignment edge - source anchor, with the source anchor
      computed two ways: (A) Liberation Sans cairo widths of the run texts (the prototype's formula) and
      (B) the runs' own PDF advances (source truth).
open: independent step proxy from geometry (shrunk?, displaced?, lines vs n_t) vs the composer's diag step label.
"""
import json, sys, collections, math
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
ROOT = Path('/home/siggi/dev/scratch-c140'); R2 = ROOT / 'r2'; ME = ROOT / 'r2v-numbers'
CEN = json.loads((ROOT / 'c3b/census.json').read_text())
R2C = json.loads((R2 / 'census.json').read_text())
BL = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'blocks.jsonl'))}
mctx = cairo.Context(cairo.ImageSurface(cairo.FORMAT_A8, 8, 8))
short = lambda b, i: f"{b.replace('CNX_Chem_', '')} b{i}"
FIGS = {b: Fig(b, items_dir=R2 / 'work/V0', diag_dir=R2 / 'work/V0') for b in names()}


def cls_of(r):
    c = r['container']
    return 'open' if c['final'] != 'BOUNDED' else ('box' if c['dark'] == 'BOUNDED' and not c['textured'] else 'cell')


def anchors(fig, bi):
    ls = FT.lines(fig.blocks[bi])
    starts = [FT.along(l[0]) for l in ls]
    wA = [sum(measure_adv(mctx, r['text'], r['size'], r['font'] in fig.bold_fonts) for r in l) for l in ls]
    wB = [max(FT.along(r) + r['adv'] for r in l) - FT.along(l[0]) for l in ls]
    out = {}
    for nm, w in (('A', wA), ('B', wB)):
        out[nm] = dict(left=min(starts), right=max(s + x for s, x in zip(starts, w)), center=sum(s + x / 2 for s, x in zip(starts, w)) / len(ls))
    return out, len(ls)


for T, PAD in (('V5_p2.0_f7.0', 2.0), ('V5_p2.0_f7.5', 2.0), ('V5_p2.5_f7.0', 2.5)):
    mine = {(r['basename'], r['block']): r for r in map(json.loads, open(ME / 'out' / f'mym-{T}.jsonl'))}
    diag = {}
    for b in names():
        for d in json.loads((R2 / 'work' / T / b / 'diag.json').read_text()):
            diag[(b, d['block'])] = d
    box_bad, cell_rows, align_disagree, open_rows = [], [], [], collections.defaultdict(list)
    cell_disp = []; abdiff = []
    for k, r in sorted(mine.items()):
        b, bi = k; bl = BL[k]; cl = cls_of(bl); ce = CEN[f'{b}#{bi}']; fig = FIGS[b]
        if cl == 'box':
            c = (ce['L'] + ce['R']) / 2
            worst = max(abs((e0 + e1) / 2 - c) for e0, e1 in r['line_extents'])
            if worst > 0.5:
                box_bad.append((short(*k), round(worst, 3)))
            continue
        an, nsrc = anchors(fig, bi)
        if cl == 'cell':
            ml, mr = bl['container']['src_margin_left_pt'], bl['container']['src_margin_right_pt']
            if nsrc > 1:
                al = bl['align']['verdict'] if bl['align']['verdict'] in ('left', 'right', 'center') else 'center'
            else:
                tight, far = min(ml, mr), max(ml, mr)
                al = ('left' if ml < mr else 'right') if (tight > 0 and far / tight >= 20) or (tight == 0 and far > 0) else 'center'
            if al != R2C[f'{b}#{bi}']['cell_align']:
                align_disagree.append((short(*k), al, R2C[f'{b}#{bi}']['cell_align'], ml, mr))
            ex = r['line_extents']
            edge = {'left': [e0 for e0, _ in ex], 'right': [e1 for _, e1 in ex], 'center': [(e0 + e1) / 2 for e0, e1 in ex]}[al]
            spread = max(edge) - min(edge)
            dA = (sum(edge) / len(edge)) - an['A'][al]; dB = (sum(edge) / len(edge)) - an['B'][al]
            cell_rows.append((short(*k), al, round(dA, 2), round(dB, 2), round(spread, 3)))
            if abs(dA) > 0.01:
                cell_disp.append((short(*k), al, round(dA, 2), round(diag[k]['r2']['disp_pt'], 2)))
            if abs(dA - dB) > 0.25:
                abdiff.append((short(*k), al, round(an['A'][al], 2), round(an['B'][al], 2), round(dA - dB, 2)))
            continue
        # open: independent step proxy
        d = diag[k]; st = d['r2']['step']; al = d['r2']['align']
        ex = r['line_extents']
        edge = {'left': [e0 for e0, _ in ex], 'right': [e1 for _, e1 in ex], 'center': [(e0 + e1) / 2 for e0, e1 in ex]}[al]
        disp = (sum(edge) / len(edge)) - an['A'][al]
        shr = r['size'] < r['sz0'] - 1e-9
        n_t = min(nsrc, r['words'])
        if r['lines'] > n_t:
            proxy = 'iv-gain'
        elif not shr:
            proxy = 'ii' if abs(disp) > 0.01 else 'i(or ii with 0 clamp)'
        else:
            proxy = 'iii-displaced' if abs(disp) > 0.01 else 'iii-anchor or iv-overflow'
        open_rows[st].append((short(*k), proxy, round(disp, 2), r['size']))
    print(f'\n==== {T}')
    print(' box: lines whose centre is > 0.5 pt from (L+R)/2:', box_bad, ' (population 66 boxes)')
    print(' cell alignment: my rule vs builder census cell_align disagreements:', align_disagree)
    print(' cell align counts (mine):', dict(collections.Counter(x[1] for x in cell_rows)))
    print(' cells right-flush:', [x[0] for x in cell_rows if x[1] == 'right'])
    print(' cells with |displacement| > 0.01 pt (anchor A) (name, align, mine, diag disp):', cell_disp)
    print(' cells whose alignment edges spread > 0.5 pt across lines:', [x for x in cell_rows if x[4] > 0.5])
    print(' cells where anchor A (Liberation widths) and B (source advances) differ > 0.25 pt (name, align, A, B, A-B):', abdiff)
    for st, rows in sorted(open_rows.items()):
        prox = collections.Counter(p for _, p, _, _ in rows)
        print(f'  open step {st:14} n={len(rows):3} proxy {dict(prox)}' + ('' if st == 'i' else f'  {rows}'))
