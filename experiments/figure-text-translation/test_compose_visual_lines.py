#!/usr/bin/env python3
"""§C140 ㉑, end to end: a ONE-line source label whose stacked charge or same-size superscript
`figtext.lines` splits off is laid out as ONE line - and its block key still splits.

    FIGTEXT_PYLIBS=./pylibs python3 test_compose_visual_lines.py

Design: docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md, D3; campaign
register §C140 ㉑. The defect, as committed on 2026-09-21 in two bought figures: compose.py counted
source lines with FT.lines, so `nitrites (NO2|–` (n_src 2) was drawn `nítrít` above `(NO2 –`, the
kept `)` that closes the formula left 3.249 pt off both baselines, and `ammonium (NH4|+|)` (n_src 3)
on three lines.

WHAT IS PLANTED, AND FROM WHERE
-------------------------------
The committed fixture (`fixtures/fixture_figure.pdf`) is prepared into a temporary directory, its
`runs.json` is REPLACED and its artwork REPLACED with a blank page plus one stroked box - the
test_compose_t23.py pattern. Every run uses the fixture's own font key `PAGE/F1`.
* AMMONIUM, NITRITES and the separate kept `)` - REAL geometry, copied from the committed
  evidence/2026-09-15-t23-review-fixes/reports/code1-control-nitrogen/runs.json (sizes, baselines,
  advances), shifted 200 pt left as ONE group so their mutual geometry is the figure's own.
* CONJ - REAL geometry from the 2026-09-13 census (test_figscripts.py's `CONJ`), shifted
  (-200, +60): `NH4|+ (conjugate acid)`, `+` 7 pt raised 4 pt.
* BOXED - CONJ's first three runs with a SHORT tail (` (acid)`), inside a stroked box sized so the
  value cannot fit on one line at the 7.5 pt floor but fits on two at 9 pt. Its `+` is RED. This is
  the only arm whose layout draws MORE lines than the source has visual lines, i.e. the only one in
  which the per-line font/colour index `j >= 1` is read after a merge.
The values are NOT translations written for this test: each is quoted verbatim from a committed
sidecar (paid MT) - books/efnafraedi-2e/figure-text/CNX_Chem_18_07_Nitrogen.is.json for the two
Nitrogen keys, CNX_Chem_14_01_conjugate_img.is.json for CONJ - and BOXED reuses CONJ's value only
for its known width.

RED-FIRST, AND WHAT IS NOT. V1, V2, V4, V5 and V7 FAIL on the composer before ㉑ (it draws 2-3
lines, the nitrites baseline 3.249 pt off its `)`, and the boxed label's second line in the red of
the `+` run that opens FT.lines line 2). The controls are not red-first and must pass on both sides:
C1 (the block keys still split - the bought keys did not move), V3 (the nitrites line ends on its
`)`: the old composer right-aligned its two lines there too), V6 (the boxed label is drawn on two
lines - without it V7 would be vacuous) and T1 (the drawn pieces reproduce each value's words).
"""
import ast
import json
import math
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))
os.environ['SOURCE_DATE_EPOCH'] = '1700000000'  # BEFORE any child is spawned
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
sys.dont_write_bytecode = True

import cairo                                                  # noqa: E402
import figtext as FT                                          # noqa: E402
import figcontainers as FC                                    # noqa: E402
from blockkey import block_key, block_lines, block_english    # noqa: E402
from fontTools.ttLib import TTFont                            # noqa: E402
from PIL import Image                                         # noqa: E402

PREPARE = HERE / 'figure-prepare.py'
COMPOSE = HERE / 'compose.py'
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'
PAGE_W, PAGE_H = 300.0, 220.0
BLACK = ['cmyk', 0.0, 0.0, 0.0, 1.0]
RED = ['cmyk', 0.0, 1.0, 1.0, 0.0]

# The fixture's own /Widths, read out of make_fixture.py WITHOUT importing it (it needs pikepdf).
_mf = ast.parse((HERE / 'make_fixture.py').read_text())
_W = next(ast.literal_eval(n.value) for n in _mf.body if isinstance(n, ast.Assign)
          and any(getattr(t, 'id', None) == 'WIDTHS' for t in n.targets))
_FIRST = next(ast.literal_eval(n.value)[0] for n in _mf.body if isinstance(n, ast.Assign)
              and isinstance(n.targets[0], ast.Tuple)
              and [e.id for e in n.targets[0].elts] == ['FIRST_CHAR', 'LAST_CHAR'])

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''), flush=True)
    if not ok:
        fails.append(label)


def finish():
    print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
    sys.exit(1 if fails else 0)


