#!/usr/bin/env python3
"""`artworkedits.py` - [USER]'s per-figure, operator-level edits to the STAGED artwork PDF
(figure-text.config.json `artworkEdits`, §C140 '6', ruling R-15a2), applied by figure-prepare.py.

    FIGTEXT_PYLIBS=./pylibs python3 -B test_artworkedits.py

Plain asserts and a module-level `fails` list, like test_figure_prepare.py - there is no pytest in
this tree, and CI does not run this file (README: the Python suites are plain scripts).

THE FIXTURE IS GENERATED HERE, never cut from FoodLabel: the source artwork lives outside the repo.
It reproduces the shapes FoodLabel's edit has to handle (the brief's list): a NEGATIVE-width `re f`
band beside a positive one, a stroked closed circle under `q cm ... Q`, an arrow drawn as a
`q cm m l S Q` shaft plus a `q cm m l l h f Q` head, ONE BT that draws a Tm line and then Td, TD and
T* lines and further lines that must not move (FoodLabel's single BT draws circle 5's digit and the
whole right column through relative moves), and a BT holding a `'` operator. Plus the shapes the
refusals need: a stroked three-point path, a slanted line, a filled two-point path and a rect under a
rotated `cm`. G21 (F3) adds four more generated pages, so MAIN's counts stay as they are: CLIP (paths
that also set the clip), SCALED (a 0.5 cm and a 9x Tm), EDGE (refusal boundaries, a kerned TJ, a TL that
differs from the TD's leading) and NEAR (selector pairs differing in one property). Section 13's pins
each kill a mutant every earlier case survived; the mutants are named in the commit that added them.

🔴 EVERY "UNMOVED" HERE IS MEASURED BY A SECOND INSTRUMENT. The module re-measures its own output
(`_verify`), so asserting with its own `inventory` alone would let one bug in that walk hide itself.
pdfplumber - the reader figcontainers and the read layer use - is the second instrument: rects,
curves, lines and words are read back from the saved PDF. AE-7 proves `_verify` can fail at all.

⚠️ This file writes ONLY into temporary directories under $TMPDIR.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))

import pikepdf                                  # noqa: E402  - after the pylibs bootstrap
import pdfplumber                               # noqa: E402

AE_PATH = HERE / 'artworkedits.py'
PREPARE = HERE / 'figure-prepare.py'
SHIPPED_CONFIG = HERE / 'figure-text.config.json'
N = pikepdf.Name
B = 'CNX_Fake_AE'

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''), flush=True)
    if not ok:
        fails.append(label)


# ── the generated artwork ─────────────────────────────────────────────────────────────

MAIN = b'''q
0.2 0.04 0.4 0 k
200 50 -80 20 re f
0.1 0.5 0.1 0 k
20 100 60 15 re f
Q
q
0 0 1 0 K
1 w
q 1 0 0 1 150 150 cm
10 0 m 10 5.523 5.523 10 0 10 c -5.523 10 -10 5.523 -10 0 c -10 -5.523 -5.523 -10 0 -10 c 5.523 -10 10 -5.523 10 0 c h S
Q
Q
0.5 0.1 1 0.4 K
1 w
q 1 0 0 1 220 120 cm 0 0 m 6.652 0 l S Q
0.5 0.1 1 0.4 k
q 1 0 0 1 225 118.3 cm 0 0 m 6.5 1.7 l 0 3.4 l h f Q
0 0 0 1 K
q 1 0 0 1 250 60 cm 0 0 m 10 0 l 10 10 l S Q
250 100 m 270 110 l S
0 1 0 0 k
250 20 m 270 20 l f
0.3 0.3 0.3 rg
q 0 1 -1 0 100 100 cm 0 0 10 5 re f Q
BT
/F1 8 Tf
1 0 0 1 30 90 Tm (Alpha) Tj
0 -10 Td (Bravo) Tj
12 -10 TD (Charlie) Tj
T* (Delta) Tj
-12 -10 Td (Echo) Tj
T* (Foxtrot) Tj
ET
BT
/F1 8 Tf
10 TL
1 0 0 1 200 30 Tm (Golf) Tj
(Hotel) '
ET
'''
# Two IDENTICAL filled rects (select-ambiguous) and a unique one (its positive control), plus a text
# line with no positioning operator (no-positioning-op).
DUP = b'''0.9 0 0 0 k 10 10 20 20 re f
0.9 0 0 0 k 10 10 20 20 re f
0 0.9 0 0 k 50 10 20 20 re f
BT /F1 8 Tf (Kilo) Tj ET
'''
# G21 #10: a path that is ALSO a clipping path (`W`/`W*` between its construction and its paint). A
# move-paths wrap `q cm ... Q` would end the clip at the inserted `Q`, so every later object would be
# drawn unclipped. The blue rect is drawn INSIDE the `re W f` clip; the yellow one is outside both.
CLIP = b'''q
1 0 0 rg
10 10 50 50 re W f
0 0 1 rg
0 0 200 200 re f
Q
q
0 1 0 rg
10 150 20 20 re W* f
Q
0.5 0.5 0 rg
220 10 20 20 re f
'''

# Selectors, in PDF page space (y up). The bbox includes Bezier control points.
BAND_A = {'paint': 'fill', 'colour': ['k', 0.2, 0.04, 0.4, 0], 'bbox': [120, 50, 200, 70]}   # w < 0
BAND_B = {'paint': 'fill', 'colour': ['k', 0.1, 0.5, 0.1, 0], 'bbox': [20, 100, 80, 115]}    # w > 0
CIRCLE = {'paint': 'stroke', 'colour': ['K', 0, 0, 1, 0], 'bbox': [140, 140, 160, 160]}
SHAFT = {'paint': 'stroke', 'colour': ['K', 0.5, 0.1, 1, 0.4], 'bbox': [220, 120, 226.652, 120]}
HEAD = {'paint': 'fill', 'colour': ['k', 0.5, 0.1, 1, 0.4], 'bbox': [225, 118.3, 231.5, 121.7]}
POLY = {'paint': 'stroke', 'colour': ['K', 0, 0, 0, 1], 'bbox': [250, 60, 260, 70]}
SLANT = {'paint': 'stroke', 'colour': ['K', 0, 0, 0, 1], 'bbox': [250, 100, 270, 110]}
FILLINE = {'paint': 'fill', 'colour': ['k', 0, 1, 0, 0], 'bbox': [250, 20, 270, 20]}
ROT = {'paint': 'fill', 'colour': ['rg', 0.3, 0.3, 0.3], 'bbox': [95, 100, 100, 110]}
DUPSEL = {'paint': 'fill', 'colour': ['k', 0.9, 0, 0, 0], 'bbox': [10, 10, 30, 30]}
# G21 F3 #53/#61 M12: a SCALED cm and a SCALED Tm. Every MAIN cm is a pure translation and every MAIN Tm
# is `1 0 0 1`, so a division by the matrix scale could be deleted unseen. Page = 0.5 * user + (10, 0).
SCALED = b'''q 0.5 0 0 0.5 10 0 cm
0.2 0.2 0.2 rg
100 100 40 20 re f
0.7 0.1 0.1 rg
300 100 20 20 re f
1 0 0 RG
100 300 m 160 300 l S
BT
/F1 2 Tf
9 0 0 9 60 200 Tm (Mike) Tj
0 -2 Td (November) Tj
9 0 0 9 60 140 Tm (Oscar) Tj
0 -2 Td (Papa) Tj
ET
Q
'''
SC_RECT = {'paint': 'fill', 'colour': ['rg', 0.2, 0.2, 0.2], 'bbox': [60, 50, 80, 60]}
SC_BOX = {'paint': 'fill', 'colour': ['rg', 0.7, 0.1, 0.1], 'bbox': [160, 50, 170, 60]}
SC_LINE = {'paint': 'stroke', 'colour': ['RG', 1, 0, 0], 'bbox': [60, 150, 90, 150]}
WORDS_SC = {'Mike': (40, 100), 'November': (40, 91), 'Oscar': (40, 70), 'Papa': (40, 61)}

# G21 F3 #61/#54/#62: shapes the refusal boundaries and the text walk need, absent from MAIN.
# ZERO: a zero-length `m l S`. WGAP: a `w` between the `l` and its `S` (the paint op is not directly
# after the `l`). FLIP: a rect under a FLIPPED (not rotated) cm. Quebec: a ROTATED Tm. Victor: a TJ with
# kerning numbers (an int and a real). Romeo..Uniform: a TL that differs from the TD's leading, in its
# own BT (tl persists across BT, and MAIN's TD left 10).
EDGE = b'''0 0 0 1 K
280 30 m 280 30 l S
250 150 m 270 150 l 2 w S
q -1 0 0 1 100 0 cm 0.4 0.4 0.4 rg 10 10 5 5 re f Q
BT /F1 8 Tf 0 1 -1 0 150 150 Tm (Quebec) Tj ET
BT /F1 8 Tf 1 0 0 1 20 120 Tm [(Vic)-15(to)3.5(r)] TJ 0 -10 Td (Whiskey) Tj ET
BT /F1 8 Tf
1 0 0 1 100 180 Tm (Romeo) Tj
0 -10 TD (Sierra) Tj
14 TL
T* (Tango) Tj
T* (Uniform) Tj
ET
'''
ZERO = {'paint': 'stroke', 'colour': ['K', 0, 0, 0, 1], 'bbox': [280, 30, 280, 30]}
WGAP = {'paint': 'stroke', 'colour': ['K', 0, 0, 0, 1], 'bbox': [250, 150, 270, 150]}
FLIP = {'paint': 'fill', 'colour': ['rg', 0.4, 0.4, 0.4], 'bbox': [85, 10, 90, 15]}
WORDS_TL = {'Romeo': (100, 180), 'Sierra': (100, 170), 'Tango': (100, 156), 'Uniform': (100, 142)}

# G21 F3 #55: pairs that differ in ONE matching property, so a loosened match turns into select-ambiguous:
# paint only (one k AND one K in force, fill and stroke of one bbox), the colour OPERATOR only (rg vs
# cs+sc, same operands), a colour operand by 0.05, and a bbox by 0.3 pt. Path index = stream order.
NEAR = b'''0.1 0.2 0.3 0.4 k
0.1 0.2 0.3 0.4 K
10 20 20 10 re f
10 20 20 10 re S
0.5 0.5 0.5 rg
40 20 20 10 re f
/DeviceRGB cs 0.5 0.5 0.5 sc
40 20 20 10 re f
0.2 0.2 0.2 rg
70 20 20 10 re f
0.25 0.2 0.2 rg
70 20 20 10 re f
0.6 0.6 0.6 rg
100 20 20 10 re f
100.3 20 20 10 re f
'''
NEAR_SEL = [
    ('the FILL of a filled+stroked bbox', {'paint': 'fill', 'colour': ['k', 0.1, 0.2, 0.3, 0.4], 'bbox': [10, 20, 30, 30]}),
    ('the STROKE of it', {'paint': 'stroke', 'colour': ['K', 0.1, 0.2, 0.3, 0.4], 'bbox': [10, 20, 30, 30]}),
    ('the rg twin', {'paint': 'fill', 'colour': ['rg', 0.5, 0.5, 0.5], 'bbox': [40, 20, 60, 30]}),
    ('the sc twin', {'paint': 'fill', 'colour': ['sc', 0.5, 0.5, 0.5], 'bbox': [40, 20, 60, 30]}),
    ('rg 0.2', {'paint': 'fill', 'colour': ['rg', 0.2, 0.2, 0.2], 'bbox': [70, 20, 90, 30]}),
    ('rg 0.25 (0.05 away)', {'paint': 'fill', 'colour': ['rg', 0.25, 0.2, 0.2], 'bbox': [70, 20, 90, 30]}),
    ('bbox x 100', {'paint': 'fill', 'colour': ['rg', 0.6, 0.6, 0.6], 'bbox': [100, 20, 120, 30]}),
    ('bbox x 100.3 (0.3 pt away)', {'paint': 'fill', 'colour': ['rg', 0.6, 0.6, 0.6], 'bbox': [100.3, 20, 120.3, 30]}),
]
CLIPPER = {'paint': 'fill', 'colour': ['rg', 1, 0, 0], 'bbox': [10, 10, 60, 60]}       # re W f
CLIPPER_STAR = {'paint': 'fill', 'colour': ['rg', 0, 1, 0], 'bbox': [10, 150, 30, 170]}  # re W* f
INSIDE = {'paint': 'fill', 'colour': ['rg', 0, 0, 1], 'bbox': [0, 0, 200, 200]}          # in the clip
UNIQUE = {'paint': 'fill', 'colour': ['k', 0, 0.9, 0, 0], 'bbox': [50, 10, 70, 30]}


def line(text, x, y):
    return {'text': text, 'origin': [x, y]}


WORDS0 = {'Alpha': (30, 90), 'Bravo': (30, 80), 'Charlie': (42, 70), 'Delta': (42, 60),
          'Echo': (30, 50), 'Foxtrot': (30, 40)}


def _font(pdf):
    """Base-14 Helvetica, as test_figure_prepare.py's `_plain_font` (no descriptor needed here)."""
    return pdf.make_indirect(pikepdf.Dictionary(
        Type=N('/Font'), Subtype=N('/Type1'), BaseFont=N('/Helvetica'),
        Encoding=N('/WinAnsiEncoding')))


