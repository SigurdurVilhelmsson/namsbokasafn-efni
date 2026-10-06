#!/usr/bin/env python3
"""Tests for figcontainers.py's SHARED BOX (§C140 '6', M7; ruling R-2a = C). Run:

    FIGTEXT_PYLIBS=./pylibs python3 -B -u test_figcontainers_sharedbox.py

Plain checks, like the siblings - no pytest in this tree. SYNTHETIC page dicts (the shape load_page()
returns, planted by hand), blank Pillow images and figlayout.decide with a hand-built `cues` dict: no
PDF, no prepared directory, no file IO.

THE PROPERTY: two labels in ONE stroked box must not be drawn on top of each other. It is checked by
VALUE (the glyph boxes figlayout.decide actually lays out), not by a class name - a class name is only
the mechanism. Every red arm has a control that differs in exactly the property under test.

WHAT IS PINNED
--------------
* S1  a heading over its body in one box (CellPhone's shape): the glyph boxes are disjoint, the heading
      keeps its source vertical centre, both are marked shared (cell path, `why` ends '+shared').
* P1  SHARED_BOX_ALIGN == 'center' - the R-2a = C gate value, an enforceable value; S1 then checks that
      every line is still centred.
* S2  three labels side by side in one stroked rect (CrystalSys' shape): none overprints, and the middle
      one is centred on its OWN source centre.
* C1  CONTROLS, green before and after M7: a label alone in a box stays a box drawn on the box centre
      (R2); a neighbour whose line centre is outside the box, or which is rotated 2 degrees, does not
      share it. S3 is the positive control for the rotation one: the same neighbour at 0.3 degrees does.
* C2  the switch: None restores R2 for a shared box; 'source' keeps a left column left (R3); 'center'
      centres it.
* C3  under 'source', cell_alignment is handed the block's `index` and `blocks` (M4's A2v hook needs
      them). No other check can tell that call from a 3-argument one: C2's 'source' column never reaches
      A2v. A recorder stands in for cell_alignment and is always restored.
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))

from PIL import Image  # noqa: E402

import figcontainers as FC  # noqa: E402
import figlayout as FLY  # noqa: E402

fails = []
MISSING = object()


def check(label, ok, detail=''):
    print(('  PASS  ' if ok else '  FAIL  ') + label + (': ' + detail if detail else ''), flush=True)
    if not ok:
        fails.append(label)


W, H = 400.0, 300.0


def run(x, y, text, size=9.0, rot=0.0, adv=None):
    return {'x': x, 'y': y, 'rot': rot, 'size': size, 'adv': adv if adv is not None else 0.5 * size * len(text),
            'text': text, 'font': 'F'}


def rect(x0, y0, x1, y1):
    return {'object_type': 'rect', 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'stroke': True, 'fill': False,
            'linewidth': 1.0, 'path': [], 'pts': []}


def page(*rects):
    return {'width': W, 'height': H, 'bbox': (0.0, 0.0, W, H), 'rects': list(rects), 'curves': [], 'lines': []}


def blank():
    return Image.new('L', (math.ceil(W * FC.S), math.ceil(H * FC.S)), 255)


def fw(chars, size, j):
    return sum(size * 0.5 for _ in chars)


def words(text):
    return [(w, [None] * len(w)) for w in text.split()]


def cues(block):
    starts = [FC.FT.along(r) for r in block]
    ends = [FC.FT.along(r) + r['adv'] for r in block]
    projs = [FC.FT.proj(r) for r in block]
    return dict(n_src=1, sz0=block[0]['size'], starts=starts, ends=ends, projs=projs)


def glyph_boxes(layout):
    """[(a0, a1, n0, n1)] of every drawn line, from the layout's own numbers."""
    out = []
    for j, (x, w) in enumerate(zip(layout['x0'], layout['widths'])):
        base = layout['top'] - j * layout['lead']
        out.append((x, x + w, base - FLY.DESC * layout['size'], base + FLY.ASC * layout['size']))
    return out


def overlap(A, B):
    """largest pairwise intersection (along, normal) between two labels' drawn glyph boxes; > 0 in both = overprint"""
    best = (0.0, 0.0)
    for a in A:
        for b in B:
            iw, ih = min(a[1], b[1]) - max(a[0], b[0]), min(a[3], b[3]) - max(a[2], b[2])
            if iw > 0 and ih > 0 and iw * ih > best[0] * best[1]:
                best = (iw, ih)
    return best


