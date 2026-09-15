#!/usr/bin/env python3
"""Text fill is drawn the way poppler draws it ([USER] ruling (C), 2026-09-15). Run:

    FIGTEXT_PYLIBS=./pylibs python3 test_figcolour.py

Plain asserts, like the rest of this tree - no pytest.

🔴 THE ORACLE IS pdftocairo, NOT A TABLE OF NUMBERS. Case 1 paints each colour as a filled
rectangle, lets `pdftocairo -svg` convert it, and compares the conversion the COMPOSER uses
against those bytes. The conversion is found where it is used: `compose.py`'s own `cmyk`,
lifted out of its source with `ast` (compose.py reads runs.json at import, so it cannot be
imported), fed by `readlayer._fill` from a synthetic pdfplumber char. So this file measures
the reader-plus-composer pair, wherever the arithmetic happens to live. Case 1g is the control
that the instrument DISCRIMINATES: on the rectangles, the naive (1-c)(1-k) map is wrong.

🔴 THE TRAP CASE 2 GUARDS: poppler converts DeviceGray and DeviceRGB WITHOUT its CMYK table,
so a DeviceGray 0 is pure black. A change that only swapped the CMYK formula would draw the
committed fixture's default-gray text, and every folded RGB/Gray label, as #231f20. Cases 1c,
1d, 2b and 2c pass on the unchanged composer on purpose - they are the half of the ruling that
must NOT move - and each is paired with a CMYK case that must.

Case 2 runs the whole path on a colour variant of the committed fixture: figure-prepare.py
(strip-text + readlayer) -> compose.py --svg, with a translated (layout) and a kept (run-exact)
label in each colour space, and compares each <text> fill with the fill pdftocairo wrote for a
rectangle of the same colour in the SAME figure's artwork.svg.
"""
import ast
import collections
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import _deps  # noqa: F401  — sys.path, never process.cwd()

import pikepdf  # noqa: E402
import readlayer as RL  # noqa: E402

HERE = Path(__file__).resolve().parent
COMPOSE = HERE / 'compose.py'
PREPARE = HERE / 'figure-prepare.py'
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'

# A rich black READ FROM THE CORPUS (CNX_Chem_04_03_map2_img and 7 other ch03/ch04 figures,
# 423 characters across the 34 composed in §C140): what readlayer reports, to 6 places.
# Case 1h reads it back out of the real figure, so this literal cannot drift from the corpus.
RICH = (0.697266, 0.675781, 0.638672, 0.740234)
RICH_FIGURE = 'CNX_Chem_04_03_map2_img'

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''), flush=True)
    if not ok:
        fails.append(label)


def finish():
    print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
    sys.exit(1 if fails else 0)


def composer_cmyk():
    """compose.py's `cmyk`, executed out of compose.py's own source with its own top-level
    imports (which read nothing from OUT) - never a copy of its body."""
    tree = ast.parse(COMPOSE.read_text())
    keep = [n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom))
            or (isinstance(n, ast.FunctionDef) and n.name == 'cmyk')]
    assert any(isinstance(n, ast.FunctionDef) for n in keep), 'compose.py has no `cmyk`'
    ns = {'__file__': str(COMPOSE), '__name__': 'compose_cmyk_probe'}
    exec(compile(ast.Module(body=keep, type_ignores=[]), str(COMPOSE), 'exec'), ns)
    return ns['cmyk']


def drawn(fill):
    """What the composer draws for a reader fill: compose.cmyk, as 8-bit bytes the way
    svgout.write_svg rounds them."""
    return tuple(round(v * 255) for v in CMYK(fill))


def char(space, vals):
    """The two pdfplumber char fields `readlayer._fill` reads."""
    return {'non_stroking_color': tuple(vals), 'ncs': space}


def svg_fills(svg_text):
    """Every fill="rgb(p%, p%, p%)" cairo wrote, as 8-bit bytes (svgout's rounding)."""
    return [tuple(round(float(p) / 100 * 255) for p in m)
            for m in re.findall(r'fill="rgb\(([\d.]+)%, ([\d.]+)%, ([\d.]+)%\)"', svg_text)]


def pdf_op(space, vals):
    return (' '.join(f'{v:g}' for v in vals) + ' '
            + {'DeviceCMYK': 'k', 'DeviceRGB': 'rg', 'DeviceGray': 'g'}[space]).encode()


CMYK = composer_cmyk()
TMP = tempfile.TemporaryDirectory(prefix='figcolour-')
tmp = Path(TMP.name)

