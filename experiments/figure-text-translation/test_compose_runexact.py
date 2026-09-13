#!/usr/bin/env python3
"""E, end to end: kept blocks drawn run-exact, translated blocks untouched (spec §C140 ① T2).

    FIGTEXT_PYLIBS=./pylibs python3 test_compose_runexact.py
    FIGTEXT_PYLIBS=./pylibs python3 test_compose_runexact.py --capture-golden

`--capture-golden` is run ONCE, on the UNCHANGED composer, and refuses to run on a composer
whose report carries `runExact`. The controls then compare the changed composer against it.

WHY PLANTED RUNS AND NOT THE COMMITTED PDF
------------------------------------------
The committed fixture has four one-run, one-line, 12 pt labels in one font. Every defect E
fixes needs something it lacks - a subscript, an italic face, a typed arrow gap, a multi-run
line, an arc - so they are planted into `runs.json`/`meta.json` after `figure-prepare.py`,
and `blocks.json` is re-derived with the real rules (test_figure_compose.py case 9's
pattern). The committed PDF is not regenerated.

🔴 A PLANT IS NOT WHAT ITS DESCRIPTION SAYS UNTIL ITS PRECONDITION PASSED. `figtext.group`
silently re-classifies a run that falls outside a clause's limits: a subscript shifted too far
becomes its own block, and a lone block is ALREADY drawn at its own size and origin by the
unchanged composer - so an assertion about it passes on the code it is meant to catch. Every
plant is checked against `blocks.json` / the report first, and the file stops on a failure.

🔴 THE CLOCK IS PINNED. fontTools writes the current time into `head.modified` of every woff2
subset in the `<style>` block, so two runs of the SAME composer differ in bytes. The child
inherits SOURCE_DATE_EPOCH, and the face control compares STRUCTURE (rule count, ordered
weight/style, decoded character set) rather than bytes anyway.

🔴 THE CONTROLS ARE WHAT MAKE THE RED ASSERTIONS MEAN ANYTHING. A composer that drew every
block run-exact - translations included - passes every "kept block is exact" assertion. The
translated-population control forbids that.
"""
import base64
import collections
import io
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
os.environ['SOURCE_DATE_EPOCH'] = '1700000000'  # BEFORE any child is spawned - see docstring

import figtext as FT                                          # noqa: E402
from blockkey import block_key, block_lines, block_english    # noqa: E402
from fontTools.ttLib import TTFont                            # noqa: E402

PREPARE = HERE / 'figure-prepare.py'
COMPOSE = HERE / 'compose.py'
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'
GOLDEN = HERE / 'fixtures' / 'compose-runexact-golden.json'
CAPTURE = '--capture-golden' in sys.argv
PAGE_H = 220.0

K_OBS, K_HYP, K_TEST, K_VERBATIM = ('Observation and curiosity', 'Form a hypothesis',
                                    'Test the hypothesis', 'H2O (g)')
K_GAP, K_EDGE, K_KARC, K_TARC = 'H2O(l)          H2O(g)', '25 mL ', '1+2=3', 'CURVE'
TR = {K_OBS: 'Athugun og forvitni', K_HYP: K_HYP,       # K_HYP is the IDENTITY reply
      K_TEST: 'Profa tilgatuna', K_TARC: 'BOGIX'}
# Every element of the translated population - text found NOWHERE else in the figure.
POPULATION = ('Athugun og forvitni', 'Profa tilgatuna', 'B', 'O', 'G', 'I', 'X')

# Helvetica advance widths (1/1000 em) for the planted glyphs - the fixture's font.
HELV = {'H': 722, '2': 556, 'O': 778, ' ': 278, '(': 333, 'g': 556, ')': 333,
        'F': 611, 'o': 556, 'r': 333, 'm': 833, 'a': 556}
FILL = ['cmyk', 0.75, 0.5, 0.0, 0.2]
RED = ['cmyk', 0.0, 1.0, 1.0, 0.0]

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''),
          flush=True)
    if not ok:
        fails.append(label)


