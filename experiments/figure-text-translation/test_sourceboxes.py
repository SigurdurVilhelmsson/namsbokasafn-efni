#!/usr/bin/env python3
"""§C140 '6' R-5c2 - `sourceAlignedBoxes`: a per-figure switch that lays out every SCHEMATIC BOX of that
figure on the cell path with the SOURCE's alignment (R3), instead of R2's box centre or R-2a's own-centre.

    FIGTEXT_PYLIBS=./pylibs python3 -B -u test_sourceboxes.py

Ruling and why: docs/decisions/2026-10-07-hazdiamond-keeps-source-box-alignment.md ([USER] 2026-10-07,
R-5c2 = b+). Plain checks, like the siblings - no pytest in this tree.

WHAT IS PINNED
--------------
* U   sourceboxes.py (stdlib): the table and its entry (exact basename; a reason over MIN_REASON
      characters), and the hand-off file `<out>/source-boxes.json`, which is never read as "off" when it
      cannot be used.
* B   figcontainers.container_for(..., source_boxes=True): a lone box and a SHARED box both become a cell
      whose `why` ends '+source-boxes' and whose alignment is cell_alignment's (the source's) - checked by
      VALUE too (figlayout.decide draws the line at the source x). CONTROLS: the flag off (and absent)
      leaves R2 / R-2a exactly as they were, and the flag leaves a cell and an open label untouched.
* V   figure-compose.py verify()'s contract: an entry that reaches NO box refuses the figure (an inert
      entry, the artworkEdits `select-none` stance); a report naming boxes while nothing is configured
      refuses; a named key absent from blocks.json refuses; a malformed list refuses. CONTROLS: configured
      and reached passes; unconfigured with no key passes (a pre-table report).
* W   figure-compose.py's plumbing: the hand-off file is a derived output (removed before every run),
      `sourceAligned` is a compose NOTE, and `--source-boxes` reaches compose.py's argv.
* E   end to end on the committed fixture, re-planted (test_compose_anchors.py's pattern): one left-set
      label inside a stroked box. With the file, compose.py names it in `sourceAligned` and draws it at the
      source x; without, it is centred in the box (CONTROL). A file written for another figure raises
      before anything is drawn; under --control the file is never read. Through figure-compose.py with a
      --config entry: accepted with the box, refused on the same figure with the box removed.
* H   the HELD path (a send:false label drawn from heldBlockValues), end to end: a held label laid out in a
      box is named in `sourceAligned`; one heldplan REFUSES (drawn run-exact in English) is not (G21-style
      review finding 2, 2026-10-07: it used to be recorded before the planner had accepted it).
"""
import importlib.util
import json
import math
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
os.environ['SOURCE_DATE_EPOCH'] = '1700000000'
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
sys.dont_write_bytecode = True

import cairo                                                  # noqa: E402
from PIL import Image                                         # noqa: E402

import figtext as FT                                          # noqa: E402
import figcontainers as FC                                    # noqa: E402
import figlayout as FLY                                       # noqa: E402
from blockkey import block_key, block_lines, block_english    # noqa: E402

fails = []


def check(label, ok, detail=''):
    print(('  PASS  ' if ok else '  FAIL  ') + label + (': ' + detail if detail else ''), flush=True)
    if not ok:
        fails.append(label)


def finish():
    print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
    sys.exit(1 if fails else 0)


def raises(fn):
    """-> (reason or the exception's type name, message), or (None, '') when nothing was raised."""
    try:
        fn()
    except Exception as exc:                                  # noqa: BLE001 - the reason is the assertion
        return getattr(exc, 'reason', type(exc).__name__), str(exc)
    return None, ''


BASENAME = 'CNX_Fixture_SrcBox'
REASON = 'R-5c2 ([USER] 2026-10-07): this figure keeps the source alignment in its boxes'

# ── U. sourceboxes.py ─────────────────────────────────────────────────────────────────────────
try:
    import sourceboxes as SB                                  # noqa: E402
except ImportError as exc:
    SB = None
    check('U0 sourceboxes.py imports', False, f'{type(exc).__name__}: {exc}')

