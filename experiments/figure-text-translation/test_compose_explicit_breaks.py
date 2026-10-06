#!/usr/bin/env python3
"""§C140 '6' R-5a, the composer half: an LF (U+000A) in a translated sidecar value is the editor's EXPLICIT line
break. compose.py draws each segment on its own line, on the block's source rows, or refuses the figure by name -
it never again draws such a value as one line in silence.

    FIGTEXT_PYLIBS=./pylibs python3 -B -u test_compose_explicit_breaks.py

Design: docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md, R-5 (a) ([USER] ruled R-5a,
2026-10-05, recorded in the campaign register). The prototype is r15 commit 7af1d82; this file pins the shipped
rule, which differs from it in five places (the controller's T10a settlement): the value's formatting is
transferred on the value with each LF read as a space (same length, so every style offset is unchanged) and a
break on an R3 joint space is refused; at most n_src lines (the block's VISUAL source lines, M2-folded); no
modal-pitch fallback; an invisible-only line is refused; and an open label takes the b_i -> b_ii -> floor ladder,
a box or cell its TRUE width budget.

FOUR SECTIONS, ONE PROCESS
--------------------------
EL  figtext.explicit_lines - pure: which values are honoured, and every refusal with its line index.
X   figlayout.decide with cues['explicit'] - pure, the fake width of test_figlayout.py (0.5 em per character, so
    9 pt text is 4.5 pt per character); every number asserted is derived beside it.
CE  compose.py end to end on a PLANTED copy of the committed fixture (`fixtures/fixture_figure.pdf`, prepared into a
    temporary directory, its runs.json replaced, its artwork replaced by a blank page - the
    test_compose_anchors.py pattern), every run in the fixture's own font key `PAGE/F1`:
      P  `QZ pure water` / `QZ blood`, 9 pt, baselines 12.9507 apart - phscale's `pure water|blood` (the one
         planned consumer, the PR-B content edit), its x moved from 276.27 into the 300 pt page;
      S  `QZ single`, one line;
      F  `QZ CO` + a 7 pt `2` 3 pt below + `QZD` on a second line: a formula on a two-line block;
      N  `QZ ion NH` + a 7 pt `4` + a raised 7 pt `+`: a stacked charge (the ㉑ shape) - TWO FT.lines in its key, ONE visual
         line, so its `|` is not a row.
    The values are probe text (`QZ...`), never translations: `QZA QZB QZC\nQZD` on P is 3 + 1 words where the
    balanced cut of the same four words is 2 + 2, so a composer that ignores the LF is seen.
FCx figure-compose.py's verify() (loaded through importlib, test_figure_compose.py's pattern).

RED-FIRST. On the pre-task tree (no figtext.explicit_lines, compose.py ignoring LF, decide ignoring
cues['explicit'], verify ignoring explicitBreakErrors) every EL, X, CE and FCx check below FAILS except the
PRECONDITIONs and the ones labelled CONTROL, which pass on both sides by design (G13; each has a planted mutant in
the task report): CE2a (the space arm draws the balanced cut - its sha256 is printed, and equal on both trees),
CE4 (a formula keeps its subscript across a break), CE6b (the wrapper passes an honoured break) and FCx2 (verify
accepts a report whose breaks were all honoured). CE3b is red there for a second reason worth keeping: the
pre-task composer ran transfer on the LF-bearing value, so the stacked charge's R3 joint match (`NH4 +`) missed
across the LF and the `+` was drawn unformatted (the detail prints N's unformatted stretches in both arms) - the
case D1 (an LF read as a space) closes.
NOT PINNED HERE: whether a translated value reaches compose.py with its LF - the sidecar route, the editor and the
validators are T10b's.
"""
import ast
import hashlib
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
os.environ['SOURCE_DATE_EPOCH'] = '1700000000'  # BEFORE any child is spawned (CE3's byte identity)
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
sys.dont_write_bytecode = True

import cairo                                                  # noqa: E402
import figtext as FT                                          # noqa: E402
import figlayout as FLY                                       # noqa: E402
from blockkey import block_key, block_lines, block_english    # noqa: E402

