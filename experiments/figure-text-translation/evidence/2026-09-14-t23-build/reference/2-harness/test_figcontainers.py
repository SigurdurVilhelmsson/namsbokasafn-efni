#!/usr/bin/env python3
"""Tests for figcontainers.py - container detection and open/cell alignment (§C140 ③). Run:

    python3 test_figcontainers.py

Plain checks, like the siblings - no pytest in this tree.

Cases 1-10 use SYNTHETIC page dicts (the shape load_page() returns, planted by hand) and
blank/barred Pillow images, so they need neither a PDF nor pdfplumber. Case 11 builds a REAL
tiny PDF with cairo.PDFSurface in a temporary directory and proves pdfplumber reports what
cairo drew in the shape classify() expects - that is how the end-to-end tests plant
containers.

Each detection rule is paired with a POSITIVE CONTROL that differs from the refused case in
exactly the one property the rule tests (a rect 0.3 pt from the page edge is a box where one
0.1 pt from it is not; a rect of 29,850 pt² is a box where one of 30,000 pt² is not; a bar that
makes a label flush is removed and the label centres), so a harness that refused everything
could not read as a pass.
"""
import math
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))

from PIL import Image  # noqa: E402

import figcontainers as FC  # noqa: E402

fails = []


def check(label, ok, detail=''):
    print(('  PASS  ' if ok else '  FAIL  ') + label + (': ' + detail if detail else ''), flush=True)
    fails.append(label) if not ok else None


def close(a, b, tol=1e-9):
    return a is not None and b is not None and all(abs(x - y) <= tol for x, y in zip(a, b)) and len(a) == len(b)


# ------------------------------------------------------------------ synthetic builders
W, H = 400.0, 300.0


def run(x, y, text='Label', size=9.0, rot=0.0, adv=40.0):
    return {'x': x, 'y': y, 'rot': rot, 'size': size, 'adv': adv, 'text': text, 'font': 'F'}


def obj(kind, x0, y0, x1, y1, stroke=True, fill=False, lw=1.0, path=None, oid=None):
    o = {'object_type': kind, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1,
         'stroke': stroke, 'fill': fill, 'linewidth': lw, 'path': path or [], 'pts': []}
    if oid is not None:
        o['oid'] = oid
    return o


def page(rects=(), curves=(), lines=(), w=W, h=H):
    return {'width': w, 'height': h, 'bbox': (0.0, 0.0, w, h),
            'rects': list(rects), 'curves': list(curves), 'lines': list(lines)}


def blank(w=W, h=H):
    return Image.new('L', (math.ceil(w * FC.S), math.ceil(h * FC.S)), 255)


def bar(img, x0, x1, y0, y1, h=H):
    """paint a dark bar covering page rect [x0,x1]x[y0,y1] (pt, y-up)"""
    px = img.load()
    for ix in range(int(x0 * FC.S), int(x1 * FC.S)):
        for iy in range(int((h - y1) * FC.S), int((h - y0) * FC.S)):
            px[ix, iy] = 0
    return img


# one horizontal label: frame a0=100 a1=140, n0=100-0.21*10=97.9, n1=100+0.73*10=107.3
LABEL = [run(100.0, 100.0, size=10.0, adv=40.0)]
FR = FC.source_frame(LABEL)

print('\n== 0. source frame from the PDF advances, per run')
check('frame of a plain label', close(FR, (100.0, 140.0, 97.9, 107.3)), str(FR))
SUB = [run(100.0, 100.0, 'H', size=9.0, adv=6.5), run(106.5, 97.0, '2', size=6.0, adv=3.3)]
fs = FC.source_frame(SUB)
check('a subscript run pulls n0 down (per-run frame)', close(fs, (100.0, 109.8, 97.0 - 0.21 * 6.0, 100.0 + 0.73 * 9.0)), str(fs))
check('page_bbox of an unrotated frame is the frame', close(FC.page_bbox(LABEL), (100.0, 97.9, 140.0, 107.3)))

