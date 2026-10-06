#!/usr/bin/env python3
"""figlayout.decide - §C140 '6' M1, SOURCE-ANCHORED CUTS, with a FAKE width (as test_figlayout.py: every
character 0.5 em, so 9 pt text is 4.5 pt per character). No cairo, no PDFs, no prepared directory.

    FIGTEXT_PYLIBS=./pylibs python3 -B test_figlayout_anchors.py

Design: docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md, D-a. Rulings
([USER] 2026-10-05, recorded in the campaign register): R-3 = arm B (M1_ANCHOR_SHRINK on - an anchored
cut that misses the budget at the chosen size is tried at smaller sizes, never at another count), R-4 =
yes (M1_ANCHOR_OVER_R9A on - an anchored cut may override R9 and (A) at the anchored position ONLY; the
free cuts keep R9, T9), R-6 (rule (E) decides the line count only; no (E) gate on M1's cut). Ported from
the M1 scratch suite (test_m1_final.py, 12 checks; there is no T6).

RED-FIRST: T1, T2, T3, T4, T7, T8 and T9 FAIL on a figlayout without M1 (it ignores cues['texts'] and
has no source_anchors / gates). `check` turns a missing attribute into a FAIL, never a crash.

CONTROLS (G13: they pass before and after M1 by design; each was turned red by a planted mutant from a
golden copy - the mutants are named in the task report):
  T5  the shrink gate off keeps the base cut and size        (mutant: ignore M1_ANCHOR_SHRINK)
  C1  a number ENDING a wrapped prose line pins nothing      (mutant: every line is a whole line)
  C2  no texts cue == the same call with the gates off       (mutant: fall back to the value's words)
  C3  an infeasible anchor set changes neither count nor cut (mutant: an infeasible set drops to the floor)
  C4  a box label already on its source rows is untouched    (mutant: the shrink walk skips the chosen size)

C5 is a CONTROL of a different kind (G16, 2026-10-06): it pins an invariant of M1 itself, so it passes with M1
and FAILS without it (m1 is absent there; the live anchor is asserted, never assumed). It stands in for a
refresh that was ruled out, not forgotten. The plan asked M1 to refresh a box/cell height overflow after an M1
shrink, on the premise that select() can end a height floor-overflow above the floor. It cannot: every branch
that sets the overflow leaves the size at sizes[-1], and m1_anchor shrinks only to sizes below the chosen one.
A fuzz of 60,000 decide() calls found 16,899 overflows (0 above the floor) and 502 M1 shrinks (0 with an
overflow). So overflow['sizePt'] is always the drawn size, and C5 pins that on one case:
  C5  a box HEIGHT floor-overflow with a live anchor stays at the floor and M1 records no shrink
      (mutants: a size_steps ladder that stops one step above the floor; m1_anchor recording shrunkFrom always)

MUTANT PINS (review-fix round G21, F1 n20-n27, n30, n32, n33, 2026-10-06). A mutation round found eleven M1 rules
that every suite let change unseen. Each check below is green on the shipped module and RED with the named mutant
planted (from a golden copy, one at a time); each asserts the layout's lines, so a mutant that silently drops an
anchor (falling back to the base partition) or moves a cut is seen. Every fixture is the finding's own or a
smaller one that discriminates the same way.
  A1  n20 (M66) a box WIDTH floor-overflow (widest word 45 > budget 36) holds the anchored cut to the widened `bud`,
      not the true budget - which no line holding that word can meet (mutant: m1_anchor passed `budget`)
  A2  n21 (M22) a closer anchor whose cut is the END of the text is dropped, and the other anchor kept - never an
      infeasible set that loses them all (mutant: `0 < c <= P.W`)
  A3  n22 (M14) a whitespace-only (' ') or NBSP-only middle source line pins nothing, by source_anchors and in
      decide (mutant: the blank-line guard deleted)
  A4  n23 (M09) a '.' decimal in the source anchors a ',' decimal in the value - the core Icelandic case (mutant:
      _m1_norm keeps the '.')
  A5  n24 (M06) a source line ending in ',' anchors the cut after the value's ',' word (mutant: no ',' closer)
  A6  n25 (M13) when the opening and the closing token of one boundary land on DIFFERENT cuts (the MT inserted a
      word), the opening one wins (mutant: closing tried first)
  A7  n26 (M10) the '(' class is an OPENING '(': a mid-word '(' (f(x)) is not counted (mutant: `'(' in w`)
  A8  n27 (M11) a list-marker class is a LEADING marker: a hyphenated word (a-b) is not counted (mutant:
      `kind[1] in w`)
  A9  n30 (M27) with (A) live on a box, the free cut keeps R9 (R9 + (A) tried before (A) alone): 'aa' / 'Cu ...',
      bound True (mutant: the two lone-tail modes swapped - 'aa Cu' / ..., bound False)
  A10 n32 (M20) a min-max TIE among an anchored partition's free cuts goes to the EARLIEST cut, as _Partition._row
      (mutant: the latest wins)
  A11 n33 (M67) after an M1 cut the layout's `bound` is M1's own (True on TICK), not the base partition's (mutant:
      `bound` not taken from m1)
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))

import figlayout as FL                                        # noqa: E402

fails = []


def check(label, fn):
    try:
        ok, detail = fn()
    except Exception as e:                       # a missing function on the pre-M1 module counts as RED, not a crash
        ok, detail = False, f'{type(e).__name__}: {e}'
    print(('  PASS  ' if ok else '  FAIL  ') + label + ('' if ok else ': ' + str(detail)), flush=True)
    if not ok:
        fails.append(label)


def fw(chars, size, j):
    return sum(size * 0.5 for ch, st in chars)


def W(text):
    return [(w, [None] * len(w)) for w in text.split()]


def T(lay):
    return [''.join(ch for ch, _ in l) for l in lay['lines']]


def open_(FLx, FRx, align='left'):
    return dict(cls='open', why='t', FL=FLx, FR=FRx, room_up=0.0, room_down=0.0, free_left_clear=5.0,
                free_right_clear=5.0, align=align, align_why='t')


def box(L, R, D, U):
    return dict(cls='box', why='t', L=L, R=R, D=D, U=U, src_left_margin=5.0, src_right_margin=5.0,
                src_up_margin=5.0, src_down_margin=5.0, align='center', align_why='box')


def cues(texts, sz0=9.0, x0=0.0):
    n = len(texts)
    return dict(n_src=n, sz0=sz0, starts=[x0] * n, ends=[x0 + 4.5 * len(t) for t in texts],
                projs=[100.0 - 11.0 * i for i in range(n)], texts=texts)


def gates(a=True, s=True, r=True):
    FL.M1_ANCHORS, FL.M1_ANCHOR_SHRINK, FL.M1_ANCHOR_OVER_R9A = a, s, r


def run(words, cont, cu, **g):
    if hasattr(FL, 'M1_ANCHORS'):
        gates(**g) if g else gates()
    try:
        return FL.decide(W(words), fw, cont, cu)
    finally:
        if hasattr(FL, 'M1_ANCHORS'):
            gates()


def nocue(cu):
    c = dict(cu)
    c.pop('texts', None)
    return c


TICK = ('5 0 Framvinda efnahvarfs', ['5', '0', 'Extent of reaction'])
# base min-max at 9 pt (4.5 pt/char): '5 0'=13.5 / 'Framvinda'=40.5 / 'efnahvarfs'=45 -> longest 45. Anchored:
# '5' / '0' / 'Framvinda efnahvarfs' = 90 pt. Free width from the left anchor 0 to FR 200 minus pad 2 = 198 >= 90.
check('T1 tick key: anchored cuts after the digits the source breaks after (R9 overridden at anchored cuts)',
      lambda: (T(run(TICK[0], open_(-50, 200), cues(TICK[1]))) == ['5', '0', 'Framvinda efnahvarfs'],
               T(run(TICK[0], open_(-50, 200), cues(TICK[1])))))
check('T2 gate M1_ANCHOR_OVER_R9A=False: anchors at R9-forbidden cuts are DROPPED -> the base layout',
      lambda: (FL.M1_ANCHOR_OVER_R9A is not None and
               T(run(TICK[0], open_(-50, 200), cues(TICK[1]), r=False)) == ['5 0', 'Framvinda', 'efnahvarfs'],
               T(run(TICK[0], open_(-50, 200), cues(TICK[1]), r=False))))
# ')' closes a source line, '(' opens one: 'Kjarni (11 róteindir, 12 nifteindir)' over 'Nucleus|(11 protons,|12 neutrons)'.
NAC = ('Kjarni (11 róteindir, 12 nifteindir)', ['Nucleus', '(11 protons,', '12 neutrons)'])
check('T3 NaCation: "(" and "," anchors put each item on its source row',
      lambda: (T(run(NAC[0], open_(-50, 200), cues(NAC[1]))) == ['Kjarni', '(11 róteindir,', '12 nifteindir)'],
               T(run(NAC[0], open_(-50, 200), cues(NAC[1])))))
# SHRINK: box budget = (R-L) - 2 pad = 66. 'Ka = 6,8 × 10–4' = 15 chars: 67.5 pt at 9 (> 66), 65.625 at 8.75.
# 'Ka' is an R9 symbol, so base's bound cut is that same 'Veik sýra / Ka ...' and misses 66 too -> base draws the
# unbound min-max 'Veik sýra Ka' (12 ch, 54) / '= 6,8 × 10–4' (12 ch, 54) at 9. Anchored: first fits at 8.75.
ACID = ('Veik sýra Ka = 6,8 × 10–4', ['Weak acid', 'Ka = 6.8 × 10–4'])
bx = box(0, 70, 0, 40)
check('T4 shrink (R-3 arm B): anchored cut misses the budget at sz0 -> same count at the largest size it fits (8.75)',
      lambda: ((lambda l: (T(l), l['size'], l['m1']['shrunkFrom']))(run(ACID[0], bx, cues(ACID[1])))
               == (['Veik sýra', 'Ka = 6,8 × 10–4'], 8.75, 9.0),
               (lambda l: (T(l), l['size'], l.get('m1')))(run(ACID[0], bx, cues(ACID[1])))))
check('T5 CONTROL gate M1_ANCHOR_SHRINK=False: the same label keeps the base cut and size',
      lambda: ((lambda l: (T(l), l['size']))(run(ACID[0], bx, cues(ACID[1]), s=False))
               == (['Veik sýra Ka', '= 6,8 × 10–4'], 9.0),
               (lambda l: (T(l), l['size']))(run(ACID[0], bx, cues(ACID[1]), s=False))))
check('T7 a shrunk BOX label is centred for the size it is DRAWN at (top recomputed after the shrink)',
      lambda: (lambda l: (abs(l['top'] - ((0 + 40) / 2 + 0.5 * l['lead'] - (FL.ASC - FL.DESC) / 2 * 8.75)) < 1e-9
                          and l['size'] == 8.75, (l['top'], l['size'])))(run(ACID[0], bx, cues(ACID[1]))))
check('T8 source_anchors: ordinal match, count mismatch pins nothing, a lone digit line pins by TOKEN',
      lambda: ((FL.source_anchors(['a (x)', 'b (y)', 'c'], ['A', '(X)', 'B', '(Y)', 'C']),
                FL.source_anchors(['a', '(x)'], ['A', '(X)', '(Z)']),
                FL.source_anchors(['0', 'Extent of reaction'], ['0', 'Framvinda', 'efnahvarfs']))
               == ({0: 2, 1: 4}, {}, {0: 1}),
               (FL.source_anchors(['a (x)', 'b (y)', 'c'], ['A', '(X)', 'B', '(Y)', 'C']),
                FL.source_anchors(['a', '(x)'], ['A', '(X)', '(Z)']),
                FL.source_anchors(['0', 'Extent of reaction'], ['0', 'Framvinda', 'efnahvarfs']))))

# R9 still binds the FREE cuts when an anchored cut overrides it (R-4): '5' (anchored, an R9 symbol) / free cut
# between 'xx Cu yyyyyyy'. Unbound min-max would cut after the symbol 'Cu' ('xx Cu' 5 ch / 'yyyyyyy' 7 ch); R9 on
# the free cut gives 'xx' / 'Cu yyyyyyy' (10 ch = 45 pt, inside 198). A rule that let the anchored override disable
# R9 everywhere (by falling back to the unbound mode) would draw 'xx Cu' / 'yyyyyyy'.
R9F = ('5 xx Cu yyyyyyy', ['5', 'aa bb', 'cc'])
check('T9 an anchored cut overrides R9 only AT that cut; the free cuts keep R9 (R-4)',
      lambda: (T(run(R9F[0], open_(-50, 200), cues(R9F[1]))) == ['5', 'xx', 'Cu yyyyyyy'],
               T(run(R9F[0], open_(-50, 200), cues(R9F[1])))))


# ---- controls: identical to the base layout where no anchor fires ----------------------------------------------
def strip(l):
    l = dict(l)
    l.pop('m1', None)
    return l


FOOT = ('*Hlutfall af ráðlögðum dagskammti er miðað við 2.000 hitaeininga mataræði.',
        ['*Percent Daily Values are based on a 2,000', 'calorie diet.'])
check('C1 CONTROL FoodLabel footnote: a number ENDING a wrapped prose line pins nothing (whole-line rule)',
      lambda: (getattr(FL, 'source_anchors', lambda a, b: {})(FOOT[1], FOOT[0].split()) == {}, 'anchored'))
check('C2 CONTROL no texts cue -> layout identical to the same call with the gates off',
      lambda: (strip(run(TICK[0], open_(-50, 200), nocue(cues(TICK[1]))))
               == strip(run(TICK[0], open_(-50, 200), nocue(cues(TICK[1])), a=False)), 'differs'))
# 'Hvatahólf 400 til 500 °C' over 'Catalyst|chamber|400 to 500 °C': the '400' anchor forces line 2 to be empty -> infeasible
FAC = ('Hvatahólf 400 til 500 °C', ['Catalyst', 'chamber', '400 to 500 °C'])
check('C3 CONTROL an infeasible anchor set never changes the count or the cut (13_03_factory shape)',
      lambda: (strip(run(FAC[0], open_(-50, 200), cues(FAC[1])))
               == strip(run(FAC[0], open_(-50, 200), cues(FAC[1]), a=False)), 'differs'))
check('C4 CONTROL a box label already on its source rows is untouched (anchored cut == min-max cut)',
      lambda: (strip(run('Litlar sameindir: - Lágt suðumark', box(0, 200, 0, 60),
                         cues(['Small molecules:', '- Low boiling point'])))
               == strip(run('Litlar sameindir: - Lágt suðumark', box(0, 200, 0, 60),
                            cues(['Small molecules:', '- Low boiling point']), a=False)), 'differs'))

# D7 (G16): 'Kjarni (11 róteindir)' over 'Nucleus|(11 protons)' in a box 57 wide (width budget 53) and 6 high
# (height budget 2). No count meets height at any size, so width picks 2 lines and the size walks to the floor:
# step 'floor-overflow', axis 'height', at 7.5. The '(' anchor is live, and the anchored cut 'Kjarni' / '(11
# róteindir)' (14 ch = 52.5 pt at 7.5) fits the budget at the floor and nowhere above it (54.25 at 7.75). So a
# height walk that stopped one step early would hand M1 a size it must shrink, and the overflow would then name a
# size that is not the drawn one. The floor is the literal 7.5 (decide's default), never read from size_steps,
# so a ladder that stops above the floor cannot move both sides of the comparison.
D7 = ('Kjarni (11 róteindir)', ['Nucleus', '(11 protons)'])


def d7_case():
    lay = run(D7[0], box(0, 57, 0, 6), cues(D7[1]))
    ov, m1 = lay['overflow'] or {}, lay.get('m1') or {}
    got = (T(lay), lay['step'], ov.get('axis'), bool(m1.get('anchors')), lay['size'], ov.get('sizePt'),
           m1.get('shrunkFrom', 'no m1'))
    return got == (['Kjarni', '(11 róteindir)'], 'floor-overflow', 'height', True, 7.5, 7.5, None), got


check('C5 CONTROL D7 invariant (G16): a box height floor-overflow with a live anchor stays at the floor,'
      ' its sizePt is the drawn size, and M1 records no shrink', d7_case)


# ---- mutant pins (G21 review-fix round, F1): see the docstring's MUTANT PINS ----------------------------------
def lines_m1(words, cont, cu):
    lay = run(words, cont, cu)
    return T(lay), (lay.get('m1') or {}).get('spans') is not None


# A1: box(0, 40, 0, 40): width budget 36, height budget 36. 'xxxxxxxxxxxx' is 12 characters = 45 at the 7.5 floor,
# so no size meets 36: a WIDTH floor-overflow, every line held to bud = max(36, 45) = 45. The '(' anchor puts
# '(11 cc)' (7 ch, 26.25) on its own row; 'xxxxxxxxxxxx' / 'aa bb' / '(11 cc)' is widest 45, which meets bud and can
# never meet 36. Three lines at the 10.998 lead are 29.05 high, inside 36.
def a1_case():
    lay = run('xxxxxxxxxxxx aa bb (11 cc)', box(0, 40, 0, 40), cues(['Nucleus', 'aa', '(11 protons)']))
    ov = lay['overflow'] or {}
    got = (T(lay), lay['step'], ov.get('axis'), ov.get('word'), (lay.get('m1') or {}).get('spans') is not None)
    return got == (['xxxxxxxxxxxx', 'aa bb', '(11 cc)'], 'floor-overflow', 'width', 'xxxxxxxxxxxx', True), got


check('A1 a box WIDTH floor-overflow honours the anchor against the widened budget it holds its lines to', a1_case)
# A2: '(11 protons)' closes with ')' and the value's only ')' word is its LAST, so boundary 1's cut is W (5): no line
# can follow it. That anchor is dropped; boundary 0 ('(11' opens line 2) is kept.
check('A2 an anchor whose cut is the end of the text is dropped; the valid one is still honoured',
      lambda: (lines_m1('Kjarni og fleira (11 róteindir)', open_(-50, 200),
                        cues(['Nucleus', '(11 protons)', 'and more']))
               == (['Kjarni og fleira', '(11', 'róteindir)'], True),
               lines_m1('Kjarni og fleira (11 róteindir)', open_(-50, 200),
                        cues(['Nucleus', '(11 protons)', 'and more']))))
# A3: without the guard, 'H2' (a whole-line TOKEN) pins boundary 0 after 'H2' across the empty line.
check('A3 a whitespace-only or NBSP-only middle source line pins nothing (source_anchors and decide)',
      lambda: ((lambda r: (r == [({}, (['H2 vatn', 'er gott', 'og kalt'], False))] * 2, r))(
          [(FL.source_anchors(['H2', blank, 'water is good'], 'H2 vatn er gott og kalt'.split()),
            lines_m1('H2 vatn er gott og kalt', open_(-50, 200), cues(['H2', blank, 'water is good'])))
           for blank in (' ', '\xa0')])))
check('A4 a "." decimal in the source anchors the "," decimal in the value (6.8 / 6,8)',
      lambda: (lines_m1('Massi sýnis 6,8 g', open_(-50, 200), cues(['Sample mass', '6.8 g']))
               == (['Massi sýnis', '6,8 g'], True),
               lines_m1('Massi sýnis 6,8 g', open_(-50, 200), cues(['Sample mass', '6.8 g']))))
# A5: 'kalium' opens nothing, so the only anchor is the ',' closing 'Natrium klorid,'. Min-max alone: 'aa bb, cc'.
check('A5 a source line ending in "," anchors the cut after the value\'s "," word',
      lambda: (lines_m1('aa bb, cc dd ee ff gg', open_(-50, 200), cues(['Natrium klorid,', 'kalium']))
               == (['aa bb,', 'cc dd ee ff gg'], True),
               lines_m1('aa bb, cc dd ee ff gg', open_(-50, 200), cues(['Natrium klorid,', 'kalium']))))
# A6: boundary 0 has an opening '(11' (target cut 2, before '(11') and a closing ',' (target cut 1, after 'Kjarni,').
check('A6 opening and closing anchors that disagree: the opening one wins',
      lambda: (lines_m1('Kjarni, aukaorð (11 róteindir)', open_(-50, 200), cues(['Nucleus,', '(11 protons)']))
               == (['Kjarni, aukaorð', '(11 róteindir)'], True),
               lines_m1('Kjarni, aukaorð (11 róteindir)', open_(-50, 200), cues(['Nucleus,', '(11 protons)']))))
# A7: one '(' opener in the source and one in the value ('(B)'); 'f(x)' holds a '(' mid-word and must not count.
check('A7 a mid-word "(" (f(x)) is no "(" anchor occurrence',
      lambda: (lines_m1('Fall f(x) og (B) gildi', open_(-50, 200), cues(['function', '(b) value']))
               == (['Fall f(x) og', '(B) gildi'], True),
               lines_m1('Fall f(x) og (B) gildi', open_(-50, 200), cues(['function', '(b) value']))))
check('A8 a hyphenated word (a-b) is no "-" list-marker occurrence',
      lambda: (lines_m1('Liður a-b og -Y gildi', open_(-50, 200), cues(['item', '-y value']))
               == (['Liður a-b og', '-Y gildi'], True),
               lines_m1('Liður a-b og -Y gildi', open_(-50, 200), cues(['item', '-y value']))))


# A9: a box (so (A) is live: the last word 'K' is a symbol), 3 source rows, boundary 1 anchored by '(s)' -> '(x)'.
# The free boundary 0 splits 'aa Cu bbbbbbb': R9 forbids the cut after the symbol 'Cu', which the unbound min-max
# takes ('aa Cu' 5 / 'bbbbbbb' 7 against 'aa' 2 / 'Cu bbbbbbb' 10). Both fit the 196 pt budget, so the FIRST mode
# tried decides: (R9 + (A)) gives 'aa' / 'Cu bbbbbbb', bound True.
def a9_case():
    lay = run('aa Cu bbbbbbb (x) K', box(0, 200, 0, 60), cues(['p q', 'r s', '(s) K']))
    m1 = lay.get('m1') or {}
    got = (T(lay), m1.get('bound'), lay['bound'])
    return got == (['aa', 'Cu bbbbbbb', '(x) K'], True, True), got


check('A9 a box label with (A) live: the anchored partition\'s free cut keeps R9 (R9 + (A) before (A) alone)', a9_case)
# A10: '(w)' anchors '(dd)' on line 3; 'aa bb cc' over the 2 free lines ties: 'aa' / 'bb cc' and 'aa bb' / 'cc' are
# both widest 5 characters (22.5 pt). The earliest cut wins, as in _Partition._row.
check('A10 a min-max tie among the free cuts of an anchored partition goes to the earliest cut',
      lambda: (lines_m1('aa bb cc (dd)', open_(-50, 200), cues(['x y', 'z', '(w)']))
               == (['aa', 'bb cc', '(dd)'], True),
               lines_m1('aa bb cc (dd)', open_(-50, 200), cues(['x y', 'z', '(w)']))))


def a11_case():
    lay = run(TICK[0], open_(-50, 200), cues(TICK[1]))
    m1 = lay.get('m1') or {}
    got = (T(lay), lay['bound'], m1.get('bound'))
    return got == (['5', '0', 'Framvinda efnahvarfs'], True, True), got


check('A11 after an M1 cut the layout reports M1\'s own `bound` (TICK: True)', a11_case)

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
