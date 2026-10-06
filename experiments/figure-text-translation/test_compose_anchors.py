#!/usr/bin/env python3
"""§C140 '6' M1 and R-20, end to end: compose.py hands figlayout the visual source lines' text, so a
translated label keeps the row boundaries its source broke at where the MT carried a verbatim token -
and `--anchor-exclusions` turns exactly that off for a named block key.

    FIGTEXT_PYLIBS=./pylibs python3 -B test_compose_anchors.py

Design: docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md, D-a; rulings R-3,
R-4, R-6 and R-20 ([USER] 2026-10-05, recorded in the campaign register).

WHAT IS PLANTED. The committed fixture (`fixtures/fixture_figure.pdf`) is prepared into a temporary
directory, its `runs.json` REPLACED and its artwork REPLACED with a blank page - the
test_compose_visual_lines.py pattern. ONE block of three source lines, `Nucleus|(11 protons,|12 neutrons)`
(the NaCation shape, test_figlayout_anchors.py T3), 9 pt, left-aligned at x = 50, baselines 11 pt apart,
every run in the fixture's own font key `PAGE/F1`. Its value is NaCation's paid-MT shape
`Kjarni (11 róteindir, 12 nifteindir)`.

THE PRECONDITION THAT MAKES A1 MEAN ANYTHING: figlayout, given compose's own cues for this block with and
without `texts` and a width measured from the face FILES (fontTools - not compose's cairo measure), cuts
the value DIFFERENTLY, and the cut with texts is the source rows' one. Without it A1 would pass on a
composer that never passes the cue.

RED-FIRST, measured on two pre-task trees. With figlayout's M1 but compose.py BEFORE this task (no
texts cue, no flag): A1 FAILS (the base cut is drawn), and so do A2b, A2c, A3 and A4 (the flag is
ignored: no `anchorExcluded`, no refusal) and U0/U0b (no anchorexclusions.py / figconfig.py); A2 PASSES
there, because a composer with no M1 draws the base cut anyway. With M1 but no R-20 (this task's first
commit): A2, A2b, A2c, A3, A4, U0 and U0b FAIL and A1 PASSES. A figlayout without M1 stops the file at
the PRECONDITION - which is its job.
CONTROLS (G13; they pass before and after by design, each reddened by a planted mutant named in the task
report): U7 (figconfig.load returns the parsed config) and C1 (under --control the flag is never read, so
a file written for another figure does not stop a control run).
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
os.environ['SOURCE_DATE_EPOCH'] = '1700000000'  # BEFORE any child is spawned (A4's byte identity)
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
sys.dont_write_bytecode = True

import cairo                                                  # noqa: E402
import figtext as FT                                          # noqa: E402
import figcontainers as FC                                    # noqa: E402
import figlayout as FL                                        # noqa: E402
from blockkey import block_key, block_lines, block_english    # noqa: E402
from fontTools.ttLib import TTFont                            # noqa: E402
from PIL import Image                                         # noqa: E402

PREPARE = HERE / 'figure-prepare.py'
COMPOSE = HERE / 'compose.py'
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'
PAGE_W, PAGE_H = 300.0, 220.0
BLACK = ['cmyk', 0.0, 0.0, 0.0, 1.0]
BASENAME = 'CNX_Fixture_M1'

# The fixture's own /Widths, read out of make_fixture.py WITHOUT importing it (it needs pikepdf).
_mf = ast.parse((HERE / 'make_fixture.py').read_text())
_W = next(ast.literal_eval(n.value) for n in _mf.body if isinstance(n, ast.Assign)
          and any(getattr(t, 'id', None) == 'WIDTHS' for t in n.targets))
_FIRST = next(ast.literal_eval(n.value)[0] for n in _mf.body if isinstance(n, ast.Assign)
              and isinstance(n.targets[0], ast.Tuple)
              and [e.id for e in n.targets[0].elts] == ['FIRST_CHAR', 'LAST_CHAR'])

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


def fixture_adv(text, size):
    return round(sum(_W[ord(c) - _FIRST] for c in text) * size / 1000.0, 3)


def run(text, size, x, y):
    return dict(text=text, font='PAGE/F1', size=size, rot=0.0, x=x, y=y, adv=fixture_adv(text, size),
                fill=BLACK, tm=[1.0, 0.0, 0.0, 1.0, x, y])


_FACE = {}


def text_adv(text, size):
    """The drawn width, from the regular face FILE with fontTools - independent of compose.py's cairo
    measure (test_compose_t23.py's instrument)."""
    from figis import face_path
    if not _FACE:
        f = TTFont(str(face_path((False, False))))
        _FACE.update(cmap=f.getBestCmap(), hmtx=f['hmtx'], upm=f['head'].unitsPerEm)
    return sum(_FACE['hmtx'][_FACE['cmap'].get(ord(c), '.notdef')][0] for c in text) * size / _FACE['upm']


def drawn_lines(svg_path):
    """The laid-out <text> pieces (svgout draws those, and only those, with font-kerning:none), grouped into
    lines by their SVG baseline, top to bottom - one planted label, so no attribution is needed."""
    rows = {}
    for m in re.finditer(r'<text ([^>]*)>([^<]*)</text>', Path(svg_path).read_text(encoding='utf-8')):
        a = dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1)))
        if 'font-kerning:none' not in a.get('style', ''):
            continue
        rows.setdefault(round(float(a['y']), 2), []).append((float(a['x']), m.group(2)))
    return [''.join(t for _, t in sorted(rows[y])) for y in sorted(rows)]


