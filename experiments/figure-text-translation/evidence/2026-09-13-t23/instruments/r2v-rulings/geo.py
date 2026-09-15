#!/usr/bin/env python3
"""r2v-rulings: INDEPENDENT ruling-conformance geometry for r2's V5 cells (scratch, read-only inputs).

Measures from items.json (drawn items) + c3/blocks.jsonl (raw container geometry), NOT from the builder's
sentinels/diag conformance tables. diag.json is read only for the OPEN step label (to test ORDER).

usage: geo.py TAG [--control]     TAG = work/<TAG> under r2, e.g. V5_p2.0_f7.5_dec
Output: r2v-rulings/geo-<TAG>.json (+ printed summary)
"""
import json, math, sys, re, copy, collections
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *          # Fig, measure_adv, draw_items, a8_array, new_a8, S, ASC, DESC, FT
from pathlib import Path

R2 = Path('/home/siggi/dev/scratch-c140/r2')
OUT = Path('/home/siggi/dev/scratch-c140/r2v-rulings')
TAG = sys.argv[1]
CONTROL = '--control' in sys.argv
m = re.match(r'V5_p([\d.]+)_f([\d.]+)', TAG)
PAD, F = float(m.group(1)), float(m.group(2))
ROWS = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'blocks.jsonl'))}
CEN = json.loads((R2 / 'census.json').read_text())
msurf = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); mctx = cairo.Context(msurf)


def cls_of(r):
    c = r['container']
    if c['final'] != 'BOUNDED':
        return 'open'
    return 'box' if (c['dark'] == 'BOUNDED' and not c['textured']) else 'cell'


def adv(it):
    return measure_adv(mctx, it['text'], it['size'], it['bold'], it['italic'])


def group_lines(items):
    """geometry only: cluster base-size items on the text normal; styled (smaller) items go to nearest."""
    base = max(it['size'] for it in items)
    bases = sorted([it for it in items if it['size'] >= base - 0.01], key=lambda it: -FT.proj(it))
    lines = []
    for it in bases:
        p = FT.proj(it)
        if lines and abs(lines[-1]['p'] - p) < 0.5 * base:
            lines[-1]['items'].append(it)
        else:
            lines.append(dict(p=p, items=[it]))
    for it in items:
        if it['size'] < base - 0.01:
            p = FT.proj(it)
            min(lines, key=lambda L: abs(L['p'] - p))['items'].append(it)
    for L in lines:
        L['a0'] = min(FT.along(it) for it in L['items'])
        L['a1'] = max(FT.along(it) + adv(it) for it in L['items'])
        L['w'] = L['a1'] - L['a0']
        L['text'] = ''.join(it['text'] for it in sorted(L['items'], key=FT.along))
    return base, lines


def ink_along(fig, items):
    """ink extent along the text direction of a set of items (rendered alone, A8)."""
    surf, ctx = new_a8(fig, 0)
    draw_items(ctx, fig, items, 0)
    a = a8_array(surf)
    ys, xs = np.nonzero(a > 60)
    if len(xs) == 0:
        return None
    rot = items[0]['rot']; t = math.radians(rot)
    X = xs / S; Y = fig.H - ys / S
    al = X * math.cos(t) + Y * math.sin(t); pr = -X * math.sin(t) + Y * math.cos(t)
    return float(al.min()), float(al.max()), float(pr.min()), float(pr.max())


names_ = names()
res = dict(tag=TAG, pad=PAD, floor=F, box=[], cell=[], open=[], floor_viol=[], below_F_literal=[],
           overflow_missing=[], overflow_extra=[], overflow_need_mismatch=[], line_tag_mismatch=[],
           overflow_multiword_lines_over_budget=[])
controls = {}