def synth(dst, content=MAIN):
    pdf = pikepdf.new()
    page = pdf.add_blank_page(page_size=(300, 200))
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=_font(pdf)))
    page.Contents = pdf.make_stream(content)
    pdf.save(str(dst), deterministic_id=True)
    return Path(dst)


def instructions(pdf_path):
    """-> [(operator, [operand repr...])] of page 1, for instruction-level diffs."""
    with pikepdf.open(str(pdf_path)) as pdf:
        return [(str(i.operator), [str(o) for o in i.operands])
                for i in pikepdf.parse_content_stream(pdf.pages[0])]


def plumb(pdf_path):
    """The SECOND instrument: what pdfplumber reads back from the saved PDF."""
    with pdfplumber.open(str(pdf_path)) as pdf:
        p = pdf.pages[0]
        h = p.height
        rects = [(r['object_type'], round(r['x0'], 4), round(r['x1'], 4), round(h - r['bottom'], 4),
                  round(h - r['top'], 4)) for r in p.rects]
        curves = [(round(c['x0'], 4), round(c['x1'], 4), round(h - c['bottom'], 4)) for c in p.curves]
        lines_ = [(round(ln['x0'], 4), round(ln['x1'], 4), round(h - ln['bottom'], 4)) for ln in p.lines]
        words = {w['text']: round(w['x0'], 4) for w in p.extract_words()}
    return {'rects': sorted(rects), 'curves': sorted(curves), 'lines': sorted(lines_), 'words': words}


def words_xy(pdf_path):
    """pdfplumber's words as {text: (x0, y of the box bottom, y up)} - the second instrument for text that
    can also move VERTICALLY (a T* rewritten with the wrong leading)."""
    with pdfplumber.open(str(pdf_path)) as pdf:
        p = pdf.pages[0]
        return {w['text']: (round(w['x0'], 3), round(p.height - w['bottom'], 3)) for w in p.extract_words()}