def precondition(label, ok, detail=''):
    check('PRECONDITION ' + label, ok, detail)
    if not ok:
        finish()


def fixture_adv(text, size):
    return round(sum(_W[ord(c) - _FIRST] for c in text) * size / 1000.0, 3)


def run(text, size, x, y, adv, fill=BLACK):
    return dict(text=text, font='PAGE/F1', size=size, rot=0.0, x=x, y=y, adv=adv,
                fill=fill, tm=[1.0, 0.0, 0.0, 1.0, x, y])


_FACES = {}


def text_adv(text, size, bold=False, italic=False):
    """The drawn width, from the face FILES with fontTools - independent of compose.py's cairo
    measure (test_compose_t23.py's instrument)."""
    from figis import face_path
    k = (bool(bold), bool(italic))
    if k not in _FACES:
        f = TTFont(str(face_path(k)))
        _FACES[k] = (f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm)
    cmap, hmtx, upm = _FACES[k]
    return sum(hmtx[cmap.get(ord(c), '.notdef')][0] for c in text) * size / upm


def elements(svg_text):
    """[{text, x, y (SVG, y down), size, fill, layout, raw}] in document order. `layout` is True
    for a LAID-OUT segment (svgout draws those, and only those, with font-kerning:none - ⑥b)."""
    out = []
    for m in re.finditer(r'<text ([^>]*)>([^<]*)</text>', svg_text):
        a = dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1)))
        t = m.group(2).replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
        out.append(dict(text=t, x=float(a['x']), y=float(a['y']), size=float(a['font-size']),
                        fill=a.get('fill'), bold=a.get('font-weight') == '700',
                        italic=a.get('font-style') == 'italic',
                        layout='font-kerning:none' in a.get('style', ''), raw=m.group(0)))
    return out


def group_lines(els):
    """Lines BY GEOMETRY (test_compose_t23.py's rule): base-size elements clustered on the baseline
    (gap < 0.5 lead), every element assigned to the nearest cluster, each line ordered along x."""
    if not els:
        return []
    base = max(e['size'] for e in els)
    lead = 1.222 * base
    ys = sorted(e['y'] for e in els if abs(e['size'] - base) < 1e-6)
    clusters = []
    for y in ys:
        if clusters and abs(y - clusters[-1][-1]) < 0.5 * lead:
            clusters[-1].append(y)
        else:
            clusters.append([y])
    cs = [c[0] for c in clusters]
    lines = [[] for _ in cs]
    for e in els:
        lines[min(range(len(cs)), key=lambda j: abs(cs[j] - e['y']))].append(e)
    return [sorted(l, key=lambda e: e['x']) for l in lines]


# ── the plant ──────────────────────────────────────────────────────────────────────────────
DX = -200.0                       # the Nitrogen group, moved as one onto the 300 x 220 page
K_AMM, K_NIT, K_PAREN = 'ammonium (NH4|+|)', 'nitrites (NO2|–', ')'
K_CONJ, K_BOX = 'NH4|+ (conjugate acid)', 'NH4|+ (acid)'
AMMONIUM = [run('ammonium (NH', 9.0, 221.794 + DX, 67.8199, 63.0),
            run('4', 9.0, 284.803 + DX, 64.8379, 5.004),
            run('+', 9.0, 289.8081 + DX, 72.3199, 6.075),
            run(')', 9.0, 295.8831 + DX, 67.8199, 2.997)]
NITRITES = [run('nitrites (NO', 9.0, 341.303 + DX, 67.8199, 45.507),
            run('2', 7.0, 386.8081 + DX, 64.8199, 3.892),
            run('–', 7.0, 390.7011 + DX, 72.3199, 3.5)]
PAREN = [run(')', 9.0, 394.2011 + DX, 67.8199, 2.997)]
CX, CY = -200.0, 60.0
CONJ = [run('NH', 9.0, 244.92 + CX, 122.32 + CY, 13.0),
        run('4', 7.0, 257.92 + CX, 119.32 + CY, 3.89),
        run('+', 7.0, 261.81 + CX, 126.32 + CY, 4.09),
        run(' (conjugate acid)', 9.0, 265.9 + CX, 122.32 + CY, 66.53)]
BX, BY = 200.0, 150.0             # BOXED: CONJ's offsets from its own first run, a short tail
BOXED = [run('NH', 9.0, BX, BY, 13.0),
         run('4', 7.0, BX + 13.0, BY - 3.0, 3.89),
         run('+', 7.0, BX + 16.89, BY + 4.0, 4.09, fill=RED),
         run(' (acid)', 9.0, BX + 20.98, BY, fixture_adv(' (acid)', 9.0))]
