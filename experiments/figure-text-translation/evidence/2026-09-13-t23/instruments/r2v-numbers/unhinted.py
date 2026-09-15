#!/usr/bin/env python3
"""Sensitivity of the margin/overflow numbers to the width METRIC.
The composer measures with cairo's default (hinted metrics at 200 dpi). The font's own advances (= PDF adv, =
cairo HINT_METRICS_OFF) are ~0.6% wider. Browser rendering of the SVG at scales other than 2.778 px/pt is
neither (c2, inherited). Here: re-measure every drawn layout line with HINT_METRICS_OFF, grow it about its
alignment anchor (box/centre: both sides by d/2; left: right side by d; right: left side by d), and report which
blocks' contact (<1 pt, BOUNDED) / overflow-into-pad / crosses-container-or-free-box verdicts FLIP.
Population: 176 layout blocks per cell; unit: block."""
import json, sys, math, collections
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
ROOT = Path('/home/siggi/dev/scratch-c140'); R2 = ROOT / 'r2'; ME = ROOT / 'r2v-numbers'
CEN = json.loads((ROOT / 'c3b/census.json').read_text())
BL = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'blocks.jsonl'))}


def ctx_for(hm):
    c = cairo.Context(cairo.ImageSurface(cairo.FORMAT_A8, 8, 8)); fo = cairo.FontOptions(); fo.set_hint_metrics(hm); c.set_font_options(fo); return c


ON, OFF = ctx_for(cairo.HINT_METRICS_DEFAULT), ctx_for(cairo.HINT_METRICS_OFF)
short = lambda b, i: f"{b.replace('CNX_Chem_', '')} b{i}"


def cls_of(r):
    c = r['container']
    return 'open' if c['final'] != 'BOUNDED' else ('box' if c['dark'] == 'BOUNDED' and not c['textured'] else 'cell')


for T, PAD in (('V5_p2.0_f7.0', 2.0), ('V5_p2.0_f7.5', 2.0)):
    diag = {}
    for b in names():
        for d in json.loads((R2 / 'work' / T / b / 'diag.json').read_text()):
            diag[(b, d['block'])] = d
    mine = {(r['basename'], r['block']): r for r in map(json.loads, open(ME / 'out' / f'mym-{T}.jsonl'))}
    flips = collections.defaultdict(list); maxrel = 0.0; ratios = []
    for k, r in sorted(mine.items()):
        b, bi = k
        fig = Fig(b, items_dir=R2 / 'work' / T, diag_dir=R2 / 'work' / T)
        its = fig.block_items(bi)
        al = diag[k]['align']; cl = cls_of(BL[k]); ce = CEN[f'{b}#{bi}']
        # per geometric line: hinted vs unhinted width
        t = math.radians(its[0]['rot'])
        lines = collections.defaultdict(list)
        for it in its:
            lines[it.get('r2line', 0) if 'r2line' in it else id(it)].append(it)
        ext_on = []; ext_off = []
        for li, l in enumerate(r['line_extents']):
            e0, e1 = l
            # find items on this line by along range
            lits = [it for it in its if e0 - 0.01 <= it['x'] * math.cos(t) + it['y'] * math.sin(t) <= e1 + 0.01]
        # simpler & exact: use my line text list and item grouping by r2line is forbidden; regroup via my rows' text
        wo = []; wf = []
        for txt_line, (e0, e1) in zip(r['text'], r['line_extents']):
            # width of the line as drawn: sum over items whose along start lies in [e0, e1] on this line's normal cluster
            pass
        # per item: hinted and unhinted advance; grow each LINE by the sum of its items' deltas
        # line membership: nearest line extent by along-start and normal (my grouping reproduced from the row's order)
        from collections import defaultdict
        base = r['size']
        normals = sorted({round(-it['x'] * math.sin(t) + it['y'] * math.cos(t), 2) for it in its if abs(it['size'] - base) < 1e-6}, reverse=True)
        # cluster normals
        cl_n = []
        for n in normals:
            if cl_n and abs(cl_n[-1][-1] - n) < 0.3 * r['sz0']:
                cl_n[-1].append(n)
            else:
                cl_n.append([n])
        centres = [sum(c) / len(c) for c in cl_n]
        delta = defaultdict(float); won = defaultdict(float)
        for it in its:
            n = -it['x'] * math.sin(t) + it['y'] * math.cos(t)
            j = min(range(len(centres)), key=lambda j: abs(centres[j] - n))
            for c, store in ((ON, won), (OFF, None)):
                pass
            c1 = ON; c2 = OFF
            for c in (c1, c2):
                c.select_font_face(FAMILY, cairo.FONT_SLANT_ITALIC if it['italic'] else cairo.FONT_SLANT_NORMAL,
                                   cairo.FONT_WEIGHT_BOLD if it['bold'] else cairo.FONT_WEIGHT_NORMAL)
                c.set_font_size(it['size'] * S)
            a_on = c1.text_extents(it['text']).x_advance / S; a_off = c2.text_extents(it['text']).x_advance / S
            delta[j] += a_off - a_on; won[j] += a_on
        assert len(centres) == r['lines'], (k, len(centres), r['lines'])
        a0s, a1s = [], []
        for j, (e0, e1) in enumerate(r['line_extents']):
            d = delta[j]
            if won[j] > 0:
                ratios.append(d / won[j])
            if cl == 'box' or al == 'center':
                a0s.append(e0 - d / 2); a1s.append(e1 + d / 2)
            elif al == 'left':
                a0s.append(e0); a1s.append(e1 + d)
            else:
                a0s.append(e0 - d); a1s.append(e1)
        A0n, A1n = min(a0s), max(a1s); A0, A1 = r['frame']['a0'], r['frame']['a1']
        if cl in ('box', 'cell'):
            L, R = ce['L'], ce['R']
            m_on, m_off = round(min(A0 - L, R - A1), 2), round(min(A0n - L, R - A1n), 2)
            if (m_on < 1.0) != (m_off < 1.0):
                flips['contact'].append((short(b, bi), cl, m_on, m_off))
        else:
            L, R = ce['FL'], ce['FR']
            m_on, m_off = round(min(A0 - L, R - A1), 2), round(min(A0n - L, R - A1n), 2)
            if (m_on >= 1.0) != (m_off >= 1.0):
                flips['open-free-margin-1pt'].append((short(b, bi), m_on, m_off))
        if (m_on >= 0) != (m_off >= 0):
            flips['crosses-edge'].append((short(b, bi), cl, m_on, m_off))
        if (m_on >= PAD - 0.01) != (m_off >= PAD - 0.01):
            flips['into-pad'].append((short(b, bi), cl, m_on, m_off))
    print(f'==== {T}: unhinted/hinted line width ratio - 1: min {min(ratios):.4f} median {sorted(ratios)[len(ratios)//2]:.4f} max {max(ratios):.4f} over {len(ratios)} lines')
    for nm, L_ in flips.items():
        print(f'  flips {nm} ({len(L_)}): {L_}')
