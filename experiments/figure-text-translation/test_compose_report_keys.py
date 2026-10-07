#!/usr/bin/env python3
"""§C140 '6' report keys: the composer NAMES the '6' layout decisions a reader would otherwise have to infer from
pixels - `relaid` (a label laid out on the source's own row breaks, M1, or on its own rows, M3) and `belowSource`
(a label drawn below its source size, R-16) - and figure-compose.py copies them, with `anchorExcluded` (R-20),
into compose.json, the only file a figure-run.js report outlives a run through.

    FIGTEXT_PYLIBS=./pylibs python3 -B test_compose_report_keys.py

Design: docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md §9.8 (nothing consumed
figlayout's `m1` / `rows`, and an M1 shrink does not change `step`); rulings R-3 (arm B: an anchored cut may
shrink - `shrunkFromPt` names it), R-16 (a source below the 7.5 pt floor may shrink to 0.8 x its size) and R-20
([USER] 2026-10-05, campaign register). Controller decisions G8 / G10 / T11 D1-D7.

P. PURE, figlayout's two report helpers, on Layout dicts from `decide` itself (the fake 0.5 x size width of
   test_figlayout_anchors.py / test_figlayout_rows.py, so every number is hand-checkable):
   * report_entries(layout): one `source-breaks` entry when M1 was HONOURED (m1 not None and m1['spans'] not
     None - T11 D3), carrying sizePt, shrunkFromPt (None, or the size it shrank from) and the anchor count; one
     `source-rows` entry when M3 drew the label on the source rows (rows True), carrying sizePt and leadPt; both,
     in that order, when both hold.
   * below_source(size, sz0): an entry {sizePt, sourcePt} only when the source sits below the floor AND the
     label is drawn smaller than its source - the R-16 shrink, never R4's ordinary shrink above the floor.
E. END TO END through compose.py and figure-compose.py, on the committed fixture prepared into a temporary
   directory with its runs.json and artwork REPLACED (the test_compose_anchors.py pattern): block A, the NaCation
   plant `Nucleus|(11 protons,|12 neutrons)` at 9 pt (open), block B, `Mass` at 5 pt inside a planted stroked
   box too narrow for its value at 5 pt, and block C, `Serving size|per box` at 5 pt on two rows 5.5 apart inside
   a planted FILLED cell (test_compose_blank_lines.py's fill-rect recipe) cut to FoodLabel's green-band margins
   (test_figlayout_rows.py [a1]: 1.33 up, 0.39 down), so the label fits only on the source rows (M3). Every plant
   is a PRECONDITION measured first.

RED-FIRST, on the pre-task tree (figlayout without the helpers, compose.py and figure-compose.py without the
keys): every P check FAILS (AttributeError: no report_entries / below_source), and so do E1-E4, E3b, E6-E10 (no
`relaid` / `belowSource` key, no stdout token or NOTE, nothing copied into compose.json).
CONTROLS (G13; they pass before and after by design, each reddened by a planted mutant named in the task report):
  E5 (block A is DRAWN on its source rows - the premise that the plant reaches M1; red when compose.py hands no
  `texts` cue at all - figlayout.M1_ANCHORS False stops the file at block A's PRECONDITION instead) and E11 (an
  excluded key draws the base cut - R-20 on the e2e path; red when compose.py hands the texts cue to an excluded
  key), and E12 (compose-report.json carries no scratch `m6Layout` key - its home is `stix.layout`, G8 / T11 D6;
  red when compose.py's report gains an `m6Layout` key).
"""
import ast
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

import figlayout as FL                                        # noqa: E402

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''), flush=True)
    if not ok:
        fails.append(label)


def guarded(label, fn):
    """check() on fn() -> (ok, detail); a missing helper on the pre-task module is RED, not a crash."""
    try:
        ok, detail = fn()
    except Exception as e:                                    # noqa: BLE001 - the exception IS the red
        ok, detail = False, f'{type(e).__name__}: {e}'
    check(label, ok, detail)