def finish():
    print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
    sys.exit(1 if fails else 0)


def adv(text, size):
    return round(sum(HELV[c] for c in text) * size / 1000.0, 3)


def run(text, x, y, size=12.0, rot=0.0, font='PAGE/F1', fill=FILL, a=0.0):
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    return dict(text=text, font=font, size=size, rot=rot, x=x, y=y, adv=a, fill=fill,
                tm=[c, s, -s, c, x, y])


def arc_runs(glyphs, cx, cy, radius=60.0, size=12.0):
    """Single glyphs at 10-degree steps on a real circle, reading left to right along the
    top, each rotated to the tangent: figtext.group's arc clause needs equal sizes,
    |drot| < 12 and centre distance < 1.6*size (2*60*sin 5deg = 10.46 < 19.2)."""
    out = []
    for i, g in enumerate(glyphs):
        th = 100.0 - 10.0 * i
        x = round(cx + radius * math.cos(math.radians(th)), 3)
        y = round(cy + radius * math.sin(math.radians(th)), 3)
        out.append(run(g, x, y, size=size, rot=th - 90.0, a=round(0.6 * size, 3)))
    return out


def run_prepare(out_dir, basename):
    env = dict(os.environ)
    env.pop('FIGTEXT_OUT', None)
    return subprocess.run([sys.executable, str(PREPARE), str(FIXTURE), '--basename', basename,
                           '--out', str(out_dir)], capture_output=True, text=True, env=env)


def run_compose(out_dir, tr_path):
    env = dict(os.environ)
    env['FIGTEXT_OUT'] = str(out_dir)
    return subprocess.run([sys.executable, str(COMPOSE), '--translations', str(tr_path), '--svg'],
                          capture_output=True, text=True, env=env, cwd=str(HERE))


def derive_blocks(out_dir):
    """blocks.json from runs.json/meta.json with the REAL rules, as emit-blocks.py does."""
    runs = json.loads((out_dir / 'runs.json').read_text())
    fonts = json.loads((out_dir / 'meta.json').read_text())['fonts']
    blocks = FT.merge_blocks(FT.group(runs))
    entries = []
    for b in blocks:
        entries.append(dict(key=block_key(b), english=block_english(b), lines=block_lines(b),
                            arc=FT.is_arc(b), send=FT.sendable(b, block_english(b), fonts)))
    (out_dir / 'blocks.json').write_text(json.dumps(entries, indent=1, ensure_ascii=False))
    return blocks, entries


def elements(svg_text):
    """[(text, attrs, raw element)] in document order."""
    out = []
    for m in re.finditer(r'<text ([^>]*)>([^<]*)</text>', svg_text):
        out.append((m.group(2), dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1))),
                    m.group(0)))
    return out


def faces(svg_text):
    """[(weight, style, sorted characters)] - the <style> block's STRUCTURE."""
    out = []
    for w, st, b64 in re.findall(
            r"@font-face\{font-family:'FigIS';font-weight:(\d+);font-style:(\w+);"
            r"src:url\(data:font/woff2;base64,([^)]+)\)", svg_text):
        font = TTFont(io.BytesIO(base64.b64decode(b64)))
        out.append([w, st, ''.join(sorted(chr(c) for c in font.getBestCmap()))])
    return out


def find(els, text, **attrs):
    return [e for e in els if e[0] == text
            and all(e[1].get(k.replace('_', '-')) == v for k, v in attrs.items())]