PREPARE = HERE / 'figure-prepare.py'
COMPOSE = HERE / 'compose.py'
WRAPPER = HERE / 'figure-compose.py'
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'
PAGE_W, PAGE_H = 300.0, 220.0
BLACK = ['cmyk', 0.0, 0.0, 0.0, 1.0]
BASENAME = 'CNX_Fixture_R5a'

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


# ── EL. figtext.explicit_lines, pure ─────────────────────────────────────────────────────────
print('EL  figtext.explicit_lines')
J = object()                                    # a stand-in for figscripts.JOINT: compared by identity only


def el(raw, fmt=None, n_src=2, arc=False, joint=None):
    """-> the helper's (counts, error), or ('MISSING', exception text) when there is no such helper (pre-task)."""
    fn = getattr(FT, 'explicit_lines', None)
    if fn is None:
        return 'MISSING', 'figtext has no explicit_lines'
    try:
        return fn(raw, fmt, n_src, arc, joint=joint)
    except Exception as exc:                      # noqa: BLE001 - a raise is a wrong answer, named
        return 'RAISED', f'{type(exc).__name__}: {exc}'


def el_check(label, got, want):
    check(label, got == want, f'{got!r} want {want!r}')


el_check('EL1 a value with no LF is not an explicit-break value: (None, None)', el('a b c'), (None, None))
el_check('EL1b ... on an arc too (an arc refuses only an LF)', el('a b', arc=True), (None, None))
el_check("EL2 'a b\\nc' on two source lines -> words per line [2, 1]", el('a b\nc'), ([2, 1], None))
el_check("EL3 an empty line is refused empty-line, naming line 1", el('a\n\nb', n_src=3), (None, ('empty-line', 1)))
el_check("EL3b a spaces-only line is empty-line too (the prototype's `not .strip()`)", el('a\n  \nb', n_src=3),
         (None, ('empty-line', 1)))
el_check("EL4 a line with an edge space is refused edge-space, naming line 0", el('a \nb'), (None, ('edge-space', 0)))
el_check('EL5 a line of only U+200B (str.strip() keeps it) is refused invisible-line, naming line 1',
         el('a\n​'), (None, ('invisible-line', 1)))
el_check('EL6 three lines on a two-line source are refused line-count', el('a\nb\nc'), (None, ('line-count', None)))
el_check('EL7 an LF on a ONE-line source is refused line-count', el('a\nb', n_src=1), (None, ('line-count', None)))
el_check('EL8 an LF on an arc is refused arc', el('a\nb', arc=True), (None, ('arc', None)))
# 'NO2\n–': the LF is the value position R3 marked JOINT once the LF was read as a space ('NO2 –').
el_check('EL9 a break on a JOINT-styled position is refused break-at-joint, naming the line it would open',
         el('NO2\n–', fmt=[None, None, None, J, None], joint=J), (None, ('break-at-joint', 1)))
el_check("EL10 'a\\r\\nb' is refused edge-space on line 0 (a CR is whitespace, never a break)", el('a\r\nb'),
         (None, ('edge-space', 0)))
# 'NO2 –\nx': the joint space is ELIDED from the drawn text, so line 0 is ONE word ('NO2–') - the count must be
# taken on the string figscripts.words is run on, or the counts do not partition the label's words.
el_check('EL11 words are counted AFTER the joint elision: NO2 + joint + – is one word', el(
    'NO2 –\nx', fmt=[None, None, None, J, None, None, None], joint=J), ([1, 1], None))
el_check('EL12 the same value with no joint marked counts two words on line 0',
         el('NO2 –\nx', fmt=[None] * 7, joint=J), ([2, 1], None))

# ── X. figlayout.decide with cues['explicit'], pure ──────────────────────────────────────────
print('X   figlayout.decide')


def fw(chars, size, j):
    return sum(size * 0.5 * (st[0] if st else 1.0) for ch, st in chars)


def words_of(text):
    return [(w, [None] * len(w)) for w in text.split()]


def texts_of(lay):
    return [''.join(ch for ch, _ in line) for line in lay['lines']]


def near(a, b, tol=1e-9):
    return a is not None and b is not None and abs(a - b) <= tol


def box(L, R, D, U):
    return dict(cls='box', why='test', L=L, R=R, D=D, U=U, src_left_margin=5.0, src_right_margin=5.0,
                src_up_margin=5.0, src_down_margin=5.0, align='center', align_why='box')