def lay(index, blocks, pg, text):
    c = FC.container_for(index, blocks, pg, blank(), H)
    return c, FLY.decide(words(text), fw, c, cues(blocks[index]))


BOX = rect(90, 60, 250, 140)                 # inner (90.5, 60.5, 249.5, 139.5)
HAS_SWITCH = hasattr(FC, 'SHARED_BOX_ALIGN')  # read BEFORE C2/C3 assign it

print('== P0. the switch exists (a renamed constant must go red, never skip)')
check('P0 module has SHARED_BOX_ALIGN', HAS_SWITCH)
check('P1 SHARED_BOX_ALIGN is \'center\' (R-2a = C)', getattr(FC, 'SHARED_BOX_ALIGN', MISSING) == 'center',
      repr(getattr(FC, 'SHARED_BOX_ALIGN', 'missing')))

print('\n== S1. heading over body in ONE box (CellPhone shape): the two labels must not overprint')
HEAD = [run(140.0, 120.0, 'Case components', adv=60.0)]
BODY = [run(100.0, 80.0, 'Polymers such as ABS', adv=70.0)]
pg = page(BOX)
ch, lh = lay(0, [HEAD, BODY], pg, 'Hlífaríhlutir')
cb, lb = lay(1, [HEAD, BODY], pg, 'Fjölliður eins og ABS')
ov = overlap(glyph_boxes(lh), glyph_boxes(lb))
check('S1 [RED before M7] heading and body glyph boxes are disjoint', ov == (0.0, 0.0), f'overlap {ov}')
check('S1 [RED before M7] the heading keeps its source vertical centre (within 0.5 pt)',
      abs((lh['top'] + (FLY.ASC - FLY.DESC) / 2 * lh['size']) - (120.0 + (FLY.ASC - FLY.DESC) / 2 * 9.0)) <= 0.5,
      f"top {lh['top']:.2f}")
check('S1 [RED before M7] both are marked shared (cell path, why ends +shared)',
      ch['cls'] == 'cell' and cb['cls'] == 'cell' and ch['why'].endswith('+shared') and cb['why'].endswith('+shared'),
      f"{ch['cls']} {ch['why']} / {cb['cls']} {cb['why']}")
check('S1 under the default SHARED_BOX_ALIGN every line is still centred (R2 look)',
      ch['align'] == 'center' and cb['align'] == 'center', f"{ch['align']} {cb['align']}")

print('\n== S2. side by side in ONE table cell drawn as a stroked rect (CrystalSys shape)')
L1 = [run(100.0, 80.0, 'Simple', adv=24.0)]
L2 = [run(160.0, 80.0, 'Face-centered', adv=50.0)]
L3 = [run(220.0, 80.0, 'Body', adv=20.0)]
blocks = [L1, L2, L3]
lays = [lay(i, blocks, pg, t)[1] for i, t in enumerate(['Einfalt', 'Flötungasett', 'Miðja'])]
pairs = [overlap(glyph_boxes(lays[i]), glyph_boxes(lays[j])) for i, j in ((0, 1), (1, 2), (0, 2))]
check('S2 [RED before M7] no two of the three side-by-side labels overprint', all(p == (0.0, 0.0) for p in pairs),
      str(pairs))
src_c = (160.0 + 50.0 / 2)
mid = lays[1]['x0'][0] + lays[1]['widths'][0] / 2
check('S2 [RED before M7] the middle label is centred on ITS OWN source centre (within 0.01 pt)',
      abs(mid - src_c) <= 0.01, f'{mid:.2f} vs {src_c:.2f}')

print('\n== C1. CONTROLS (green before AND after M7)')
c = FC.container_for(0, [HEAD], page(BOX), blank(), H)
check('C1 a single label alone in a box stays a box, centred (R2)', c['cls'] == 'box' and c['align'] == 'center'
      and c['why'] == 'stroked-closed', f"{c['cls']} {c['align']} {c['why']}")
l0 = FLY.decide(words('Hlífaríhlutir'), fw, c, cues(HEAD))
check('C1 ... and is drawn on the box centre', abs(l0['x0'][0] + l0['widths'][0] / 2 - 170.0) <= 1e-6,
      f"{l0['x0'][0] + l0['widths'][0] / 2:.3f}")