def compose(out, tr, *extra):
    return subprocess.run([sys.executable, str(COMPOSE), '--translations', str(tr), *map(str, extra), '--svg'],
                          capture_output=True, text=True, env=dict(os.environ, FIGTEXT_OUT=str(out)), cwd=str(HERE))


def report_of(out):
    p = out / 'compose-report.json'
    return json.loads(p.read_text()) if p.exists() else None


# ── U. the two new stdlib modules, pure ───────────────────────────────────────────────────────
try:
    import anchorexclusions as AE                             # noqa: E402
except ImportError as exc:
    AE = None
    check('U0 anchorexclusions.py imports', False, f'{type(exc).__name__}: {exc}')
try:
    import figconfig                                          # noqa: E402
except ImportError as exc:
    figconfig = None
    check('U0b figconfig.py imports', False, f'{type(exc).__name__}: {exc}')


def raises(fn):
    """-> (reason or the exception's type name, message), or (None, '') when nothing was raised."""
    try:
        fn()
    except Exception as exc:                                  # noqa: BLE001 - the reason is the assertion
        return getattr(exc, 'reason', type(exc).__name__), str(exc)
    return None, ''


LONG = 'R-20 ([USER] 2026-10-05): keep the wrap [USER] accepted for this label'
if AE is not None:
    check('U1 an absent table is {} and a figure with no entry is {}',
          AE.load_table({}) == {} and AE.for_figure({'CNX_Other': {'a|b': LONG}}, BASENAME) == {})
    r, m = raises(lambda: AE.load_table({'anchorExclusions': None}))
    check('U2 a null table is refused, never read as empty', r == 'table-not-object', m)
    r, m = raises(lambda: AE.for_figure({BASENAME: {'a|b': 'R-20'}}, BASENAME))
    check('U3 a reason of 40 characters or fewer is refused, naming anchorExclusions.<b>[<key>]',
          r == 'reason-short' and f"anchorExclusions.{BASENAME}['a|b']" in m, m)
    check('U4 an EXACT basename only: a case twin of the basename reads nothing',
          AE.for_figure({BASENAME.lower(): {'a|b': LONG}}, BASENAME) == {})