for b in names_:
    fig = Fig(b, items_dir=R2 / 'work' / TAG, diag_dir=R2 / 'work' / TAG)
    rep = json.loads((R2 / 'work' / TAG / b / 'compose-report.json').read_text())
    over_rep = {o['block']: o for o in rep.get('overflow', [])}
    blocks_here = sorted(bi for (bb, bi) in ROWS if bb == b)
    seen_over = set()
    for bi in blocks_here:
        r = ROWS[(b, bi)]; ce = CEN[f'{b}#{bi}']
        cl = cls_of(r)
        assert cl == ce['r2cls']
        items = [it for it in fig.block_items(bi) if it['path'] == 'layout']
        if CONTROL:
            items = copy.deepcopy(items)
            if (b, bi) == ('CNX_Chem_04_05_combmap_img', 0):
                for it in items: it['x'] += 1.0          # box centring must fire
            if (b, bi) == ('CNX_Chem_03_01_alsulfatemass_img', 13):
                for it in items: it['x'] -= 1.0          # right-flush cell must fire
            if (b, bi) == ('CNX_Chem_04_04_sandwich', 5):
                for it in items: it['x'] -= 1.0          # flush-right OPEN must fire
            if (b, bi) == ('CNX_Chem_03_02_argon_img-9025', 2):
                for it in items: it['size'] = it['size'] * (F - 0.5) / 9.0 if it['size'] >= 8.9 else it['size']  # floor must fire
            if (b, bi) == ('CNX_Chem_03_03_empform', 2):
                items[0]['text'] = items[0]['text'] + 'XXXXXXXXXXXXXXXX'   # overflow-missing must fire
        assert items, (b, bi)
        sz0 = r['src']['sz0']
        base, lines = group_lines(items)
        # line-tag cross-check
        geo_sets = sorted(sorted((it['r2seg'], round(it['x'], 3)) for it in L['items']) for L in lines)
        tagd = collections.defaultdict(list)
        for it in items:
            tagd[it['r2line']].append((it['r2seg'], round(it['x'], 3)))
        tag_sets = sorted(sorted(v) for v in tagd.values())
        if geo_sets != tag_sets:
            res['line_tag_mismatch'].append(f'{b}#{bi}')
        e0 = min(L['a0'] for L in lines); e1 = max(L['a1'] for L in lines)
        top = max(L['p'] for L in lines) + ASC * base; bot = min(L['p'] for L in lines) - DESC * base
        src_lb = fig.src_line_boxes(bi)
        s_a0 = min(x[0] for x in src_lb); s_a1 = max(x[1] for x in src_lb)
        s_cent = sum((x[0] + x[1]) / 2 for x in src_lb) / len(src_lb)
        rec = dict(key=f'{b}#{bi}', text=[L['text'] for L in lines], n=len(lines), n_src=len(src_lb), size=base, sz0=sz0)
        # floor
        if base < min(F, sz0) - 1e-6:
            res['floor_viol'].append(dict(key=f'{b}#{bi}', size=base, floor_eff=min(F, sz0)))
        if base < F - 1e-6:
            res['below_F_literal'].append(dict(key=f'{b}#{bi}', size=base, sz0=sz0))
        if cl in ('box', 'cell'):
            L_, R_, D_, U_ = ce['L'], ce['R'], ce['D'], ce['U']
            rb = r['container']['region_bbox_pt']
            budget = (R_ - L_) - 2 * PAD
            lo, hi = L_ + PAD, R_ - PAD
        else:
            L_, R_ = ce['FL'], ce['FR']
            budget = (R_ - L_) - 2 * PAD
            lo, hi = L_ + PAD, R_ - PAD
        maxw = max(L['w'] for L in lines)
        over_extent = max(lo - e0, e1 - hi, 0.0)
        rec.update(budget=round(budget, 3), maxw=round(maxw, 3), extent=[round(e0, 3), round(e1, 3)],
                   over_budget=round(max(0.0, maxw - budget), 3), outside_pad=round(over_extent, 3))
        in_rep = bi in over_rep
        if maxw > budget + 0.05 and not in_rep:
            res['overflow_missing'].append(dict(key=f'{b}#{bi}', maxw=round(maxw, 3), budget=round(budget, 3), cls=cl, lines=rec['text']))
        if in_rep:
            seen_over.add(bi)
            o = over_rep[bi]
            if maxw <= budget + 0.05:
                res['overflow_extra'].append(dict(key=f'{b}#{bi}', maxw=round(maxw, 3), budget=round(budget, 3)))
            # need_pt is the widest WORD; for one-word lines it must equal my line width
            one_word_lines = [L for L in lines if ' ' not in L['text'].strip()]
            wmax1 = max((L['w'] for L in one_word_lines), default=None)
            if wmax1 is not None and abs(wmax1 - o['need_pt']) > 0.1 and o['word'] in [L['text'].strip() for L in one_word_lines]:
                res['overflow_need_mismatch'].append(dict(key=f'{b}#{bi}', need=o['need_pt'], mine=round(wmax1, 3)))
            if abs(budget - o['budget_pt']) > 0.05:
                res['overflow_need_mismatch'].append(dict(key=f'{b}#{bi}', budget_rep=o['budget_pt'], budget_mine=round(budget, 3)))
            multi = [L for L in lines if ' ' in L['text'].strip() and L['w'] > budget + 0.05]
            if multi:
                res['overflow_multiword_lines_over_budget'].append(dict(key=f'{b}#{bi}', lines=[(L['text'], round(L['w'], 2)) for L in multi], budget=round(budget, 2)))
        if cl == 'box':
            cC = (L_ + R_) / 2; cRB = (rb[0] + rb[2]) / 2
            offs = []; inkoffs = []
            for L in lines:
                offs.append((L['a0'] + L['a1']) / 2 - cC)
                ia = ink_along(fig, L['items'])
                inkoffs.append((ia[0] + ia[1]) / 2 - cC if ia else None)
            ink_all = ink_along(fig, items)
            rec.update(centre_off=[round(x, 3) for x in offs], centre_off_regionbbox=[round((L['a0'] + L['a1']) / 2 - cRB, 3) for L in lines],
                       ink_centre_off=[round(x, 3) if x is not None else None for x in inkoffs],
                       L_minus_rbL=round(L_ - rb[0], 3), R_minus_rbR=round(R_ - rb[2], 3),
                       margin_left=round(e0 - L_, 3), margin_right=round(R_ - e1, 3),
                       glyph_up=round(U_ - top, 3), glyph_down=round(bot - D_, 3),
                       ink_up=round(U_ - ink_all[3], 3) if ink_all else None, ink_down=round(ink_all[2] - D_, 3) if ink_all else None,
                       vcentre_off=round((top + bot) / 2 - (D_ + U_) / 2, 3))
            res['box'].append(rec)
        elif cl == 'cell':
            al = ce['cell_align']
            if al == 'right':
                d_anchor = e1; s_anchor = s_a1
            elif al == 'left':
                d_anchor = e0; s_anchor = s_a0
            else:
                d_anchor = sum((L['a0'] + L['a1']) / 2 for L in lines) / len(lines); s_anchor = s_cent
            per_line_anchor = [{'right': L['a1'], 'left': L['a0'], 'center': (L['a0'] + L['a1']) / 2}[al] for L in lines]
            rec.update(align=al, src_margin_left=round(s_a0 - L_, 3), src_margin_right=round(R_ - s_a1, 3),
                       drawn_margin_left=round(e0 - L_, 3), drawn_margin_right=round(R_ - e1, 3),
                       anchor_delta=round(d_anchor - s_anchor, 3),
                       line_anchor_spread=round(max(per_line_anchor) - min(per_line_anchor), 3),
                       touches_pad=bool(abs(e0 - lo) < 0.05 or abs(e1 - hi) < 0.05),
                       inside_cell=bool(e0 >= L_ - 0.01 and e1 <= R_ + 0.01),
                       glyph_up=round(U_ - top, 3), glyph_down=round(bot - D_, 3),
                       src_lines=[(round(x[0], 2), round(x[1], 2)) for x in src_lb])
            res['cell'].append(rec)
        else:
            dg = fig.diag.get(bi, {}).get('r2', {})
            al = ce['open_align_r2']
            if al == 'right':
                d_anchor = e1; s_anchor = s_a1
            elif al == 'left':
                d_anchor = e0; s_anchor = s_a0
            else:
                d_anchor = sum((L['a0'] + L['a1']) / 2 for L in lines) / len(lines); s_anchor = s_cent
            FL, FR = ce['FL'], ce['FR']
            b_i = {'left': FR - s_anchor - PAD, 'right': s_anchor - FL - PAD,
                   'center': 2 * (min(s_anchor - FL, FR - s_anchor) - PAD)}[al]
            b_ii = (FR - FL) - 2 * PAD
            step = dg.get('step')
            chk = []
            maxw_sz0 = maxw * sz0 / base
            maxw_up = maxw * (base + 0.25) / base
            n_t = min(len(src_lb), len(' '.join(fig.diag[bi]['value']).split()))
            if len(lines) != n_t:
                chk.append(f'lines {len(lines)} != n_t {n_t}')
            if step == 'i':
                if abs(d_anchor - s_anchor) > 0.35: chk.append(f'i but anchor moved {d_anchor - s_anchor:.2f}')
                if abs(base - sz0) > 1e-6: chk.append('i but shrunk')
            elif step == 'ii':
                if abs(base - sz0) > 1e-6: chk.append('ii but shrunk')
                if maxw <= b_i + 0.05: chk.append(f'ii but fits at anchor (maxw {maxw:.2f} <= b_i {b_i:.2f})')
                if not (abs(e0 - (FL + PAD)) < 0.05 or abs(e1 - (FR - PAD)) < 0.05): chk.append('ii but displacement not minimal (no pad touch)')
            elif step in ('iii-anchor', 'iii-displaced'):
                if base >= sz0 - 1e-6: chk.append('iii but not shrunk')
                if maxw_up <= b_ii + 0.05: chk.append(f'iii but +0.25pt would fit displaced ({maxw_up:.2f} <= b_ii {b_ii:.2f})')
                if step == 'iii-anchor' and abs(d_anchor - s_anchor) > 0.35: chk.append('iii-anchor but moved')
                if step == 'iii-displaced':
                    if maxw <= b_i + 0.05: chk.append('iii-displaced but fits at anchor at this size')
                    if not (abs(e0 - (FL + PAD)) < 0.05 or abs(e1 - (FR - PAD)) < 0.05): chk.append('iii-displaced but not minimal')
            elif step == 'iv-overflow':
                if base > min(F, sz0) + 1e-6: chk.append('iv-overflow above floor')
            flush = str(ce.get('open_align_r2_why', '')).startswith('single-flush')
            rec.update(align=al, align_why=ce.get('open_align_r2_why'), step=step, anchor_delta=round(d_anchor - s_anchor, 3),
                       b_i=round(b_i, 2), b_ii=round(b_ii, 2), flush=flush, order_problems=chk,
                       src_extent=[round(s_a0, 2), round(s_a1, 2)], free=[round(FL, 2), round(FR, 2)])
            if flush and abs(d_anchor - s_anchor) > 0.35:
                chk.append(f'flush block moved off its tight edge by {d_anchor - s_anchor:.2f}')
            res['open'].append(rec)
    for bi in over_rep:
        if bi not in seen_over:
            res['overflow_extra'].append(dict(key=f'{b}#{bi}', why='reported overflow for a non-layout block?'))