if SB is not None:
    check('U1 the table is named sourceAlignedBoxes', SB.TABLE == 'sourceAlignedBoxes', repr(SB.TABLE))
    check('U1 an absent table is {} and a figure with no entry is None',
          SB.load_table({}) == {} and SB.for_figure({'CNX_Other': REASON}, BASENAME) is None)
    r, m = raises(lambda: SB.load_table({'sourceAlignedBoxes': None}))
    check('U2 a null table is refused, never read as empty', r == 'table-not-object', m)
    r, m = raises(lambda: SB.load_table({'sourceAlignedBoxes': []}))
    check('U2 a list table is refused', r == 'table-not-object', m)
    r, m = raises(lambda: SB.load_table(None))
    check('U2 a config that is not an object is refused', r == 'config-not-object', m)
    r, m = raises(lambda: SB.for_figure({BASENAME: True}, BASENAME))
    check('U3 an entry that is not a string is refused, naming sourceAlignedBoxes.<b>',
          r == 'reason-not-string' and f'sourceAlignedBoxes.{BASENAME}' in m, m)
    r, m = raises(lambda: SB.for_figure({BASENAME: 'R-5c2'}, BASENAME))
    check('U3 a reason of MIN_REASON characters or fewer is refused', r == 'reason-short' and BASENAME in m, m)
    r, m = raises(lambda: SB.for_figure({BASENAME: 'x' * SB.MIN_REASON}, BASENAME))
    check('U3 exactly MIN_REASON characters is still refused (over, not at)', r == 'reason-short', m)
    check('U3 CONTROL MIN_REASON + 1 characters is accepted',
          SB.for_figure({BASENAME: 'x' * (SB.MIN_REASON + 1)}, BASENAME) == 'x' * (SB.MIN_REASON + 1))
    check('U4 an EXACT basename only: a case twin reads nothing',
          SB.for_figure({BASENAME.lower(): REASON}, BASENAME) is None)
    check('U4 CONTROL the exact basename reads its reason', SB.for_figure({BASENAME: REASON}, BASENAME) == REASON)
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / 'source-boxes.json'
        SB.write_file(p, BASENAME, '/cfg.json', REASON)
        got = SB.read_file(p)
        check('U5 write/read round trip, reason on', got == {'basename': BASENAME, 'configPath': '/cfg.json',
                                                            'reason': REASON}, repr(got))
        check('U5 the write leaves no .tmp behind', not (Path(td) / 'source-boxes.json.tmp').exists())
        SB.write_file(p, BASENAME, '/cfg.json', None)
        got = SB.read_file(p)
        check('U5 write/read round trip, off (reason null)', got['reason'] is None, repr(got))
        r, m = raises(lambda: SB.read_file(Path(td) / 'absent.json'))
        check('U6 a missing hand-off file is refused, never read as off', r == 'unreadable', m)
        bad = Path(td) / 'bad.json'
        bad.write_text('{', encoding='utf-8')
        r, m = raises(lambda: SB.read_file(bad))
        check('U6 an unparsable hand-off file is refused', r == 'unparsable', m)
        bad.write_text('[]', encoding='utf-8')
        r, m = raises(lambda: SB.read_file(bad))
        check('U6 a hand-off file that is not an object is refused', r == 'file-not-object', m)
        bad.write_text(json.dumps({'basename': BASENAME, 'configPath': '/c'}), encoding='utf-8')
        r, m = raises(lambda: SB.read_file(bad))
        check('U6 a hand-off file with no reason field is refused (absent is not off)', r == 'missing-field', m)
        bad.write_text(json.dumps({'basename': BASENAME, 'configPath': '/c', 'reason': True}), encoding='utf-8')
        r, m = raises(lambda: SB.read_file(bad))
        check('U6 a reason that is neither a string nor null is refused', r == 'bad-field', m)
        bad.write_text(json.dumps({'basename': BASENAME, 'configPath': '/c', 'reason': '  '}), encoding='utf-8')
        r, m = raises(lambda: SB.read_file(bad))
        check('U6 a blank-string reason is refused (only null means off; review finding 5)', r == 'bad-field', m)
        bad.write_text(json.dumps({'basename': '', 'configPath': '/c', 'reason': None}), encoding='utf-8')
        r, m = raises(lambda: SB.read_file(bad))
        check('U6 an empty basename is refused', r == 'bad-field', m)