if figconfig is not None:
    with tempfile.TemporaryDirectory() as td:
        rep = Path(td) / 'rep.json'
        rep.write_text('{"anchorExclusions": {"X": {"a|b": "r"}, "X": {"a|b": "r"}}}', encoding='utf-8')
        r, m = raises(lambda: figconfig.load(rep))
        check('U5 figconfig.load refuses a repeated key at any depth, naming it', r == 'ConfigError'
              and 'repeats the key' in m and "'X'" in m, m)
        r, m = raises(lambda: figconfig.load(Path(td) / 'absent.json'))
        check('U6 figconfig.load refuses a config it cannot read, never reading it as empty',
              r == 'ConfigError' and 'cannot be read' in m and 'absent.json' in m, m)
        ok = Path(td) / 'ok.json'
        ok.write_text('{"anchorExclusions": {}, "heldBlockValues": {}}', encoding='utf-8')
        check('U7 CONTROL figconfig.load returns the parsed config', figconfig.load(ok)
              == {'anchorExclusions': {}, 'heldBlockValues': {}})

# ── the plant ─────────────────────────────────────────────────────────────────────────────────
KEY = 'Nucleus|(11 protons,|12 neutrons)'
VALUE = 'Kjarni (11 róteindir, 12 nifteindir)'
ROWS = ['Kjarni', '(11 róteindir,', '12 nifteindir)']
X0, Y0, PITCH = 50.0, 150.0, 11.0
PLANT = [run('Nucleus', 9.0, X0, Y0), run('(11 protons,', 9.0, X0, Y0 - PITCH),
         run('12 neutrons)', 9.0, X0, Y0 - 2 * PITCH)]

TMP = tempfile.TemporaryDirectory(prefix='c140-m1-anchors-')
out = Path(TMP.name) / 'fig'
env = dict(os.environ)
env.pop('FIGTEXT_OUT', None)
prep = subprocess.run([sys.executable, str(PREPARE), str(FIXTURE), '--basename', BASENAME, '--out', str(out)],
                      capture_output=True, text=True, env=env)
precondition('the fixture prepares', prep.returncode == 0, prep.stderr.strip()[-400:])
(out / 'runs.json').write_text(json.dumps(PLANT, ensure_ascii=False))
pdf = out / 'artwork.pdf'
surf = cairo.PDFSurface(str(pdf), PAGE_W, PAGE_H)
_c = cairo.Context(surf)
_c.set_source_rgb(1, 1, 1)
_c.paint()
surf.finish()
r = subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(pdf), str(out / 'artwork')],
                   capture_output=True, text=True)
precondition('the planted artwork renders', r.returncode == 0 and (out / 'artwork.png').exists(), r.stderr[-300:])

runs = json.loads((out / 'runs.json').read_text())
fonts = json.loads((out / 'meta.json').read_text())['fonts']
blocks = FT.merge_blocks(FT.group(runs))
entries = [dict(key=block_key(b), english=block_english(b), lines=block_lines(b), arc=FT.is_arc(b),
                send=FT.sendable(b, block_english(b), fonts)) for b in blocks]
(out / 'blocks.json').write_text(json.dumps(entries, indent=1, ensure_ascii=False))
precondition('the plant is ONE block under the key, of three visual lines',
             [e['key'] for e in entries] == [KEY] and len(FT.visual_lines(blocks[0])) == 3,
             repr([e['key'] for e in entries]))

# The precondition: figlayout cuts THIS block differently with and without the texts cue.
b = blocks[0]
vls = FT.visual_ink(b)
cues = dict(n_src=len(vls), sz0=9.0, starts=[min(FT.along(r) for r in l) for l in vls],
            ends=[max(FT.along(r) + r['adv'] for r in l) for l in vls], projs=[FT.proj(l[0]) for l in vls],
            blank=[not ''.join(r['text'] for r in l).strip() for l in vls])
texts = [''.join(r['text'] for r in l) for l in vls]
container = FC.container_for(0, blocks, FC.load_page(pdf), Image.open(out / 'artwork.png').convert('L'), PAGE_H)
words = [(w, [None] * len(w)) for w in VALUE.split()]


def width(chars, size, j):
    return text_adv(''.join(ch for ch, _ in chars), size)


def cut(lay):
    return [''.join(ch for ch, _ in l) for l in lay['lines']]


base = cut(FL.decide(words, width, container, cues))
anch = cut(FL.decide(words, width, container, dict(cues, texts=texts)))
precondition(f"in its {container['cls']} container figlayout cuts the value on the source rows WITH texts, and "
             f"DIFFERENTLY without", texts == KEY.split('|') and anch == ROWS and base != ROWS
             and len(base) == 3, f'texts={texts} with={anch} without={base}')

