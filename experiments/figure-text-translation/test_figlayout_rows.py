#!/usr/bin/env python3
"""§C140 '6', M3 - a CELL label on the source's own line count is admissible on the source's own rows and is then
drawn on them (SOURCE_ROWS), and a short token ending in ')' after an earlier '(' on the label (presence, not bracket
balance) may end a line and never starts one (R9_CLOSER, [USER] R-19, 2026-10-05). CELL_CLAMP_BUDGET ships switched
off (spec D-c, R-7).

    FIGTEXT_PYLIBS=./pylibs python3 -B -u test_figlayout_rows.py

Plain checks and a module-level `fails` list, like its siblings - there is no pytest in this tree. PURE: no artwork,
no cairo, nothing composed, nothing spawned, no fixture file. A FAKE width function (0.5 em per character, 'ó' 0.9,
as test_figlayout.py) and containers DERIVED from the source frame the way figcontainers.source_frame derives them:
D/U = the source glyph box (ASC/DESC around the outer baselines) widened by the measured margins.

WHY NOT test_figlayout.py's helpers: its cell()/box() hard-code src margins of 5.0 independent of the cues, and its
cues() put the source pitch at exactly sz0 * 1.222 - so a source pitch below the lead, the one thing SOURCE_ROWS
reads, cannot occur there and that suite is vacuous for M3 (spec D-c). `src_cues` / `derived` below are the M3
design run's own fixtures (test_m3_final.py), renamed so they cannot be mistaken for test_figlayout's.

Design: docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md, D-c (M3).
Gates: figlayout.SOURCE_ROWS / CELL_CLAMP_BUDGET / R9_CLOSER; the private decide() kwargs _rows / _cclamp /
_r9close switch them per call.

WHAT IS PINNED, AND WHY EACH ONE CAN FAIL
----------------------------------------
The [... RED] checks. Five are red on the pre-M3 composer - [a1] keeps 2 lines, [a1] drawn on the rows, [c1] the
cut, [c5], [ac1]; the other three pass there (its 1-line layout fits; its R9 partition is bound too) and each is
turned red by the planted variant named beside it:
* [a1]  FoodLabel's green band (cell, 5 pt, two source rows 5.5 apart against a lead of 6.11, margins up 1.33 /
        down 0.39): a label on the source's 2 lines keeps them (the pad budget leaves 7.93 pt, 2 lines at the lead
        need 10.81), at step fit with heightFit True (red when heightFit is tested at the lead only), DRAWN on the
        source rows (lead 5.5, top = the first source baseline 206.12, vdisp 0), its glyph box inside the clamp
        interval [D + 0.39, U - 1.33] - what is tested is what is drawn. The draw and glyph-box checks go red on
        the M3 design run's own `nodraw` variant (tested on the rows, drawn at the lead).
* [c1]  'Skammta 1 bolli (228 g) Fjoldi skammta pakka 2': the cut falls after the closer 'g)', and that R9-bound
        partition is the one drawn (bound True; red when the closer may not end a line).
* [c5]  'aaaaaaaaaa (bb g) cccccccccccc': no line starts with 'g)' - the min-max cut (after '(bb') is refused.
        Red when a line may start with a closer.
* [ac1] the two together on the ruled FoodLabel serving value in its derived green band: 2 rows, broken after
        '(228 g)', step fit (pre-M3: 'Skammtastaerd 1 bolli (228' / 'g) Fjoldi ...', floor-overflow 10.81/7.92).
CONTROLS (G13: pass before and after by design; each names the planted variant that turns it red):
* [a3]  width forcing 3 lines in the green band is NAMED on the height axis (floor-overflow): the source rows admit
        n_src lines only. Red when on_rows drops BOTH its `n == n_src` and its clamp-height test.
* [a3b] the same text with the down margin widened to 8.0, so the clamp interval holds 3 lines at the source pitch
        while the pad budget still refuses 3 at the lead: still floor-overflow on height, rows False. Red when
        on_rows drops `n == n_src` alone (3 fit rows True, lead 5.5 - a third line on a source row that does not
        exist).
* [a3c] a container whose recorded margins over-report its D/U, so the source rows fall OUTSIDE the clamp interval:
        not admitted (1 line, rows False, identical to gates off). Red when on_rows drops its clamp-height test
        alone. Synthetic by necessity: with D/U derived from the source frame the clamp interval always holds the
        source rows at any size <= sz0.
* [a4]  source pitch == the lead: identical to the gates-off decision. Red when the pitch test admits a pitch EQUAL
        to the lead (`_p <= lead + EPS`).
* [a5]  source pitch WIDER than the lead (1.33x, the vitamin column): identical to gates off - the rule never makes
        a cell stricter. Red when the pitch test is dropped.
* [a6]  a BOX (R2 centres its glyph box): identical to gates off. Red when `cls == 'cell'` is dropped from the
        rows eligibility and the clamp interval (by this assertion). Dropped from the eligibility ALONE, decide
        raises TypeError on the box's hb_clamp None - red by crash, not by [a6] (G13 accepts a crash as red).
* [a7]  a whitespace-only source line (cues['blank']) is no row: identical to gates off. Red when the blank guard
        is dropped.
* [a8]  a 1-line source: identical to gates off. Red when `n_src >= 2` admits one line (pitch divisor max(1, ...)).
* [a9]  margins >= pad: the count fits at the lead, so it stays at the lead (identical to gates off). Red when the
        draw override drops its `glyph_h > hb` condition (drawn on the rows whenever they admit).
* [b1]  rule (E) still merges a lone connective (SciMethod shape). [b3] the ruled wording 'Kalsium' restores 4
        rows under (E), with no code. Rule (E) is unchanged by M3 (spec R-6); b1 is red with (E) off, b3 with
        (E)'s comparison inverted.
* [c2]  'Massi A atomanna': 'A' still binds forward (no bracket). Red only when `_closer` drops BOTH its
        endswith(')') and its opener test (every symbol a closer); either clause alone holds it - [c2b] pins the
        endswith(')') clause alone.
* [c2b] 'Massi (vid) A frumeindamassi': a symbol AFTER an opener that does not end with ')' still binds
        forward. Red when `_closer` drops endswith(')').
* [c3b] 'a) bbbbbbbbbb c': an enumerator 'a)' with no opener before it still binds forward (the min-max cut after
        it is refused). Red when `_closer` drops its opener test.
A RULING PROBE, not a control:
* [b2]  the committed value 'A-vitamin C-vitamin Kalk Jarn': (E) merges the 4th item - 'Kalk Jarn' on one row
        (what [USER] would have to exempt). Red with (E) off.
FIXED POINTS and a precondition (they state the invariant; no planted M3 variant can turn them red on these
fixtures, which is why [c2b] / [c3b] exist):
* [a2]  one line MORE than the source is still refused on height: the width admits 1 line, and the count search
        tries n_src before n_src + 1, so 3 lines are never reached. [a3] is the discriminating check.
* [a9 non-vacuity]  the margins >= pad arm draws 2 lines (gates off draws 2 too), so [a9] compares 2-line layouts.
* [c3]  the M3 design run's enumerator case 'a) aaaaaaa bbbbbbb': its min-max cut is after 'aaaaaaa' whatever the
        closer rule says. [c3b] is the discriminating one.
* [c4]  (A) unchanged, '(mPa s)': its min-max cut leaves '(mPa s)' together with or without (A) and the closer rule.
Gates-off controls ([a4]-[a9]) compare decide(..., gates on) with decide(..., **OFF), OFF = the three private
kwargs False - the module under test is its own baseline (a history-based baseline is vacuous at a depth-1 clone).
On a figlayout without SOURCE_ROWS, OFF is {} and those checks compare the module with itself.
Each of on_rows' two clauses is pinned alone ([a3b] `n == n_src`, [a3c] the clamp-height test); [a3] drops both.
NOT pinned: CELL_CLAMP_BUDGET is off and no check turns it on.
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, os.environ.get('FIGTEXT_PYLIBS', str(HERE / 'pylibs')))
sys.path.insert(0, str(HERE))
import figlayout as FLY  # noqa: E402

ASC, DESC = 0.73, 0.21
OFF = dict(_rows=False, _cclamp=False, _r9close=False) if hasattr(FLY, 'SOURCE_ROWS') else {}
fails = []


def check(label, ok, detail=''):
    print(('  PASS  ' if ok else '  FAIL  ') + label + (': ' + detail if detail else ''), flush=True)
    ok or fails.append(label)


def fw(chars, size, j):
    return sum(size * (0.9 if ch == 'ó' else 0.5) for ch, st in chars)


def words(t):
    return [(w, [None] * len(w)) for w in t.split()]


def texts(lay):
    return [''.join(c for c, _ in x) for x in lay['lines']]


def src_cues(sz0, projs, start=5.0, blank=None):
    """Cues of a source set at sz0 on the baselines `projs` (one per visual line), every line starting at `start`."""
    c = dict(n_src=len(projs), sz0=sz0, starts=[start] * len(projs), ends=[start + 60] * len(projs), projs=projs)
    if blank is not None:
        c['blank'] = blank
    return c


def derived(cls, L, R, sz0, projs, up, down, align='left'):
    """A container whose D/U are the SOURCE glyph box widened by the measured margins (figcontainers' relation)."""
    D = min(projs) - DESC * sz0 - down
    U = max(projs) + ASC * sz0 + up
    return dict(cls=cls, why='t', L=L, R=R, D=D, U=U, src_left_margin=1.0, src_right_margin=1.0,
                src_up_margin=up, src_down_margin=down, align='center' if cls == 'box' else align, align_why='t')


def dec(t, c, cu, **kw):
    return FLY.decide(words(t), fw, c, cu, **kw)


def same(a, b):
    keys = ('size', 'x0', 'top', 'lead', 'step', 'overflow', 'heightFit')
    return texts(a) == texts(b) and all(a[k] == b[k] for k in keys)


# FoodLabel's green band: 5 pt, two source rows 5.5 pt apart (lead guess 6.11), margins 1.33 up / 0.39 down.
P0 = 206.12
GB_PROJ = [P0, P0 - 5.5]
GB = derived('cell', 0, 200, 5.0, GB_PROJ, up=1.33, down=0.39)

print('(a) the source\'s own line count is admissible on its own rows, and drawn there')
lay = dec('aaaaaaaaaaaa bbbbbbbbbbbbb', GB, src_cues(5.0, GB_PROJ))   # 65 pt on one line: width allows 1 line
check('[a1 RED] a 2-line cell source keeps its 2 lines', len(lay['lines']) == 2,
      f"{texts(lay)} {lay['step']} {lay['overflow']}")
check('[a1 RED] ... step fit, nothing named, heightFit True',
      lay['step'] == 'fit' and lay['overflow'] is None and lay['heightFit'] is True,
      f"{lay['step']} {lay['overflow']} {lay['heightFit']}")
check('[a1 RED] ... drawn ON the source rows: lead 5.5, first baseline 206.12',
      abs(lay['lead'] - 5.5) < 1e-9 and abs(lay['top'] - P0) < 1e-9 and lay['vdisp'] == 0,
      f"lead {lay['lead']} top {lay['top']} vdisp {lay['vdisp']}")
g_top = lay['top'] + ASC * lay['size']
g_bot = lay['top'] - (len(lay['lines']) - 1) * lay['lead'] - DESC * lay['size']
check('[a1 RED] ... glyph box inside the clamp interval [D+0.39, U-1.33] (what is tested is what is drawn)',
      g_bot >= GB['D'] + 0.39 - 1e-9 and g_top <= GB['U'] - 1.33 + 1e-9,
      f"[{g_bot:.3f},{g_top:.3f}] in [{GB['D'] + 0.39:.3f},{GB['U'] - 1.33:.3f}]")
lay = dec('aaaa bbbb cccc', GB, src_cues(5.0, GB_PROJ))
check('[a2 FIXED POINT] one line MORE than the source is still refused on height', len(lay['lines']) <= 2,
      str(texts(lay)))
c3 = derived('cell', 0, 160, 5.0, GB_PROJ, up=1.33, down=0.39)
lay = dec('a' * 60 + ' ' + 'b' * 60 + ' ' + 'c' * 60, c3, src_cues(5.0, GB_PROJ))
check('[a3 CONTROL] width forcing 3 lines there is NAMED on the height axis',
      lay['step'] == 'floor-overflow' and (lay['overflow'] or {}).get('axis') == 'height',
      f"{texts(lay)} {lay['overflow']}")
# The same text with the down margin widened to 8.0: the clamp interval (16.2) now holds THREE lines at the source
# pitch (2 * 5.5 + 4.7 = 15.7) while the pad budget (15.53) still refuses three at the lead (16.92). Only on_rows'
# `n == n_src` keeps a third line off two source rows (down 7.5 .. 9.39 separates it; 0.39, 6.0 and 7.0 do not).
c3b = derived('cell', 0, 160, 5.0, GB_PROJ, up=1.33, down=8.0)
lay = dec('a' * 60 + ' ' + 'b' * 60 + ' ' + 'c' * 60, c3b, src_cues(5.0, GB_PROJ))
check('[a3b CONTROL] ... and with a clamp interval that holds 3 lines at the source pitch: still NAMED on height, '
      'not drawn on the rows (the rows admit n_src lines only)',
      lay['step'] == 'floor-overflow' and (lay['overflow'] or {}).get('axis') == 'height' and lay['rows'] is False,
      f"{texts(lay)} {lay['step']} {lay['overflow']} rows {lay['rows']}")
# A container whose recorded margins (2.0) OVER-report its geometry (D/U drawn with margins 0): the clamp interval
# (10.2 - 2 - 2 = 6.2) no longer holds the source's own rows (5.5 + 4.7 = 10.2). With D/U derived from the source
# frame this cannot happen (min(pad, m) never removes more than m), which is why only a synthetic margin source
# reaches on_rows' clamp-height test - the module keeps that test for exactly such a source.
c3c = dict(derived('cell', 0, 200, 5.0, GB_PROJ, up=0.0, down=0.0), src_up_margin=2.0, src_down_margin=2.0)
a, b = dec('aaaaaaaaaaaa bbbbbbbbbbbbb', c3c, src_cues(5.0, GB_PROJ)), \
    dec('aaaaaaaaaaaa bbbbbbbbbbbbb', c3c, src_cues(5.0, GB_PROJ), **OFF)
check('[a3c CONTROL] source rows OUTSIDE the clamp interval are not admitted: 1 line, not drawn on the rows, '
      'identical to gates off',
      len(a['lines']) == 1 and a.get('rows') is not True and same(a, b),
      f"{texts(a)} lead {a['lead']:.3f} rows {a.get('rows')} | off {texts(b)} lead {b['lead']:.3f}")
for lab, c, cu in (
        ('[a4 CONTROL] source pitch == lead: decision identical to gates off',
         derived('cell', 0, 200, 5.0, [P0, P0 - 6.11], 1.33, 0.39), src_cues(5.0, [P0, P0 - 6.11])),
        ('[a5 CONTROL] source pitch WIDER than the lead (1.33x, the vitamin column): never stricter, identical to '
         'gates off',
         derived('cell', 0, 200, 5.0, [P0, P0 - 6.65], 0.2, 0.2), src_cues(5.0, [P0, P0 - 6.65])),
        ('[a6 CONTROL] a BOX (R2 centres its glyph box): identical to gates off',
         derived('box', 0, 200, 5.0, GB_PROJ, 1.33, 0.39), src_cues(5.0, GB_PROJ)),
        ('[a7 CONTROL] a whitespace-only source line (blank cue) is not a row: identical to gates off', GB,
         src_cues(5.0, GB_PROJ, blank=[False, True])),
        ('[a8 CONTROL] a 1-line source: identical to gates off', derived('cell', 0, 200, 5.0, [P0], 0.39, 0.39),
         src_cues(5.0, [P0])),
        ('[a9 CONTROL] margins >= pad: the count fits at the lead, so it stays at the lead (not moved to the rows)',
         derived('cell', 0, 200, 5.0, GB_PROJ, 3.0, 3.0), src_cues(5.0, GB_PROJ)),
):
    a, b = dec('aaaaaaaaaaaa bbbbbbbbbbbbb', c, cu), dec('aaaaaaaaaaaa bbbbbbbbbbbbb', c, cu, **OFF)
    check(lab, same(a, b), f"{texts(a)} lead {a['lead']:.3f} top {a['top']:.3f} | "
                           f"off {texts(b)} lead {b['lead']:.3f} top {b['top']:.3f}")
a = dec('aaaaaaaaaaaa bbbbbbbbbbbbb', derived('cell', 0, 200, 5.0, GB_PROJ, 3.0, 3.0), src_cues(5.0, GB_PROJ))
check('[a9 non-vacuity] ... and it is 2 lines (the arm compares 2-line layouts: gates off draws 2 too)',
      len(a['lines']) == 2, str(texts(a)))

print('(b) rule (E) [USER] 2026-09-15 is UNCHANGED by M3 (its exemption is a ruling, not code)')
c = derived('box', 0, 70, 8.5, [50.0, 50 - 10.4, 50 - 20.8], 5.0, 5.0)   # SciMethod shape: 3 source lines
lay = dec('Studlar ad thekkingarforda', c, src_cues(8.5, [50.0, 50 - 10.4, 50 - 20.8]))
check('[b1 CONTROL] (E) still merges a lone connective: Studlar ad / thekkingarforda',
      texts(lay) == ['Studlar ad', 'thekkingarforda'], str(texts(lay)))
VC = [106.0, 99.35, 92.7, 86.05]                                          # FoodLabel vitamin column, 5 pt
c = derived('cell', 0, 60, 5.0, VC, 2.5, 2.5)   # margins >= pad: height does not bind here
lay = dec('A-vitamin C-vitamin Kalk Jarn', c, src_cues(5.0, VC))
check('[b2 RULING-PROBE] committed value: (E) merges the 4th item - Kalk Jarn on one row (what [USER] would exempt)',
      texts(lay) == ['A-vitamin', 'C-vitamin', 'Kalk Jarn'], str(texts(lay)))
lay = dec('A-vitamin C-vitamin Kalsium Jarn', c, src_cues(5.0, VC))
check('[b3 CONTROL] the ruled wording Kalsium restores 4 rows under (E), 0 code', len(lay['lines']) == 4,
      str(texts(lay)))

print('(c) R9: a short token CLOSING a bracket may end a line, and binds backward')
TWO = [25.0, 19.5]
lay = dec('Skammta 1 bolli (228 g) Fjoldi skammta pakka 2', derived('cell', 0, 70, 5.0, TWO, 10, 10),
          src_cues(5.0, TWO))
check('[c1 RED] the cut falls after "g)": "(228 g)" ends line 1', texts(lay)[0].endswith('(228 g)'), str(texts(lay)))
check('[c1 RED] ... and the R9-bound partition is the one drawn', lay['bound'] is True, str(lay['bound']))
lay = dec('Massi A atomanna', derived('cell', 0, 40, 5.0, TWO, 10, 10), src_cues(5.0, TWO))
check('[c2 CONTROL] "Massi A atomanna": A still binds forward', texts(lay) == ['Massi', 'A atomanna'],
      str(texts(lay)))
# 'Massi (vid) A frumeindamassi' (28 ch, 70 pt) in a 44 pt budget: 2 lines. The min-max cut is after 'A'
# ('Massi (vid) A' 32.5 / 'frumeindamassi' 35), which R9 refuses; the bound cut is before 'A' (27.5 / 40).
lay = dec('Massi (vid) A frumeindamassi', derived('cell', 0, 48, 5.0, TWO, 10, 10), src_cues(5.0, TWO))
check('[c2b CONTROL] a symbol after an opener that does not end with ")" still binds forward',
      texts(lay) == ['Massi (vid)', 'A frumeindamassi'], str(texts(lay)))
lay = dec('a) aaaaaaa bbbbbbb', derived('cell', 0, 30, 5.0, TWO, 10, 10), src_cues(5.0, TWO))
check('[c3 FIXED POINT] an enumerator "a)" with no opener still binds forward', not texts(lay)[0].endswith('a)'),
      str(texts(lay)))
# 'a) bbbbbbbbbb c' (15 ch, 37.5 pt) in a 34 pt budget: 2 lines. The min-max cut is after 'a)' (5 / 30), which R9
# refuses for a short token with no opener before it; the bound cut is before 'c' (32.5 / 2.5).
lay = dec('a) bbbbbbbbbb c', derived('cell', 0, 38, 5.0, TWO, 10, 10), src_cues(5.0, TWO))
check('[c3b CONTROL] an enumerator "a)" with no opener: the min-max cut after it is still refused',
      texts(lay) == ['a) bbbbbbbbbb', 'c'], str(texts(lay)))
lay = dec('Seigja aaaa (mPa s)', derived('cell', 0, 40, 5.0, TWO, 10, 10), src_cues(5.0, TWO))
check('[c4 FIXED POINT] (A) unchanged: a final "s)" never stands alone', texts(lay)[-1] != 's)', str(texts(lay)))
lay = dec('aaaaaaaaaa (bb g) cccccccccccc', derived('cell', 0, 60, 5.0, TWO, 10, 10), src_cues(5.0, TWO))
check('[c5 RED] "(bb | g)" is never split: no line starts with "g)"',
      not any(x.startswith('g)') for x in texts(lay)), str(texts(lay)))

print('(ac) the two together on the ruled FoodLabel serving value, in its derived green band (width 104 pt)')
c = derived('cell', 0, 104, 5.0, GB_PROJ, 1.33, 0.39)
lay = dec('Skammtastaerd 1 bolli (228 g) Fjoldi skammta i pakkningu 2', c, src_cues(5.0, GB_PROJ))
check('[ac1 RED] 2 rows, broken after "(228 g)", step fit',
      texts(lay) == ['Skammtastaerd 1 bolli (228 g)', 'Fjoldi skammta i pakkningu 2'] and lay['step'] == 'fit',
      f"{texts(lay)} {lay['step']} {lay['overflow']}")

print('ALL PASS' if not fails else f'{len(fails)} FAILED: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