# ---------------- summary ----------------
bx = res['box']
worst = max(bx, key=lambda r: max(abs(x) for x in r['centre_off']))
worst_ink = max(bx, key=lambda r: max(abs(x) for x in r['ink_centre_off'] if x is not None))
print(TAG, 'boxes', len(bx), 'cells', len(res['cell']), 'open', len(res['open']))
print(' box advance-centre |off| max', worst['key'], worst['centre_off'])
print(' box ink-centre |off| max', worst_ink['key'], worst_ink['ink_centre_off'])
print(' boxes with any line |adv off| > 0.5:', [(r['key'], r['centre_off']) for r in bx if max(abs(x) for x in r['centre_off']) > 0.5])
print(' boxes with any line |ink off| > 1.0:', [(r['key'], r['ink_centre_off']) for r in bx if max(abs(x) for x in r['ink_centre_off'] if x is not None) > 1.0])
print(' boxes glyph box outside container (up/down < 0):', [(r['key'], r['glyph_up'], r['glyph_down']) for r in bx if r['glyph_up'] < 0 or r['glyph_down'] < 0])
print(' boxes ink outside container vertically:', [(r['key'], r['ink_up'], r['ink_down']) for r in bx if (r['ink_up'] is not None and r['ink_up'] < 0) or (r['ink_down'] is not None and r['ink_down'] < 0)])
print(' boxes |vcentre off| > 1:', [(r['key'], r['vcentre_off']) for r in bx if abs(r['vcentre_off']) > 1])
print(' box L-rbL / R-rbR max |.|', max(abs(r['L_minus_rbL']) for r in bx), max(abs(r['R_minus_rbR']) for r in bx))
cl_ = res['cell']
print(' cells anchor |delta| > 0.35:', [(r['key'], r['align'], r['anchor_delta'], r['touches_pad']) for r in cl_ if abs(r['anchor_delta']) > 0.35])
print(' cells not inside cell:', [(r['key'], r['drawn_margin_left'], r['drawn_margin_right']) for r in cl_ if not r['inside_cell']])
print(' cells line-anchor spread > 0.35:', [(r['key'], r['align'], r['line_anchor_spread']) for r in cl_ if r['line_anchor_spread'] > 0.35])
print(' cells glyph outside vertically:', [(r['key'], r['glyph_up'], r['glyph_down']) for r in cl_ if r['glyph_up'] < 0 or r['glyph_down'] < 0])
op = res['open']
print(' open steps', collections.Counter(r['step'] for r in op))
print(' open order problems:', [(r['key'], r['step'], r['order_problems']) for r in op if r['order_problems']])
print(' open outside free box by pad:', [(r['key'], r['outside_pad']) for r in op if r['outside_pad'] > 0.05])
for k in ('floor_viol', 'below_F_literal', 'overflow_missing', 'overflow_extra', 'overflow_need_mismatch', 'line_tag_mismatch', 'overflow_multiword_lines_over_budget'):
    print(' ', k, len(res[k]), res[k])
fn = OUT / (f'geo-{TAG}' + ('-CONTROL' if CONTROL else '') + '.json')
fn.write_text(json.dumps(res, ensure_ascii=False, indent=0))
print('wrote', fn)