def finish():
    print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
    sys.exit(1 if fails else 0)


def precondition(label, ok, detail=''):
    check('PRECONDITION ' + label, ok, detail)
    if not ok:
        finish()


# ── P. pure ───────────────────────────────────────────────────────────────────────────────────
def fw(chars, size, j):
    return sum(size * 0.5 for ch, st in chars)


def fw_o(chars, size, j):                                     # test_figlayout_rows.py's width
    return sum(size * (0.9 if ch == 'ó' else 0.5) for ch, st in chars)


def W(text):
    return [(w, [None] * len(w)) for w in text.split()]


def open_(FLx, FRx):
    return dict(cls='open', why='t', FL=FLx, FR=FRx, room_up=0.0, room_down=0.0, free_left_clear=5.0,
                free_right_clear=5.0, align='left', align_why='t')


def box(L, R, D, U):
    return dict(cls='box', why='t', L=L, R=R, D=D, U=U, src_left_margin=5.0, src_right_margin=5.0,
                src_up_margin=5.0, src_down_margin=5.0, align='center', align_why='box')


def cues(texts, sz0=9.0):
    n = len(texts)
    return dict(n_src=n, sz0=sz0, starts=[0.0] * n, ends=[4.5 * len(t) for t in texts],
                projs=[100.0 - 11.0 * i for i in range(n)], texts=texts)


def nocue(cu):
    return {k: v for k, v in cu.items() if k != 'texts'}


def entries(lay):
    return FL.report_entries(lay)


TICK = ('5 0 Framvinda efnahvarfs', ['5', '0', 'Extent of reaction'])      # test_figlayout_anchors.py T1
ACID = ('Veik sýra Ka = 6,8 × 10–4', ['Weak acid', 'Ka = 6.8 × 10–4'])    # ... T4 (the R-3 shrink)
print('(P) figlayout.report_entries / below_source, pure')
guarded('P1 an honoured M1 cut at sz0 is ONE source-breaks entry: sizePt 9.0, shrunkFromPt None, 2 anchors',
        lambda: (lambda e: (e == [{'rule': 'source-breaks', 'sizePt': 9.0, 'shrunkFromPt': None, 'anchors': 2}],
                            e))(entries(FL.decide(W(TICK[0]), fw, open_(-50, 200), cues(TICK[1])))))
guarded('P2 an M1 SHRINK (R-3 arm B) is named: sizePt 8.75, shrunkFromPt 9.0, 1 anchor',
        lambda: (lambda e: (e == [{'rule': 'source-breaks', 'sizePt': 8.75, 'shrunkFromPt': 9.0, 'anchors': 1}],
                            e))(entries(FL.decide(W(ACID[0]), fw, box(0, 70, 0, 40), cues(ACID[1])))))


def _unhonoured():
    FL.M1_ANCHOR_SHRINK = False
    try:
        lay = FL.decide(W(ACID[0]), fw, box(0, 70, 0, 40), cues(ACID[1]))
    finally:
        FL.M1_ANCHOR_SHRINK = True
    # the premise: an anchor WAS found (m1 is a note), and could not be honoured (spans None)
    return (lay['m1'] is not None and lay['m1']['spans'] is None and entries(lay) == [],
            f"m1={lay['m1']} entries={entries(lay)}")


guarded('P3 an anchor found but NOT honoured (m1 spans None: the base cut is drawn) is no entry (D3)', _unhonoured)
# FoodLabel's green band, test_figlayout_rows.py [a1]: 5 pt, two source rows 5.5 apart, margins 1.33 up / 0.39 down.
P0 = 206.12
GB_PROJ = [P0, P0 - 5.5]
GB = dict(cls='cell', why='t', L=0, R=200, D=min(GB_PROJ) - 0.21 * 5.0 - 0.39, U=max(GB_PROJ) + 0.73 * 5.0 + 1.33,
          src_left_margin=1.0, src_right_margin=1.0, src_up_margin=1.33, src_down_margin=0.39, align='left',
          align_why='t')