def plant(out_dir):
    runs = json.loads((out_dir / 'runs.json').read_text())
    meta = json.loads((out_dir / 'meta.json').read_text())
    meta['fonts']['PAGE/F2'] = dict(meta['fonts']['PAGE/F1'],
                                    base='/ABCDEF+LiberationSans-Italic')
    planted = []
    for r in runs:
        if r['text'] == K_HYP:
            # IDENTITY: one line of TWO runs (a mid-line fill split). A one-run line - and a
            # multi-LINE block of one-run lines at 1.222 leading - is already drawn at its
            # source origin by the unchanged composer, which would make the positional
            # assertion pass on the code it exists to catch.
            a1 = adv('Form a ', 12)
            planted.append(run('Form a ', 10.0, 120.0, a=a1))
            planted.append(run('hypothesis', 10.0 + a1, 120.0, fill=RED,
                               a=round(r['adv'] - a1, 3)))
        elif r['text'] == K_VERBATIM:
            # SUBSCRIPT + ITALIC: shift 3 < 0.45*12, ratio 8/12 in [0.4, 2.5], gaps 0.
            a_h, a_2, a_o = adv('H', 12), adv('2', 8), adv('O ', 12)
            x2 = 10.0 + a_h
            xo = round(x2 + a_2, 3)
            xg = round(xo + a_o, 3)
            planted += [run('H', 10.0, 40.0, a=a_h),
                        run('2', round(x2, 3), 37.0, size=8.0, a=a_2),
                        run('O ', xo, 40.0, a=a_o),
                        run('(g)', xg, 40.0, font='PAGE/F2', a=adv('(g)', 12))]
        else:
            planted.append(r)
    planted.append(run(K_GAP, 10.0, 200.0, a=150.0))            # ARROW GAP - verbatim
    planted.append(run(K_EDGE, 200.0, 200.0, a=40.0))           # EDGE SPACE - verbatim
    planted += arc_runs(list(K_KARC), 230.0, 100.0)             # KEPT ARC - verbatim
    planted += arc_runs(list(K_TARC), 230.0, 20.0)              # TRANSLATED ARC - prose
    (out_dir / 'runs.json').write_text(json.dumps(planted, ensure_ascii=False))
    (out_dir / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False))
    return planted


def compose_fixture(tmp, name, mutate, translations):
    """prepare -> mutate(out) -> derive blocks -> compose. -> (out, blocks, entries, report, svg)"""
    out = Path(tmp) / name
    prep = run_prepare(out, 'CNX_Fixture_' + name)
    check(f'{name}: PRECONDITION prepare exits 0', prep.returncode == 0,
          f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
    if prep.returncode != 0:
        finish()
    extra = mutate(out) if mutate else None
    blocks, entries = derive_blocks(out)
    tr = Path(tmp) / f'{name}-tr.json'
    tr.write_text(json.dumps({'blocks': translations}, ensure_ascii=False))
    c = run_compose(out, tr)
    check(f'{name}: PRECONDITION compose exits 0 and writes its report + SVG',
          c.returncode == 0 and (out / 'compose-report.json').exists()
          and (out / 'translated.svg').exists(),
          f'exit {c.returncode}: {c.stderr.strip()[-600:]}')
    if fails:
        finish()
    report = json.loads((out / 'compose-report.json').read_text())
    return out, extra, blocks, entries, report, (out / 'translated.svg').read_text()


def bold_test_run(out_dir):
    meta = json.loads((out_dir / 'meta.json').read_text())
    runs = json.loads((out_dir / 'runs.json').read_text())
    meta['fonts']['PAGE/F3'] = dict(meta['fonts']['PAGE/F1'], base='/ABCDEF+Helvetica-Bold')
    for r in runs:
        if r['text'] == K_TEST:
            r['font'] = 'PAGE/F3'
    (out_dir / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False))
    (out_dir / 'runs.json').write_text(json.dumps(runs, ensure_ascii=False))