def cell(L, R, D, U, align):
    return dict(cls='cell', why='test', L=L, R=R, D=D, U=U, src_left_margin=5.0, src_right_margin=5.0,
                src_up_margin=5.0, src_down_margin=5.0, align=align, align_why='test')


def open_(FL, FR, align):
    return dict(cls='open', why='test', FL=FL, FR=FR, room_up=0.0, room_down=0.0, free_left_clear=5.0,
                free_right_clear=5.0, align=align, align_why='test')


PITCH = 12.9507                                 # phscale's own source pitch (187.8415 - 174.8908)


def xcues(n_src=2, sz0=9.0, explicit=None, pitch=PITCH, projs=None, **extra):
    projs = projs if projs is not None else [50.0 - k * PITCH for k in range(n_src)]
    c = dict(n_src=n_src, sz0=sz0, starts=[10.0] * n_src, ends=[30.0] * n_src, projs=projs, **extra)
    if explicit is not None:
        c.update(explicit=explicit, explicit_pitch=pitch)
    return c


def lay(text, container, cu, **kw):
    try:
        return FLY.decide(words_of(text), fw, container, cu, **kw)
    except Exception as exc:                      # noqa: BLE001 - a raise is a wrong answer, named
        return {'RAISED': f'{type(exc).__name__}: {exc}'}


def show(L):
    if 'RAISED' in L:
        return L['RAISED']
    return (f"lines {texts_of(L)} size {L['size']} step {L['step']} top {L['top']:.4f} lead {L['lead']:.4f} "
            f"disp {L['disp']:.4f} vdisp {L['vdisp']:.4f} m1 {L['m1']!r} overflow {L['overflow']!r}")


# X1 - open, wide: 'aa bb' (22.5 pt at 9) fits b_i = 200 - 10 - 2. The balanced cut of 'aa bb cc' into the
# source's 2 lines is 'aa' / 'bb cc' (a 22.5 pt tie, the earlier cut wins), so the explicit [2, 1] is visible.
L = lay('aa bb cc', open_(0.0, 200.0, 'left'), xcues(explicit=[2, 1]))
check("X1 open: the lines are exactly the explicit partition, on the first source baseline at the explicit pitch, "
      "step 'explicit'", 'RAISED' not in L and texts_of(L) == ['aa bb', 'cc'] and near(L['top'], 50.0)
      and near(L['lead'], PITCH) and L['step'] == 'explicit' and L['size'] == 9.0, show(L))

L = lay('aa bb cc', open_(0.0, 200.0, 'left'), xcues(explicit=[2, 2]))
check('X2 explicit counts that do not partition the words raise ValueError',
      'RAISED' in L and L['RAISED'].startswith('ValueError') and 'partition' in L['RAISED'], show(L))

# X3 - box, width budget (42.5 - 0) - 2*2 = 38.5. 'aaaa bbbb' is 9 characters: 40.5 at 9, 39.375 at 8.75, 38.25 at
# 8.5 -> 8.5. (Without the explicit cue the box keeps 2 lines at 9: 'aaaa' / 'bbbb cc' = 31.5.)
L = lay('aaaa bbbb cc', box(0.0, 42.5, 0.0, 60.0), xcues(explicit=[2, 1]))
check("X3 box: the size is the largest step at which EVERY explicit line fits the width budget (8.5)",
      'RAISED' not in L and texts_of(L) == ['aaaa bbbb', 'cc'] and L['size'] == 8.5 and L['step'] == 'explicit'
      and L['overflow'] is None, show(L))

# X4 - box, budget (34 - 0) - 4 = 30. 'xxxxxxxxxx' is 10 characters: 37.5 at the 7.5 floor, so nothing fits. The
# box path's own floor-overflow holds its lines to max(budget, widest word) = 37.5, which this line WOULD fit - the
# explicit route measures against the TRUE budget and names the overhang.
L = lay('xxxxxxxxxx yy', box(0.0, 34.0, 0.0, 60.0), xcues(explicit=[1, 1]))
ov = L.get('overflow') or {}
check("X4 box, nothing fits: drawn at the floor, step 'explicit-overflow', the width overhang named against the "
      "TRUE budget (30), not the box path's widest-word budget (37.5)",
      'RAISED' not in L and texts_of(L) == ['xxxxxxxxxx', 'yy'] and L['size'] == 7.5
      and L['step'] == 'explicit-overflow' and ov.get('axis') == 'width' and near(ov.get('budgetPt'), 30.0)
      and near(ov.get('needPt'), 37.5) and ov.get('sizePt') == 7.5 and near(L.get('budget'), 30.0), show(L))