GB_CUES = dict(n_src=2, sz0=5.0, starts=[5.0] * 2, ends=[65.0] * 2, projs=GB_PROJ)


def _rows():
    lay = FL.decide(W('aaaaaaaaaaaa bbbbbbbbbbbbb'), fw_o, GB, GB_CUES)
    e = entries(lay)
    return (lay.get('rows') is True and len(e) == 1 and e[0]['rule'] == 'source-rows' and e[0]['sizePt'] == 5.0
            and abs(e[0]['leadPt'] - 5.5) < 1e-9 and set(e[0]) == {'rule', 'sizePt', 'leadPt'},
            f"rows={lay.get('rows')} entries={e}")


guarded('P4 a label DRAWN on the source rows (M3, rows True) is ONE source-rows entry: sizePt 5.0, leadPt 5.5', _rows)
guarded('P5 both at once (the FoodLabel BI4 shape): source-breaks first, then source-rows',
        lambda: (lambda e: ([x['rule'] for x in e] == ['source-breaks', 'source-rows'], e))(entries(
            {'size': 5.0, 'lead': 5.5, 'rows': True,
             'm1': {'anchors': {'0': 3}, 'shrunkFrom': None, 'spans': [(0, 3), (3, 6)], 'bound': True}})))
guarded('P6 CONTROL-shaped: no texts cue (m1 None) and not on the rows is no entry',
        lambda: (lambda lay: (lay['m1'] is None and lay['rows'] is False and entries(lay) == [], entries(lay)))(
            FL.decide(W(TICK[0]), fw, open_(-50, 200), nocue(cues(TICK[1])))))
guarded('P7 below_source: a 5 pt source drawn at 4.5 is {sizePt 4.5, sourcePt 5.0}',
        lambda: (FL.below_source(4.5, 5.0) == {'sizePt': 4.5, 'sourcePt': 5.0}, FL.below_source(4.5, 5.0)))
guarded('P8 below_source: a sub-floor source drawn AT its size is None',
        lambda: (FL.below_source(5.0, 5.0) is None, FL.below_source(5.0, 5.0)))
guarded('P9 below_source: R4\'s ordinary shrink above the floor (9 -> 8.75) is None - not R-16',
        lambda: (FL.below_source(8.75, 9.0) is None, FL.below_source(8.75, 9.0)))
guarded('P10 below_source: a source AT the floor (7.5) is None',
        lambda: (FL.below_source(7.5, 7.5) is None, FL.below_source(7.5, 7.5)))


def _sub_floor():
    # 'Mólmassafrumefnisins' = 20 chars: 50 pt at 5, against a box budget (50 - 0) - 4 = 46 -> fits at 4.5.
    lay = FL.decide(W('Mólmassafrumefnisins'), fw, box(0, 50, 0, 20),
                    dict(n_src=1, sz0=5.0, starts=[5.0], ends=[15.0], projs=[7.0], texts=['Mass']))
    return (lay['size'] == 4.5 and FL.below_source(lay['size'], 5.0) == {'sizePt': 4.5, 'sourcePt': 5.0}
            and entries(lay) == [], f"size={lay['size']} below={FL.below_source(lay['size'], 5.0)}")


guarded('P11 decide draws a 5 pt boxed label at 4.5 (R-16), below_source names it, report_entries does not', _sub_floor)

# ── E. end to end ──────────────────────────────────────────────────────────────────────────────
import cairo                                                  # noqa: E402
import figtext as FT                                          # noqa: E402
import figcontainers as FC                                    # noqa: E402
from blockkey import block_key, block_lines, block_english    # noqa: E402
from fontTools.ttLib import TTFont                            # noqa: E402
from PIL import Image                                         # noqa: E402