print('\n== 1. closed stroked rect -> box, inset by max(linewidth, MIN_RULE)/2')
p = page(rects=[obj('rect', 90, 90, 160, 120, lw=2.0)])
cls, inner, why = FC.classify(p, FC.page_bbox(LABEL))
check('lw 2.0 -> box', cls == 'box' and why == 'stroked-closed', f'{cls} {why}')
check('lw 2.0 -> inner inset 1.0 on every side', close(inner, (91, 91, 159, 119)), str(inner))
p = page(rects=[obj('rect', 90, 90, 160, 120, lw=0.0)])
cls, inner, why = FC.classify(p, FC.page_bbox(LABEL))
check('lw 0 (hairline) -> inset MIN_RULE/2 = 0.5', cls == 'box' and close(inner, (90.5, 90.5, 159.5, 119.5)), f'{cls} {inner}')
c = FC.container_for(0, [LABEL], p, blank(), H)
check('container_for box: inner in the along/normal frame',
      c['cls'] == 'box' and close((c['L'], c['R'], c['D'], c['U']), (90.5, 159.5, 90.5, 119.5)), str(c))
check('container_for box: source margins',
      close((c['src_left_margin'], c['src_right_margin'], c['src_up_margin'], c['src_down_margin']),
            (9.5, 19.5, 119.5 - 107.3, 97.9 - 90.5)), str(c))
check('container_for box: always centred (R2)', c['align'] == 'center', c['align_why'])
# a closed CURVE (rounded rect) is a box too; an OPEN stroked curve is not
cc = obj('curve', 90, 90, 160, 120, lw=1.5, path=['m', 'c', 'l', 'c', 'l', 'c', 'l', 'c', 'h'])
cls, inner, why = FC.classify(page(curves=[cc]), FC.page_bbox(LABEL))
check('closed curve (ends in h) -> box, inset 0.75', cls == 'box' and close(inner, (90.75, 90.75, 159.25, 119.25)), f'{cls} {inner}')
oc = obj('curve', 90, 90, 160, 120, lw=1.5, path=['m', 'c', 'l', 'c'])
cls, inner, why = FC.classify(page(curves=[oc]), FC.page_bbox(LABEL))
check('open stroked curve (a bracket) -> open', cls == 'open', f'{cls} {why}')

print('\n== 2. four rule segments that span the cell -> cell, inset by each rule\'s half-thickness')
rules = [obj('line', 90, 80, 90, 130, lw=0.5, oid=1), obj('line', 160, 80, 160, 130, lw=2.0, oid=2),
         obj('line', 80, 90, 170, 90, lw=0.5, oid=3), obj('line', 80, 120, 170, 120, lw=0.5, oid=4)]
cls, inner, why = FC.classify(page(lines=rules), FC.page_bbox(LABEL))
check('spanning rules -> cell via rules', cls == 'cell' and why == 'rules', f'{cls} {why}')
check('inner: 0.5 on the hairline sides, 1.0 on the 2 pt right rule', close(inner, (90.5, 90.5, 159.0, 119.5)), str(inner))

print('\n== 3. four rules that do NOT span (box edges + an arrow line) -> open')
# the label sits over an arrow BETWEEN two boxes: left/right are the boxes' facing edges, below is
# the arrow line (stops 5 pt short of the left box and 10 pt short of the right one), above is a
# long line. All four sides are bracketed, nothing encloses it.
boxA = obj('rect', 20, 80, 90, 130, lw=1.0, oid=10)
boxB = obj('rect', 160, 80, 230, 130, lw=1.0, oid=11)
arrow = obj('line', 95, 97, 150, 97, lw=1.0, oid=12)
top = obj('line', 60, 125, 200, 125, lw=1.0, oid=13)
ARROW_LABEL = [run(100.0, 100.0, size=8.0, adv=40.0)]
p3 = page(rects=[boxA, boxB], lines=[arrow, top])
cls, inner, why = FC.classify(p3, FC.page_bbox(ARROW_LABEL))
check('bracketing, non-spanning rules -> open', cls == 'open', f'{cls} {why}')
check('... and the why names the refusal', 'rules-not-spanning' in (why or ''), why)
# positive control: extend the arrow line to meet both boxes -> the same four sides span -> cell
arrow_full = obj('line', 90, 97, 160, 97, lw=1.0, oid=12)
cls, inner, why = FC.classify(page(rects=[boxA, boxB], lines=[arrow_full, top]), FC.page_bbox(ARROW_LABEL))
check('control: the same geometry with a spanning bottom rule -> cell', cls == 'cell' and why == 'rules', f'{cls} {why}')