# X5 - open, FL 0, FR 60, anchor 10 (left): b_i = 60 - 10 - 2 = 48, b_ii = 60 - 4 = 56. 'aaaaaaaaaaaa' is 12
# characters = 54 at 9: over b_i, within b_ii -> drawn at 9, DISPLACED: x0 10 -> e1 64 > 58, shift -6. A ladder that
# shrank before displacing would draw it undisplaced at 8.0 (54 * 8/9 = 48).
L = lay('aaaaaaaaaaaa b', open_(0.0, 60.0, 'left'), xcues(explicit=[1, 1]))
check("X5 open: a line within b_ii but not b_i is drawn at sz0 displaced (b_i, then b_ii, at EACH size)",
      'RAISED' not in L and texts_of(L) == ['aaaaaaaaaaaa', 'b'] and L['size'] == 9.0 and L['step'] == 'explicit'
      and near(L['disp'], -6.0) and near(L['x0'][0], 4.0) and near(L.get('budget'), 56.0), show(L))

# X6 - box L 0 R 100 D 0 U 40: top = (D+U)/2 + (n-1)/2 * pitch - (ASC-DESC)/2 * s = 20 + 6.47535 - 2.34.
L = lay('aa bb', box(0.0, 100.0, 0.0, 40.0), xcues(explicit=[1, 1]))
check('X6 box: centred at the explicit pitch (top 24.13535, lead 12.9507, align center)',
      'RAISED' not in L and texts_of(L) == ['aa', 'bb'] and near(L['top'], 20 + PITCH / 2 - 0.26 * 9.0)
      and near(L['lead'], PITCH) and L['align'] == 'center' and L['step'] == 'explicit', show(L))

# X7 - a cell on a THREE-line source, 2 explicit lines at the mean pitch: top = projs[0] = 50, glyph top
# 50 + 0.73*9 = 56.57 above the clamp's ceiling U - min(2, 5) = 53 -> vdisp = -3.57, top 46.43.
L = lay('aa bb', cell(0.0, 100.0, 0.0, 55.0, 'left'), xcues(n_src=3, explicit=[1, 1]))
check('X7 cell: drawn from the first source baseline, then the cell\'s vertical clamp applied (vdisp -3.57)',
      'RAISED' not in L and texts_of(L) == ['aa', 'bb'] and near(L['vdisp'], 53.0 - (50.0 + 0.73 * 9.0))
      and near(L['top'], 50.0 + L['vdisp']) and near(L['lead'], PITCH) and L['step'] == 'explicit', show(L))

# X8 - open, n_src 2 and 2 lines, rows 12.9507 apart against sz0*LEAD 10.998: P1v would redraw on the source rows
# (lead 12.9507). The explicit pitch here is a deliberately different 7.0, so a P1v that ran would be seen.
L = lay('aa bb', open_(0.0, 200.0, 'left'), xcues(explicit=[1, 1], pitch=7.0))
check('X8 P1v never runs on an explicit label: the lead stays the explicit pitch (7.0), not the source rows\'',
      'RAISED' not in L and near(L['lead'], 7.0) and near(L['top'], 50.0), show(L))

# X9 - M1: 'Nucleus' / '(11 protons)' anchors a cut before '(11' (test_figlayout_anchors.py's C5 shape).
src_texts = ['Nucleus', '(11 protons)']
base = lay('Kjarni (11 róteindir)', open_(0.0, 200.0, 'left'), xcues(texts=src_texts))
precondition('X9 without the explicit cue M1 anchors this label', 'RAISED' not in base and base['m1'] is not None,
             show(base))
L = lay('Kjarni (11 róteindir)', open_(0.0, 200.0, 'left'), xcues(explicit=[2, 1], texts=src_texts))
check("X9 the editor's break wins over an M1 anchor: lines as typed, m1 None",
      'RAISED' not in L and texts_of(L) == ['Kjarni (11', 'róteindir)'] and L['m1'] is None, show(L))