PREPARE = HERE / 'figure-prepare.py'
COMPOSE = HERE / 'compose.py'
WRAPPER = HERE / 'figure-compose.py'
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'
PAGE_W, PAGE_H = 300.0, 220.0
BLACK = ['cmyk', 0.0, 0.0, 0.0, 1.0]
BASENAME = 'CNX_Fixture_ReportKeys'

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


_FACE = {}


def text_adv(text, size):
    """The drawn width, from the regular face FILE (fontTools) - independent of compose.py's cairo measure."""
    from figis import face_path
    if not _FACE:
        f = TTFont(str(face_path((False, False))))
        _FACE.update(cmap=f.getBestCmap(), hmtx=f['hmtx'], upm=f['head'].unitsPerEm)
    return sum(_FACE['hmtx'][_FACE['cmap'].get(ord(c), '.notdef')][0] for c in text) * size / _FACE['upm']


def drawn_lines(svg_path, x_max):
    """The laid-out <text> pieces (font-kerning:none) left of x_max, grouped into lines by SVG baseline."""
    rows = {}
    for m in re.finditer(r'<text ([^>]*)>([^<]*)</text>', Path(svg_path).read_text(encoding='utf-8')):
        a = dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1)))
        if 'font-kerning:none' not in a.get('style', '') or float(a['x']) >= x_max:
            continue
        rows.setdefault(round(float(a['y']), 2), []).append((float(a['x']), m.group(2)))
    return [''.join(t for _, t in sorted(rows[y])) for y in sorted(rows)]


def load(p):
    try:
        return json.loads(Path(p).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


# Block A - the NaCation plant (test_compose_anchors.py): open, 9 pt, three lines 11 pt apart.
KEY_A = 'Nucleus|(11 protons,|12 neutrons)'
VALUE_A = 'Kjarni (11 róteindir, 12 nifteindir)'
ROWS_A = ['Kjarni', '(11 róteindir,', '12 nifteindir)']
# Block B - 'Mass' at 5 pt (below the 7.5 pt floor) inside a stroked box whose width budget holds the value at
# 4.5 pt and not at 4.75 (sized from the face file below, so R-16's ladder 5, 4.75, 4.5, ... stops at 4.5).
KEY_B, VALUE_B = 'Mass', 'Mólmassafrumefnisins'
W5 = text_adv(VALUE_B, 5.0)
BUDGET_B = W5 * 0.92                                          # 4.6 / 5 of the width at 5 pt
BOX_B = (200.0, 20.0, 200.0 + BUDGET_B + 5.0, 40.0)            # page x0 y0 x1 y1; pad 2 a side + the 1.0 stroke
SRC_B_X = round((BOX_B[0] + BOX_B[2]) / 2 - fixture_adv(KEY_B, 5.0) / 2, 3)
# Block C - two 5 pt source rows 5.5 apart (closer than the 6.11 lead) in a FILLED cell whose sides sit at the
# green band's margins: the two-line glyph box at the lead does not fit, the source rows do (M3, rows True).
KEY_C, VALUE_C = 'Serving size|per box', 'Skammtastærð í hverjum kassa'
ROW_C, PITCH_C = 195.0, 5.5
CELL_C = (150.0 - 0.5, (ROW_C - PITCH_C) - 0.21 * 5.0 - 0.39 - 0.5, 290.0 + 0.5,
          ROW_C + 0.73 * 5.0 + 1.33 + 0.5)                   # page x0 y0 x1 y1; + MIN_RULE/2, the fill-rect inset
PLANT = [run('Nucleus', 9.0, 50.0, 150.0), run('(11 protons,', 9.0, 50.0, 139.0),
         run('12 neutrons)', 9.0, 50.0, 128.0), run(KEY_B, 5.0, SRC_B_X, 28.0),
         run('Serving size', 5.0, 160.0, ROW_C), run('per box', 5.0, 160.0, ROW_C - PITCH_C)]
REASON = 'R-20 test reason: keep the base cut on this label, long enough for the minimum'

TMP = tempfile.TemporaryDirectory(prefix='c140-t11-report-keys-')
out = Path(TMP.name) / 'fig'
env = dict(os.environ)
env.pop('FIGTEXT_OUT', None)
print('\n(E) end to end')
prep = subprocess.run([sys.executable, str(PREPARE), str(FIXTURE), '--basename', BASENAME, '--out', str(out)],
                      capture_output=True, text=True, env=env)
precondition('the fixture prepares', prep.returncode == 0, prep.stderr.strip()[-400:])
(out / 'runs.json').write_text(json.dumps(PLANT, ensure_ascii=False))
pdf = out / 'artwork.pdf'
surf = cairo.PDFSurface(str(pdf), PAGE_W, PAGE_H)
_c = cairo.Context(surf)
_c.set_source_rgb(1, 1, 1)
_c.paint()
_c.set_source_rgb(0, 0, 0)
_c.set_line_width(1.0)
_c.rectangle(BOX_B[0], PAGE_H - BOX_B[3], BOX_B[2] - BOX_B[0], BOX_B[3] - BOX_B[1])
_c.stroke()
_c.set_source_rgb(0.86, 0.80, 0.92)                           # light: filled, never stroked, not dark
_c.rectangle(CELL_C[0], PAGE_H - CELL_C[3], CELL_C[2] - CELL_C[0], CELL_C[3] - CELL_C[1])
_c.fill()
surf.finish()
r = subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(pdf), str(out / 'artwork')],
                   capture_output=True, text=True)