def near(a, b, tol=1e-3):
    return all(abs(float(x) - float(y)) <= tol for x, y in zip(a, b))


def raises(fn):
    """-> (reason or exception class name, message) or (None, result)."""
    try:
        return None, fn()
    except Exception as exc:                      # noqa: BLE001 - reported, not raised
        return getattr(exc, 'reason', type(exc).__name__), str(exc)


def run_py(script, *args, cwd=None):
    """Spawn a tool with a BARE env (no FIGTEXT_PYLIBS), so its own bootstrap is exercised."""
    env = dict(os.environ)
    env.pop('FIGTEXT_PYLIBS', None)
    env.pop('FIGTEXT_OUT', None)
    return subprocess.run([sys.executable, '-B', str(script), *[str(a) for a in args]],
                          capture_output=True, text=True, env=env, cwd=str(cwd) if cwd else None)


def refused(result, code):
    """Did the TOOL exit `code` - or did the interpreter fail to open it? (test_figure_prepare.py)"""
    return result.returncode == code and "can't open file" not in result.stderr


def write_config(path, obj):
    Path(path).write_text(json.dumps(obj), encoding='utf-8')
    return Path(path)


# ── 0. the module ─────────────────────────────────────────────────────────────────────

check('0 PRECONDITION artworkedits.py exists', AE_PATH.exists(), str(AE_PATH))
AE = None
try:
    import artworkedits as AE                   # noqa: E402
except Exception as exc:                          # noqa: BLE001
    check('0b artworkedits.py imports', False, f'{type(exc).__name__}: {exc}')
if AE is not None:
    check('0b artworkedits.py imports', True)

TD = Path(tempfile.mkdtemp(prefix='t-artworkedits-'))
MAIN_PDF = synth(TD / 'main.pdf')
DUP_PDF = synth(TD / 'dup.pdf', DUP)
CLIP_PDF = synth(TD / 'clip.pdf', CLIP)
SCALED_PDF = synth(TD / 'scaled.pdf', SCALED)
EDGE_PDF = synth(TD / 'edge.pdf', EDGE)
NEAR_PDF = synth(TD / 'near.pdf', NEAR)
BASE = plumb(MAIN_PDF)
check('0c PRECONDITION pdfplumber reads the fixture: 3 rects, the circle curve, every word',
      len(BASE['rects']) == 3 and len(BASE['curves']) >= 1
      and {w: BASE['words'].get(w) for w in WORDS0} == {w: float(x) for w, (x, _) in WORDS0.items()},
      f'{BASE!r}')
check('0d PRECONDITION the negative-width band is a pdfplumber rect at x 120..200',
      ('rect', 120.0, 200.0, 50.0, 70.0) in BASE['rects'], f"{BASE['rects']!r}")

_n = [0]


def edited(ops, src=MAIN_PDF):
    """Copy `src`, apply `ops` through apply_to_pdf -> (path, summary) or (path, (reason, msg))."""
    _n[0] += 1
    dst = TD / f'edit-{_n[0]}.pdf'
    shutil.copyfile(src, dst)
    reason, got = raises(lambda: AE.apply_to_pdf(dst, ops, f'artworkEdits.{B}'))
    return dst, (got if reason is None else (reason, got))


def refusal(ops, src=MAIN_PDF):
    """-> the refusal reason apply_to_pdf raises for `ops` (None if it applied), and whether `src`'s
    copy came out byte-identical (a refusal must leave the staged PDF untouched)."""
    _n[0] += 1
    dst = TD / f'ref-{_n[0]}.pdf'
    shutil.copyfile(src, dst)
    reason, msg = raises(lambda: AE.apply_to_pdf(dst, ops, f'artworkEdits.{B}'))
    untouched = dst.read_bytes() == Path(src).read_bytes() and not list(TD.glob('*.edit.tmp'))
    return reason, msg, untouched