# ── CE. compose.py end to end ─────────────────────────────────────────────────────────────────
print('CE  compose.py, planted')
_mf = ast.parse((HERE / 'make_fixture.py').read_text())
_W = next(ast.literal_eval(n.value) for n in _mf.body if isinstance(n, ast.Assign)
          and any(getattr(t, 'id', None) == 'WIDTHS' for t in n.targets))
_FIRST = next(ast.literal_eval(n.value)[0] for n in _mf.body if isinstance(n, ast.Assign)
              and isinstance(n.targets[0], ast.Tuple)
              and [e.id for e in n.targets[0].elts] == ['FIRST_CHAR', 'LAST_CHAR'])


def fixture_adv(text, size):
    return round(sum(_W[ord(c) - _FIRST] for c in text) * size / 1000.0, 3)


def run(text, size, x, y):
    return dict(text=text, font='PAGE/F1', size=size, rot=0.0, x=x, y=y, adv=fixture_adv(text, size),
                fill=BLACK, tm=[1.0, 0.0, 0.0, 1.0, x, y])


PY0, PY1 = 187.8415 - 37.0, 174.8908 - 37.0     # phscale's two baselines, moved down into the 220 pt page
P_RUNS = [run('QZ pure water', 9.0, 50.0, PY0), run('QZ blood', 9.0, 50.0, PY1)]
S_RUNS = [run('QZ single', 9.0, 50.0, 60.0)]
F_RUNS = [run('QZ CO', 9.0, 180.0, 150.0), run('2', 7.0, 180.0 + fixture_adv('QZ CO', 9.0), 147.0),
          run('QZD', 9.0, 180.0, 150.0 - PITCH)]
_NH = fixture_adv('QZ ion NH', 9.0)
N_RUNS = [run('QZ ion NH', 9.0, 180.0, 60.0), run('4', 7.0, 180.0 + _NH, 57.0),
          run('+', 7.0, 180.0 + _NH + fixture_adv('4', 7.0), 64.0)]
KP, KS, KF, KN = 'QZ pure water|QZ blood', 'QZ single', 'QZ CO2|QZD', 'QZ ion NH4|+'

TMP = tempfile.TemporaryDirectory(prefix='c140-r5a-explicit-')
TD = Path(TMP.name)
FIG = TD / 'fig'
env0 = dict(os.environ)
env0.pop('FIGTEXT_OUT', None)
prep = subprocess.run([sys.executable, str(PREPARE), str(FIXTURE), '--basename', BASENAME, '--out', str(FIG)],
                      capture_output=True, text=True, env=env0)
precondition('the fixture prepares', prep.returncode == 0, prep.stderr.strip()[-400:])
(FIG / 'runs.json').write_text(json.dumps(P_RUNS + S_RUNS + F_RUNS + N_RUNS, ensure_ascii=False))
pdf = FIG / 'artwork.pdf'
surf = cairo.PDFSurface(str(pdf), PAGE_W, PAGE_H)
_c = cairo.Context(surf)
_c.set_source_rgb(1, 1, 1)
_c.paint()
surf.finish()
r = subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(pdf), str(FIG / 'artwork')],
                   capture_output=True, text=True)
precondition('the planted artwork renders', r.returncode == 0 and (FIG / 'artwork.png').exists(), r.stderr[-300:])
runs = json.loads((FIG / 'runs.json').read_text())
fonts = json.loads((FIG / 'meta.json').read_text())['fonts']
blocks = FT.merge_blocks(FT.group(runs))
entries = [dict(key=block_key(b), english=block_english(b), lines=block_lines(b), arc=FT.is_arc(b),
                send=FT.sendable(b, block_english(b), fonts)) for b in blocks]
(FIG / 'blocks.json').write_text(json.dumps(entries, indent=1, ensure_ascii=False))
BI = {e['key']: i for i, e in enumerate(entries)}
nvis = {block_key(b): len(FT.visual_lines(b)) for b in blocks}
precondition('the plant is four sendable blocks: P and F on TWO visual lines, S and the stacked charge N on ONE',
             sorted(BI) == sorted([KP, KS, KF, KN]) and all(e['send'] for e in entries)
             and nvis == {KP: 2, KS: 1, KF: 2, KN: 1}, f"{[(e['key'], e['send']) for e in entries]} {nvis}")