precondition('the planted artwork renders', r.returncode == 0 and (out / 'artwork.png').exists(), r.stderr[-300:])
r = subprocess.run(['pdftocairo', '-svg', str(pdf), str(out / 'artwork.svg')], capture_output=True, text=True)
precondition('the planted artwork.svg renders', r.returncode == 0 and (out / 'artwork.svg').exists(), r.stderr[-300:])

runs = json.loads((out / 'runs.json').read_text())
fonts = json.loads((out / 'meta.json').read_text())['fonts']
blocks = FT.merge_blocks(FT.group(runs))
ents = [dict(key=block_key(b), english=block_english(b), lines=block_lines(b), arc=FT.is_arc(b),
             send=FT.sendable(b, block_english(b), fonts)) for b in blocks]
(out / 'blocks.json').write_text(json.dumps(ents, indent=1, ensure_ascii=False))
keys = [e['key'] for e in ents]
precondition('the plant is three send:true blocks, A of three visual lines, B of one and C of two',
             sorted(keys) == sorted([KEY_A, KEY_B, KEY_C]) and all(e['send'] for e in ents)
             and [len(FT.visual_lines(blocks[keys.index(k)])) for k in (KEY_A, KEY_B, KEY_C)] == [3, 1, 2],
             repr(ents))
BI_A, BI_B, BI_C = keys.index(KEY_A), keys.index(KEY_B), keys.index(KEY_C)

page = FC.load_page(pdf)
dark = Image.open(out / 'artwork.png').convert('L')


def src_cues(b, sz0):
    vls = FT.visual_ink(b)
    return dict(n_src=len(vls), sz0=sz0, starts=[min(FT.along(r) for r in l) for l in vls],
                ends=[max(FT.along(r) + r['adv'] for r in l) for l in vls], projs=[FT.proj(l[0]) for l in vls],
                blank=[not ''.join(r['text'] for r in l).strip() for l in vls],
                texts=[''.join(r['text'] for r in l) for l in vls])


def face_width(chars, size, j):
    return text_adv(''.join(ch for ch, _ in chars), size)


def cut(lay):
    return [''.join(ch for ch, _ in l) for l in lay['lines']]