if AE is not None:
    # ── 1. INERT: no entry, nothing touched ──────────────────────────────────────────────
    def inert(cfg_obj, label):
        _n[0] += 1
        dst = TD / f'inert-{_n[0]}.pdf'
        shutil.copyfile(MAIN_PDF, dst)
        os.utime(dst, ns=(1_600_000_000_000_000_000, 1_600_000_000_000_000_000))
        before = (dst.read_bytes(), dst.stat().st_mtime_ns)
        cfg = write_config(TD / f'cfg-inert-{_n[0]}.json', cfg_obj)
        reason, got = raises(lambda: AE.apply_for_figure(dst, B, cfg))
        after = (dst.read_bytes(), dst.stat().st_mtime_ns)
        check(f'AE-1{label} CONTROL returns None and leaves the staged PDF byte- and mtime-identical',
              reason is None and got is None and before == after, f'{reason} {got!r}')

    inert({'artworkEdits': {}}, ' (an empty table)')
    inert({}, 'b (an ABSENT table is an empty one)')
    inert({'artworkEdits': {'CNX_Other': [{'op': 'move-paths', 'dx': 1, 'select': [CIRCLE]}]}},
          'c (an entry for a DIFFERENT basename)')
    inert({'artworkEdits': {B.lower(): [{'op': 'move-paths', 'dx': 1, 'select': [CIRCLE]}]}},
          'd (a basename differing only by case: exact name, no fold)')
    inert({'artworkEdits': {'CNX_Other': 'not a list'}},
          "e (a MALFORMED entry for another figure is never read; the validator catches it in CI)")

    # ── 2. move-edge ─────────────────────────────────────────────────────────────────────
    p, s = edited([{'op': 'move-edge', 'edge': 'left', 'to': 110, 'select': [BAND_A]}])
    after = plumb(p)
    check('AE-2 move-edge left `to` on a NEGATIVE-width band: still a pdfplumber rect, x0 = to, x1 kept',
          ('rect', 110.0, 200.0, 50.0, 70.0) in after['rects']
          and ('rect', 120.0, 200.0, 50.0, 70.0) not in after['rects'], f"{after['rects']!r}")
    ins0, ins1 = instructions(MAIN_PDF), instructions(p)
    re_after = [o for op, o in ins1 if op == 're']
    check('AE-2a the band stays ONE `re` and keeps its width sign (x stays the right edge, w = -90)',
          re_after[0] == ['200', '50', '-90', '20'] and len(ins0) == len(ins1), f'{re_after!r}')
    check('AE-2c every other pdfplumber object unmoved',
          sorted(r for r in after['rects'] if r[1] != 110.0) == sorted(r for r in BASE['rects'] if r[1] != 120.0)
          and after['curves'] == BASE['curves'] and after['lines'] == BASE['lines']
          and after['words'] == BASE['words'], f'{after!r}')
    check('AE-2d the summary names the op, the count and the object',
          s == [{'op': 'move-edge', 'selected': 1,
                 'objects': [{'bbox': [120.0, 50.0, 200.0, 70.0], 'edge': 'left', 'to': 110.0}]}], f'{s!r}')

    p, s = edited([{'op': 'move-edge', 'edge': 'right', 'dx': 7, 'select': [BAND_B]}])
    after = plumb(p)
    check('AE-2b move-edge right `dx` on a positive-width band: x1 + 7, x0 kept, still a rect',
          ('rect', 20.0, 87.0, 100.0, 115.0) in after['rects'], f"{after['rects']!r}")

    # ── 3. move-paths ────────────────────────────────────────────────────────────────────
    p, s = edited([{'op': 'move-paths', 'dx': -15, 'select': [CIRCLE]}])
    after = plumb(p)
    moved = [c for c in after['curves'] if c not in BASE['curves']]
    check('AE-3 move-paths shifts the circle by dx (pdfplumber curve x0/x1 -15, y kept)',
          len(moved) == 1 and [c for c in BASE['curves'] if c not in after['curves']]
          and moved[0][0] == 125.0 and moved[0][1] == 145.0, f"{after['curves']!r} vs {BASE['curves']!r}")
    check('AE-3b every other object unmoved',
          after['rects'] == BASE['rects'] and after['lines'] == BASE['lines']
          and after['words'] == BASE['words'], f'{after!r}')
    with pikepdf.open(str(p)) as _pdf:
        _, got_paths = raises(lambda: AE.inventory(pikepdf, list(pikepdf.parse_content_stream(_pdf.pages[0]))))
    check('AE-3c the module\'s own inventory agrees: the circle bbox is [125, 140, 145, 160]',
          isinstance(got_paths, tuple)
          and [float(x) for x in got_paths[0][2]['bbox']] == [125.0, 140.0, 145.0, 160.0],
          f'{got_paths!r}'[:300])

    # ── 4. move-text ─────────────────────────────────────────────────────────────────────
    def words_after(ops):
        p_, s_ = edited(ops)
        return p_, s_, plumb(p_)['words']

    want = {w: float(x) for w, (x, _) in WORDS0.items()}
    p, s, w = words_after([{'op': 'move-text', 'dx': 5, 'select': [line('Bravo', 30, 80)]}])
    check('AE-4 move-text on a Td line: Bravo +5, every LATER unselected line unmoved (pdfplumber words)',
          {k: w.get(k) for k in want} == {**want, 'Bravo': 35.0}, f'{w!r}')
    check('AE-4a the summary carries the selected line\'s text and origin',
          s == [{'op': 'move-text', 'selected': 1, 'objects': [{'text': 'Bravo', 'origin': [30.0, 80.0]}]}],
          f'{s!r}')

    p, s, w = words_after([{'op': 'move-text', 'dx': 5, 'select': [line('Charlie', 42, 70)]}])
    ins1 = instructions(p)
    delta_pos = [o for op, o in ins1 if op in ('T*', 'Td', 'TD')]
    check('AE-4b a selected TD line followed by a T* line: the T* is rewritten as `Td -dtx -TL`',
          ['-5', '-10'] in delta_pos and 'T*' in [op for op, _ in ins1]
          and [op for op, _ in ins1].count('T*') == 1, f'{delta_pos!r}')
    check('AE-4b2 ... and only Charlie moved (pdfplumber words)',
          {k: w.get(k) for k in want} == {**want, 'Charlie': 47.0}, f'{w!r}')

    p, s, w = words_after([{'op': 'move-text', 'dx': -4, 'select': [line('Alpha', 30, 90)]}])
    tms = [o for op, o in instructions(p) if op == 'Tm']
    check('AE-4c a selected Tm line: an ABSOLUTE shift of its own e, the next Td compensated',
          tms[0][4] == '26' and {k: w.get(k) for k in want} == {**want, 'Alpha': 26.0}, f'{tms!r} {w!r}')

    p, s, w = words_after([{'op': 'move-text', 'dx': -15,
                            'select': [line('Bravo', 30, 80), line('Delta', 42, 60), line('Foxtrot', 30, 40)]}])
    check('AE-4d three non-adjacent lines in one BT: exactly those three move',
          {k: w.get(k) for k in want} == {**want, 'Bravo': 15.0, 'Delta': 27.0, 'Foxtrot': 15.0}, f'{w!r}')

    # ── 5. move-line-end (the arrow shaft) ───────────────────────────────────────────────
    p, s = edited([{'op': 'move-line-end', 'edge': 'left', 'dx': -6, 'select': [SHAFT]}])
    ins0, ins1 = instructions(MAIN_PDF), instructions(p)
    diff = [(i, a, b) for i, (a, b) in enumerate(zip(ins0, ins1)) if a != b]
    check('AE-5 move-line-end left dx -6: exactly ONE parsed instruction changes, the shaft\'s `m 0 0`',
          len(ins0) == len(ins1) and len(diff) == 1 and diff[0][1] == ('m', ['0', '0'])
          and diff[0][2] == ('m', ['-6', '0']), f'{diff!r}')
    after = plumb(p)
    shaft_after = [ln for ln in after['lines'] if ln not in BASE['lines']]
    check('AE-5a the shaft is a pdfplumber line 214..226.652; the head and everything else unmoved',
          shaft_after == [(214.0, 226.652, 120.0)] and after['rects'] == BASE['rects']
          and after['curves'] == BASE['curves'] and after['words'] == BASE['words'],
          f"{after['lines']!r}")
    check('AE-5c the summary names the edge and the new page coordinate',
          s == [{'op': 'move-line-end', 'selected': 1,
                 'objects': [{'bbox': [220.0, 120.0, 226.652, 120.0], 'edge': 'left', 'to': 214.0}]}],
          f'{s!r}')

    p, s = edited([{'op': 'move-line-end', 'edge': 'right', 'dx': 3, 'select': [SHAFT]}])
    ins1 = instructions(p)
    diff = [(i, a, b) for i, (a, b) in enumerate(zip(ins0, ins1)) if a != b]
    check('AE-5b move-line-end right dx 3: only the `l` operand x changes, 6.652 -> 9.652',
          len(diff) == 1 and diff[0][1] == ('l', ['6.652', '0']) and diff[0][2][0] == 'l'
          and float(diff[0][2][1][0]) == 9.652 and diff[0][2][1][1] == '0', f'{diff!r}')

    # ── 6. refusals, by reason name ──────────────────────────────────────────────────────
    def refuses(label, ops, want_reason, src=MAIN_PDF, needle=''):
        reason, msg, untouched = refusal(ops, src)
        check(f'{label} refuses `{want_reason}` and leaves the staged PDF untouched',
              reason == want_reason and untouched and needle in msg, f'{reason}: {msg}'[:300])

    refuses('AE-5c1 move-line-end on an `re`', [{'op': 'move-line-end', 'edge': 'left', 'dx': -1,
                                                  'select': [BAND_B]}], 'not-a-line')
    refuses('AE-5c2 move-line-end on a three-point path', [{'op': 'move-line-end', 'edge': 'left',
                                                            'dx': -1, 'select': [POLY]}], 'not-a-line')
    refuses('AE-5c3 move-line-end on a FILLED two-point path', [{'op': 'move-line-end', 'edge': 'left',
                                                                 'dx': -1, 'select': [FILLINE]}],
            'not-a-line')
    refuses('AE-5c4 move-line-end on the filled head', [{'op': 'move-line-end', 'edge': 'right',
                                                         'dx': 1, 'select': [HEAD]}], 'not-a-line')
    refuses('AE-5d move-line-end on a slanted line', [{'op': 'move-line-end', 'edge': 'left', 'dx': -1,
                                                       'select': [SLANT]}], 'not-horizontal')
    refuses('AE-5e move-line-end past the other end', [{'op': 'move-line-end', 'edge': 'left', 'dx': 7,
                                                        'select': [SHAFT]}], 'edge-inverts')
    refuses('AE-5f move-line-end and move-paths on one shaft',
            [{'op': 'move-paths', 'dx': -3, 'select': [SHAFT]},
             {'op': 'move-line-end', 'edge': 'left', 'dx': -6, 'select': [SHAFT]}], 'select-overlap')
    off = dict(CIRCLE, bbox=[141, 140, 161, 160])
    refuses('AE-6 a selector 1 pt off', [{'op': 'move-paths', 'dx': 1, 'select': [off]}], 'select-none')
    refuses('AE-6a a selector matching two identical paths',
            [{'op': 'move-edge', 'edge': 'left', 'dx': -1, 'select': [DUPSEL]}], 'select-ambiguous', DUP_PDF)
    p, s = edited([{'op': 'move-edge', 'edge': 'left', 'dx': -1, 'select': [UNIQUE]}], DUP_PDF)
    check('AE-6a2 CONTROL the unique rect in the same file applies', isinstance(s, list)
          and s[0]['selected'] == 1, f'{s!r}')
    refuses('AE-6b the same object in two ops', [{'op': 'move-paths', 'dx': 1, 'select': [CIRCLE]},
                                                 {'op': 'move-paths', 'dx': 2, 'select': [CIRCLE]}],
            'select-overlap')
    refuses('AE-6c move-edge on a rect under a rotated cm',
            [{'op': 'move-edge', 'edge': 'left', 'dx': -1, 'select': [ROT]}], 'not-axis-aligned')
    refuses('AE-6c2 move-paths on a rect under a rotated cm',
            [{'op': 'move-paths', 'dx': -1, 'select': [ROT]}], 'not-axis-aligned')
    refuses("AE-6d move-text in a BT holding a ' operator",
            [{'op': 'move-text', 'dx': 1, 'select': [line('GolfHotel', 200, 30)]}], 'quote-operator')
    refuses('AE-6e move-edge past the other edge',
            [{'op': 'move-edge', 'edge': 'left', 'to': 200, 'select': [BAND_A]}], 'edge-inverts')
    refuses('AE-6f move-edge on a curve (not ONE `re`)',
            [{'op': 'move-edge', 'edge': 'left', 'dx': -1, 'select': [CIRCLE]}], 'not-a-rect')
    refuses('AE-6f2 move-edge on a line (not ONE `re`)',
            [{'op': 'move-edge', 'edge': 'left', 'dx': -1, 'select': [SHAFT]}], 'not-a-rect')
    refuses('AE-6g a text line with no positioning operator',
            [{'op': 'move-text', 'dx': 1, 'select': [line('Kilo', 0, 0)]}], 'no-positioning-op', DUP_PDF)
    # G21 #10: move-paths on a clipping path is refused by name - its q/Q wrap would pop the clip.
    refuses('AE-12 move-paths on a path that is also a clip (`re W f`)',
            [{'op': 'move-paths', 'dx': 100, 'select': [CLIPPER]}], 'clip-path', CLIP_PDF, 'W')
    refuses('AE-12b move-paths on a path that is also a clip (`re W* f`)',
            [{'op': 'move-paths', 'dx': 100, 'select': [CLIPPER_STAR]}], 'clip-path', CLIP_PDF, 'W*')
    p, s = edited([{'op': 'move-paths', 'dx': 5, 'select': [INSIDE]}], CLIP_PDF)
    check('AE-12c CONTROL move-paths on an object drawn INSIDE the clip applies (its own wrap pops no clip)',
          isinstance(s, list) and s[0]['selected'] == 1, f'{s!r}')
    _, inv12 = raises(lambda: AE.inventory_report(CLIP_PDF))
    clip_recs = [q for q in (inv12 or {}).get('paths', []) if q.get('select') is None]
    check('AE-12d --inventory prints both clip paths with no selector and a `why` naming the clip; the '
          'other two are ready selectors',
          isinstance(inv12, dict) and len(inv12.get('paths', [])) == 4 and len(clip_recs) == 2
          and all('clip' in q.get('why', '') for q in clip_recs), f'{inv12!r}'[:400])

    # Field-level refusals: for_figure validates the entry before any PDF is opened.
    def field(label, entry, want_reason, needle=''):
        reason, msg = raises(lambda: AE.for_figure({B: entry}, B))
        check(f'{label} refuses `{want_reason}`', reason == want_reason and needle in msg,
              f'{reason}: {msg}'[:300])

    MP = {'op': 'move-paths', 'dx': 1, 'select': [CIRCLE]}
    ME = {'op': 'move-edge', 'edge': 'left', 'dx': 1, 'select': [BAND_A]}
    ML = {'op': 'move-line-end', 'edge': 'left', 'dx': -6, 'select': [SHAFT]}
    MT = {'op': 'move-text', 'dx': 1, 'select': [line('Bravo', 30, 80)]}
    field('AE-6h an entry that is not a list', {'op': 'move-paths'}, 'entry-not-list')
    field('AE-6h2 an empty entry', [], 'entry-not-list')
    field('AE-6i an op that is not an object', ['move-paths'], 'op-not-object')
    field('AE-6j an unknown op', [dict(MP, op='move-all')], 'unknown-op')
    # G21 #11/#58: a non-string op is refused by name (a list or dict op is unhashable: no bare TypeError).
    field('AE-6j2 an op that is a list', [dict(MP, op=['move-paths'])], 'unknown-op')
    field('AE-6j3 an op that is an object', [dict(MP, op={'move-paths': 1})], 'unknown-op')
    field('AE-6k an unknown field', [dict(MP, colour='red')], 'unknown-field')
    field('AE-6k2 move-line-end takes `dx` only: `to` is an unknown field', [dict(ML, to=214)],
          'unknown-field', "'to'")
    field('AE-6l a missing field', [{'op': 'move-paths', 'select': [CIRCLE]}], 'missing-field')
    field('AE-6l2 move-line-end without `edge`', [{'op': 'move-line-end', 'dx': -6, 'select': [SHAFT]}],
          'missing-field')
    field('AE-6l3 move-line-end without `dx`', [{'op': 'move-line-end', 'edge': 'left', 'select': [SHAFT]}],
          'missing-field')
    field('AE-6m a bad edge', [dict(ME, edge='top')], 'bad-field')
    field('AE-6m2 move-line-end with a bad edge', [dict(ML, edge='start')], 'bad-field')
    field('AE-6m3 move-edge with both `to` and `dx`', [dict(ME, to=110)], 'bad-field')
    field('AE-6m4 move-edge with neither `to` nor `dx`', [{'op': 'move-edge', 'edge': 'left',
                                                           'select': [BAND_A]}], 'bad-field')
    field('AE-6m5 a selector bbox with x0 > x1', [dict(MP, select=[dict(CIRCLE, bbox=[160, 140, 140, 160])])],
          'bad-field')
    field('AE-6m6 a dx that is a boolean', [dict(MP, dx=True)], 'bad-field')
    field('AE-6m7 a move-line-end dx that is a string', [dict(ML, dx='-6')], 'bad-field')
    field('AE-6m8 a note that is not a string', [dict(MP, note=5)], 'bad-field')
    field('AE-6m9 an empty select', [dict(MP, select=[])], 'bad-field')
    field('AE-6m10 a path selector with a text field', [dict(MP, select=[dict(CIRCLE, text='x')])],
          'unknown-field')
    field('AE-6m11 a path selector without a bbox', [dict(MP, select=[{'paint': 'stroke',
                                                                       'colour': ['K', 0, 0, 1, 0]}])],
          'missing-field')
    field('AE-6m12 a paint that is not fill or stroke', [dict(MP, select=[dict(CIRCLE, paint='fill+stroke')])],
          'bad-field')
    field('AE-6m13 a colour with no operator', [dict(MP, select=[dict(CIRCLE, colour=[0, 0, 1, 0])])],
          'bad-field')
    field('AE-6m14 an empty text', [dict(MT, select=[line('', 30, 80)])], 'bad-field')
    field('AE-6m15 an origin that is not [x, y]', [dict(MT, select=[{'text': 'Bravo', 'origin': [30]}])],
          'bad-field')
    reason, got = raises(lambda: AE.for_figure({B: [dict(MP, select=[dict(SHAFT, bbox=[5, 0, 5, 10])])]}, B))
    check('AE-6n2 CONTROL a vertical-line selector (x0 == x1) validates, as the JS validator\'s does',
          reason is None and len(got) == 1, f'{reason}: {got!r}'[:200])
    reason, got = raises(lambda: AE.for_figure({B: [MP, ME, ML, MT]}, B))
    check('AE-6n CONTROL a well-formed four-op entry validates', reason is None and len(got) == 4,
          f'{reason}: {got!r}'[:200])

    # Table- and config-level refusals, through apply_for_figure (the prepare entry point).
    def via_config(label, raw, want_reason, needle=''):
        _n[0] += 1
        cfg = TD / f'cfg-{_n[0]}.json'
        cfg.write_text(raw, encoding='utf-8') if raw is not None else None
        dst = TD / f'cfgpdf-{_n[0]}.pdf'
        shutil.copyfile(MAIN_PDF, dst)
        reason, msg = raises(lambda: AE.apply_for_figure(dst, B, cfg))
        check(f'{label} refuses `{want_reason}`', reason == want_reason and needle in msg
              and dst.read_bytes() == MAIN_PDF.read_bytes(), f'{reason}: {msg}'[:300])

    via_config('AE-6o a table that is not an object', '{"artworkEdits": []}', 'table-not-object')
    via_config('AE-6o2 a table that is null', '{"artworkEdits": null}', 'table-not-object')
    via_config('AE-6p a config that is not an object', '[]', 'config-not-object')
    # G7: the ONE parse (figconfig.load) and its ONE wording; ArtworkEditError carries it verbatim.
    via_config('AE-6q a config repeating a key at ANY depth (another figure\'s entry)',
               '{"artworkEdits": {}, "heldBlockValues": {"X": {"a": "b", "a": "c"}}}',
               'config-unusable', "repeats the key(s) ['a']")
    via_config('AE-6r a config that cannot be read (absent)', None, 'config-unusable', 'cannot be read')
    via_config('AE-6r2 a config that is not JSON', '{"artworkEdits": {', 'config-unusable', 'cannot be read')

    # ── 7. the self-check can fail ───────────────────────────────────────────────────────
    # A planted rewrite that skips ONE compensation (Charlie's TD keeps its original operands after
    # Bravo moved) must be caught by _verify, not saved. Paired with the unpatched run, which applies.
    real_rewrite = AE.rewrite

    def skipping_rewrite(pikepdf_, instr, *a, **kw):
        out = real_rewrite(pikepdf_, instr, *a, **kw)
        orig_td = [i for i in instr if not isinstance(i, pikepdf.ContentStreamInlineImage)
                   and str(i.operator) == 'TD']
        return [orig_td[0] if (not isinstance(i, pikepdf.ContentStreamInlineImage)
                               and str(i.operator) == 'TD') else i for i in out]

    ops7 = [{'op': 'move-text', 'dx': 5, 'select': [line('Bravo', 30, 80)]}]
    AE.rewrite = skipping_rewrite
    try:
        reason, msg, untouched = refusal(ops7)
    finally:
        AE.rewrite = real_rewrite
    check('AE-7 a rewrite that skips one Td compensation is refused `verify-failed`, nothing saved',
          reason == 'verify-failed' and 'Charlie' in msg and untouched, f'{reason}: {msg}'[:300])
    reason, msg, _ = refusal(ops7)
    check('AE-7b CONTROL the same op with the real rewrite applies', reason is None, f'{reason}: {msg}'[:200])

    # ── 8. determinism ───────────────────────────────────────────────────────────────────
    ops8 = [{'op': 'move-edge', 'edge': 'left', 'to': 110, 'select': [BAND_A]},
            {'op': 'move-paths', 'dx': -15, 'select': [CIRCLE]},
            {'op': 'move-text', 'dx': -15, 'select': [line('Bravo', 30, 80)]},
            {'op': 'move-line-end', 'edge': 'left', 'dx': -6, 'select': [SHAFT]}]
    p1, s1 = edited(ops8)
    p2, s2 = edited(ops8)
    check('AE-8 two applies of the same four ops give byte-identical PDFs and summaries',
          p1.read_bytes() == p2.read_bytes() and s1 == s2 and p1.read_bytes() != MAIN_PDF.read_bytes(),
          f'{len(p1.read_bytes())} {len(p2.read_bytes())}')

    # ── 10. parity with the JS validator (change both or neither) ────────────────────────
    # 🔴 THE SAME LITERAL AS tools/__tests__/figure-config-validate.test.js (AE-10): the op table
    # {op: [required, optional]} and the selector field sets. Two implementations of one shape rule.
    OPS_LITERAL = {
        'move-edge': (['edge', 'op', 'select'], ['dx', 'note', 'to']),
        'move-line-end': (['dx', 'edge', 'op', 'select'], ['note']),
        'move-paths': (['dx', 'op', 'select'], ['note']),
        'move-text': (['dx', 'op', 'select'], ['note']),
    }
    SELECT_LITERAL = {'path': ['bbox', 'colour', 'paint'], 'line': ['origin', 'text']}
    check('AE-10 OPS is the literal the JS validator\'s AE_OPS is pinned to',
          {k: (sorted(r), sorted(o)) for k, (r, o) in AE.OPS.items()} == OPS_LITERAL, f'{AE.OPS!r}')
    check('AE-10b the selector field sets are the literal AE_SELECT_FIELDS is pinned to',
          {'path': sorted(AE.PATH_FIELDS), 'line': sorted(AE.LINE_FIELDS)} == SELECT_LITERAL)

    # ── 11. --inventory: selectors authored from repo tooling ────────────────────────────
    r = run_py(AE_PATH, '--inventory', MAIN_PDF)
    try:
        inv = json.loads(r.stdout)
    except ValueError as exc:
        inv = {'_unparsable': str(exc)}
    paths_ = inv.get('paths', [])
    lines_ = inv.get('lines', [])
    check('AE-11 --inventory exits 0 with every painted path and every text line',
          r.returncode == 0 and len(paths_) == 9 and len(lines_) == 7, f'{r.returncode} {r.stderr[-300:]}')
    sel = [q['select'] for q in paths_ if q.get('select')]
    shaft = [q for q in paths_ if q.get('shape') == 'm l' and q.get('select')
             and q['select']['colour'] == SHAFT['colour']]
    check('AE-11b the shaft is printed as a ready selector, shape `m l`',
          len(shaft) == 1 and shaft[0]['select']['paint'] == 'stroke'
          and shaft[0]['select']['bbox'] == SHAFT['bbox'], f'{shaft!r}')
    # Matched through `plan` (selection only): the rotated rect is selectable, and only a REWRITE of
    # it refuses (AE-6c2).
    with pikepdf.open(str(MAIN_PDF)) as _pdf:
        _instr = list(pikepdf.parse_content_stream(_pdf.pages[0]))
        ok11 = len(sel) == 9
        for k, sj in enumerate(sel):
            reason, got = raises(lambda: AE.plan(pikepdf, _instr, [{'op': 'move-paths', 'dx': 0.5,
                                                                    'select': [sj]}], 'inv'))
            ok11 = ok11 and reason is None and got[-1][0]['selected'] == 1
    for ln in lines_:
        ok11 = ok11 and set(ln.get('select', {})) == {'text', 'origin'}
    check('AE-11c every printed path selector selects exactly one object on the same PDF', ok11)
    check("AE-11d the ' line is printed with quote true (a move of it refuses)",
          [ln.get('quote') for ln in lines_ if ln['select']['text'] == 'GolfHotel'] == [True], f'{lines_!r}'[:300])
    r = run_py(AE_PATH)
    check('AE-11e no arguments is a usage error, exit 2', refused(r, 2), f'{r.returncode} {r.stderr[-200:]}')

    # ── 13. G21 F3: pins that kill mutants every earlier case survived ────────────────────
    # 13a (#53, #61 M12). SCALED cm and Tm: each op applies, and the second instrument agrees.
    P13 = plumb(SCALED_PDF)
    check('AE-13 PRECONDITION pdfplumber reads SCALED: the two rects, the line and the four words',
          ('rect', 60.0, 80.0, 50.0, 60.0) in P13['rects'] and ('rect', 160.0, 170.0, 50.0, 60.0) in P13['rects']
          and (60.0, 90.0, 150.0) in P13['lines']
          and all(near((P13['words'].get(k, -1),), (x,)) for k, (x, _) in WORDS_SC.items()), f'{P13!r}')
    p, s = edited([{'op': 'move-edge', 'edge': 'right', 'dx': 4, 'select': [SC_RECT]}], SCALED_PDF)
    check('AE-13a move-edge under a 0.5-scaled cm: page x1 80 -> 84, still a rect',
          isinstance(s, list) and ('rect', 60.0, 84.0, 50.0, 60.0) in plumb(p)['rects'], f'{s!r}')
    p, s = edited([{'op': 'move-paths', 'dx': 10, 'select': [SC_BOX]}], SCALED_PDF)
    check('AE-13b move-paths under a 0.5-scaled cm: the box moves 10 PAGE pt (160..170 -> 170..180)',
          isinstance(s, list) and ('rect', 170.0, 180.0, 50.0, 60.0) in plumb(p)['rects'], f'{s!r}')
    p, s = edited([{'op': 'move-line-end', 'edge': 'right', 'dx': 6, 'select': [SC_LINE]}], SCALED_PDF)
    check('AE-13c move-line-end under a 0.5-scaled cm: the right end 90 -> 96 page pt',
          isinstance(s, list) and (60.0, 96.0, 150.0) in plumb(p)['lines'], f'{s!r} {plumb(p)["lines"]!r}')
    want13 = {k: x for k, (x, _) in WORDS_SC.items()}
    p, s = edited([{'op': 'move-text', 'dx': 5, 'select': [line('Mike', 40, 100)]}], SCALED_PDF)
    w13 = plumb(p)['words'] if isinstance(s, list) else {}
    check('AE-13d move-text on a 9x Tm line under a 0.5 cm: Mike +5 page pt, the Td line after it unmoved',
          isinstance(s, list) and all(near((w13.get(k, -1),), (v,)) for k, v in {**want13, 'Mike': 45}.items()),
          f'{s!r} {w13!r}')
    p, s = edited([{'op': 'move-text', 'dx': 5, 'select': [line('November', 40, 91), line('Oscar', 40, 70)]}],
                  SCALED_PDF)
    w13 = plumb(p)['words'] if isinstance(s, list) else {}
    check('AE-13e two consecutive selected lines, the SECOND a Tm whose shift equals the first: both move, '
          'the Td line after them does not',
          isinstance(s, list) and all(near((w13.get(k, -1),), (v,)) for k, v in
                                      {**want13, 'November': 45, 'Oscar': 45}.items()), f'{s!r} {w13!r}')

    # 13b (#61). Refusal boundaries and inputs MAIN lacks.
    refuses('AE-13f move-line-end landing EXACTLY on the other end (reaching, not crossing)',
            [{'op': 'move-line-end', 'edge': 'left', 'dx': 6.652, 'select': [SHAFT]}], 'edge-inverts',
            needle='reaches')
    refuses('AE-13g move-line-end on a zero-length line', [{'op': 'move-line-end', 'edge': 'left', 'dx': -1,
                                                             'select': [ZERO]}], 'not-a-line', EDGE_PDF, 'zero length')
    refuses('AE-13h move-line-end on `m l` whose stroke is not directly after the `l` (a `w` between)',
            [{'op': 'move-line-end', 'edge': 'left', 'dx': -1, 'select': [WGAP]}], 'not-a-line', EDGE_PDF)
    refuses('AE-13i move-paths on a rect under a FLIPPED cm (-1 0 0 1)',
            [{'op': 'move-paths', 'dx': 3, 'select': [FLIP]}], 'not-axis-aligned', EDGE_PDF)
    refuses('AE-13i2 move-edge on a rect under a FLIPPED cm (-1 0 0 1)',
            [{'op': 'move-edge', 'edge': 'left', 'dx': -1, 'select': [FLIP]}], 'not-axis-aligned', EDGE_PDF)
    refuses('AE-13j move-text on a line under a ROTATED Tm',
            [{'op': 'move-text', 'dx': 3, 'select': [line('Quebec', 150, 150)]}], 'not-axis-aligned', EDGE_PDF)

    # 13c (#54). A TJ with kerning numbers: its text is the strings only, and move-text moves it.
    _, inv13 = raises(lambda: AE.inventory_report(EDGE_PDF))
    check('AE-13k --inventory reads the kerned TJ `[(Vic)-15(to)3.5(r)]` as the line text Victor',
          isinstance(inv13, dict) and {'text': 'Victor', 'origin': [20.0, 120.0]}
          in [q['select'] for q in inv13.get('lines', [])], f'{inv13!r}'[:400])
    E0 = words_xy(EDGE_PDF)
    p, s = edited([{'op': 'move-text', 'dx': 5, 'select': [line('Victor', 20, 120)]}], EDGE_PDF)
    e13 = words_xy(p) if isinstance(s, list) else {}
    check('AE-13l move-text on the kerned TJ line: Victor +5, every other word where it was',
          isinstance(s, list) and near(e13.get('Victor', (0, 0)), (E0['Victor'][0] + 5, E0['Victor'][1]))
          and all(near(e13.get(k, (0, 0)), v) for k, v in E0.items() if k != 'Victor'), f'{s!r} {e13!r}')

    # 13d (#62). A TL that differs from the TD's leading: T* lines are where TL puts them.
    check('AE-13m PRECONDITION pdfplumber puts the T* lines 14 pt apart (TL), not 10 (the TD)',
          all(near((E0[k][0],), (x,)) for k, (x, _) in WORDS_TL.items())
          and near((E0['Sierra'][1] - E0['Tango'][1], E0['Tango'][1] - E0['Uniform'][1]), (14, 14)), f'{E0!r}')
    p, s = edited([{'op': 'move-text', 'dx': 5, 'select': [line('Tango', 100, 156)]}], EDGE_PDF)
    e13 = words_xy(p) if isinstance(s, list) else {}
    check('AE-13n move-text on a T* line after `14 TL`: selected at its TL origin, Tango +5, Uniform unmoved',
          isinstance(s, list) and near(e13.get('Tango', (0, 0)), (E0['Tango'][0] + 5, E0['Tango'][1]))
          and all(near(e13.get(k, (0, 0)), v) for k, v in E0.items() if k != 'Tango'), f'{s!r} {e13!r}')
    p, s = edited([{'op': 'move-text', 'dx': 5, 'select': [line('Sierra', 100, 170)]}], EDGE_PDF)
    e13 = words_xy(p) if isinstance(s, list) else {}
    check('AE-13o the UNSELECTED T* line after a moved one is compensated with the TL leading: no word '
          'moves vertically (pdfplumber; _verify shares the inventory and cannot see this)',
          isinstance(s, list) and near(e13.get('Sierra', (0, 0)), (E0['Sierra'][0] + 5, E0['Sierra'][1]))
          and all(near(e13.get(k, (0, 0)), v) for k, v in E0.items() if k != 'Sierra'), f'{s!r} {e13!r}')

    # 13e (#55). Each selector of a near-identical pair picks exactly its OWN path.
    with pikepdf.open(str(NEAR_PDF)) as _pdf:
        _ni = list(pikepdf.parse_content_stream(_pdf.pages[0]))
    for k, (label, sj) in enumerate(NEAR_SEL):
        reason, got = raises(lambda: AE.plan(pikepdf, _ni, [{'op': 'move-paths', 'dx': 0.5, 'select': [sj]}],
                                             'near'))
        check(f'AE-13p{k} the selector for {label} picks path {k} alone',
              reason is None and list(got[2]) == [k], f'{reason}: {got if reason else list(got[2])!r}'[:200])

    # 13f (#52). _verify's PATH half can fail: planted rewrite faults, each refused with nothing saved.
    def planted(label, fault, ops, needle):
        def faulty(pikepdf_, instr, *a, **kw):
            return fault(real_rewrite(pikepdf_, instr, *a, **kw))
        AE.rewrite = faulty
        try:
            reason, msg, untouched = refusal(ops)
        finally:
            AE.rewrite = real_rewrite
        check(f'{label} is refused `verify-failed`, nothing saved', reason == 'verify-failed' and needle in msg
              and untouched, f'{reason}: {msg}'[:300])

    CSI, OP = pikepdf.ContentStreamInstruction, pikepdf.Operator

    def _is(i, op):
        return not isinstance(i, pikepdf.ContentStreamInlineImage) and str(i.operator) == op

    def nudge_wrap(out):          # the move-paths wrap's cm moves 1 pt too far
        return [CSI([1, 0, 0, 1, -14, 0], OP('cm')) if _is(i, 'cm') and [str(o) for o in i.operands]
                == ['1', '0', '0', '1', '-15', '0'] else i for i in out]

    def extra_path(out):          # one painted path more than the original
        return out + [CSI([0, 0, 1, 1], OP('re')), CSI([], OP('f'))]

    def recolour(out):            # BAND_B's fill colour changes; its geometry does not
        return [CSI([0.1, 0.5, 0.1, 0.5], OP('k')) if _is(i, 'k') and [str(o) for o in i.operands]
                == ['0.1', '0.5', '0.1', '0'] else i for i in out]

    def respell(out):             # Echo's string changes; its origin does not
        return [CSI([pikepdf.String('Ecxo')], OP('Tj')) if _is(i, 'Tj') and bytes(i.operands[0]) == b'Echo'
                else i for i in out]

    ops13 = [{'op': 'move-paths', 'dx': -15, 'select': [CIRCLE]}]
    planted('AE-13q a move-paths wrap 1 pt off', nudge_wrap, ops13, 'path 2')
    planted('AE-13r a rewrite that adds a painted path', extra_path, ops13, 'paths/lines became')
    planted('AE-13s a rewrite that changes a path\'s colour', recolour, ops13, 'path 1')
    planted('AE-13t a rewrite that changes a line\'s string', respell, ops13, 'Ecxo')
    reason, msg, _ = refusal(ops13)
    check('AE-13u CONTROL the same op with the real rewrite applies', reason is None, f'{reason}: {msg}'[:200])

