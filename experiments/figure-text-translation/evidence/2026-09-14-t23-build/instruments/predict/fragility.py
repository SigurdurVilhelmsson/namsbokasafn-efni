#!/usr/bin/env python3
"""SUPPLEMENTARY: how close each FINAL layout decision sits to flipping - the predictions most likely to move if the
repository implementation differs from the scratch build by a fraction of a point (a container inset, a metric).

    PYTHONDONTWRITEBYTECODE=1 python3 -u fragility.py     -> ../out/fragility.json (+ stdout)

For each of the 176 blocks, with the FINAL build's own inputs (diag container + cues, figscripts words, compose's
linear width) through figlayout's own _Partition:
  fit margin   budget - (the longest line of the chosen partition at the chosen size)      (>= 0; small = could stop fitting)
  miss margin  (the best the next-larger size could do) - budget, when the block was shrunk  (> 0; small = could grow)
  open i/ii    b_i - m and b_ii - m at the chosen size (which step was taken hinges on these)
  overflow     widest word - budget (> 0; small = could stop overflowing)
  R9           budget - the bound partition's longest line (small = binding could be dropped)
CONTROL: decide() on the same inputs reproduces the FINAL diag (lines, size, step) 176/176.

PRED2 CHANGES (fragility.py.adapt2.diff):
  * argv [INST WORK OUT]: the module tree, the work dir and the output name, so the SAME definitions run on the previous
    build (plan/pred/inst-C + plan/pred/work/FINAL) and on the fixed one (defaults).
  * box/cell margins follow the BUILD'S OWN order. tree-fix (F5) tries every line count n <= n_src, closest first, from
    sz0 down to the floor, before any n > n_src; tree-int tried every size before the next size. So
      miss margin (tree-fix)   minmax(s + 0.25, n) - budget for the CHOSEN count n (height permitting), and
      earlier-count margin     minmax(floor, n') - budget for every count n' ahead of n in that order (height permitting)
      miss margin (tree-int)   min over height-permitted counts of minmax(s + 0.25, m) - budget (unchanged).
    Which order a module uses is read from the module (it has `first_fit`), never assumed.
  * R9 margin is reported only where binding CHANGES the partition (the bound partition != the unconstrained one at the
    chosen size and count); elsewhere it equals the fit margin and names no flip of its own.
  * Unrounded margins are kept in the JSON (6 dp); stdout prints 2 dp.
"""
import json, sys
from pathlib import Path
sys.dont_write_bytecode = True
PRED = Path('/home/siggi/dev/scratch-c140/plan/pred2')
INST = Path(sys.argv[1]) if len(sys.argv) > 1 else PRED / 'inst-C'
WORKF = Path(sys.argv[2]) if len(sys.argv) > 2 else PRED / 'work/FINAL'
OUTNAME = sys.argv[3] if len(sys.argv) > 3 else 'fragility.json'
sys.path.insert(0, str(INST / 'pylibs')); sys.path.insert(0, str(INST))
import cairo
import figtext as FT
import figscripts as FS
import figlayout as FLY
assert Path(FLY.__file__).resolve().parent == INST.resolve(), FLY.__file__
import inspect
F5 = 'first_fit' in inspect.getsource(FLY.decide)
R6 = lambda x: round(x, 6)
from blockkey import block_key
PREP = Path('/home/siggi/dev/scratch-c140/prep/figs')
SIDE = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
S = 200.0 / 72.0
_s = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); CTX = cairo.Context(_s)
_fo = cairo.FontOptions(); _fo.set_hint_metrics(cairo.HINT_METRICS_OFF); CTX.set_font_options(_fo)
PAD, EPS = 2.0, 1e-9