cont_a = FC.container_for(BI_A, blocks, page, dark, PAGE_H)
cu_a = src_cues(blocks[BI_A], 9.0)
with_a = FL.decide(W(VALUE_A), face_width, cont_a, cu_a)
base_a = FL.decide(W(VALUE_A), face_width, cont_a, nocue(cu_a))
precondition(f"block A ({cont_a['cls']}): figlayout cuts it on the source rows WITH texts, differently without",
             cut(with_a) == ROWS_A and cut(base_a) != ROWS_A and with_a['size'] == 9.0,
             f'with={cut(with_a)} without={cut(base_a)}')
cont_b = FC.container_for(BI_B, blocks, page, dark, PAGE_H)
lay_b = FL.decide(W(VALUE_B), face_width, cont_b, src_cues(blocks[BI_B], 5.0))
precondition(f"block B sits in a BOX and figlayout draws it at 4.5 pt (R-16; budget {BUDGET_B:.2f}, "
             f"{W5:.2f} pt at 5)", cont_b['cls'] == 'box' and lay_b['size'] == 4.5 and lay_b['overflow'] is None,
             f"cls={cont_b['cls']} L={cont_b.get('L')} R={cont_b.get('R')} size={lay_b['size']} "
             f"overflow={lay_b['overflow']}")

cont_c = FC.container_for(BI_C, blocks, page, dark, PAGE_H)
lay_c = FL.decide(W(VALUE_C), face_width, cont_c, src_cues(blocks[BI_C], 5.0))
precondition('block C sits in a CELL and figlayout draws it on the source rows at 5 pt (M3, no M1 anchor)',
             cont_c['cls'] == 'cell' and lay_c.get('rows') is True and lay_c['m1'] is None
             and lay_c['size'] == 5.0 and abs(lay_c['lead'] - PITCH_C) < 1e-6 and len(lay_c['lines']) == 2,
             f"cls={cont_c['cls']} rows={lay_c.get('rows')} m1={lay_c['m1']} size={lay_c['size']} "
             f"lead={lay_c['lead']} lines={cut(lay_c)}")

tr = Path(TMP.name) / 'tr.json'
tr.write_text(json.dumps({'blocks': {KEY_A: VALUE_A, KEY_B: VALUE_B, KEY_C: VALUE_C}}, ensure_ascii=False))

# E1-E6: compose.py itself, no flag.
c = subprocess.run([sys.executable, str(COMPOSE), '--translations', str(tr), '--svg'], capture_output=True,
                   text=True, env=dict(os.environ, FIGTEXT_OUT=str(out)), cwd=str(HERE))
rep = load(out / 'compose-report.json')
precondition('compose.py exits 0 and writes its report and SVG',
             c.returncode == 0 and rep is not None and (out / 'translated.svg').exists(), c.stderr[-400:])
RELAID_A = {'key': KEY_A, 'block': BI_A, 'rule': 'source-breaks', 'sizePt': 9.0, 'shrunkFromPt': None,
            'anchors': 2}
RELAID_C = {'key': KEY_C, 'block': BI_C, 'rule': 'source-rows', 'sizePt': 5.0, 'leadPt': PITCH_C}
RELAID = sorted([RELAID_A, RELAID_C], key=lambda e: e['block'])   # draw order = block order
BELOW_B = {'key': KEY_B, 'block': BI_B, 'sizePt': 4.5, 'sourcePt': 5.0}
check('E1 compose-report.json `relaid` is exactly block A\'s source-breaks and block C\'s source-rows entry '
      '(B, one line, has none)', rep.get('relaid') == RELAID, repr(rep.get('relaid')))
check('E2 compose-report.json `belowSource` is exactly block B, 4.5 pt from 5.0 (A, at 9 pt, has none)',
      rep.get('belowSource') == [BELOW_B], repr(rep.get('belowSource')))
line_a = [l for l in c.stdout.splitlines() if repr(KEY_A) in l and '->' in l]
check('E3 the per-label stdout line of block A ends with the rule token `src-breaks`',
      len(line_a) == 1 and line_a[0].endswith(' src-breaks'), repr(line_a))
