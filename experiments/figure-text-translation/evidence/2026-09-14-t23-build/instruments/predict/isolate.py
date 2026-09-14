#!/usr/bin/env python3
"""PRED2: which fix moves which DECISION on the 176 layout blocks - each fix alone, on the fixed build's own inputs.

    PYTHONDONTWRITEBYTECODE=1 python3 -u isolate.py      -> ../out/isolate.json (+ stdout)

The fix round shipped its changes as isolated diffs against tree-int (tree-fix/diffs-fix/iso-F*.diff); pred2/iso/F<k>/
holds tree-int's module with exactly one of them applied (`patch`), and the combined figlayout diff applied to
tree-int reproduces tree-fix/figlayout.py byte for byte (checked when iso/ was built).

  F1 R9 symbols-only        F2 height overflow named (axis)   F3 floor appended to an off-grid ladder
  F4 linePt                  F5 box/cell line count before size (all figlayout)
  F6 figscripts.body_size at the line's resolved base
  F7 figcontainers - docstrings only (AST-equal to tree-int with docstrings removed; checked when iso/ was built)
  compose.py: one transfer per VALUE (a list value joined) + containerErrors - checked here: every sidecar value on the
  layout path is a str, so the join is the identity.

Per block, with the FIXED build's inputs (diag container + cues, tree-fix figscripts words, compose's linear width):
decide() under tree-int's figlayout (BASE), under each F<k> alone, and under tree-fix's figlayout (ALL). A decision is
(lines, size, step, align, x0, top, disp, vdisp, bound, overflow without the additive axis/linePt keys).
CONTROLS: ALL reproduces the fixed build's diag 176/176; BASE reproduces the PREVIOUS build's diag (plan/pred) 176/176
(the previous build ran exactly tree-int's figlayout, and the inputs are identical - F6 and the list join move none).
F1 moving blocks is the instrument's built-in positive control: it can see a moved decision.
"""
import json, sys, importlib.util, collections
from pathlib import Path
sys.dont_write_bytecode = True
PLAN = Path('/home/siggi/dev/scratch-c140/plan')
PRED = PLAN / 'pred2'
INST = PRED / 'inst-C'
sys.path.insert(0, str(INST / 'pylibs')); sys.path.insert(0, str(INST))
import cairo
import figtext as FT
import figscripts as FS
from blockkey import block_key


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, str(path))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


MODS = dict(BASE=load('fl_base', PLAN / 'tree-int/figlayout.py'), ALL=load('fl_all', PLAN / 'tree-fix/figlayout.py'),
            **{f'F{k}': load(f'fl_F{k}', PRED / f'iso/F{k}/figlayout.py') for k in range(1, 6)})
FS_OLD = load('fs_old', PLAN / 'tree-int/figscripts.py')
PREP = Path('/home/siggi/dev/scratch-c140/prep/figs')
SIDE = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
S = 200.0 / 72.0
_s = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); CTX = cairo.Context(_s)
_fo = cairo.FontOptions(); _fo.set_hint_metrics(cairo.HINT_METRICS_OFF); CTX.set_font_options(_fo)