print('\n== 4. fill-only rect -> cell, inset MIN_RULE/2')
cls, inner, why = FC.classify(page(rects=[obj('rect', 90, 90, 160, 120, stroke=False, fill=True, lw=0.0)]), FC.page_bbox(LABEL))
check('fill-only rect -> cell via fill-rect', cls == 'cell' and why == 'fill-rect', f'{cls} {why}')
check('fill-rect inner inset 0.5', close(inner, (90.5, 90.5, 159.5, 119.5)), str(inner))
cls, inner, why = FC.classify(page(curves=[obj('curve', 90, 90, 160, 120, stroke=False, fill=True, path=['m', 'l', 'l', 'l', 'h'])]), FC.page_bbox(LABEL))
check('a fill-only CURVE is not a label patch -> open', cls == 'open', f'{cls} {why}')

print('\n== 5. a candidate within EDGE of the page edge -> open')
cls, inner, why = FC.classify(page(rects=[obj('rect', 0.1, 90, 160, 120)]), FC.page_bbox(LABEL))
check('stroked rect 0.1 pt from the left page edge -> open', cls == 'open' and 'page-edge' in why, f'{cls} {why}')
cls, inner, why = FC.classify(page(rects=[obj('rect', 90, 90, 160, H - 0.2)]), FC.page_bbox(LABEL))
check('stroked rect 0.2 pt from the top page edge -> open', cls == 'open', f'{cls} {why}')
cls, inner, why = FC.classify(page(rects=[obj('rect', 0.3, 90, 160, 120)]), FC.page_bbox(LABEL))
check('control: 0.3 pt from the edge -> box', cls == 'box', f'{cls} {why}')
edge_rules = [obj('line', 0.2, 80, 0.2, 130, oid=1), obj('line', 160, 80, 160, 130, oid=2),
              obj('line', 0, 90, 170, 90, oid=3), obj('line', 0, 120, 170, 120, oid=4)]
cls, inner, why = FC.classify(page(lines=edge_rules), FC.page_bbox(LABEL))
check('rules cell whose left rule is 0.2 pt from the page edge -> open', cls == 'open' and 'rules-page-edge' in why, f'{cls} {why}')

print('\n== 6. an enclosing path covering >= 25 % of the page -> open')
cls, inner, why = FC.classify(page(rects=[obj('rect', 50, 50, 250, 200)]), FC.page_bbox(LABEL))  # 200*150 = 30000 = 25 %
check('stroked rect of exactly 25 % -> open', cls == 'open' and 'area' in why, f'{cls} {why}')
cls, inner, why = FC.classify(page(rects=[obj('rect', 50, 50, 249, 200)]), FC.page_bbox(LABEL))  # 29850
check('control: 24.9 % -> box', cls == 'box', f'{cls} {why}')
big_rules = [obj('line', 50, 40, 50, 210, oid=1), obj('line', 250, 40, 250, 210, oid=2),
             obj('line', 40, 50, 260, 50, oid=3), obj('line', 40, 200, 260, 200, oid=4)]   # cell 200 x 150 = 25 %
cls, inner, why = FC.classify(page(lines=big_rules), FC.page_bbox(LABEL))
check('rules cell of exactly 25 % -> open', cls == 'open' and 'rules-area' in why, f'{cls} {why}')
big_rules[1] = obj('line', 249, 40, 249, 210, oid=2)
cls, inner, why = FC.classify(page(lines=big_rules), FC.page_bbox(LABEL))
check('control: rules cell of 24.9 % -> cell', cls == 'cell' and why == 'rules', f'{cls} {why}')
cls, inner, why = FC.classify(page(rects=[obj('rect', 50, 50, 249, 200), obj('rect', 90, 90, 160, 120, lw=1.0)]), FC.page_bbox(LABEL))
check('nested: the smallest enclosing candidate wins', cls == 'box' and close(inner, (90.5, 90.5, 159.5, 119.5)), f'{cls} {inner}')

print('\n== 7. a block rotated 90 deg inside a box -> box, inner mapped into along/normal')
# rot 90: along = y, normal = -x. run at x=50, y=30, size 10, adv 40:
#   a0=30 a1=70, n0=-50-2.1=-52.1, n1=-50+7.3=-42.7 -> page bbox x [42.7,52.1], y [30,70]
R90 = [run(50.0, 30.0, size=10.0, rot=90.0, adv=40.0)]
check('rot 90 source frame', close(FC.source_frame(R90), (30.0, 70.0, -52.1, -42.7)), str(FC.source_frame(R90)))
check('rot 90 page bbox', close(FC.page_bbox(R90), (42.7, 30.0, 52.1, 70.0)), str(FC.page_bbox(R90)))
p7 = page(rects=[obj('rect', 10, 10, 60, 100, lw=1.0)])
c = FC.container_for(0, [R90], p7, blank(), H)
check('rot 90 -> box', c['cls'] == 'box', str(c))
check('rot 90 inner: L=10.5 R=99.5 D=-59.5 U=-10.5',
      close((c.get('L'), c.get('R'), c.get('D'), c.get('U')), (10.5, 99.5, -59.5, -10.5)), str(c))