line_c = [l for l in c.stdout.splitlines() if repr(KEY_C) in l and '->' in l]
check('E3b the per-label stdout line of block C ends with the rule token `src-rows` (and only it)',
      len(line_c) == 1 and line_c[0].endswith('] src-rows'), repr(line_c))
check('E4 stdout carries both NOTEs, each opening after a blank line (the `!!` parse rule)',
      "\nNOTE (not a failure): 2 label(s) laid out on the source's own row breaks or rows:" in c.stdout
      and '\nNOTE (not a failure): 1 label(s) drawn below their source size (R-16):' in c.stdout, c.stdout[-600:])
got_a = drawn_lines(out / 'translated.svg', 150.0)
check('E5 CONTROL block A is DRAWN on its source rows (the premise that the plant reaches M1)', got_a == ROWS_A,
      repr(got_a))


def wrapper(config_doc, tag):
    cfg = Path(TMP.name) / f'config-{tag}.json'
    cfg.write_text(json.dumps(config_doc, ensure_ascii=False), encoding='utf-8')
    w = subprocess.run([sys.executable, str(WRAPPER), '--out', str(out), '--translations', str(tr), '--config',
                        str(cfg)], capture_output=True, text=True, env=env, cwd=str(HERE))
    return w, load(out / 'compose.json') or {}, load(out / 'compose-report.json') or {}


# E6-E8: through figure-compose.py, nothing excluded.
w, d, rep = wrapper({'anchorExclusions': {}}, 'empty')
precondition('figure-compose.py composes the plant (exit 0, an outputPath)', w.returncode == 0
             and d.get('outputPath') and 'error' not in d, f'exit {w.returncode}: {d!r} {w.stderr.strip()[-300:]}')
check('E6 compose.json carries `relaid` exactly as the report', d.get('relaid') == RELAID
      and d.get('relaid') == rep.get('relaid'), repr(d.get('relaid')))
check('E7 compose.json carries `belowSource` exactly as the report', d.get('belowSource') == [BELOW_B]
      and d.get('belowSource') == rep.get('belowSource'), repr(d.get('belowSource')))
check('E8 compose.json carries `anchorExcluded` [] when nothing is excluded', d.get('anchorExcluded') == [],
      repr(d.get('anchorExcluded')))

# E9-E11: block A's key excluded (R-20).
w, d, rep = wrapper({'anchorExclusions': {BASENAME: {KEY_A: REASON}}}, 'excl')
precondition('figure-compose.py composes with block A excluded (exit 0)', w.returncode == 0
             and d.get('outputPath') and 'error' not in d, f'exit {w.returncode}: {d!r} {w.stderr.strip()[-300:]}')
check('E9 compose.json `anchorExcluded` names block A once, changed True',
      d.get('anchorExcluded') == [{'key': KEY_A, 'block': BI_A, 'changed': True}], repr(d.get('anchorExcluded')))
check('E10 ... and an excluded key has NO relaid entry (M1 off), while block C\'s and belowSource are unchanged',
      d.get('relaid') == [RELAID_C] and d.get('belowSource') == [BELOW_B],
      f"relaid={d.get('relaid')!r} belowSource={d.get('belowSource')!r}")
got_x = drawn_lines(out / 'translated.svg', 150.0)
check('E11 CONTROL the excluded key is drawn with the BASE cut', got_x == cut(base_a), f'{got_x} base {cut(base_a)}')
# G8 / T11 D6: T7 renamed the scratch `m6Layout` to `stix.layout`; the scratch name must never reach a report.
check('E12 CONTROL compose-report.json carries no `m6Layout` key; its entries live in `stix.layout` (a list)',
      'm6Layout' not in rep and isinstance(rep.get('stix', {}).get('layout'), list),
      f"keys={sorted(rep)} stix={sorted(rep.get('stix', {}))}")
finish()
