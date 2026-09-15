#!/usr/bin/env python3
"""Overflow (D-floor) lists, independently:
 A. the composer's compose-report.json `overflow` / `openFallback` per tag (named)
 B. my recomputation: widest sidecar word at the DRAWN base size (cairo, face of the block's first run) vs budget
    (box/cell: census R-L-2PAD; open: FR-FL-2PAD; census = c3b/census.json, inherited) -> the set that SHOULD be named
 C. geometric overhang from MY drawn extents: blocks whose drawn frame leaves [L+PAD, R-PAD] (box/cell) or
    [FL+PAD, FR-PAD] (open) by > 0.01 pt, and blocks leaving the container/free box itself (margin < 0) - named, with
    whether they are in A
 D. vertical: boxes whose glyph extent leaves [D+PAD, U-PAD]; cells leaving [D+min(PAD,srcdown), U-min(PAD,srcup)]
 E. named spot values: empform b8, flowchart b13/b14, combmap b8, b10-b14, moleratio2 b3 margins
"""
import json, sys, re, collections, math
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
ROOT = Path('/home/siggi/dev/scratch-c140'); R2 = ROOT / 'r2'; ME = ROOT / 'r2v-numbers'
SIDE = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
CEN = json.loads((ROOT / 'c3b/census.json').read_text())
BL = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'blocks.jsonl'))}
mctx = cairo.Context(cairo.ImageSurface(cairo.FORMAT_A8, 8, 8))
CELLS = {'V5_p2.0_f7.0': (2.0, 7.0), 'V5_p2.0_f7.5': (2.0, 7.5), 'V5_p2.0_f8.0': (2.0, 8.0),
         'V5_p2.5_f7.0': (2.5, 7.0), 'V5_p2.5_f7.5': (2.5, 7.5), 'V5_p2.5_f8.0': (2.5, 8.0), 'CTRL_V5_p2.0_f9.0': (2.0, 9.0)}
short = lambda b, i: f"{b.replace('CNX_Chem_', '')} b{i}"
FIGS = {b: Fig(b, items_dir=R2 / 'work/V0', diag_dir=R2 / 'work/V0') for b in names()}


def cls_of(r):
    c = r['container']
    return 'open' if c['final'] != 'BOUNDED' else ('box' if c['dark'] == 'BOUNDED' and not c['textured'] else 'cell')


# census L/R vs measure-container L/R (same geometry for budget and contact?)
geo_mis = []
for T in ['V5_p2.0_f7.0']:
    for r in map(json.loads, open(ME / 'out' / f'mym-{T}.jsonl')):
        ce = CEN[f"{r['basename']}#{r['block']}"]
        if ce['cls'] == 'BOUNDED':
            g = r['geo']['container']
            if abs(ce['L'] - g['L']) > 0.011 or abs(ce['R'] - g['R']) > 0.011:
                geo_mis.append((short(r['basename'], r['block']), ce['container_source'], round(ce['L'], 2), round(g['L'], 2), round(ce['R'], 2), round(g['R'], 2)))
        g = r['geo']['free']
        if abs(ce['FL'] - g['L']) > 0.011 or abs(ce['FR'] - g['R']) > 0.011:
            geo_mis.append(('free', short(r['basename'], r['block']), round(ce['FL'], 2), round(g['L'], 2), round(ce['FR'], 2), round(g['R'], 2)))
print('census L/R (budget geometry) vs measure container/free L/R, mismatches > 0.011 pt:', geo_mis)