check('rot 90 margins: left 19.5, right 29.5, up 32.2, down 7.4',
      close((c.get('src_left_margin'), c.get('src_right_margin'), c.get('src_up_margin'), c.get('src_down_margin')),
            (19.5, 29.5, 32.2, 7.4)), str(c))
R270 = [run(50.0, 70.0, size=10.0, rot=-90.0, adv=40.0)]   # along = -y, normal = x
c = FC.container_for(0, [R270], p7, blank(), H)
check('rot -90 -> box with inner L=-99.5 R=-10.5 D=10.5 U=59.5',
      c['cls'] == 'box' and close((c['L'], c['R'], c['D'], c['U']), (-99.5, -10.5, 10.5, 59.5)), str(c))
R89 = [run(50.0, 30.0, size=10.0, rot=89.6, adv=40.0)]
c = FC.container_for(0, [R89], p7, blank(), H)
check('rot 89.6 (within 0.5 of 90) -> box, inner inscribed (never wider than the exact one)',
      c['cls'] == 'box' and c['R'] - c['L'] <= 89.0 + 1e-9 and c['U'] - c['D'] <= 49.0 + 1e-9, str(c))

print('\n== 8. rotated 30 deg -> open "rotated", even inside a box')
R30 = [run(60.0, 60.0, size=10.0, rot=30.0, adv=20.0)]
c = FC.container_for(0, [R30], page(rects=[obj('rect', 10, 10, 160, 150)]), blank(), H)
check('rot 30 -> open with why rotated', c['cls'] == 'open' and c['why'] == 'rotated', str(c))
check('rot 30 still carries a free box', all(k in c for k in ('FL', 'FR', 'room_up', 'room_down', 'free_left_clear', 'free_right_clear')), str(sorted(c)))

print('\n== 9. container_for never raises')
bad = page(rects=[obj('rect', 90, 90, 160, 120)])
bad['rects'] = None
try:
    c = FC.container_for(0, [LABEL], bad, blank(), H)
    check('broken page dict -> open "error: TypeError"', c['cls'] == 'open' and c['why'] == 'error: TypeError', str(c))
    check('... with zero free room around the source frame',
          (c['FL'], c['FR'], c['room_up'], c['room_down'], c['free_left_clear'], c['free_right_clear']) == (100.0, 140.0, 0.0, 0.0, 0.0, 0.0), str(c))
except Exception as e:  # noqa: BLE001
    check('broken page dict -> open "error: TypeError"', False, f'RAISED {type(e).__name__}: {e}')
try:
    c = FC.container_for(0, [LABEL], page(), None, H)
    check('dark image None on an open block -> open "error: AttributeError"', c['cls'] == 'open' and c['why'] == 'error: AttributeError', str(c))
except Exception as e:  # noqa: BLE001
    check('dark image None on an open block -> open "error: AttributeError"', False, f'RAISED {type(e).__name__}: {e}')
try:
    c = FC.container_for(5, [LABEL], page(), blank(), H)
    check('index out of range -> open "error: IndexError", frame fallback 0', c['cls'] == 'open' and c['why'] == 'error: IndexError' and c['FL'] == 0.0, str(c))
except Exception as e:  # noqa: BLE001
    check('index out of range -> open "error: IndexError"', False, f'RAISED {type(e).__name__}: {e}')
c = FC.container_for(0, [LABEL], page(), blank(), H)
check('control: the same block on a sound page is open WITHOUT error', c['cls'] == 'open' and not c['why'].startswith('error'), str(c))

print('\n== 9b. [F7] an error container is visible ONLY through its `why` - the layout names nothing that fits')
# The docstring claim this replaces was false: zero free room does NOT make figlayout name the label. The error
# container's free box is the source frame's own along extent (100..140 -> b_ii = 40 - 2 * 2 = 36), so a translation
# that fits that width is laid out and drawn with NO overflow - even though its block really sat in a box. The only
# trace is `why`, which compose.py must report.
import figlayout as FLY  # noqa: E402