# ── 1. the conversion, against pdftocairo's own rectangles ──────────────────────────────────
print('\n[1] compose.cmyk(readlayer._fill(char)) == what pdftocairo draws')
CASES = [('K=1', 'DeviceCMYK', (0, 0, 0, 1)),
         ('rich black (corpus)', 'DeviceCMYK', RICH),
         ('CMYK blue', 'DeviceCMYK', (0.75, 0.5, 0, 0.2)),
         ('CMYK red', 'DeviceCMYK', (0, 1, 1, 0)),
         ('CMYK white', 'DeviceCMYK', (0, 0, 0, 0)),
         ('Gray 0', 'DeviceGray', (0,)),
         ('Gray 0.5', 'DeviceGray', (0.5,)),
         ('RGB blue', 'DeviceRGB', (0.2, 0.4, 0.8)),
         ('RGB black', 'DeviceRGB', (0, 0, 0)),
         # OUT-OF-RANGE operands (final review, code-3): poppler's DeviceRGB/DeviceGray getRGB clip to
         # [0, 1]; fill_rgb returned them raw, and svgout's '#%02x%02x%02x' then wrote `#132-1a80`.
         # 0 of 71,930 corpus runs carry one - hardening, pinned against pdftocairo's own bytes.
         ('RGB out of range', 'DeviceRGB', (1.2, -0.1, 0.5)),
         ('Gray above 1', 'DeviceGray', (1.3,)),
         ('Gray below 0', 'DeviceGray', (-0.2,))]
pdf = pikepdf.new()
page = pdf.add_blank_page(page_size=(20 * len(CASES), 20))
page.Contents = pdf.make_stream(b''.join(pdf_op(sp, v) + b' %d 0 20 20 re f\n' % (20 * i)
                                         for i, (_, sp, v) in enumerate(CASES)))
pdf.save(tmp / 'rects.pdf')
r = subprocess.run(['pdftocairo', '-svg', str(tmp / 'rects.pdf'), str(tmp / 'rects.svg')],
                   capture_output=True, text=True)
truth = svg_fills((tmp / 'rects.svg').read_text()) if r.returncode == 0 else []
if len(truth) != len(CASES):
    check('1 PRECONDITION pdftocairo -svg painted one fill per rectangle', False,
          f'exit {r.returncode}, {len(truth)} fills for {len(CASES)} rects: {r.stderr[-300:]}')
    finish()
oracle = {label: t for (label, _, _), t in zip(CASES, truth)}
got = {label: drawn(RL._fill(char(sp, v), collections.Counter())) for label, sp, v in CASES}
for label, sp, v in CASES:
    check(f'1e {label} ({sp} {v}) draws pdftocairo\'s bytes', got[label] == oracle[label],
          f'composer {got[label]} pdftocairo {oracle[label]}')
check('1a K=1 draws (35,31,32) = #231f20 - the artwork\'s black - within 1/255',
      all(abs(a - b) <= 1 for a, b in zip(got['K=1'], (35, 31, 32))), repr(got['K=1']))
check('1b the corpus rich black draws (33,28,29), within 1/255',
      all(abs(a - b) <= 1 for a, b in zip(got['rich black (corpus)'], (33, 28, 29))),
      repr(got['rich black (corpus)']))
g0 = CMYK(RL._fill(char('DeviceGray', (0,)), collections.Counter()))
check('1c DeviceGray 0 stays PURE black (0,0,0), exactly', tuple(g0) == (0, 0, 0), repr(g0))
rgb = CMYK(RL._fill(char('DeviceRGB', (0.2, 0.4, 0.8)), collections.Counter()))
check('1d a DeviceRGB value is drawn unchanged, exactly (no table, no fixed-point)',
      all(abs(a - b) < 1e-12 for a, b in zip(rgb, (0.2, 0.4, 0.8))), repr(rgb))
# svgout.write_svg's fill format, over the out-of-range cases: a valid #rrggbb or nothing.
_hex = {label: '#%02x%02x%02x' % tuple(round(x * 255) for x in CMYK(RL._fill(char(sp, v), collections.Counter())))
        for label, sp, v in CASES if 'range' in label or 'above' in label or 'below' in label}
check('1i out-of-range DeviceRGB/DeviceGray operands are CLIPPED like poppler: every one formats as a valid #rrggbb',
      len(_hex) == 3 and all(re.fullmatch(r'#[0-9a-f]{6}', h) for h in _hex.values()), repr(_hex))
unknown = collections.Counter()
sep = RL._fill(char('Separation', (1.0,)), unknown)
check('1f a refused space (None) still draws black, never white - test_readlayer.py 7c',
      sep is None and tuple(CMYK(sep)) == (0, 0, 0) and unknown, f'{sep!r} {unknown!r}')
naive = {label: tuple(round(x * 255) for x in ((1 - v[0]) * (1 - v[3]), (1 - v[1]) * (1 - v[3]),
                                               (1 - v[2]) * (1 - v[3])))
         for label, sp, v in CASES if sp == 'DeviceCMYK'}
check('1g CONTROL the rectangles discriminate: the naive (1-c)(1-k) map misses pdftocairo on '
      'K=1, rich black, blue and red',
      all(naive[k] != oracle[k] for k in ('K=1', 'rich black (corpus)', 'CMYK blue', 'CMYK red')),
      repr({k: (naive[k], oracle[k]) for k in naive}))