ALL = {}
for T, (PAD, F) in CELLS.items():
    rep_over, rep_fb = [], []
    for b in names():
        rp = json.loads((R2 / 'work' / T / b / 'compose-report.json').read_text())
        rep_over += [(short(b, o['block']), o['word'], o['need_pt'], o['budget_pt'], o['size'], o['cls']) for o in rp.get('overflow', [])]
        rep_fb += [(short(b, o['block']), o['word']) for o in rp.get('openFallback', [])]
    named = {x[0] for x in rep_over}
    mine = {(r['basename'], r['block']): r for r in map(json.loads, open(ME / 'out' / f'mym-{T}.jsonl'))}
    should, horiz_out, box_out, vert, spot = [], [], [], [], {}
    for (b, bi), r in sorted(mine.items()):
        ce = CEN[f'{b}#{bi}']; cl = cls_of(BL[(b, bi)]); fig = FIGS[b]
        run0 = fig.blocks[bi][0]; bold = run0['font'] in fig.bold_fonts
        words = r['value'].split()
        ww, wword = max((measure_adv(mctx, w, r['size'], bold, False), w) for w in words)
        if cl in ('box', 'cell'):
            lo, hi, budget = ce['L'] + PAD, ce['R'] - PAD, ce['R'] - ce['L'] - 2 * PAD
            outer = (ce['L'], ce['R'])
        else:
            lo, hi, budget = ce['FL'] + PAD, ce['FR'] - PAD, ce['FR'] - ce['FL'] - 2 * PAD
            outer = (ce['FL'], ce['FR'])
        a0, a1 = r['frame']['a0'], r['frame']['a1']
        if ww > budget + 1e-6:
            should.append((short(b, bi), wword, round(ww, 2), round(budget, 2), r['size'], cl))
        ov = max(lo - a0, a1 - hi)
        if ov > 0.01:
            horiz_out.append((short(b, bi), cl, round(lo - a0, 2), round(a1 - hi, 2), short(b, bi) in named))
        ob = max(outer[0] - a0, a1 - outer[1])
        if ob > 0.0:
            box_out.append((short(b, bi), cl, round(a0 - outer[0], 2), round(outer[1] - a1, 2), short(b, bi) in named))
        if cl == 'box':
            vlo, vhi = ce['D'] + PAD, ce['U'] - PAD
            if r['frame']['n0'] < vlo - 0.01 or r['frame']['n1'] > vhi + 0.01:
                vert.append((short(b, bi), 'box', round(r['frame']['n0'] - ce['D'], 2), round(ce['U'] - r['frame']['n1'], 2)))
        elif cl == 'cell':
            sd = BL[(b, bi)]['container']['src_margin_down_pt']; su = BL[(b, bi)]['container']['src_margin_up_pt']
            if r['frame']['n0'] < ce['D'] + min(PAD, sd) - 0.01 or r['frame']['n1'] > ce['U'] - min(PAD, su) + 0.01:
                vert.append((short(b, bi), 'cell', round(r['frame']['n0'] - ce['D'], 2), round(ce['U'] - r['frame']['n1'], 2)))
        if short(b, bi) in ('03_03_empform b8', '04_03_flowchart b13', '04_03_flowchart b14', '04_05_combmap_img b8', '04_05_combmap_img b10',
                            '04_05_combmap_img b11', '04_05_combmap_img b12', '04_05_combmap_img b13', '04_05_combmap_img b14', '04_03_moleratio2_img b3',
                            '04_03_ethene_img b0'):
            spot[short(b, bi)] = dict(cls=cl, size=r['size'], word=wword, need=round(ww, 2), budget=round(budget, 2),
                                      margin_L=round(a0 - outer[0], 2), margin_R=round(outer[1] - a1, 2))
    ALL[T] = dict(rep=rep_over, fb=rep_fb, should=should, horiz_out=horiz_out, box_out=box_out, vert=vert, spot=spot)
    print(f'\n==== {T}  (PAD {PAD}, F {F})')
    print(f' A compose-report overflow ({len(rep_over)}):', rep_over)
    print(f'   openFallback ({len(rep_fb)}):', rep_fb)
    print(f' B widest word > budget at drawn size ({len(should)}):', should)
    print('   B set == A set:', {x[0] for x in should} == named, ' in B not A:', sorted({x[0] for x in should} - named), ' in A not B:', sorted(named - {x[0] for x in should}))
    print(f' C drawn frame outside [lo+PAD, hi-PAD] by >0.01 pt ({len(horiz_out)}) (name, cls, over-left, over-right, named?):', horiz_out)
    print(f'   drawn frame outside the container/free box itself ({len(box_out)}) (name, cls, margin L, margin R, named?):', box_out)
    print(f' D vertical outside budget ({len(vert)}):', vert)
    print(' E spot:', json.dumps(spot, ensure_ascii=False))
(ME / 'out' / 'overflow.json').write_text(json.dumps(ALL, ensure_ascii=False, indent=1))