# ── 9. END TO END through figure-prepare.py ───────────────────────────────────────────
# A1 of the brief in miniature, on the generated page: the edit reaches runs.json, and prepare.json
# carries the summary; a selector 1 pt off fails the figure; no --config reads the SHIPPED config,
# whose table is empty, so the staged PDF is the input byte for byte and prepare.json has no key.
E2E = TD / 'e2e'
E2E.mkdir()
art = synth(E2E / 'artwork-in.pdf')
cfg9 = write_config(E2E / 'cfg.json', {'artworkEdits': {B: [
    {'op': 'move-text', 'dx': 5, 'select': [line('Bravo', 30, 80)]},
    {'op': 'move-edge', 'edge': 'left', 'to': 110, 'select': [BAND_A]}]}})

r0 = run_py(PREPARE, art, '--basename', B, '--out', E2E / 'plain')
pj0 = json.loads((E2E / 'plain' / 'prepare.json').read_text()) if (E2E / 'plain' / 'prepare.json').exists() else {}
check('AE-9c no --config: exit 0, no artworkEdits key, staged PDF byte-identical to the input',
      r0.returncode == 0 and 'artworkEdits' not in pj0
      and (E2E / 'plain' / f'{B}.pdf').read_bytes() == art.read_bytes(), f'{r0.returncode} {r0.stderr[-300:]}')

