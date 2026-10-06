#!/usr/bin/env python3
"""§C140 '6', M2, end to end: a source line that draws only U+0020 is no line - compose.py draws FoodLabel's
`more is` as ONE line at its source origin, and [USER]'s ruled one-line bullets are drawn instead of refused.

    FIGTEXT_PYLIBS=./pylibs python3 -B -u test_compose_blank_lines.py

Design: docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md, D-b (ruling R-17). The
pure half is test_figtext_blank_lines.py; the planner's is test_heldplan.py HP19-HP23.

WHAT IS PLANTED, AND FROM WHERE
-------------------------------
The committed fixture (`fixtures/fixture_figure.pdf`, 300 x 220) is prepared into a temporary directory - the
test_compose_visual_lines.py / test_compose_held.py pattern. Then:
* `runs.json` is REPLACED by the 11 runs of FoodLabel's purple cell, verbatim from
  evidence/2026-10-06-c140-v6-m2/foodlabel-purple-runs.json, shifted x -200 (x and tm[4]); y is unchanged
  (the highest baseline, 157.56, is inside the 220 pt page). meta.json's fonts gain the fixture's `PAGE/TT1`.
* the artwork is REPLACED by a white page plus ONE FILLED, UNSTROKED rect: the snapshot's cell, shifted -200
  and grown by MIN_RULE/2 on every side so figcontainers' fill-rect inset gives the snapshot's L/R/D/U back.
  FoodLabel's real container is `cell`/`fill-rect`; a STROKED closed rect would classify as `box` (and a box
  refuses a multi-line held block), so the spec's "stroked purple cell box" is not what is planted.
  PRECONDITIONS pin the six keys, `cell`/`fill-rect` with the snapshot's L/R/D/U - 200 (0.01 pt), and
  `left` on blocks 42/44/45 - the planted page reproduces the real cell's decisions, or the file stops.
* `--translations` = the four bought values, copied verbatim from the committed sidecar
  books/efnafraedi-2e/figure-text/CNX_Chem_05_02_FoodLabel.is.json (paid MT); `--held-values` (HV.write_file,
  as test_compose_held.py) carries [USER]'s ruled bullets (R-15g2 / the value sheet), quoted verbatim.
Every position below is asserted against the PLANTED runs, never the real figure's 389.611 / 131.908.

WHAT IS PINNED
--------------
* E1 exactly one `meira er` element, at the planted `more is` run's x and baseline (0.001 pt). Red before M2
     (`meira` / `er` from the folded space's x, two lines). Also the mutant "compose cues from visual_lines".
* E2 no `er` element (the `erhátt` collision). Red before M2.
* E3 CONTROL: every element outside block 45 is byte-identical to a compose without the `more is| `
     translation - the fold touches only the block that has the blank line.
* E4 the ruled bullets: exit 0, `held` = blocks 42 and 44 with line 0 changed, `• 20% eða` at the planted
     `(cid:127) 20% or` run's x and baseline, and `• 5% eða minna` drawn. Red before M2 (`line-count`). NOT
     asserted: `• 5% eða minna`'s position - this cell has no table rule and no neighbours, so where a 36 pt
     label that overflows its 27 pt budget lands belongs to the M7/R-15 class, not to M2.
* E5 a two-line bullet is refused `line-count` on block 42. Red before M2 (it was ACCEPTED, onto `er lítið`).
* E6 a value equal to the ink text is refused `no-change`. Red before M2 (`line-count`).
NOT PINNED (disclosed; 0 corpus instances): draw_held draws a changed line in the font and fill of its first
INK run (`inks[li][0]`); on every FoodLabel blank line the blank run and the ink run share font and fill, and
a different fill would need a first-line-blank held block, which the corpus does not have.
"""
import json
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

import cairo                                    # noqa: E402
import figtext as FT                            # noqa: E402
import figcontainers as FC                      # noqa: E402
import heldvalues as HV                         # noqa: E402
from blockkey import block_key                  # noqa: E402
from PIL import Image                           # noqa: E402

PREPARE = HERE / 'figure-prepare.py'
COMPOSE = HERE / 'compose.py'
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'
FX = json.loads((HERE / 'evidence' / '2026-10-06-c140-v6-m2' / 'foodlabel-purple-runs.json')
                .read_text(encoding='utf-8'))