def adv(text, bold, italic, px):
    CTX.select_font_face('Liberation Sans', cairo.FONT_SLANT_ITALIC if italic else cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    CTX.set_font_size(px)
    return CTX.text_extents(text).x_advance / S


def dec(lay):
    o = lay['overflow']
    if o is not None:
        o = {k: v for k, v in o.items() if k not in ('axis', 'linePt')}
    return dict(lines=[''.join(c for c, _ in l) for l in lay['lines']], size=lay['size'], step=lay['step'], align=lay['align'],
                x0=lay['x0'], top=lay['top'], disp=lay['disp'], vdisp=lay['vdisp'], bound=lay['bound'], overflow=o)


def same(a, b):
    return (a['lines'] == b['lines'] and a['size'] == b['size'] and a['step'] == b['step'] and a['align'] == b['align']
            and a['bound'] == b['bound'] and a['overflow'] == b['overflow'] and len(a['x0']) == len(b['x0'])
            and all(abs(x - y) < 1e-9 for x, y in zip(a['x0'], b['x0'])) and abs(a['top'] - b['top']) < 1e-9
            and abs(a['disp'] - b['disp']) < 1e-9 and abs(a['vdisp'] - b['vdisp']) < 1e-9)


moved = collections.defaultdict(list)
ctrl_all, ctrl_base_prev = [], []
body_size_changed, words_changed, list_values, ls_ = [], [], [], 0
for fd in sorted((PRED / 'work/FINAL').iterdir()):
    if not fd.is_dir():
        continue
    name = fd.name
    meta = json.loads((PREP / name / 'meta.json').read_text())
    blocks = FT.merge_blocks(FT.group(json.loads((PREP / name / 'runs.json').read_text())))
    BOLD = {k for k, v in meta['fonts'].items() if 'bold' in v['base'].lower()}
    TR = json.loads((SIDE / f'{name}.is.json').read_text())['blocks']
    prev = {d['block']: d for d in json.loads((PLAN / 'pred/work/FINAL' / name / 'diag.json').read_text())}
    for d in json.loads((fd / 'diag.json').read_text()):
        bi = d['block']; b = blocks[bi]; ls = FT.lines(b); assert block_key(b) == d['key']
        short = f"{name.replace('CNX_Chem_', '')} b{bi}"
        ls_ += 1
        v = TR[d['key']]
        if not isinstance(v, str):
            list_values.append(short)
        raw = ' '.join(FT.normalise_block_value(v, False))
        toks = FS.source_tokens(b, meta['fonts'])[0]
        words = FS.words(raw, FS.transfer(toks, raw)[0] if toks else [None] * len(raw))
        toks_o = FS_OLD.source_tokens(b, meta['fonts'])[0]
        words_o = FS_OLD.words(raw, FS_OLD.transfer(toks_o, raw)[0] if toks_o else [None] * len(raw))
        if [(w, [tuple(s) if s else None for s in st]) for w, st in words] != [(w, [tuple(s) if s else None for s in st]) for w, st in words_o]:
            words_changed.append(short)
        bs_new, bs_old = FS.body_size(b, meta['fonts']), FS_OLD.body_size(b, meta['fonts'])
        if bs_new != bs_old:
            body_size_changed.append((short, bs_old, bs_new))
        assert d['cues']['sz0'] == bs_new == d['sz0'], (short, d['cues']['sz0'], bs_new)

        def width(chars, size, j):
            fr = ls[min(j, len(ls) - 1)][0]
            segs = FS.segments(chars) or [('', None)]
            if any(st is not None for _, st in segs):
                segs = FS.split_at_word_edges(segs)
            return sum(adv(t, fr['font'] in BOLD, bool(st and st.italic), size * (st.ratio if st else 1.0) * S) for t, st in segs)

        c, cues = d['container'], d['cues']
        R = {m: dec(MODS[m].decide(words, width, c, cues)) for m in MODS}
        row_ov = d['overflow'] and {k: v for k, v in d['overflow'].items() if k not in ('axis', 'linePt')}
        rowd = dict(lines=d['lines'], size=d['size'], step=d['step'], align=d['align'], x0=d['x0'], top=d['top'],
                    disp=d['r2']['disp_pt'], vdisp=d['r2']['vdisp_pt'], bound=d['bound'], overflow=row_ov)
        if not same(R['ALL'], rowd):
            ctrl_all.append(short)
        pv = prev[bi]
        prevd = dict(lines=pv['lines'], size=pv['size'], step=pv['step'], align=pv['align'], x0=pv['x0'], top=pv['top'],
                     disp=pv['r2']['disp_pt'], vdisp=pv['r2']['vdisp_pt'], bound=pv['bound'], overflow=pv['overflow'])
        base_eq_prev = same(R['BASE'], prevd)
        for m in list(MODS) :
            if m != 'BASE' and not same(R[m], R['BASE']):
                moved[m].append((short, {k: (R['BASE'][k], R[m][k]) for k in ('lines', 'size', 'step', 'bound') if R['BASE'][k] != R[m][k]}
                                 or 'position/overflow only'))
        if not base_eq_prev:
            ctrl_base_prev.append(short)

out = dict(blocks=ls_, list_values=list_values, body_size_changed=body_size_changed, words_changed=words_changed,
           control_all_reproduces_build_fail=ctrl_all, base_differs_from_previous_build=ctrl_base_prev,
           moved={m: v for m, v in moved.items()})
print('blocks', ls_, '| layout values that are not str (list join non-identity):', list_values)
print('CONTROL tree-fix figlayout reproduces the fixed build diag: fail', len(ctrl_all), ctrl_all)
print('CONTROL tree-int figlayout on the fixed inputs reproduces the PREVIOUS build diag: differs on', len(ctrl_base_prev), ctrl_base_prev)
print('F6 body_size old != new on the 176:', body_size_changed, '| figscripts words old != new:', words_changed)
for m in ['F1', 'F2', 'F3', 'F4', 'F5', 'ALL']:
    v = moved.get(m, [])
    print(f'{m}: decisions moved vs tree-int figlayout: {len(v)}')
    for x in v:
        print('    ', x[0], json.dumps(x[1], ensure_ascii=False))
(PRED / 'out' / 'isolate.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
