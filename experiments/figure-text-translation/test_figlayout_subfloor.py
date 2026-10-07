#!/usr/bin/env python3
"""figlayout.size_steps / decide - §C140 '6' R-16: a label the SOURCE set below R4's 7.5 pt floor may shrink to
SUB_FLOOR_RATIO (0.8) x its source size. A FAKE width (as test_figlayout.py: every character 0.5 em, so a 4 pt
label is 2 pt per character). No cairo, no PDFs, no prepared directory.

    FIGTEXT_PYLIBS=./pylibs python3 -B test_figlayout_subfloor.py

Ruling R-16 ([USER] 2026-10-05, campaign register): "Yes: shrink to 0.8 x source size, only where the source is
below 7.5 pt". It amends R4 (the 7.5 pt floor) and R5 (an overhang at the floor is named, never shrunk further),
both [USER] 2026-09-13 (frozen spec docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md).
R5 still holds AT THE NEW FLOOR: a word that does not fit at 0.8 x sz0 overhangs there and is named (R16e). The
measured arm is r2 of the 2026-10-05 composer design (env-gated prototype M7_FLOOR='0.8*sz0 if sz0<7.5 else 7.5');
the shipped form is a module constant, read at call time, and the threshold is size_steps' own `floor` argument.

RED-FIRST: R16-pre, R16a-h FAIL on a figlayout without R-16 (its ladder for sz0 < 7.5 is [sz0]). `check` turns a
missing attribute into a FAIL, never a crash.

CONTROLS (G13: they pass before and after R-16 by design; each was turned red by a planted mutant from a golden
copy - the mutants are named in the task report):
  R16i  size_steps(7.5, 7.5) == [7.5]: the boundary is the floor itself  (mutant: sz0 > floor + EPS is the test)
  R16j  a 9 pt label that cannot fit stops at exactly 7.5               (mutant: the sub-floor ladder for every sz0)
  R16k  a 7 pt label that fits at 7.0 is drawn at 7.0 - never enlarged, never shrunk when it fits
                                                                         (mutant: a ladder that skips sz0)
  R16l  SUB_FLOOR_RATIO = 1.0 is the exact before-arm: [sz0], and R16c's label back at 4.0 floor-overflow
                                                                         (mutant: 0.8 hardcoded, the constant ignored)
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))

import figlayout as FLY                                       # noqa: E402

fails = []


def check(label, fn):
    try:
        ok, detail = fn()
    except Exception as e:                       # a missing attribute on the pre-R-16 module counts as RED, not a crash
        ok, detail = False, f'{type(e).__name__}: {e}'
    print(('  PASS  ' if ok else '  FAIL  ') + label + ('' if ok else ': ' + str(detail)), flush=True)
    if not ok:
        fails.append(label)


def fw(chars, size, j):
    return sum(size * 0.5 for ch, st in chars)


def W(text):
    return [(w, [None] * len(w)) for w in text.split()]


def T(lay):
    return [''.join(ch for ch, _ in line) for line in lay['lines']]


def near(a, b, tol=1e-9):
    return abs(a - b) <= tol


def box(L, R, D, U):
    return dict(cls='box', why='t', L=L, R=R, D=D, U=U, src_left_margin=5.0, src_right_margin=5.0,
                src_up_margin=5.0, src_down_margin=5.0, align='center', align_why='box')


def open_(FLx, FRx, align='left'):
    return dict(cls='open', why='t', FL=FLx, FR=FRx, room_up=0.0, room_down=0.0, free_left_clear=5.0,
                free_right_clear=5.0, align=align, align_why='t')


def cues(n_src=1, sz0=9.0, starts=None):
    starts = starts if starts is not None else [10.0] * n_src
    return dict(n_src=n_src, sz0=sz0, starts=starts, ends=[s + 20.0 for s in starts],
                projs=[50.0 - k * sz0 * 1.222 for k in range(n_src)])


def decide(text, container, cu, **kw):
    """Through the production default: NO `floor` argument (R4's 7.5 is decide's default), pad 2."""
    return FLY.decide(W(text), fw, container, cu, pad=2.0, **kw)


def summary(lay):
    return (lay['size'], lay['step'], lay['overflow'])


print('R-16: the ladder below the floor')
check('R16-pre SUB_FLOOR_RATIO is 0.8 (ruling R-16)', lambda: (FLY.SUB_FLOOR_RATIO == 0.8, 'missing or not 0.8'))
# 4.0, 3.75, 3.5, 3.25 on the 0.25 grid; 3.0 is below 0.8 * 4.0 = 3.2, so the grid misses the floor and 3.2 is appended.
check('R16a size_steps(4.0, 7.5) runs 4.0 down to 0.8 x 4.0 = 3.2 (the floor appended off the grid)',
      lambda: (FLY.size_steps(4.0, 7.5) == [4.0, 3.75, 3.5, 3.25, 0.8 * 4.0], FLY.size_steps(4.0, 7.5)))
# 7.0 ... 5.75 on the grid, then 0.8 * 7.0 (5.6000000000000005 as a float) appended UNROUNDED - the measured r2 arm
# used the bare product, and byte identity with it is the acceptance check.
check('R16b size_steps(7.0, 7.5) ends 6.0, 5.75, 0.8 x 7.0 - bit-exact, never rounded',
      lambda: (FLY.size_steps(7.0, 7.5)[-3:] == [6.0, 5.75, 0.8 * 7.0] and FLY.size_steps(7.0, 7.5)[0] == 7.0,
               FLY.size_steps(7.0, 7.5)))
# 'aaaaaaaaaa' = 10 chars = 5 x size: 20 at 4.0, 18.75 at 3.75, 17.5 at 3.5. box R 22 -> width budget 18.
check('R16c a 4 pt label that misses at 4.0 and 3.75 is drawn at 3.5, step fit, no overflow',
      lambda: (summary(decide('aaaaaaaaaa', box(0, 22, 0, 30), cues(sz0=4.0))) == (3.5, 'fit', None),
               summary(decide('aaaaaaaaaa', box(0, 22, 0, 30), cues(sz0=4.0)))))
# box R 20.1 -> budget 16.1: 16.25 at 3.25 misses, 16.0 at the appended floor 3.2 fits.
check('R16d the same word in a 16.1 pt budget is drawn at the appended floor 3.2, step fit',
      lambda: (summary(decide('aaaaaaaaaa', box(0, 20.1, 0, 30), cues(sz0=4.0))) == (0.8 * 4.0, 'fit', None),
               summary(decide('aaaaaaaaaa', box(0, 20.1, 0, 30), cues(sz0=4.0)))))


def r16e():
    lay = decide('aaaaaaaaaa', box(0, 19, 0, 30), cues(sz0=4.0))      # budget 15 < 16.0 at 3.2
    ov = lay['overflow'] or {}
    got = (lay['step'], lay['size'], ov.get('sizePt'), ov.get('axis'), ov.get('word'))
    return got == ('floor-overflow', 0.8 * 4.0, 0.8 * 4.0, 'width', 'aaaaaaaaaa'), got


check('R16e R5 AT THE NEW FLOOR: a word that misses at 3.2 overhangs there and is named (sizePt 3.2, width)', r16e)
# R16c straight through FLY.decide with neither `floor` nor the wrapper: the rule must live in the production path.
check('R16f production default: FLY.decide with NO floor argument draws R16c at 3.5',
      lambda: ((lambda l: (l['size'], l['step']))(FLY.decide(W('aaaaaaaaaa'), fw, box(0, 22, 0, 30), cues(sz0=4.0),
                                                              pad=2.0)) == (3.5, 'fit'),
               summary(FLY.decide(W('aaaaaaaaaa'), fw, box(0, 22, 0, 30), cues(sz0=4.0), pad=2.0))))
# OPEN (the FoodLabel b31 shape in r2: 5.0 -> 4.0, v-overflow -> iii-anchor). Left anchor 8, FL 8, FR 100, pad 2:
# (i) budget 90, (ii) budget 88. 44 chars = 22 x size: 110 at 5.0, 93.5 at 4.25, 88 at 4.0 (= 0.8 x 5.0, on the grid).
# No vertical room, so (iv) cannot gain a line.
check('R16g open: a 5 pt label missing (i) and (ii) at 5.0 is drawn at 4.0 from its anchor (iii-anchor)',
      lambda: (summary(decide('a' * 44, open_(8, 100), cues(sz0=5.0, starts=[8.0]))) == (4.0, 'iii-anchor', None),
               summary(decide('a' * 44, open_(8, 100), cues(sz0=5.0, starts=[8.0])))))


# M1 x R-16 (R-3 arm B walks the same ladder): test_figlayout_anchors.py T4's ACID shape at 5 pt (2.5 pt per char).
# box R 38 -> budget 34. Base: 'Veik sýra Ka' / '= 6,8 × 10–4' (12 ch = 30 each) fits at 5.0. Anchored: 'Veik sýra' /
# 'Ka = 6,8 × 10–4' (15 ch) = 37.5 at 5.0, 35.625 at 4.75, 33.75 at 4.5 -> first fits at 4.5, below the source size.
def r16h():
    texts = ['Weak acid', 'Ka = 6.8 × 10–4']
    cu = dict(n_src=2, sz0=5.0, starts=[0.0, 0.0], ends=[2.5 * len(t) for t in texts],
              projs=[100.0, 89.0], texts=texts)
    lay = FLY.decide(W('Veik sýra Ka = 6,8 × 10–4'), fw, box(0, 38, 0, 40), cu, pad=2.0)
    m1 = lay.get('m1') or {}
    got = (T(lay), lay['size'], m1.get('shrunkFrom'))
    return got == (['Veik sýra', 'Ka = 6,8 × 10–4'], 4.5, 5.0), (got, m1)


check('R16h M1 x R-16: an anchored cut that misses at the 5 pt source size shrinks to 4.5 (shrunkFrom 5.0)', r16h)

print('\ncontrols')
check('R16i CONTROL size_steps(7.5, 7.5) == [7.5]: a source AT the floor gets no sub-floor ladder',
      lambda: (FLY.size_steps(7.5, 7.5) == [7.5], FLY.size_steps(7.5, 7.5)))
# 20 chars = 10 x size: 75 at 7.5 > budget 36 (R 40).
check('R16j CONTROL a 9 pt label that cannot fit stops at exactly 7.5 (R4 unchanged at or above the floor)',
      lambda: ((lambda l: (l['size'], l['step']))(decide('a' * 20, box(0, 40, 0, 30), cues())) == (7.5, 'floor-overflow'),
               summary(decide('a' * 20, box(0, 40, 0, 30), cues()))))
# 'aaaa' = 2 x size = 14 at 7.0, budget 56 (R 60).
check('R16k CONTROL a 7 pt label that fits at 7.0 is drawn at 7.0 (never enlarged, no shrink when it fits)',
      lambda: (summary(decide('aaaa', box(0, 60, 0, 30), cues(sz0=7.0))) == (7.0, 'fit', None),
               summary(decide('aaaa', box(0, 60, 0, 30), cues(sz0=7.0)))))


def r16l():
    real = getattr(FLY, 'SUB_FLOOR_RATIO', None)
    FLY.SUB_FLOOR_RATIO = 1.0
    try:
        steps = FLY.size_steps(4.0, 7.5)
        lay = decide('aaaaaaaaaa', box(0, 22, 0, 30), cues(sz0=4.0))
        got = (steps, lay['size'], lay['step'], (lay['overflow'] or {}).get('sizePt'))
    finally:
        if real is None:
            del FLY.SUB_FLOOR_RATIO
        else:
            FLY.SUB_FLOOR_RATIO = real
    return got == ([4.0], 4.0, 'floor-overflow', 4.0), got


check('R16l CONTROL SUB_FLOOR_RATIO = 1.0 is the exact before-arm: ladder [4.0], R16c back at 4.0 floor-overflow',
      r16l)
check('R16l-post SUB_FLOOR_RATIO is restored',
      lambda: (getattr(FLY, 'SUB_FLOOR_RATIO', None) in (None, 0.8), getattr(FLY, 'SUB_FLOOR_RATIO', None)))

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