r1 = run_py(PREPARE, art, '--basename', B, '--out', E2E / 'edited', '--config', cfg9)
pj1 = json.loads((E2E / 'edited' / 'prepare.json').read_text()) if (E2E / 'edited' / 'prepare.json').exists() else {}
check('AE-9 --config with an entry: exit 0 (pre-task: argparse refuses --config, exit 2)',
      r1.returncode == 0, f'{r1.returncode} {r1.stderr[-300:]}')
check('AE-9a prepare.json carries artworkEdits: op, selected and objects per op',
      pj1.get('artworkEdits') == [
          {'op': 'move-text', 'selected': 1, 'objects': [{'text': 'Bravo', 'origin': [30.0, 80.0]}]},
          {'op': 'move-edge', 'selected': 1,
           'objects': [{'bbox': [120.0, 50.0, 200.0, 70.0], 'edge': 'left', 'to': 110.0}]}],
      f"{pj1.get('artworkEdits')!r}")


def runs_xy(d):
    p_ = Path(d) / 'runs.json'
    return {r_['text']: (r_['x'], r_['y']) for r_ in json.loads(p_.read_text())} if p_.exists() else {}


x0, x1 = runs_xy(E2E / 'plain'), runs_xy(E2E / 'edited')
check('AE-9b runs.json: Bravo moved by +5, every other run where the unedited prepare put it',
      bool(x0) and x1.get('Bravo') == (x0['Bravo'][0] + 5, x0['Bravo'][1])
      and {k: v for k, v in x1.items() if k != 'Bravo'} == {k: v for k, v in x0.items() if k != 'Bravo'},
      f'{x0!r} {x1!r}')