# ── B. figcontainers.container_for(..., source_boxes=...) ─────────────────────────────────────
W, H = 400.0, 300.0


def brun(x, y, text, size=9.0, adv=None):
    return {'x': x, 'y': y, 'rot': 0.0, 'size': size, 'adv': adv if adv is not None else 0.5 * size * len(text),
            'text': text, 'font': 'F'}


def rect(x0, y0, x1, y1, stroke=True, fill=False):
    return {'object_type': 'rect', 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'stroke': stroke, 'fill': fill,
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
    return dict(n_src=1, sz0=block[0]['size'], starts=[FC.FT.along(r) for r in block],
                ends=[FC.FT.along(r) + r['adv'] for r in block], projs=[FC.FT.proj(r) for r in block])


def cf(index, blocks, pg, **kw):
    try:
        return FC.container_for(index, blocks, pg, blank(), H, **kw)
    except TypeError as exc:                     # the red arm: no such keyword yet
        return {'cls': 'TypeError', 'why': str(exc), 'align': None}


BOX = rect(90, 60, 250, 140)                     # inner (90.5, 60.5, 249.5, 139.5)
LEFT = [brun(95.0, 100.0, 'Oxidizer', adv=36.0)]  # left margin 4.5, right margin 118.5 -> the source is LEFT
pg = page(BOX)

c_on = cf(0, [LEFT], pg, source_boxes=True)
check('B1 a lone box with the switch on becomes a cell, why ends +source-boxes',
      c_on['cls'] == 'cell' and c_on['why'] == 'stroked-closed+source-boxes', f"{c_on['cls']} {c_on['why']}")
check("B1 ... with the source's alignment (cell_alignment: left)", c_on.get('align') == 'left',
      f"{c_on.get('align')} {c_on.get('align_why')}")
if c_on['cls'] == 'cell':
    lay = FLY.decide(words('Oxunarefni'), fw, c_on, cues(LEFT))
    check('B1 by VALUE: figlayout draws the line at the source x (95.0, within 0.01 pt)',
          abs(lay['x0'][0] - 95.0) <= 0.01, f"{lay['x0'][0]:.3f}")
c_off = cf(0, [LEFT], pg, source_boxes=False)
c_def = cf(0, [LEFT], pg)
check('B2 CONTROL switch off: R2 - a box, centred, why stroked-closed',
      c_off['cls'] == 'box' and c_off['align'] == 'center' and c_off['why'] == 'stroked-closed',
      f"{c_off['cls']} {c_off['align']} {c_off['why']}")
check('B2 CONTROL the switch defaults to off (no keyword = R2, the same dict)', c_def == c_off)
c_r2 = FC.container_for(0, [LEFT], pg, blank(), H)          # the 5-argument call, valid on every tree
lay_off = FLY.decide(words('Oxunarefni'), fw, c_r2, cues(LEFT))
check('B2 CONTROL by VALUE: with no switch, the line is centred on the box (170.0)',
      abs(lay_off['x0'][0] + lay_off['widths'][0] / 2 - 170.0) <= 1e-6,
      f"{lay_off['x0'][0] + lay_off['widths'][0] / 2:.3f}")

# A SHARED box (code column + explanation column, HazDiamond's special-hazard shape).
CODE = [brun(95.0, 120.0, 'OX', adv=12.0), brun(95.0, 108.0, 'ACID', adv=20.0)]
EXPL = [brun(125.0, 120.0, 'Oxidizer', adv=36.0), brun(125.0, 108.0, 'Acid', adv=18.0)]
s_on = cf(1, [CODE, EXPL], pg, source_boxes=True)
s_off = cf(1, [CODE, EXPL], pg, source_boxes=False)
check('B3 a SHARED box with the switch on: +source-boxes, not +shared',
      s_on['cls'] == 'cell' and s_on['why'] == 'stroked-closed+source-boxes', f"{s_on['cls']} {s_on['why']}")
check("B3 ... with the source's alignment (left), not R-2a's own-centre",
      s_on.get('align') == 'left', f"{s_on.get('align')} {s_on.get('align_why')}")
check('B3 CONTROL switch off: the shared box keeps R-2a (+shared, centre)',
      s_off['cls'] == 'cell' and s_off['why'].endswith('+shared') and s_off['align'] == 'center',
      f"{s_off['cls']} {s_off['why']} {s_off['align']}")

# A cell (fill-only label patch) and an open label: the switch reaches boxes only.
PATCH = rect(90, 60, 250, 140, stroke=False, fill=True)
p_on, p_off = cf(0, [LEFT], page(PATCH), source_boxes=True), cf(0, [LEFT], page(PATCH), source_boxes=False)
check('B4 CONTROL precondition: a fill-only patch is a cell with the switch off', p_off['cls'] == 'cell',
      f"{p_off['cls']} {p_off['why']}")
check('B4 the switch leaves a cell exactly as it was (same dict)', p_on == p_off, f'{p_on} vs {p_off}')
o_on, o_off = cf(0, [LEFT], page(), source_boxes=True), cf(0, [LEFT], page(), source_boxes=False)
check('B4 CONTROL precondition: no rect -> open', o_off['cls'] == 'open', o_off['cls'])
check('B4 the switch leaves an open label exactly as it was (same dict)', o_on == o_off)

# ── V / W. figure-compose.py verify() and its plumbing, as units ──────────────────────────────
_spec = importlib.util.spec_from_file_location('figure_compose', HERE / 'figure-compose.py')
FCW = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(FCW)

BLOCKS = [{'key': 'OX|ACID', 'send': False}, {'key': 'Oxidizer|Acid', 'send': True}]
TR = {'Oxidizer|Acid': 'Oxunarefni Sýra'}
BASE_REPORT = {'blocks': ['OX|ACID', 'Oxidizer|Acid'], 'missing': ['OX|ACID'], 'translated': ['Oxidizer|Acid'],
               'held': [], 'heldErrors': [], 'explicitBreaks': [], 'explicitBreakErrors': [], 'anchorExcluded': []}


def verdict(report, src):
    try:
        FCW.verify(report, BLOCKS, TR, None, None, src)
    except FCW.ComposeError as exc:
        return str(exc)
    except TypeError as exc:                     # the red arm: verify has no such parameter yet
        return f'TypeError: {exc}'
    return ''


def has_src_param():
    import inspect
    return len(inspect.signature(FCW.verify).parameters) >= 6


check('V0 verify() takes the sourceAlignedBoxes reason as its sixth argument', has_src_param())
REACHED = {**BASE_REPORT, 'sourceAligned': [{'key': 'OX|ACID', 'block': 0}, {'key': 'Oxidizer|Acid', 'block': 1}]}
check('V1 CONTROL configured and reaching two boxes: accepted', verdict(REACHED, REASON) == '',
      verdict(REACHED, REASON))
m = verdict({**BASE_REPORT, 'sourceAligned': []}, REASON)
check('V2 configured but reaching NO box: refused (an inert entry), naming sourceAlignedBoxes',
      m != '' and 'sourceAlignedBoxes' in m and 'TypeError' not in m, m)
m = verdict(BASE_REPORT, REASON)
check('V2 configured and the report carries no sourceAligned key: refused (drifted)', m != '' and 'TypeError' not in m, m)
m = verdict(REACHED, None)
check('V3 nothing configured but the report names boxes: refused', m != '' and 'TypeError' not in m, m)
check('V4 CONTROL nothing configured and no key in the report (a pre-table report): accepted',
      verdict(BASE_REPORT, None) == '', verdict(BASE_REPORT, None))
check('V4 CONTROL nothing configured and an empty list: accepted',
      verdict({**BASE_REPORT, 'sourceAligned': []}, None) == '')
m = verdict({**BASE_REPORT, 'sourceAligned': [{'key': 'Not a block', 'block': 0}]}, REASON)
check('V5 a named key that blocks.json does not carry: refused', m != '' and 'TypeError' not in m, m)
m = verdict({**BASE_REPORT, 'sourceAligned': [{'key': 'OX|ACID', 'block': True}]}, REASON)
check('V5 a block that is a bool, not an int, is refused (isinstance(True, int); review finding 4)',
      m != '' and 'TypeError' not in m, m)
m = verdict({**BASE_REPORT, 'sourceAligned': ['OX|ACID']}, REASON)
check('V5 entries that are not {key, block} objects: refused', m != '' and 'TypeError' not in m, m)
m = verdict({**BASE_REPORT, 'sourceAligned': {'key': 'OX|ACID'}}, REASON)
check('V5 a sourceAligned that is not a list: refused', m != '' and 'TypeError' not in m, m)

check('W1 source-boxes.json is a derived output (removed before every run)',
      'source-boxes.json' in FCW.DERIVED_OUTPUTS, repr(FCW.DERIVED_OUTPUTS))
check('W2 sourceAligned is a compose NOTE (copied into compose.json)', 'sourceAligned' in FCW.COMPOSE_NOTES,
      repr(FCW.COMPOSE_NOTES))
_seen = {}


class _Done:
    returncode, stdout, stderr = 0, '', ''


def _fake_run(argv, **kw):
    _seen['argv'] = list(argv)
    return _Done()


_real_run = FCW.subprocess.run
FCW.subprocess.run = _fake_run
try:
    try:
        FCW.run_compose(Path('/o'), Path('/t.json'), Path('/o/held-values.json'), Path('/o/anchor-exclusions.json'),
                        Path('/o/source-boxes.json'))
    except TypeError as exc:
        _seen['err'] = str(exc)
finally:
    FCW.subprocess.run = _real_run
argv = _seen.get('argv', [])
check('W3 run_compose passes --source-boxes <file> to compose.py',
      '--source-boxes' in argv and argv[argv.index('--source-boxes') + 1] == '/o/source-boxes.json',
      _seen.get('err', repr(argv)))

# ── E. end to end: the committed fixture, re-planted with ONE left-set label inside a stroked box ──
PREPARE, COMPOSE, FIXTURE = HERE / 'figure-prepare.py', HERE / 'compose.py', HERE / 'fixtures' / 'fixture_figure.pdf'
PAGE_W, PAGE_H = 300.0, 220.0
BLACK = ['cmyk', 0.0, 0.0, 0.0, 1.0]
BX0, BY0, BX1, BY1 = 40.0, 100.0, 200.0, 140.0       # the box, PDF page space (y up)
LX, LY = 45.0, 116.0                                 # the label: left-set, 5 pt inside the box's left edge


def plant(out, with_box):
    (out / 'runs.json').write_text(json.dumps([dict(text='Oxidizer', font='PAGE/F1', size=9.0, rot=0.0, x=LX,
                                                    y=LY, adv=36.0, fill=BLACK, tm=[1.0, 0.0, 0.0, 1.0, LX, LY])]))
    pdf = out / 'artwork.pdf'
    surf = cairo.PDFSurface(str(pdf), PAGE_W, PAGE_H)
    c = cairo.Context(surf)
    c.set_source_rgb(1, 1, 1)
    c.paint()
    if with_box:
        c.set_source_rgb(0.3, 0.4, 0.8)
        c.set_line_width(1.0)
        c.rectangle(BX0, PAGE_H - BY1, BX1 - BX0, BY1 - BY0)
        c.stroke()
    surf.finish()
    r = subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(pdf), str(out / 'artwork')],
                       capture_output=True, text=True)
    runs = json.loads((out / 'runs.json').read_text())
    fonts = json.loads((out / 'meta.json').read_text())['fonts']
    blocks = FT.merge_blocks(FT.group(runs))
    (out / 'blocks.json').write_text(json.dumps(
        [dict(key=block_key(b), english=block_english(b), lines=block_lines(b), arc=FT.is_arc(b),
              send=FT.sendable(b, block_english(b), fonts)) for b in blocks], indent=1, ensure_ascii=False))
    return r.returncode == 0 and [block_key(b) for b in blocks] == ['Oxidizer']