# Quoted verbatim from committed sidecars (paid MT), never written for this test - see the docstring.
V_AMM, V_NIT, V_CONJ = 'ammóníum (NH4 + )', 'nítrít (NO2 –', 'NH4 + (samoka sýra)'
TR = {K_AMM: V_AMM, K_NIT: V_NIT, K_CONJ: V_CONJ, K_BOX: V_CONJ}

# BOXED's box: a stroked rect, lw 1.0 (inner inset 0.5), with pad 2.0 the width budget is
# (x1 - x0 - 1) - 4. It must lie strictly between the value's widest 2-line min-max partition at 9 pt
# and its one-line width at the 7.5 pt floor - measured below, as a precondition.
BOX = (BX - 10.0, BY - 10.0, BX + 59.0, BY + 20.0)       # page x0 y0 x1 y1
BOX_BUDGET = (BOX[2] - BOX[0] - 1.0) - 4.0


def art(ctx):
    ctx.set_source_rgb(1, 1, 1)
    ctx.paint()
    ctx.set_source_rgb(0, 0, 0)
    ctx.set_line_width(1.0)
    x0, y0, x1, y1 = BOX
    ctx.rectangle(x0, PAGE_H - y1, x1 - x0, y1 - y0)
    ctx.stroke()


def one_line_width(value, size):
    """Upper bound on the drawn one-line width: every character at `size` (a styled subscript is
    drawn smaller, so the real line is no wider)."""
    return text_adv(value, size)


def minmax2_width(value, size):
    """The widest line of the best 2-line partition of `value`'s words at `size`, all characters at
    `size` (an upper bound, as above)."""
    w = value.split()
    return min(max(text_adv(' '.join(w[:k]), size), text_adv(' '.join(w[k:]), size))
               for k in range(1, len(w)))


TMP = tempfile.TemporaryDirectory(prefix='c21-visual-lines-')
out = Path(TMP.name) / 'fig'
env = dict(os.environ)
env.pop('FIGTEXT_OUT', None)
prep = subprocess.run([sys.executable, str(PREPARE), str(FIXTURE), '--basename', 'CNX_Fixture_c21',
                       '--out', str(out)], capture_output=True, text=True, env=env)
precondition('the fixture prepares', prep.returncode == 0, prep.stderr.strip()[-400:])
(out / 'runs.json').write_text(json.dumps(AMMONIUM + NITRITES + PAREN + CONJ + BOXED, ensure_ascii=False))
pdf = out / 'artwork.pdf'
surf = cairo.PDFSurface(str(pdf), PAGE_W, PAGE_H)
art(cairo.Context(surf))
surf.finish()
r = subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(pdf), str(out / 'artwork')],
                   capture_output=True, text=True)
precondition('the planted artwork renders', r.returncode == 0 and (out / 'artwork.png').exists(), r.stderr[-300:])

runs = json.loads((out / 'runs.json').read_text())
fonts = json.loads((out / 'meta.json').read_text())['fonts']
blocks = FT.merge_blocks(FT.group(runs))
entries = [dict(key=block_key(b), english=block_english(b), lines=block_lines(b), arc=FT.is_arc(b),
                send=FT.sendable(b, block_english(b), fonts)) for b in blocks]
(out / 'blocks.json').write_text(json.dumps(entries, indent=1, ensure_ascii=False))
keys = [e['key'] for e in entries]
precondition('the plant groups into exactly the five planted blocks, keys split by FT.lines',
             keys == [K_AMM, K_NIT, K_PAREN, K_CONJ, K_BOX], repr(keys))
by_key = dict(zip(keys, blocks))
precondition('FT.lines splits every planted label (3, 2, 2, 2 lines) - the defect\'s precondition',
             [len(FT.lines(by_key[k])) for k in (K_AMM, K_NIT, K_CONJ, K_BOX)] == [3, 2, 2, 2],
             repr([len(FT.lines(by_key[k])) for k in (K_AMM, K_NIT, K_CONJ, K_BOX)]))
pg = FC.load_page(pdf)
dark = Image.open(out / 'artwork.png').convert('L')
cls = {k: FC.container_for(keys.index(k), blocks, pg, dark, PAGE_H)['cls'] for k in (K_AMM, K_NIT, K_CONJ, K_BOX)}
precondition('containers: ammonium / nitrites / CONJ open, BOXED box', cls == {K_AMM: 'open', K_NIT: 'open',
             K_CONJ: 'open', K_BOX: 'box'}, repr(cls))