check('AE-9d the edited staged PDF is what prepare read (it differs from the input)',
      (E2E / 'edited' / f'{B}.pdf').exists()
      and (E2E / 'edited' / f'{B}.pdf').read_bytes() != art.read_bytes())

cfg9e = write_config(E2E / 'cfg-off.json', {'artworkEdits': {B: [
    {'op': 'move-edge', 'edge': 'left', 'to': 110, 'select': [dict(BAND_A, bbox=[121, 50, 201, 70])]}]}})
r2 = run_py(PREPARE, art, '--basename', B, '--out', E2E / 'off', '--config', cfg9e)
pj2 = json.loads((E2E / 'off' / 'prepare.json').read_text()) if (E2E / 'off' / 'prepare.json').exists() else {}
check('AE-9e a selector 1 pt off: exit 1, prepare.json error "artworkEdits refused: select-none"',
      refused(r2, 1) and str(pj2.get('error', '')).startswith('artworkEdits refused: select-none'),
      f"{r2.returncode} {pj2!r}"[:300])

cfg9f = E2E / 'cfg-rep.json'
cfg9f.write_text('{"artworkEdits": {}, "keptCopies": {"A": "x", "A": "y"}}', encoding='utf-8')
r3 = run_py(PREPARE, art, '--basename', B, '--out', E2E / 'rep', '--config', cfg9f)
pj3 = json.loads((E2E / 'rep' / 'prepare.json').read_text()) if (E2E / 'rep' / 'prepare.json').exists() else {}
check('AE-9f a config repeating a key ANYWHERE fails every figure, with or without an entry (G7)',
      refused(r3, 1) and str(pj3.get('error', '')).startswith('artworkEdits refused: config-unusable')
      and 'repeats the key(s)' in str(pj3.get('error', '')), f"{r3.returncode} {pj3!r}"[:300])

shutil.rmtree(TD, ignore_errors=True)
print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