TMP = tempfile.TemporaryDirectory()
PLAIN_TR = {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu', K_TEST: 'Profa tilgatuna'}

# ── the planted figure ──────────────────────────────────────────────────────────────
out_dir, RUNS, blocks, entries, rep, svg = compose_fixture(TMP.name, 'planted', plant, TR)
els = elements(svg)
by_key = collections.defaultdict(list)
for b, e in zip(blocks, entries):
    by_key[e['key']].append((b, e))
meta_page = json.loads((out_dir / 'meta.json').read_text())['page']


def one(key):
    return by_key[key][0] if len(by_key[key]) == 1 else (None, None)


check('P0 PRECONDITION the fixture page is 300 x 220 pt (y below is page_h - y)',
      meta_page == [300.0, PAGE_H], repr(meta_page))
b, e = one(K_VERBATIM)
check('P1 PRECONDITION the subscript plant stays ONE block, send:false, 4 runs on ONE line',
      e is not None and e['send'] is False and len(b) == 4 and len(FT.lines(b)) == 1
      and not any(k in by_key for k in ('H', '2', '2O (g)', 'O (g)')),
      f'{sorted(by_key)}')
b, e = one(K_HYP)
check('P2 PRECONDITION the identity plant is ONE sent block whose single line has 2 runs',
      e is not None and e['send'] is True and len(FT.lines(b)) == 1
      and len(FT.lines(b)[0]) == 2, repr(e))
b, e = one(K_GAP)
check('P3 PRECONDITION the arrow-gap run is its own send:false block, intact',
      e is not None and e['send'] is False and b[0]['text'] == K_GAP, repr(e))
b, e = one(K_EDGE)
check('P4 PRECONDITION the edge-space run is its own send:false block', e is not None
      and e['send'] is False, repr(e))
b, e = one(K_KARC)
check('P5 PRECONDITION the kept arc is ONE block, is_arc, send:false, with a usable circle',
      e is not None and e['arc'] and e['send'] is False
      and K_KARC not in rep.get('degenerate', []), f'{e!r} degenerate={rep.get("degenerate")!r}')
b, e = one(K_TARC)
check('P6 PRECONDITION the translated arc is ONE block, is_arc, send:true, with a circle',
      e is not None and e['arc'] and e['send'] is True
      and K_TARC not in rep.get('degenerate', []), f'{e!r}')
check('P7 PRECONDITION exactly 8 blocks', len(entries) == 8, f'{[x["key"] for x in entries]}')
check('P8 PRECONDITION compose kept exactly the send:false blocks (report `missing`)',
      collections.Counter(rep['missing'])
      == collections.Counter(x['key'] for x in entries if not x['send']), repr(rep['missing']))
if fails:
    finish()

# ── the two controls' inputs ────────────────────────────────────────────────────────
_, _, _, _, _, svg_plain = compose_fixture(TMP.name, 'plain', None, PLAIN_TR)
_, _, _, _, _, svg_bold = compose_fixture(TMP.name, 'bold', bold_test_run, PLAIN_TR)
population = [raw for text, _, raw in els if text in POPULATION]
check('C0 NON-VACUITY the translated population is all 7 elements (2 labels + 5 arc glyphs)',
      len(population) == 7, repr([t for t, _, _ in els if t in POPULATION]))
current = {'population': population, 'faces_plain': faces(svg_plain),
           'faces_bold': faces(svg_bold)}
check('C0b NON-VACUITY the bold variant really has a 700 face',
      any(f[0] == '700' for f in current['faces_bold']), repr(current['faces_bold']))

if CAPTURE:
    check('CAPTURE refused unless the composer is UNCHANGED (its report has no runExact)',
          'runExact' not in rep, 'this composer already implements E - a golden captured '
          'from it would describe the new output, not constrain it')
    if not fails:
        GOLDEN.write_text(json.dumps(current, indent=1, ensure_ascii=False) + '\n')
        print(f'  wrote {GOLDEN.name}')
    finish()

golden = json.loads(GOLDEN.read_text()) if GOLDEN.exists() else None
check('C1 CONTROL the translated population - plain labels AND the translated arc - is '
      'byte-identical to the unchanged composer',
      golden is not None and current['population'] == golden['population'],
      f"now {current['population']!r}")
check('C2 CONTROL a figure with no italic run has the unchanged composer\'s faces (plain)',
      golden is not None and current['faces_plain'] == golden['faces_plain'],
      repr(current['faces_plain']))
check('C3 CONTROL ... and with a whole bold run (face order is visible here)',
      golden is not None and current['faces_bold'] == golden['faces_bold'],
      repr(current['faces_bold']))

# ── E's assertions are appended below this line by Tasks 4 and 5 ────────────────────

finish()