def _fw(chars, size, j):
    return sum(size * 0.5 for _ in chars)


def _words(text):
    return [(w, [None] * len(w)) for w in text.split()]


_cues = dict(n_src=1, sz0=9.0, starts=[100.0], ends=[140.0], projs=[100.0])
_boxed = page(rects=[obj('rect', 90, 90, 160, 120)])
_broken = page(rects=[obj('rect', 90, 90, 160, 120)])
_broken['rects'] = None
_cb = FC.container_for(0, [LABEL], _boxed, blank(), H)
_ce = FC.container_for(0, [LABEL], _broken, blank(), H)
check('[F7] precondition: the sound page makes the label a BOX; the broken copy of it an error container',
      _cb['cls'] == 'box' and _ce['cls'] == 'open' and _ce['why'] == 'error: TypeError', f"{_cb['cls']} {_ce['why']}")
_le = FLY.decide(_words('Suðumark'), _fw, _ce, _cues)          # 8 chars * 4.5 = 36 at 9 pt: exactly b_ii
check('[F7] a label that fits the source width under an error container: drawn at sz0 with overflow None - '
      'nothing but `why` records the error', _le['overflow'] is None and _le['size'] == 9.0 and _le['cls'] == 'open',
      f"{_le['step']} {_le['size']} {_le['overflow']}")
_lw = FLY.decide(_words('Suðumarksvatnsins'), _fw, _ce, _cues)  # 17 chars * 3.75 = 63.75 > 36 at the floor
check('[F7] CONTROL: a label wider than the source frame at the floor IS named (open step v) - the check above can fire',
      _lw['step'] == 'v-overflow' and (_lw['overflow'] or {}).get('word') == 'Suðumarksvatnsins', str(_lw['overflow']))
_lg = FLY.decide(_words('Suðumark vatns'), _fw, _ce, _cues)     # 63 at 9, 52.5 at 7.5: (i)-(iii) fail
check('[F7] an error container never gains a line (zero vertical room)', _lg['step'] == 'v-overflow', _lg['step'])
_lg0 = FLY.decide(_words('Suðumark vatns'), _fw, dict(_ce, room_down=30.0), _cues)
check('[F7] CONTROL: the same label WITH vertical room gains a line - the check above can fire',
      _lg0['step'] == 'iv-gain', _lg0['step'])
check('[F7] the module docstring no longer claims zero room makes the layout NAME the label',
      'NAMES the label' not in (FC.__doc__ or ''))
check('[F7] _error_container\'s docstring no longer claims the layout names any overhang',
      'names any overhang' not in (FC._error_container.__doc__ or ''))
# [F7] `why` is what compose reports on: every error path keeps the exact 'error: <ExceptionType>' form over the
# hostile inputs of the NUMBERS review (review-spec/p08), rebuilt on this file's synthetic label.
_hostile = {
    'page={}': ((0, [LABEL], {}, blank(), H), 'error: KeyError'),
    'rect missing x1': ((0, [LABEL], dict(page(), rects=[{'x0': 0, 'y0': 0, 'y1': 1, 'stroke': True}]), blank(), H),
                        'error: KeyError'),
    'blocks=[]': ((0, [], page(), blank(), H), 'error: IndexError'),
    'page_h=None on an open block': ((0, [LABEL], page(), blank(), None), 'error: TypeError'),
    'NaN coordinates': ((0, [[dict(r, x=float('nan')) for r in LABEL]], page(), blank(), H), 'error: ValueError'),
    'adv missing': ((0, [[{k: v for k, v in r.items() if k != 'adv'} for r in LABEL]], page(), blank(), H),
                    'error: KeyError'),
}
for _name, (_args, _why) in _hostile.items():
    try:
        _c = FC.container_for(*_args)
        check(f'[F7] hostile input {_name}: open, why {_why!r}', _c['cls'] == 'open' and _c['why'] == _why, str(_c['why']))
    except Exception as e:  # noqa: BLE001
        check(f'[F7] hostile input {_name}: open, why {_why!r}', False, f'RAISED {type(e).__name__}: {e}')