tr = Path(TMP.name) / 'tr.json'
tr.write_text(json.dumps({'blocks': {KEY: VALUE}}, ensure_ascii=False))

# A1: no flag at all - M1 runs.
c = compose(out, tr)
rep = report_of(out)
precondition('compose (no flag) exits 0 and writes its report and SVG',
             c.returncode == 0 and rep is not None and (out / 'translated.svg').exists(), c.stderr[-400:])
svg_plain = (out / 'translated.svg').read_bytes()
got = drawn_lines(out / 'translated.svg')
check('A1 the label is drawn on its SOURCE rows: each anchored item on its own line', got == ROWS,
      f'{got} (base cut {base})')

# A4: an EMPTY exclusions file for this figure - byte for byte the no-flag drawing.
empty = Path(TMP.name) / 'anchor-empty.json'
empty.write_text(json.dumps({'basename': BASENAME, 'configPath': 'test', 'exclusions': {}}))
c = compose(out, tr, '--anchor-exclusions', empty)
rep = report_of(out)
same = (out / 'translated.svg').exists() and (out / 'translated.svg').read_bytes() == svg_plain
check('A4 an empty exclusions file draws translated.svg BYTE-identical to no flag, and reports anchorExcluded []',
      c.returncode == 0 and same and rep is not None and rep.get('anchorExcluded') == [],
      f"exit {c.returncode} identical={same} anchorExcluded={rep and rep.get('anchorExcluded')!r} "
      f"{c.stderr.strip()[-300:]}")

# A2: the key excluded - the base cut, and a report naming the block as changed.
excl = Path(TMP.name) / 'anchor-excl.json'
excl.write_text(json.dumps({'basename': BASENAME, 'configPath': 'test', 'exclusions': {KEY: 'R-20 test reason'}}))
c = compose(out, tr, '--anchor-exclusions', excl)
rep = report_of(out)
got = drawn_lines(out / 'translated.svg') if (out / 'translated.svg').exists() else None
check('A2 an excluded key is drawn with the BASE cut (M1 off)', c.returncode == 0 and got == base,
      f'exit {c.returncode}: {got} (base {base}) {c.stderr.strip()[-300:]}')
check('A2b ... and compose-report.json anchorExcluded names it once, changed True',
      rep is not None and rep.get('anchorExcluded') == [{'key': KEY, 'block': 0, 'changed': True}],
      repr(rep and rep.get('anchorExcluded')))
check('A2c ... and stdout carries the NOTE, on a line of its own after a blank one',
      '\nNOTE (not a failure): 1 label(s) laid out WITHOUT M1' in c.stdout, c.stdout[-400:])

# A3: a file written for ANOTHER figure is never used: compose raises before drawing, no report.
other = Path(TMP.name) / 'anchor-other.json'
other.write_text(json.dumps({'basename': 'CNX_Other_Figure', 'configPath': 'test', 'exclusions': {KEY: 'x'}}))
(out / 'compose-report.json').unlink(missing_ok=True)
c = compose(out, tr, '--anchor-exclusions', other)
check('A3 an exclusions file written for another basename is refused: exit != 0, no report, named',
      c.returncode != 0 and report_of(out) is None and 'another figure' in c.stderr,
      f'exit {c.returncode}: {c.stderr.strip()[-300:]}')

# C1 CONTROL: under --control the flag is not even read, so the same other-figure file does not stop it.
c = subprocess.run([sys.executable, str(COMPOSE), '--control', '--translations', str(tr), '--anchor-exclusions',
                    str(other), '--svg'], capture_output=True, text=True,
                   env=dict(os.environ, FIGTEXT_OUT=str(out)), cwd=str(HERE))
rep = report_of(out)
check('C1 CONTROL --control never reads --anchor-exclusions: an other-figure file still composes',
      c.returncode == 0 and rep is not None and rep.get('control') is True, f'exit {c.returncode}: '
      f'{c.stderr.strip()[-300:]}')
finish()