OUT = [run(300.0, 80.0, 'Elsewhere', adv=40.0)]          # centre (320, ~82) is OUTSIDE the box
c = FC.container_for(0, [HEAD, OUT], page(BOX), blank(), H)
check('C1 a neighbour whose line centre is OUTSIDE the box does not share it', c['cls'] == 'box', f"{c['cls']} {c['why']}")
ROT = [run(120.0, 70.0, 'Tilted', rot=2.0, adv=30.0)]    # line centre INSIDE the box, rotation 2 deg off
fa0, fa1, fn0, fn1 = FC.line_frames(ROT)[0]
check('C1 precondition: the tilted neighbour\'s line centre lies inside the box',
      90.5 <= (fa0 + fa1) / 2 <= 249.5 and 60.5 <= (fn0 + fn1) / 2 <= 139.5, f'{(fa0 + fa1) / 2:.1f}, {(fn0 + fn1) / 2:.1f}')
c = FC.container_for(0, [HEAD, ROT], page(BOX), blank(), H)
check('C1 a neighbour inside the box at another rotation (2 deg) does not share it', c['cls'] == 'box', f"{c['cls']} {c['why']}")
ROT03 = [run(120.0, 70.0, 'Tilted', rot=0.3, adv=30.0)]
c = FC.container_for(0, [HEAD, ROT03], page(BOX), blank(), H)
check('S3 [RED before M7] POSITIVE control for the line above: the same neighbour at 0.3 deg DOES share it',
      c['cls'] == 'cell' and c['why'].endswith('+shared'), f"{c['cls']} {c['why']}")

print('\n== C2. the switch')
LEFTB = [run(100.0, 80.0, 'Polymers such as ABS', adv=70.0), run(100.0, 70.0, 'and/or metals', adv=45.0)]
C2_LABELS = ['C2 SHARED_BOX_ALIGN = None restores R2 (box, centre) for a shared box',
             "C2 SHARED_BOX_ALIGN = 'source' keeps a left column left (R3)",
             "C2 SHARED_BOX_ALIGN = 'center' centres the same column"]
if not HAS_SWITCH:
    for label in C2_LABELS:
        check(label, False, 'no SHARED_BOX_ALIGN')
else:
    keep = FC.SHARED_BOX_ALIGN
    try:
        FC.SHARED_BOX_ALIGN = None
        c = FC.container_for(0, [HEAD, BODY], page(BOX), blank(), H)
        check(C2_LABELS[0], c['cls'] == 'box' and c['align'] == 'center', f"{c['cls']} {c['align']}")
        FC.SHARED_BOX_ALIGN = 'source'
        c = FC.container_for(1, [HEAD, LEFTB], page(BOX), blank(), H)
        check(C2_LABELS[1], c['cls'] == 'cell' and c['align'] == 'left', f"{c['cls']} {c['align']} {c['align_why']}")
        FC.SHARED_BOX_ALIGN = 'center'
        c = FC.container_for(1, [HEAD, LEFTB], page(BOX), blank(), H)
        check(C2_LABELS[2], c['cls'] == 'cell' and c['align'] == 'center', f"{c['cls']} {c['align']}")
    finally:
        FC.SHARED_BOX_ALIGN = keep

print('\n== C3. under \'source\', cell_alignment is handed the block\'s index and blocks (M4\'s A2v hook)')
C3_LABEL = "C3 SHARED_BOX_ALIGN = 'source' calls cell_alignment with index and blocks"
if not HAS_SWITCH:
    check(C3_LABEL, False, 'no SHARED_BOX_ALIGN')
else:
    keep, real = FC.SHARED_BOX_ALIGN, FC.cell_alignment
    calls = []

    def recorder(*a, **k):
        calls.append((a, k))
        return ('left', 'rec')

    try:
        FC.SHARED_BOX_ALIGN = 'source'
        FC.cell_alignment = recorder
        bl = [HEAD, BODY]
        c = FC.container_for(1, bl, page(BOX), blank(), H)
        got = None
        if len(calls) == 1:
            a, k = calls[0]
            idx = a[3] if len(a) > 3 else k.get('index', MISSING)
            blk = a[4] if len(a) > 4 else k.get('blocks', MISSING)
            got = (idx, blk)
        check(C3_LABEL, got is not None and got[0] == 1 and got[1] is bl and c['align'] == 'left'
              and c['align_why'] == 'rec',
              f"{len(calls)} call(s), args {len(calls[0][0]) if calls else '-'}, kwargs "
              f"{sorted(calls[0][1]) if calls else '-'}, {c['cls']} {c['align']} {c['align_why']}")
    finally:
        FC.SHARED_BOX_ALIGN = keep
        FC.cell_alignment = real
    check('C3-post cell_alignment and SHARED_BOX_ALIGN are restored',
          FC.cell_alignment is real and FC.SHARED_BOX_ALIGN == keep)

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