BASENAME = 'CNX_Fixture_m2'
PAGE_W, PAGE_H = 300.0, 220.0
DX = -200.0
KEYS = ['Quick|guide to|% DV', '(cid:127) 5% or less| ', 'is low', '(cid:127) 20% or| ', 'more is| ', 'high']
K42, K44, K45 = KEYS[1], KEYS[3], KEYS[4]
# Copied verbatim from books/efnafraedi-2e/figure-text/CNX_Chem_05_02_FoodLabel.is.json (paid MT).
TR = {'Quick|guide to|% DV': 'Stuttar leiðbeiningar um % af dagskammti', 'is low': 'er lítið',
      'more is| ': 'meira er', 'high': 'hátt'}
# [USER]'s ruled one-line bullets (R-15g2 / the value sheet), quoted verbatim.
BULLETS = {K42: '• 5% eða minna', K44: '• 20% eða'}

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


def elements(svg_text):
    """[{text, x, y (PDF, y up), raw}] in document order."""
    out = []
    for m in re.finditer(r'<text ([^>]*)>([^<]*)</text>', svg_text):
        a = dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1)))
        t = m.group(2).replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
        out.append(dict(text=t, x=float(a['x']), y=PAGE_H - float(a['y']), raw=m.group(0)))
    return out


def at(e, r):
    """Is element e drawn at run r's origin (0.001 pt: the SVG writes 3 decimals)?"""
    return abs(e['x'] - r['x']) <= 0.001 and abs(e['y'] - r['y']) <= 0.001


# ── the plant ──────────────────────────────────────────────────────────────────────────────
RUNS = [dict(r, x=round(r['x'] + DX, 4), tm=r['tm'][:4] + [round(r['tm'][4] + DX, 4), r['tm'][5]])
        for r in FX['runs']]
CELL = FX['containers']['0']
H = FC.MIN_RULE / 2
RECT = (CELL['L'] + DX - H, CELL['D'] - H, CELL['R'] + DX + H, CELL['U'] + H)   # page x0 y0 x1 y1, y up

TMP = tempfile.TemporaryDirectory(prefix='c140-m2-blank-')
TD = Path(TMP.name)
FIG = TD / 'fig'
env0 = dict(os.environ)
env0.pop('FIGTEXT_OUT', None)
prep = subprocess.run([sys.executable, str(PREPARE), str(FIXTURE), '--basename', BASENAME, '--out', str(FIG)],
                      capture_output=True, text=True, env=env0)
precondition('the fixture prepares', prep.returncode == 0, prep.stderr.strip()[-400:])
(FIG / 'runs.json').write_text(json.dumps(RUNS, ensure_ascii=False))
meta = json.loads((FIG / 'meta.json').read_text())
meta['fonts'].update(FX['fonts'])
(FIG / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False))
pdf = FIG / 'artwork.pdf'
surf = cairo.PDFSurface(str(pdf), PAGE_W, PAGE_H)
ctx = cairo.Context(surf)
ctx.set_source_rgb(1, 1, 1)
ctx.paint()
ctx.set_source_rgb(0.86, 0.80, 0.92)            # a light purple patch: filled, never stroked, not dark
ctx.rectangle(RECT[0], PAGE_H - RECT[3], RECT[2] - RECT[0], RECT[3] - RECT[1])
ctx.fill()
surf.finish()
r = subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(pdf), str(FIG / 'artwork')],
                   capture_output=True, text=True)
precondition('the planted artwork renders', r.returncode == 0 and (FIG / 'artwork.png').exists(), r.stderr[-300:])

blocks = FT.merge_blocks(FT.group(RUNS))
keys = [block_key(b) for b in blocks]
precondition('the plant groups into FoodLabel\'s six purple-cell blocks, keys unmoved', keys == KEYS, repr(keys))
pg = FC.load_page(pdf)
with Image.open(FIG / 'artwork.png') as im:
    dark = im.convert('L')
cont = [FC.container_for(i, blocks, pg, dark, PAGE_H) for i in range(len(blocks))]
want = (CELL['L'] + DX, CELL['R'] + DX, CELL['D'], CELL['U'])
geo = [(c['cls'], c['why'], tuple(round(c.get(s, float('nan')), 3) for s in 'LRDU')) for c in cont]
precondition("every block sits in ONE `cell`/`fill-rect` with the snapshot's L/R/D/U - 200 in x (0.01 pt)",
             all(c['cls'] == 'cell' and c['why'] == 'fill-rect'
                 and all(abs(c[s] - w) <= 0.01 for s, w in zip('LRDU', want)) for c in cont),
             f'{geo} want {want}')
precondition('blocks 42/44/45 are aligned left (the real cell\'s decision)',
             [cont[i]['align'] for i in (1, 3, 4)] == ['left', 'left', 'left'],
             repr([(cont[i]['align'], cont[i]['align_why']) for i in (1, 3, 4)]))

