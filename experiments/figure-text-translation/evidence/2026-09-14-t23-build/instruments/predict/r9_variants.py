#!/usr/bin/env python3
"""PRED2 COPY of plan/r9/r9_variants.py (the controller's R9 harness). CHANGES: paths -> pred2; `literal` is now
EXPLICIT (len(w) > SHORT_TOKEN) because on the fixed build the module's own cut_allowed IS symbols-only; `symbols` is
the module's own cut_allowed (asserted equal to the ruling's predicate on every word); a CONTROL that `symbols` mode
reproduces the build's diag (lines, size, step) 176/176; the bound flag per mode; a JSON dump.

ORIGINAL DOCSTRING (it was copied from fragility.py and does not describe this file): how close each FINAL layout decision sits to flipping - the predictions most likely to move if the
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
"""
import json, sys
from pathlib import Path
sys.dont_write_bytecode = True
PRED = Path('/home/siggi/dev/scratch-c140/plan/pred2')
INST = PRED / 'inst-C'
sys.path.insert(0, str(INST / 'pylibs')); sys.path.insert(0, str(INST))
import cairo
import figtext as FT
import figscripts as FS
import figlayout as FLY
from blockkey import block_key
PREP = Path('/home/siggi/dev/scratch-c140/prep/figs')
SIDE = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
S = 200.0 / 72.0
_s = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); CTX = cairo.Context(_s)
_fo = cairo.FontOptions(); _fo.set_hint_metrics(cairo.HINT_METRICS_OFF); CTX.set_font_options(_fo)
PAD, EPS = 2.0, 1e-9
ORIG = None


def adv(text, bold, italic, px):
    CTX.select_font_face('Liberation Sans', cairo.FONT_SLANT_ITALIC if italic else cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    CTX.set_font_size(px)
    return CTX.text_extents(text).x_advance / S


out, ctrl_fail = [], []
ORIG = FLY._Partition.cut_allowed
for fd in sorted((PRED / 'work/FINAL').iterdir()):
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
        res = {}
        for mode in ('literal', 'symbols', 'off'):
            if mode == 'literal':
                def ca(self, k):                           # the design spec's literal R9: no cut after ANY 1-2 char word
                    return k == 0 or len(self.words[k - 1][0]) > FLY.SHORT_TOKEN
                FLY._Partition.cut_allowed = ca
            else:
                FLY._Partition.cut_allowed = ORIG          # the fixed build's own rule (symbols only); 'off' ignores it
            lay = FLY.decide(words, width, c, cues, _r9=(mode != 'off'))
            res[mode] = ([''.join(ch for ch, _ in l) for l in lay['lines']], lay['size'], lay['step'], lay['bound'])
        if res['symbols'][:3] != (d['lines'], d['size'], d['step']) or res['symbols'][3] != d['bound']:
            ctrl_fail.append((name, d['block']))
        for w, _ in words:                                 # the module's predicate == the ruling's, word by word
            pr = FLY._Partition([(w, [None] * len(w)), ('x', [None])], width)
            assert ORIG(pr, 1) == (len(w) > 2 or (w.isalpha() and w.islower())), w
        FLY._Partition.cut_allowed = ORIG
        out.append((name.replace('CNX_Chem_', ''), d['block'], c['cls'], cues['n_src'], res))
import collections
cnt = collections.Counter()
for name, bi, cls, nsrc, res in out:
    L, S_, O = (tuple(res[m][:3]) for m in ('literal', 'symbols', 'off'))
    cnt['bound_symbols'] += bool(res['symbols'][3]); cnt['bound_literal'] += bool(res['literal'][3])
    cnt['literal!=off'] += L != O; cnt['symbols!=off'] += S_ != O; cnt['literal!=symbols'] += L != S_
    if L != O or S_ != O:
        print(f"{name} b{bi} [{cls}] src {nsrc} lines")
        print('   off     :', ' | '.join(O[0]), O[1], O[2])
        print('   literal :', ' | '.join(L[0]), L[1], L[2])
        print('   symbols :', ' | '.join(S_[0]), S_[1], S_[2])
print(dict(cnt), 'blocks', len(out), '| CONTROL symbols mode reproduces the build diag (lines, size, step, bound): fail', len(ctrl_fail), ctrl_fail)
nm = lambda x: f"{x[0]} b{x[1]}"
J = dict(symbols_vs_off=[nm(x) for x in out if tuple(x[4]['symbols'][:3]) != tuple(x[4]['off'][:3])],
         literal_vs_symbols=[nm(x) for x in out if tuple(x[4]['literal'][:3]) != tuple(x[4]['symbols'][:3])],
         literal_vs_off=[nm(x) for x in out if tuple(x[4]['literal'][:3]) != tuple(x[4]['off'][:3])],
         bound_symbols_false=[nm(x) for x in out if not x[4]['symbols'][3]], bound_literal_false=[nm(x) for x in out if not x[4]['literal'][3]],
         blocks={nm(x): dict(cls=x[2], n_src=x[3], **{m: dict(lines=x[4][m][0], size=x[4][m][1], step=x[4][m][2], bound=x[4][m][3]) for m in x[4]}) for x in out},
         counts=dict(cnt), control_fail=ctrl_fail)
for k in ('symbols_vs_off', 'literal_vs_symbols', 'literal_vs_off', 'bound_symbols_false', 'bound_literal_false'):
    print(k, len(J[k]), J[k])
(PRED / 'out' / 'r9_variants.json').write_text(json.dumps(J, indent=1, ensure_ascii=False))