print('\n== 10. alignment')
# free box sanity on a blank page: label a0=100 -> left clear to the page edge
fb = FC.free_box(0, [LABEL], blank(), H)
# the image is ceil(400*S) = 1112 px wide, 0.32 pt wider than the page: the last on-image sample
# decides, so the right side may run one step past x = 400.
check('free box on a blank page: stopped by the page on every side',
      fb['by'] == {'left': 'page', 'right': 'page', 'up': 'page', 'down': 'page'}, str(fb))
check('free box FL/FR are along coordinates of the page edges (to one step)',
      abs(fb['FL'] - 0.0) <= FC.MARCH_STEP and abs(fb['FR'] - 400.0) <= FC.MARCH_STEP + 1e-9, str(fb))
check('free box room_up / room_down reach the page (to one step)',
      abs(fb['room_up'] - (H - 107.3)) <= FC.MARCH_STEP + 1e-9 and abs(fb['room_down'] - 97.9) <= FC.MARCH_STEP + 1e-9, str(fb))
# (a) flush: a dark bar ending 2 pt left of the label, nothing to its right
img = bar(blank(), 96.0, 98.0, 80.0, 120.0)
c = FC.container_for(0, [LABEL], page(), img, H)
check('flush: bar 2 pt to the left -> left, single-flush', c['align'] == 'left' and c['align_why'].startswith('single-flush'), f"{c['align']} {c['align_why']} L={c['free_left_clear']}")
c = FC.container_for(0, [LABEL], page(), blank(), H)
check('control: bar removed -> center', c['align'] == 'center', f"{c['align']} {c['align_why']}")
img = bar(blank(), 142.0, 144.0, 80.0, 120.0)
c = FC.container_for(0, [LABEL], page(), img, H)
check('flush: bar 2 pt to the right -> right', c['align'] == 'right' and c['align_why'].startswith('single-flush'), f"{c['align']} {c['align_why']}")
# another block is an obstacle too
NEIGH = [run(142.5, 100.0, 'X', size=10.0, adv=5.0)]
fb = FC.free_box(0, [LABEL, NEIGH], blank(), H)
check('another block\'s source line box stops the march', abs(fb['free_right_clear'] - 2.5) < 1e-9 and fb['by']['right'] == 'hit', str(fb))
# ... and its frame is PER RUN: a formula above whose subscript '3' hangs 3 pt below its baseline
# stops the up ray at the SUBSCRIPT's glyph box (n0 = 117 - 0.21*7 = 115.53 -> room 8.25), not at
# the base run's (120 - 0.21*9 = 118.11 -> room 11.0). The FishLemon labels under CH3COOH are this shape.
FORMULA = [run(100.0, 120.0, 'CH', size=9.0, adv=11.0), run(111.0, 117.0, '3', size=7.0, adv=4.0),
           run(115.0, 120.0, 'COOH', size=9.0, adv=25.0)]
check('fixture: the formula is one FT line', len(FC.line_frames(FORMULA)) == 1)
fb = FC.free_box(0, [LABEL, FORMULA], blank(), H)
check('an obstacle\'s subscript glyph box stops the up march (room_up 8.25, not 11.0)',
      abs(fb['room_up'] - 8.25) < 1e-9 and fb['by']['up'] == 'hit', str(fb))
# (b) left-only sibling cue, far from any obstacle
A = [run(100.0, 100.0, 'Short', size=9.0, adv=40.0)]
B = [run(100.1, 150.0, 'A much longer one', size=9.0, adv=80.0)]
c = FC.container_for(0, [A, B], page(), blank(), H)
check('left-only sibling cue (0.1 pt) -> left', c['align'] == 'left' and c['align_why'] == 'single-cue-left-only->left', f"{c['align']} {c['align_why']}")
# (c) rxn2 geometry: 'Reactant' b11 [92.222, 128.240] and 'Coefficient' b12 [85.220, 127.742] -
# right edges 0.498 pt apart, a coincidence. At the measured SIBLING_TOL 0.2 there is no cue.
REACT = [run(92.222, 148.659, 'Reactant', size=9.0, adv=128.240 - 92.222)]
COEF = [run(85.220, 131.658, 'Coefficient', size=9.0, adv=127.742 - 85.220)]
RXN2 = [REACT, COEF]
for i, nm in ((0, 'Reactant'), (1, 'Coefficient')):
    c = FC.container_for(i, RXN2, page(), blank(), H)
    check(f'rxn2 {nm}: 0.498 pt right-edge coincidence -> no cue -> center', c['align'] == 'center', f"{c['align']} {c['align_why']}")