def drawn_x(svg):
    xs = []
    for m in re.finditer(r'<text ([^>]*)>([^<]*)</text>', Path(svg).read_text(encoding='utf-8')):
        a = dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1)))
        if 'font-kerning:none' in a.get('style', '') and m.group(2) == 'Oxunarefni':
            xs.append(float(a['x']))
    return xs


def compose(out, *extra):
    return subprocess.run([sys.executable, str(COMPOSE), '--translations', str(out.parent / 'tr.json'),
                           *map(str, extra), '--svg'], capture_output=True, text=True,
                          env=dict(os.environ, FIGTEXT_OUT=str(out)), cwd=str(HERE))


def report_of(out):
    p = out / 'compose-report.json'
    return json.loads(p.read_text()) if p.exists() else None


TMP = tempfile.TemporaryDirectory(prefix='c140-srcbox-')
out = Path(TMP.name) / BASENAME
env = dict(os.environ)
env.pop('FIGTEXT_OUT', None)
prep = subprocess.run([sys.executable, str(PREPARE), str(FIXTURE), '--basename', BASENAME, '--out', str(out)],
                      capture_output=True, text=True, env=env)
if prep.returncode != 0 or not plant(out, True):
    check('PRECONDITION the fixture prepares and re-plants as ONE boxed label', False, prep.stderr[-400:])
    finish()