def adv(text, bold, italic, px):
    CTX.select_font_face('Liberation Sans', cairo.FONT_SLANT_ITALIC if italic else cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    CTX.set_font_size(px)
    return CTX.text_extents(text).x_advance / S


out, ctrl_fail = [], []
for fd in sorted(WORKF.iterdir()):
    if not fd.is_dir():
        continue
    name = fd.name
    meta = json.loads((PREP / name / 'meta.json').read_text())
    blocks = FT.merge_blocks(FT.group(json.loads((PREP / name / 'runs.json').read_text())))
    BOLD = {k for k, v in meta['fonts'].items() if 'bold' in v['base'].lower()}
    TR = json.loads((SIDE / f'{name}.is.json').read_text())['blocks']
    for d in json.loads((fd / 'diag.json').read_text()):
        b = blocks[d['block']]; ls = FT.lines(b); assert block_key(b) == d['key']
        toks = FS.source_tokens(b, meta['fonts'])[0]
        words = []
        for para in FT.normalise_block_value(TR[d['key']], False):
            words += FS.words(para, FS.transfer(toks, para)[0] if toks else [None] * len(para))

        def width(chars, size, j):
            fr = ls[min(j, len(ls) - 1)][0]
            segs = FS.segments(chars) or [('', None)]
            if any(st is not None for _, st in segs):
                segs = FS.split_at_word_edges(segs)
            return sum(adv(t, fr['font'] in BOLD, bool(st and st.italic), size * (st.ratio if st else 1.0) * S) for t, st in segs)
        c, cues = d['container'], d['cues']
        lay = FLY.decide(words, width, c, cues)
        got = ([''.join(ch for ch, _ in l) for l in lay['lines']], lay['size'], lay['step'])
        if got != (d['lines'], d['size'], d['step']):
            ctrl_fail.append((name, d['block'], got))
        P = FLY._Partition(words, width)
        s, n, sz0 = lay['size'], len(lay['lines']), cues['sz0']
        row = dict(block=f"{name.replace('CNX_Chem_', '')} b{d['block']}", cls=c['cls'], step=lay['step'], size=s, n=n, n_src=cues['n_src'])
        lead = sz0 * FLY.LEAD
        if c['cls'] in ('box', 'cell'):
            bud = (c['R'] - c['L']) - 2 * PAD; hb = (c['U'] - c['D']) - 2 * PAD
            hok = lambda m, sz: (m - 1) * lead + (FLY.ASC + FLY.DESC) * sz <= hb + EPS
            row['fit_margin'] = R6(bud - P.minmax(s, n))
            if s < sz0 - EPS:
                up = s + FLY.STEP
                if F5:
                    row['miss_margin_next_size'] = R6(P.minmax(up, n) - bud) if hok(n, up) else None
                else:
                    ok_n = [m for m in range(1, len(words) + 1) if hok(m, up)]
                    row['miss_margin_next_size'] = R6(min(P.minmax(up, m) for m in ok_n) - bud) if ok_n else None
            if F5:
                n_src_ = cues['n_src']
                order = sorted(range(1, len(words) + 1), key=lambda m: (m > n_src_, abs(m - n_src_), m))
                ahead = [m for m in order[:order.index(n)] if hok(m, FLY.size_steps(sz0, 7.5)[-1])]
                if ahead:
                    fl = FLY.size_steps(sz0, 7.5)[-1]
                    row['earlier_count_margin'] = R6(min(P.minmax(fl, m) for m in ahead) - bud)
            if lay['overflow']:
                row['overflow_margin'] = R6(lay['overflow']['needPt'] - lay['overflow']['budgetPt'])
            row['height_margin'] = R6(hb - ((n - 1) * lead + (FLY.ASC + FLY.DESC) * s))
            bud_used = max(bud, lay['overflow']['needPt']) if lay['overflow'] else bud
        else:
            FLl, FRr = c['FL'], c['FR']; anc = lay['anchor']; al = lay['align']
            b_i = {'left': FRr - anc - PAD, 'right': anc - FLl - PAD, 'center': 2 * (min(anc - FLl, FRr - anc) - PAD)}[al]
            b_ii = (FRr - FLl) - 2 * PAD
            n_t = min(cues['n_src'], len(words))
            m = P.minmax(s, n_t)
            row.update(b_i_margin=R6(b_i - m), b_ii_margin=R6(b_ii - m))
            if s < sz0 - EPS:
                m_up = P.minmax(s + FLY.STEP, n_t)
                row.update(next_size_b_i_miss=R6(m_up - b_i), next_size_b_ii_miss=R6(m_up - b_ii))
            if lay['overflow']:
                row['overflow_margin'] = R6(lay['overflow']['needPt'] - lay['overflow']['budgetPt'])
            bud_used = lay['budget']
        if lay['bound'] and n > 1 and P.cut(s, n, bound=True) != P.cut(s, n):   # R9 matters only where it moves the cut
            row['r9_bound_margin'] = R6(bud_used - P.minmax(s, n, bound=True))
            row['r9_unbound_lines'] = [''.join(ch for ch, _ in P.chars(a, e)) for a, e in P.cut(s, n)]
        out.append(row)

keys = ('fit_margin', 'miss_margin_next_size', 'earlier_count_margin', 'overflow_margin', 'b_i_margin', 'b_ii_margin', 'next_size_b_i_miss', 'next_size_b_ii_miss', 'r9_bound_margin', 'height_margin')
print('CONTROL decide() reproduces FINAL (lines, size, step): fail', len(ctrl_fail), ctrl_fail[:3])
close = []
for r in out:
    vals = {k: r[k] for k in keys if r.get(k) is not None}
    # the margin that DECIDED the step: for open i the b_i margin; ii/iii-displaced the b_ii margin (and b_i miss); box/cell fit margin
    crit = []
    if r['cls'] in ('box', 'cell'):
        crit += [vals.get('fit_margin')] if r['step'] == 'fit' else []
        crit += [vals.get('miss_margin_next_size'), vals.get('earlier_count_margin'), vals.get('overflow_margin'), vals.get('r9_bound_margin')]
    else:
        if r['step'] in ('i', 'iii-anchor'):
            crit += [vals.get('b_i_margin'), vals.get('next_size_b_ii_miss')]
        elif r['step'] in ('ii', 'iii-displaced'):
            crit += [vals.get('b_ii_margin'), -vals.get('b_i_margin') if 'b_i_margin' in vals else None, vals.get('next_size_b_ii_miss')]
        crit += [vals.get('overflow_margin'), vals.get('r9_bound_margin')]
    crit = [x for x in crit if x is not None]
    r['critical'] = min(crit, key=abs) if crit else None
    if crit and abs(r['critical']) < 0.3:
        close.append(r)
print(f'build {INST} | box/cell order: {"line count before size (F5)" if F5 else "size before line count"}')
print(f'decisions within 0.3 pt of flipping ({len(close)} of {len(out)}):')
for r in sorted(close, key=lambda r: abs(r['critical'])):
    print('   ', json.dumps({k: (f'{v:.2f}' if isinstance(v, float) and k not in ('size',) else v) for k, v in r.items()}, ensure_ascii=False))
(PRED / 'out' / OUTNAME).write_text(json.dumps(dict(build=str(INST), work=str(WORKF), f5_order=F5, control_fail=ctrl_fail, blocks=out, close=close), indent=1, ensure_ascii=False))