# (d) ethene geometry: b0 left 22.527, b17 left 22.500 - a real column (0.027 pt) -> left
ETH0 = [run(22.527, 55.882, 'required to react with H2O to produce', size=9.0, adv=209.02 - 22.527)]
ETH17 = [run(22.5, 116.382, 'The number of moles and the mass of', size=9.0, adv=174.069 - 22.5)]
c = FC.container_for(1, [ETH0, ETH17], page(), blank(), H)
check('ethene b17: 0.027 pt left coincidence -> left', c['align'] == 'left' and c['align_why'] == 'single-cue-left-only->left', f"{c['align']} {c['align_why']}")
# (e) multi-line: two smallest spreads within AMBIG -> center; a clear left column -> left
AMB = [run(100.0, 100.0, 'line one', size=9.0, adv=40.0), run(100.3, 89.0, 'line two', size=9.0, adv=40.6)]
# starts spread 0.3, ends spread 0.9, centres spread 0.6 -> two smallest 0.3 / 0.6 differ by 0.3 < 0.5
check('fixture: the multi-line block has two FT lines', len(FC.line_frames(AMB)) == 2)
c = FC.container_for(0, [AMB], page(), blank(), H)
check('multi-line ambiguous (0.3 vs 0.6) -> center', c['align'] == 'center' and c['align_why'].startswith('multi-ambiguous'), f"{c['align']} {c['align_why']}")
LEFTCOL = [run(100.0, 100.0, 'line one', size=9.0, adv=40.0), run(100.0, 89.0, 'a second, longer line', size=9.0, adv=80.0)]
c = FC.container_for(0, [LEFTCOL], page(), blank(), H)
check('control: multi-line left column (0 vs 20) -> left', c['align'] == 'left' and c['align_why'].startswith('multi('), f"{c['align']} {c['align_why']}")
# (f) cell alignment keeps the source's: right-flush single line in a rules cell
CELLRULES = [obj('line', 20, 80, 20, 130, oid=1), obj('line', 160, 80, 160, 130, oid=2),
             obj('line', 10, 90, 170, 90, oid=3), obj('line', 10, 120, 170, 120, oid=4)]
RFLUSH = [run(100.0, 100.0, 'Molecular mass', size=9.0, adv=58.0)]   # a1 = 158; inner R = 159.5
c = FC.container_for(0, [RFLUSH], page(lines=CELLRULES), blank(), H)
check('cell: right-flush source (margins 79.5 / 1.5) -> right', c['cls'] == 'cell' and c['align'] == 'right', f"{c['cls']} {c['align']} {c['align_why']}")
MID = [run(60.0, 100.0, 'Element', size=9.0, adv=40.0)]
c = FC.container_for(0, [MID], page(lines=CELLRULES), blank(), H)
check('cell: centred source (margins 39.5 / 59.5) -> center', c['cls'] == 'cell' and c['align'] == 'center', f"{c['cls']} {c['align']} {c['align_why']}")
c = FC.container_for(0, [RFLUSH], page(rects=[obj('rect', 20, 80, 160, 130)]), blank(), H)
check('box: a right-flush source is still centred (R2)', c['cls'] == 'box' and c['align'] == 'center', f"{c['cls']} {c['align']}")

print('\n== 11. a REAL tiny PDF drawn with cairo: pdfplumber reports what classify expects')
try:
    import cairo
except Exception as e:  # noqa: BLE001
    cairo = None
    check('cairo importable for the real-PDF case', False, f'{type(e).__name__}: {e}')