import read_layer_accept as H  # noqa: E402  (after the cheap cases: it loads sources config)
path, _ = H.resolver()(RICH_FIGURE)
seen = set()
if path:
    with H.staged(path) as (src, err):
        runs, _meta, _ = RL.read(src)
    seen = {tuple(run['fill']) for run in runs if run['fill']}
check(f'1h NON-VACUITY {RICH_FIGURE} really carries the rich black read as DeviceCMYK',
      ('cmyk',) + RICH in seen, f'resolved={bool(path)} fills={sorted(seen)[:4]!r}')

# ── 2. the whole path, on a colour variant of the committed fixture ───────────────────────
print('\n[2] figure-prepare -> compose --svg: every label fill equals its artwork twin')
# Each BT block gets a colour. Blocks 0/1 are TRANSLATED (the layout path), 2/3 are KEPT
# (run-exact; 'H2O (g)' is never bought). The artwork gains one rectangle per colour.
COLOURS = [('DeviceCMYK', (0, 0, 0, 1)), ('DeviceGray', (0,)),
           ('DeviceRGB', (0.2, 0.4, 0.8)), ('DeviceCMYK', RICH)]
LABELS = ['Observation and curiosity', 'Form a hypothesis', 'Test the hypothesis', 'H2O (g)']
TR = {'Observation and curiosity': 'Athugun og forvitni', 'Form a hypothesis': 'Setja fram tilgatu'}
src = pikepdf.open(FIXTURE)
content = src.pages[0].Contents.read_bytes()
bts = [m.start() for m in re.finditer(rb'BT /F1', content)]
if len(bts) != len(COLOURS):
    check('2 PRECONDITION the fixture still has one BT per label', False, f'{len(bts)} BT')
    finish()
variant = content
for pos, (sp, v) in reversed(list(zip(bts, COLOURS))):
    variant = variant[:pos] + pdf_op(sp, v) + b'\n' + variant[pos:]
variant = b''.join(pdf_op(sp, v) + b' %d 205 10 10 re f\n' % (200 + 20 * i)
                   for i, (sp, v) in enumerate(COLOURS)) + variant
src.pages[0].Contents = src.make_stream(variant)
src.save(tmp / 'CNX_Fixture_colour.pdf')
out = tmp / 'fig'
env = dict(os.environ)
env.pop('FIGTEXT_OUT', None)
p = subprocess.run([sys.executable, str(PREPARE), str(tmp / 'CNX_Fixture_colour.pdf'),
                    '--basename', 'CNX_Fixture_colour', '--out', str(out)],
                   capture_output=True, text=True, env=env)
if p.returncode != 0:
    check('2 PRECONDITION figure-prepare exits 0 on the colour variant', False, p.stderr[-400:])
    finish()
(tmp / 'tr.json').write_text(json.dumps({'blocks': TR}, ensure_ascii=False))
env['FIGTEXT_OUT'] = str(out)
c = subprocess.run([sys.executable, str(COMPOSE), '--translations', str(tmp / 'tr.json'), '--svg'],
                   capture_output=True, text=True, env=env, cwd=str(HERE))
svg = (out / 'translated.svg').read_text() if (out / 'translated.svg').exists() else ''
if c.returncode != 0 or not svg:
    check('2 PRECONDITION compose.py --svg exits 0 and writes translated.svg', False,
          f'exit {c.returncode}: {c.stderr[-400:]}')
    finish()
texts = [(t, tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)))
         for h, t in re.findall(r'<text [^>]*fill="#([0-9a-f]{6})"[^>]*>([^<]*)</text>', svg)]
art = svg_fills((out / 'artwork.svg').read_text())


def fills_of(words):
    return {f for t, f in texts if t and t in words}


shown = {'Observation and curiosity': ('Athugun og forvitni',),
         'Form a hypothesis': ('Setja fram tilgatu',),
         'Test the hypothesis': ('Test the hypothesis',), 'H2O (g)': ('H', '2', 'O (g)', 'H2O (g)')}
for i, (label, (sp, v)) in enumerate(zip(LABELS, COLOURS)):
    path_ = 'translated' if label in TR else 'kept'
    f = fills_of(shown[label])
    twin = oracle[{0: 'K=1', 1: 'Gray 0', 2: 'RGB blue', 3: 'rich black (corpus)'}[i]]
    check(f'2{"abcd"[i]} {path_} {label!r} ({sp} {v}) draws {twin}, the fill pdftocairo gave '
          f'the same colour', f == {twin} and twin in art, f'label fills {f} artwork fills {sorted(set(art))}')
check('2e NON-VACUITY all four labels were found as <text> elements',
      all(fills_of(shown[l]) for l in LABELS), repr(texts))
finish()