def elements(svg_text):
    """The LAID-OUT <text> pieces (svgout draws those, and only those, with font-kerning:none):
    [{text, x, y (PDF, y up), size, raw}] in document order."""
    out = []
    for m in re.finditer(r'<text ([^>]*)>([^<]*)</text>', svg_text):
        a = dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1)))
        if 'font-kerning:none' not in a.get('style', ''):
            continue
        out.append(dict(text=m.group(2), x=float(a['x']), y=PAGE_H - float(a['y']), size=float(a['font-size']),
                        raw=m.group(0)))
    return out


def lines_in(els, x_lo, x_hi, y_lo, y_hi):
    """One planted label's drawn lines, top to bottom: its base-size pieces grouped by baseline, joined along x."""
    sel = [e for e in els if x_lo <= e['x'] < x_hi and y_lo <= e['y'] < y_hi]
    rows = {}
    for e in sel:
        if e['size'] >= 9.0 - 1e-6:
            rows.setdefault(round(e['y'], 3), []).append(e)
    for e in sel:                                # a script piece joins the nearest base row
        if e['size'] < 9.0 - 1e-6 and rows:
            rows[min(rows, key=lambda y: abs(y - e['y']))].append(e)
    return [(y, ''.join(e['text'] for e in sorted(rows[y], key=lambda e: e['x']))) for y in sorted(rows, reverse=True)]


def P_lines(els):
    return lines_in(els, 0, 170, 100, 220)


def S_lines(els):
    return lines_in(els, 0, 170, 0, 100)


BASE_TR = {KP: 'QZA QZB QZC QZD', KS: 'QZ eitt', KF: 'QZE CO2 QZF', KN: 'QZ jón NH4 +'}
_N = [0]


def compose(tr, *extra):
    """Compose the plant with BASE_TR overridden by `tr`. -> (rc, report or None, svg bytes, stderr+stdout)."""
    for n in ('compose-report.json', 'translated.png', 'translated.svg'):
        (FIG / n).unlink(missing_ok=True)
    _N[0] += 1
    trp = TD / f'tr-{_N[0]}.json'
    trp.write_text(json.dumps({'blocks': dict(BASE_TR, **tr)}, ensure_ascii=False))
    c = subprocess.run([sys.executable, str(COMPOSE), '--translations', str(trp), *map(str, extra), '--svg'],
                       capture_output=True, text=True, env=dict(os.environ, FIGTEXT_OUT=str(FIG)), cwd=str(HERE))
    rp, svg = FIG / 'compose-report.json', FIG / 'translated.svg'
    return (c.returncode, json.loads(rp.read_text()) if rp.exists() else None,
            svg.read_bytes() if svg.exists() else b'', c.stderr + c.stdout)


def els_of(svg):
    return elements(svg.decode('utf-8'))


def rnd(ls):
    return [(round(y, 3), t) for y, t in ls]


# CE1 - the explicit break, honoured. 3 + 1 words, where the balanced cut of the same four words is 2 + 2.
LF_P = 'QZA QZB QZC\nQZD'
rc1, rep1, svg1, out1 = compose({KP: LF_P})
precondition('the LF compose exits 0 and writes its report and SVG', rc1 == 0 and rep1 is not None and svg1,
             out1[-400:])
got = P_lines(els_of(svg1))
check("CE1 'QZA QZB QZC\\nQZD' is drawn as typed: 'QZA QZB QZC' on source line 0's baseline, 'QZD' on line 1's",
      rnd(got) == [(round(PY0, 3), 'QZA QZB QZC'), (round(PY1, 3), 'QZD')], f'{rnd(got)} want rows {PY0} / {PY1}')
check('CE1b compose-report.json explicitBreaks names the block, 2 lines at the source pitch; no errors',
      rep1.get('explicitBreaks') == [{'key': KP, 'block': BI[KP], 'lines': 2, 'pitch': round(PY0 - PY1, 4)}]
      and rep1.get('explicitBreakErrors') == [],
      f"explicitBreaks {rep1.get('explicitBreaks')!r} errors {rep1.get('explicitBreakErrors')!r}")