if cairo is not None:
    PW, PH = 300.0, 200.0
    with tempfile.TemporaryDirectory() as td:
        pdf = os.path.join(td, 'containers.pdf')
        surf = cairo.PDFSurface(pdf, PW, PH)
        ctx = cairo.Context(surf)
        ctx.set_source_rgb(0, 0, 0)
        # (i) a stroked rect, cairo coords y-DOWN: x 20..120, y 20..80 -> PDF y 120..180
        ctx.set_line_width(1.0)
        ctx.rectangle(20, 20, 100, 60)
        ctx.stroke()
        # (ii) a rounded rect, closed: x 160..280, y 20..80
        ctx.set_line_width(1.5)
        r = 8.0
        x0, y0, x1, y1 = 160.0, 20.0, 280.0, 80.0
        ctx.new_sub_path()
        ctx.arc(x1 - r, y0 + r, r, -math.pi / 2, 0)
        ctx.arc(x1 - r, y1 - r, r, 0, math.pi / 2)
        ctx.arc(x0 + r, y1 - r, r, math.pi / 2, math.pi)
        ctx.arc(x0 + r, y0 + r, r, math.pi, 3 * math.pi / 2)
        ctx.close_path()
        ctx.stroke()
        # (iii) a 2x2 table grid of separate lines: x 20..220 (cols at 20, 120, 220), y 110..190 (rows at 110, 150, 190)
        ctx.set_line_width(0.5)
        for gx in (20, 120, 220):
            ctx.move_to(gx, 110)
            ctx.line_to(gx, 190)
            ctx.stroke()
        for gy in (110, 150, 190):
            ctx.move_to(20, gy)
            ctx.line_to(220, gy)
            ctx.stroke()
        surf.finish()
        pg = FC.load_page(pdf)
    shapes = {k: [(o['object_type'], o['stroke'], o['fill'], o['linewidth'], o['path'][-1:] if o['path'] else [],
                   tuple(round(o[z], 2) for z in ('x0', 'y0', 'x1', 'y1'))) for o in pg[k]] for k in ('rects', 'curves', 'lines')}
    for k in ('rects', 'curves', 'lines'):
        print(f'        pdfplumber {k}: {shapes[k]}')
    print(f"        page width/height/bbox: {pg['width']} {pg['height']} {pg['bbox']}")
    check('page size and origin', (pg['width'], pg['height'], pg['bbox']) == (PW, PH, (0.0, 0.0, PW, PH)))
    rect_hits = [o for o in pg['rects'] if abs(o['x0'] - 20) < 0.01 and abs(o['y0'] - 120) < 0.01]
    check('cairo rectangle()+stroke -> one rect, stroked, not filled, linewidth 1.0, y flipped to PDF 120..180',
          len(rect_hits) == 1 and rect_hits[0]['stroke'] and not rect_hits[0]['fill'] and rect_hits[0]['linewidth'] == 1.0
          and abs(rect_hits[0]['y1'] - 180) < 0.01, str(shapes['rects']))
    rr = [o for o in pg['curves'] if abs(o['x0'] - 160) < 0.01]
    check('cairo rounded rect (arcs + close_path) -> one curve, stroked, linewidth 1.5, closed',
          len(rr) == 1 and rr[0]['stroke'] and rr[0]['linewidth'] == 1.5 and FC._closed(rr[0]), str(shapes['curves']))
    check('cairo grid move_to/line_to/stroke -> six lines, linewidth 0.5', len(pg['lines']) == 6
          and all(o['object_type'] == 'line' and o['stroke'] and o['linewidth'] == 0.5 for o in pg['lines']), str(shapes['lines']))
    # plant labels: inside the rect, inside the rounded rect, inside grid cell (cols 20..120, PDF rows 50..90)
    in_rect = [run(40.0, 145.0, 'In box', size=9.0, adv=30.0)]
    in_round = [run(190.0, 145.0, 'Rounded', size=9.0, adv=40.0)]
    in_cell = [run(40.0, 65.0, 'Cell', size=9.0, adv=30.0)]
    blocks = [in_rect, in_round, in_cell]
    dark = Image.new('L', (math.ceil(PW * FC.S), math.ceil(PH * FC.S)), 255)
    c0 = FC.container_for(0, blocks, pg, dark, PH)
    check('real PDF: label in the cairo rect -> box, inner inset 0.5', c0['cls'] == 'box'
          and close((c0['L'], c0['R'], c0['D'], c0['U']), (20.5, 119.5, 120.5, 179.5), 1e-3), str(c0))
    c1 = FC.container_for(1, blocks, pg, dark, PH)
    check('real PDF: label in the rounded rect -> box, inner inset 0.75', c1['cls'] == 'box'
          and close((c1['L'], c1['R'], c1['D'], c1['U']), (160.75, 279.25, 120.75, 179.25), 1e-2), str(c1))
    c2 = FC.container_for(2, blocks, pg, dark, PH)
    check('real PDF: label in the grid -> cell via rules, inner inset 0.5', c2['cls'] == 'cell' and c2['why'] == 'rules'
          and close((c2['L'], c2['R'], c2['D'], c2['U']), (20.5, 119.5, 50.5, 89.5), 1e-3), str(c2))

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