(Path(TMP.name) / 'tr.json').write_text(json.dumps({'Oxidizer': 'Oxunarefni'}, ensure_ascii=False))
pg_e = FC.load_page(out / 'artwork.pdf')
with Image.open(out / 'artwork.png') as _im:
    dark_e = _im.convert('L')
blocks_e = FT.merge_blocks(FT.group(json.loads((out / 'runs.json').read_text())))
pre = FC.container_for(0, blocks_e, pg_e, dark_e, PAGE_H)
if pre['cls'] != 'box':
    check('PRECONDITION the planted label is in a box (R2) with no switch', False, f"{pre['cls']} {pre['why']}")
    finish()

if SB is not None:
    sbf = out / 'source-boxes.json'
    SB.write_file(sbf, BASENAME, '/cfg.json', REASON)
    r = compose(out, '--source-boxes', sbf)
    rep = report_of(out)
    check('E1 compose.py with the file names the boxed label in sourceAligned',
          rep is not None and rep.get('sourceAligned') == [{'key': 'Oxidizer', 'block': 0}],
          repr(rep and rep.get('sourceAligned')) + r.stderr[-300:])
    xs_on = drawn_x(out / 'translated.svg') if (out / 'translated.svg').exists() else []
    check('E1 ... and draws it at the source x (45.0, within 0.01 pt)', len(xs_on) == 1 and abs(xs_on[0] - LX) <= 0.01,
          repr(xs_on))
    SB.write_file(sbf, BASENAME, '/cfg.json', None)
    compose(out, '--source-boxes', sbf)
    rep = report_of(out)
    xs_null = drawn_x(out / 'translated.svg')
    check('E2 CONTROL a file whose reason is null: sourceAligned [], centred like no file',
          rep is not None and rep.get('sourceAligned') == [] and len(xs_null) == 1 and abs(xs_null[0] - LX) > 5,
          f"{rep and rep.get('sourceAligned')} {xs_null}")
    svg_null = (out / 'translated.svg').read_bytes()
    compose(out)
    rep = report_of(out)
    check('E2 CONTROL no flag: sourceAligned [], and byte-identical to the null file',
          rep is not None and rep.get('sourceAligned') == [] and (out / 'translated.svg').read_bytes() == svg_null,
          repr(rep and rep.get('sourceAligned')))
    (out / 'compose-report.json').unlink()
    SB.write_file(sbf, 'CNX_Someone_Else', '/cfg.json', REASON)
    r = compose(out, '--source-boxes', sbf)
    check('E3 a file written for another figure raises before anything is drawn (no report)',
          r.returncode != 0 and report_of(out) is None and 'CNX_Someone_Else' in r.stderr, r.stderr[-300:])
    r = compose(out, '--source-boxes', Path(TMP.name) / 'does-not-exist.json', '--control')
    check('E4 CONTROL under --control the file is never read (a missing path is no error)',
          r.returncode == 0 and report_of(out) is not None, r.stderr[-300:])

    cfg = Path(TMP.name) / 'cfg.json'
    cfg.write_text(json.dumps({'sourceAlignedBoxes': {BASENAME: REASON}}), encoding='utf-8')
    fc = subprocess.run([sys.executable, str(HERE / 'figure-compose.py'), '--out', str(out), '--translations',
                         str(Path(TMP.name) / 'tr.json'), '--config', str(cfg)],
                        capture_output=True, text=True, cwd=str(HERE))
    cj = json.loads((out / 'compose.json').read_text()) if (out / 'compose.json').exists() else {}
    check('E5 figure-compose.py with the entry: accepted, compose.json names the box',
          fc.returncode == 0 and cj.get('sourceAligned') == [{'key': 'Oxidizer', 'block': 0}],
          f'exit {fc.returncode} {cj.get("sourceAligned")} {fc.stderr[-300:]}')
    plant(out, False)
    fc = subprocess.run([sys.executable, str(HERE / 'figure-compose.py'), '--out', str(out), '--translations',
                         str(Path(TMP.name) / 'tr.json'), '--config', str(cfg)],
                        capture_output=True, text=True, cwd=str(HERE))
    check('E6 the same entry on the figure with the box removed: refused as INERT (laid out NO label in a box)',
          fc.returncode != 0 and 'NO label' in (fc.stdout + fc.stderr),
          f'exit {fc.returncode} {(fc.stdout + fc.stderr)[-300:]}')

    # ── H. the held path ──────────────────────────────────────────────────────────────────────
    import heldvalues as HV                                   # noqa: E402

    def plant_digit(out_):
        (out_ / 'runs.json').write_text(json.dumps([dict(text='4', font='PAGE/F1', size=9.0, rot=0.0, x=LX, y=LY,
                                                         adv=5.0, fill=BLACK, tm=[1.0, 0.0, 0.0, 1.0, LX, LY])]))
        runs_ = json.loads((out_ / 'runs.json').read_text())
        fonts_ = json.loads((out_ / 'meta.json').read_text())['fonts']
        blocks_ = FT.merge_blocks(FT.group(runs_))
        (out_ / 'blocks.json').write_text(json.dumps(
            [dict(key=block_key(b), english=block_english(b), lines=block_lines(b), arc=FT.is_arc(b),
                  send=FT.sendable(b, block_english(b), fonts_)) for b in blocks_], indent=1, ensure_ascii=False))
        return json.loads((out_ / 'blocks.json').read_text())

    plant(out, True)                                          # the box back
    entries_h = plant_digit(out)
    if [(e['key'], e['send']) for e in entries_h] != [('4', False)]:
        check('PRECONDITION H the digit label is ONE send:false block', False, repr(entries_h))
    else:
        (Path(TMP.name) / 'tr.json').write_text('{}', encoding='utf-8')
        SB.write_file(sbf, BASENAME, '/cfg.json', REASON)
        hv = out / 'held-values.json'
        HV.write_file(hv, BASENAME, '/cfg.json', {'4': 'Fjórir'})
        compose(out, '--held-values', hv, '--source-boxes', sbf)
        rep = report_of(out)
        check('H1 CONTROL a held label the planner accepts is laid out in the box and named in sourceAligned',
              rep is not None and [h['key'] for h in rep.get('held', [])] == ['4']
              and rep.get('sourceAligned') == [{'key': '4', 'block': 0}],
              repr(rep and (rep.get('held'), rep.get('heldErrors'), rep.get('sourceAligned'))))
        HV.write_file(hv, BASENAME, '/cfg.json', {'4': 'Fj\u2603rir'})
        compose(out, '--held-values', hv, '--source-boxes', sbf)
        rep = report_of(out)
        check('H2 precondition: the planner REFUSES a value with a glyph the face lacks (heldErrors names it)',
              rep is not None and [e['key'] for e in rep.get('heldErrors', [])] == ['4'],
              repr(rep and rep.get('heldErrors')))
        check('H2 ... and that block, drawn run-exact in English, is NOT named in sourceAligned',
              rep is not None and rep.get('sourceAligned') == [], repr(rep and rep.get('sourceAligned')))

finish()