_N = [0]


def compose(tr, held=None):
    """Compose the plant. -> (rc, report or None, elements, stderr)."""
    for n in ('compose-report.json', 'translated.png', 'translated.svg'):
        (FIG / n).unlink(missing_ok=True)
    _N[0] += 1
    trp = TD / f'tr-{_N[0]}.json'
    trp.write_text(json.dumps({'blocks': tr}, ensure_ascii=False))
    argv = [sys.executable, str(COMPOSE), '--translations', str(trp), '--svg']
    if held is not None:
        hp = TD / f'held-{_N[0]}.json'
        HV.write_file(hp, BASENAME, 'test-config.json', held)
        argv += ['--held-values', str(hp)]
    c = subprocess.run(argv, capture_output=True, text=True, env=dict(os.environ, FIGTEXT_OUT=str(FIG)),
                       cwd=str(HERE))
    rp, svg = FIG / 'compose-report.json', FIG / 'translated.svg'
    return (c.returncode, json.loads(rp.read_text()) if rp.exists() else None,
            elements(svg.read_text(encoding='utf-8')) if svg.exists() else [], c.stderr)


def errs(rep):
    return [(e.get('key'), e.get('block'), e.get('reason')) for e in (rep or {}).get('heldErrors') or []]


B45 = blocks[4]
MORE = next(r for r in B45 if r['text'] == 'more is')
rc, rep, els, err = compose(TR)
precondition('the plain compose exits 0 and writes its report and SVG', rc == 0 and rep is not None and els,
             '' if rc == 0 else err[-400:])
meira = [e for e in els if e['text'] == 'meira er']
check("E1 exactly one 'meira er' element, at the planted `more is` run's x and baseline",
      len(meira) == 1 and at(meira[0], MORE),
      f"{[(e['text'], e['x'], round(e['y'], 4)) for e in els if 'meira' in e['text']]} want "
      f"({MORE['x']}, {MORE['y']})")
check("E2 no 'er' element (the `erhátt` collision)", not [e for e in els if e['text'] == 'er'],
      repr([(e['x'], round(e['y'], 4)) for e in els if e['text'] == 'er']))

rc0, rep0, els0, err0 = compose({k: v for k, v in TR.items() if k != K45})
precondition('the compose without `more is| ` exits 0', rc0 == 0 and rep0 is not None and els0,
             '' if rc0 == 0 else err0[-400:])


def outside45(es):
    """The elements no part of block 45 drew: not its translation's words, not one of its source runs."""
    return [e['raw'] for e in es if e['text'] not in ('meira er', 'meira', 'er')
            and not any(at(e, r) for r in B45)]


a, b = outside45(els), outside45(els0)
check('E3 CONTROL: every element outside block 45 is byte-identical to a compose without its translation',
      a == b and len(a) >= 5, f'{len(a)} vs {len(b)}; first difference '
      f'{next(((x, y) for x, y in zip(a, b) if x != y), None)}')

rc, rep, els, err = compose(TR, BULLETS)
held = [(h.get('key'), h.get('block'), h.get('changed')) for h in (rep or {}).get('held') or []]
B44_0 = blocks[3][0]
b20 = [e for e in els if e['text'] == '• 20% eða']
check("E4 [USER]'s ruled bullets: exit 0, blocks 42/44 held with line 0 changed, '• 20% eða' at its source "
      "origin, '• 5% eða minna' drawn",
      rc == 0 and held == [(K42, 1, [0]), (K44, 3, [0])] and len(b20) == 1 and at(b20[0], B44_0)
      and any(e['text'] == '• 5% eða minna' for e in els),
      f"rc {rc} held {held} errors {errs(rep)} '• 20% eða' {[(e['x'], round(e['y'], 4)) for e in b20]} "
      f"want ({B44_0['x']}, {B44_0['y']})")

rc, rep, els, err = compose(TR, {K42: '• 5% eða\nminna'})
check("E5 a two-line bullet (its 2nd line would sit on 'er lítið') is refused line-count on block 42",
      (K42, 1, 'line-count') in errs(rep), f'rc {rc} errors {errs(rep)} held {(rep or {}).get("held")}')

rc, rep, els, err = compose(TR, {K42: '(cid:127) 5% or less'})
check('E6 a value equal to the ink text is refused no-change', (K42, 1, 'no-change') in errs(rep),
      f'rc {rc} errors {errs(rep)} held {(rep or {}).get("held")}')

finish()