# CE2 - the space arm: the instrument sees the break.
rc2, rep2, svg2, out2 = compose({})
precondition('the space-arm compose exits 0', rc2 == 0 and svg2, out2[-400:])
got2 = P_lines(els_of(svg2))
check("CE2a CONTROL the same value with a space draws the balanced cut 'QZA QZB' / 'QZC QZD' (sha256 printed for "
      "the before/after comparison)", [t for _, t in got2] == ['QZA QZB', 'QZC QZD'],
      f'{rnd(got2)} sha256 {hashlib.sha256(svg2).hexdigest()[:16]}')
check('CE2b the LF arm differs from the space arm', svg1 != svg2, '' if svg1 != svg2 else 'identical SVGs: the LF was ignored')

# CE3 - every refusal end to end: drawn exactly as the same value without its LFs, named, block by block.
REFUSED = {KP: 'QZA \nQZC', KS: 'QZA\nQZB', KN: 'QZ jón NH4\n+'}
SPACED = {k: v.replace('\n', ' ') for k, v in REFUSED.items()}
rc3, rep3, svg3, out3 = compose(REFUSED)
rc3s, rep3s, svg3s, out3s = compose(SPACED)
precondition('the refusal arm and its spaced twin both exit 0 (compose.py refuses nothing itself)',
             rc3 == 0 and rc3s == 0 and svg3 and svg3s, (out3 + out3s)[-400:])
errs3 = sorted((e.get('key'), e.get('block'), e.get('reason'), e.get('line'))
               for e in (rep3 or {}).get('explicitBreakErrors') or [])
check("CE3 the refusals are named: edge-space line 0 on P, line-count on the one-line S and on the stacked charge N",
      errs3 == sorted([(KP, BI[KP], 'edge-space', 0), (KS, BI[KS], 'line-count', None),
                       (KN, BI[KN], 'line-count', None)]), repr(errs3))
check('CE3b ... each drawn byte for byte as the same value with its LFs read as spaces, and no explicitBreaks',
      svg3 == svg3s and (rep3 or {}).get('explicitBreaks') == [],
      f"identical={svg3 == svg3s} explicitBreaks {(rep3 or {}).get('explicitBreaks')!r} N unformatted: LF arm "
      f"{[u.get('stretch') for u in (rep3 or {}).get('unformatted') or [] if u.get('key') == KN]} spaced "
      f"{[u.get('stretch') for u in (rep3s or {}).get('unformatted') or [] if u.get('key') == KN]}")

# CE4 - a formula on a two-line block keeps its subscript across a break.
rc4, rep4, svg4, out4 = compose({KF: 'QZE CO2\nQZF'})
precondition('the formula LF compose exits 0', rc4 == 0 and svg4, out4[-400:])


def twos(svg):
    """The drawn `2` pieces of F: (size, its baseline minus its line's) - the subscript style, positionally. The
    drop is compared within 0.002 pt: the SVG writes each coordinate to 3 decimals, and the two arms measure
    -3.0 and -2.999."""
    es = [e for e in els_of(svg) if e['x'] >= 170 and e['y'] >= 100]
    out = []
    for e in es:
        if e['text'] == '2':
            line = min((x for x in es if x['size'] >= 9.0 - 1e-6), key=lambda x: abs(x['y'] - e['y']))
            out.append((e['size'], round(e['y'] - line['y'], 3)))
    return out


t4, t2 = twos(svg4), twos(svg2)
unf4 = [u for u in (rep4 or {}).get('unformatted') or [] if u.get('key') == KF]
check("CE4 CONTROL 'QZE CO2\\nQZF' draws its 2 as the same subscript as 'QZE CO2 QZF' (size and drop), none "
      "unformatted",
      len(t4) == 1 and len(t2) == 1 and t4[0][0] == t2[0][0] < 9.0 and abs(t4[0][1] - t2[0][1]) <= 0.002
      and unf4 == [], f'LF {t4} space {t2} unformatted {unf4}')