w1, w2 = one_line_width(V_CONJ, 7.5), minmax2_width(V_CONJ, 9.0)
precondition('BOXED budget lies between 2 lines at 9 pt and 1 line at the 7.5 pt floor (pt)',
             w2 + 1.0 < BOX_BUDGET < w1 - 1.0, f'2-line {w2:.2f} < budget {BOX_BUDGET:.2f} < 1-line {w1:.2f}')

tr = Path(TMP.name) / 'tr.json'
tr.write_text(json.dumps({'blocks': TR}, ensure_ascii=False))
c = subprocess.run([sys.executable, str(COMPOSE), '--translations', str(tr), '--svg'], capture_output=True,
                   text=True, env=dict(os.environ, FIGTEXT_OUT=str(out)), cwd=str(HERE))
rep = json.loads((out / 'compose-report.json').read_text()) if (out / 'compose-report.json').exists() else None
precondition('compose exits 0 and writes its report and SVG', c.returncode == 0 and rep is not None
             and (out / 'translated.svg').exists(), c.stderr[-400:])

check('C1 control: the bought keys did not move - all four laid out under their FT.lines keys, only ")" kept',
      sorted(rep['translated']) == sorted([K_AMM, K_NIT, K_CONJ, K_BOX]) and rep['missing'] == [K_PAREN]
      and rep['identity'] == [], f"translated={rep['translated']} missing={rep['missing']}")

els = elements((out / 'translated.svg').read_text())
lay = [e for e in els if e['layout']]
centres = {k: ((FC.source_frame(by_key[k])[0] + FC.source_frame(by_key[k])[1]) / 2,
               PAGE_H - (FC.source_frame(by_key[k])[2] + FC.source_frame(by_key[k])[3]) / 2)
           for k in (K_AMM, K_NIT, K_CONJ, K_BOX)}
lab = {k: [] for k in centres}
for e in lay:
    mx = e['x'] + text_adv(e['text'], e['size'], e['bold'], e['italic']) / 2
    lab[min(centres, key=lambda k: math.hypot(centres[k][0] - mx, centres[k][1] - e['y']))].append(e)
lines = {k: group_lines(v) for k, v in lab.items()}
paren = [e for e in els if not e['layout'] and e['text'] == ')'
         and abs(e['x'] - round(PAREN[0]['x'], 3)) < 1e-6]
precondition('the kept ")" is drawn run-exact at its source origin', len(paren) == 1, repr(paren))
py = paren[0]['y']


def drawn(k):
    return [''.join(e['text'] for e in l) for l in lines[k]]


check('V1 nitrites (NO2|– is drawn on ONE line', len(lines[K_NIT]) == 1, repr(drawn(K_NIT)))
base = [e['y'] for e in lab[K_NIT] if abs(e['size'] - 9.0) < 1e-6]
check('V2 ... on the baseline of the kept ")" that closes it (0.01 pt)',
      bool(base) and all(abs(y - py) <= 0.01 for y in base), f'baselines={sorted(set(base))} ")"={py}')
if lines[K_NIT]:
    last = lines[K_NIT][-1]
    end = max(e['x'] + text_adv(e['text'], e['size'], e['bold'], e['italic']) for e in last)
    check('V3 guard: ... and its line ends on the ")" (0.5 pt)', abs(end - paren[0]['x']) <= 0.5,
          f'end={end:.3f} ")" at {paren[0]["x"]}')
else:
    check('V3 guard: ... and its line ends on the ")" (0.5 pt)', False, 'nothing drawn')
check('V4 ammonium (NH4|+|) - three FT.lines - is drawn on ONE line', len(lines[K_AMM]) == 1, repr(drawn(K_AMM)))
check('V5 NH4|+ (conjugate acid) is drawn on ONE line', len(lines[K_CONJ]) == 1, repr(drawn(K_CONJ)))
check('V6 control: the boxed label is drawn on TWO lines (the only arm where line j=1 is read)',
      len(lines[K_BOX]) == 2, repr(drawn(K_BOX)))
fills = sorted({e['fill'] for e in lab[K_BOX]})
check('V7 every drawn line of the boxed label takes the colour of the run that OPENS its source line, never '
      'the red script run', len(fills) == 1, f'fills={fills} lines={drawn(K_BOX)}')
want = {K_AMM: V_AMM, K_NIT: V_NIT, K_CONJ: V_CONJ, K_BOX: V_CONJ}
bad = {k: (' '.join(drawn(k)), ' '.join(v.split())) for k, v in want.items()
       if ' '.join(' '.join(drawn(k)).split()) != ' '.join(v.split())}
check('T1 sentinel: each label\'s drawn pieces, line by line, reproduce its value\'s words', not bad, repr(bad))
finish()