# CE5 - R-20: an anchor-excluded key still takes the explicit route, and the exclusion reports changed False.
excl = TD / 'anchor-excl.json'
excl.write_text(json.dumps({'basename': BASENAME, 'configPath': 'test', 'exclusions': {KP: 'R-20 test reason'}}))
rc5, rep5, svg5, out5 = compose({KP: LF_P}, '--anchor-exclusions', excl)
got5 = P_lines(els_of(svg5)) if svg5 else []
check('CE5 an anchor-excluded key is drawn as typed, and anchorExcluded reports changed False',
      rc5 == 0 and [t for _, t in got5] == ['QZA QZB QZC', 'QZD']
      and (rep5 or {}).get('anchorExcluded') == [{'key': KP, 'block': BI[KP], 'changed': False}],
      f"rc {rc5} {rnd(got5)} anchorExcluded {(rep5 or {}).get('anchorExcluded')!r} {out5[-300:]}")


# CE6 - through figure-compose.py: a figure with an unhonoured break is refused, by key and reason.
def wrap(tr):
    trp = TD / f'wrap-{len(tr)}-{_N[0]}.json'
    _N[0] += 1
    trp.write_text(json.dumps({'blocks': dict(BASE_TR, **tr)}, ensure_ascii=False))
    for n in ('compose.json', 'compose-report.json', 'translated.svg'):
        (FIG / n).unlink(missing_ok=True)
    c = subprocess.run([sys.executable, str(WRAPPER), '--out', str(FIG), '--translations', str(trp)],
                       capture_output=True, text=True, env=dict(os.environ), cwd=str(HERE))
    cj = FIG / 'compose.json'
    return c.returncode, (json.loads(cj.read_text()) if cj.exists() else None), c.stderr + c.stdout


rc6, cj6, out6 = wrap(REFUSED)
err6 = (cj6 or {}).get('error') or ''
check('CE6 figure-compose.py refuses the figure: exit 1, an error naming each key and reason',
      rc6 == 1 and 'line breaks that were not honoured' in err6 and sorted((cj6 or {}).get('keys') or [])
      == sorted([KP, KS, KN]) and 'edge-space' in err6 and 'line-count' in err6, f'rc {rc6} {cj6!r} {out6[-300:]}')
rc6b, cj6b, out6b = wrap({KP: LF_P})
check('CE6b CONTROL figure-compose.py passes a figure whose break was honoured: exit 0, no error',
      rc6b == 0 and cj6b is not None and 'error' not in cj6b, f'rc {rc6b} {cj6b!r} {out6b[-300:]}')

# ── FCx. figure-compose.py's verify ───────────────────────────────────────────────────────────
print('FCx figure-compose.py verify()')
import importlib.util                                         # noqa: E402

_spec = importlib.util.spec_from_file_location('figure_compose', WRAPPER)
FC_MOD = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(FC_MOD)
GOOD = {'blocks': ['a', 'b'], 'missing': ['b'], 'translated': ['a'], 'degenerate': [],
        'translationsPath': '/x.json', 'control': False}
VB = [{'key': 'a', 'send': True}, {'key': 'b', 'send': False}]
TRS = FC_MOD.Translations(path='/x.json', keys=frozenset({'a'}), has_state=False)


def raises(fn):
    """-> (ComposeError raised, its keys, its message). Any OTHER exception is (False, [], its text)."""
    try:
        fn()
    except FC_MOD.ComposeError as exc:
        return True, exc.keys, str(exc)
    except Exception as exc:                                  # noqa: BLE001
        return False, [], f'{type(exc).__name__}: {exc}'
    return False, [], ''


ok, keys, msg = raises(lambda: FC_MOD.verify(
    {**GOOD, 'explicitBreakErrors': [{'key': 'a', 'block': 0, 'reason': 'line-count', 'line': None}]}, VB, TRS))
check('FCx1 verify refuses a report carrying explicitBreakErrors, naming the key, block and reason',
      ok and keys == ['a'] and "'a' block 0: line-count" in msg, f'{ok} {keys} {msg!r}')
ok, keys, msg = raises(lambda: FC_MOD.verify(
    {**GOOD, 'explicitBreaks': [{'key': 'a', 'block': 0, 'lines': 2, 'pitch': 12.9507}],
     'explicitBreakErrors': []}, VB, TRS))
check('FCx2 CONTROL verify accepts a report whose explicit breaks were all honoured - nothing raised at all',
      not ok and msg == '', repr(msg))

finish()
