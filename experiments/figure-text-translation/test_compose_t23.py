#!/usr/bin/env python3
"""§C140 ② ⑨ ③, end to end: formulas in translated labels, decimal commas in kept labels, re-flow.

    FIGTEXT_PYLIBS=./pylibs python3 test_compose_t23.py
    FIGTEXT_PYLIBS=./pylibs python3 test_compose_t23.py --capture-golden

Spec: docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md, "End to end".

`--capture-golden` is run ONCE, on the UNCHANGED composer, and refuses to run on a composer whose
report carries `unformatted` (the first key ② adds). The controls then compare later composers
against it.

T23_COMPOSE_TREE (scratch only) points the compose child at another tree's `compose.py` - the
RED-first runs execute this file, unchanged, against the base composer and each stage. The plan
may drop it: in the repo the unchanged composer IS `compose.py` at the commit before (2).

WHY PLANTED RUNS AND A PLANTED ARTWORK
--------------------------------------
The committed fixture has four one-run 12 pt labels and a page with one filled rect and one rule.
② needs a formula made of script runs, ⑨ a kept decimal, ③ a box, a table cell, an arrow and a
label too long for its box. Runs are planted into `runs.json` after `figure-prepare.py` and
`blocks.json` is re-derived with the real rules (test_compose_runexact.py's pattern). For ③ the
stripped artwork is REPLACED: `artwork.pdf` is redrawn with cairo.PDFSurface at the fixture's page
size and `artwork.png` re-rendered from it with `pdftocairo -png -r 200 -singlefile`, exactly as
`strip-text.py` renders the real one - so container detection reads what it reads in production.
The committed PDF is not regenerated.

🔴 A PLANT IS NOT WHAT ITS DESCRIPTION SAYS UNTIL ITS PRECONDITION PASSED. Every plant is checked
against `blocks.json` (and, for ③, against `figcontainers` on the planted page) FIRST, and the
file stops on a precondition failure - `figtext.group` silently re-classifies a run outside a
clause's limits, and a lone block is already drawn at its own size by the unchanged composer.

🔴 THE CLOCK IS PINNED (SOURCE_DATE_EPOCH) and faces are compared by STRUCTURE: fontTools stamps
`head.modified` into every woff2 subset.

🔴 THE TEXT SENTINEL IS AN INVARIANT, NOT A NEW BEHAVIOUR - it holds on the unchanged composer too.
What makes it mean anything is its positive control: corrupted copies of the drawn elements must
FAIL it.

RED-FIRST, AND WHAT IS NOT. Every S/D/L/X/LG/R9 assertion was run against the unchanged composer (and
the ones that pin a correction, against the composer before it) and seen FAIL. The exceptions are
named where they stand: the controls (G*, D3, T2, L4c, X0), the sentinels (T1, T3), and two PINS -
L0 (the prototype's crash, which the unchanged composer never had) and X4 (an error container that
fits names no overhang, so `containerErrors` is its only record). R6 (added by the final review) was
seen FAIL against a named MUTANT of the finished composer instead - an identity reply drawn unlocalised.

A DETECTION ERROR CANNOT BE PLANTED THROUGH DATA the rest of the composer survives: every input that
makes figcontainers raise (a NaN coordinate, a run with no `adv`, a malformed page object) breaks
compose.py or load_page first. So the X arm runs the UNCHANGED compose.py under a 12-line `runpy`
wrapper that makes `figcontainers.classify` raise for ONE block, selected by its exact page bbox.
Nothing in compose.py knows about it, and a composer with no figcontainers simply runs.
"""
import ast
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
os.environ['SOURCE_DATE_EPOCH'] = '1700000000'  # BEFORE any child is spawned
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'     # pylibs is a symlink into the repo
sys.dont_write_bytecode = True

import cairo                                                  # noqa: E402
import figtext as FT                                          # noqa: E402
import figcolour                                              # noqa: E402
import figcontainers as FC                                    # noqa: E402
from blockkey import block_key, block_lines, block_english    # noqa: E402
from fontTools.ttLib import TTFont                            # noqa: E402

PREPARE = HERE / 'figure-prepare.py'
COMPOSE_TREE = Path(os.environ.get('T23_COMPOSE_TREE', str(HERE))).resolve()
COMPOSE = COMPOSE_TREE / 'compose.py'
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'
GOLDEN = HERE / 'fixtures' / 'compose-t23-golden.json'
CAPTURE = '--capture-golden' in sys.argv
PAGE_W, PAGE_H = 300.0, 220.0
ASC, DESC = 0.73, 0.21
FILL = ['cmyk', 0.0, 0.0, 0.0, 1.0]

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


def adv(text, size):
    return round(sum(_W[ord(c) - _FIRST] for c in text) * size / 1000.0, 3)


def run(text, x, y, size=12.0):
    return dict(text=text, font='PAGE/F1', size=size, rot=0.0, x=x, y=y, adv=adv(text, size),
                fill=FILL, tm=[1.0, 0.0, 0.0, 1.0, x, y])


# ── the drawn-width instrument: fontTools advances, INDEPENDENT of compose.py's cairo measure ──
_FACES = {}


def face(bold, italic):
    from svgout import FACES
    k = (bool(bold), bool(italic))
    if k not in _FACES:
        f = TTFont(FACES[k])
        _FACES[k] = (f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm)
    return _FACES[k]


def text_adv(text, size, bold=False, italic=False):
    cmap, hmtx, upm = face(bold, italic)
    return sum(hmtx[cmap.get(ord(c), '.notdef')][0] for c in text) * size / upm


# ── prepare / plant / compose ───────────────────────────────────────────────────────────────
def run_prepare(out_dir, basename):
    env = dict(os.environ)
    env.pop('FIGTEXT_OUT', None)
    return subprocess.run([sys.executable, str(PREPARE), str(FIXTURE), '--basename', basename,
                           '--out', str(out_dir)], capture_output=True, text=True, env=env)


def run_compose(out_dir, tr_path, control=False, pre=None):
    """`pre`: Python source run with `-c` that receives compose.py's path as argv[1] (the X arm)."""
    env = dict(os.environ)
    env['FIGTEXT_OUT'] = str(out_dir)
    argv = [sys.executable] + (['-c', pre] if pre else []) + [str(COMPOSE), '--translations',
                                                              str(tr_path), '--svg']
    if control:
        argv.append('--control')
    return subprocess.run(argv, capture_output=True, text=True, env=env, cwd=str(COMPOSE_TREE))


def derive_blocks(out_dir):
    """blocks.json from runs.json/meta.json with the REAL rules, as emit-blocks.py does."""
    runs = json.loads((out_dir / 'runs.json').read_text())
    fonts = json.loads((out_dir / 'meta.json').read_text())['fonts']
    blocks = FT.merge_blocks(FT.group(runs))
    entries = [dict(key=block_key(b), english=block_english(b), lines=block_lines(b),
                    arc=FT.is_arc(b), send=FT.sendable(b, block_english(b), fonts)) for b in blocks]
    (out_dir / 'blocks.json').write_text(json.dumps(entries, indent=1, ensure_ascii=False))
    return blocks, entries


def plant_runs(out_dir, runs):
    (out_dir / 'runs.json').write_text(json.dumps(runs, ensure_ascii=False))


def plant_artwork(out_dir, draw):
    """Replace artwork.pdf with a cairo drawing (y-DOWN: page y = PAGE_H - cairo y) and
    re-render artwork.png from it the way strip-text.py renders the real one."""
    pdf = out_dir / 'artwork.pdf'
    surf = cairo.PDFSurface(str(pdf), PAGE_W, PAGE_H)
    ctx = cairo.Context(surf)
    ctx.set_source_rgb(0, 0, 0)
    draw(ctx)
    surf.finish()
    r = subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(pdf),
                        str(out_dir / 'artwork')], capture_output=True, text=True)
    return r


def elements(svg_text):
    """[{text, x, y (SVG, y down), size, bold, italic, raw}] in document order."""
    out = []
    for m in re.finditer(r'<text ([^>]*)>([^<]*)</text>', svg_text):
        a = dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1)))
        t = m.group(2).replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
        out.append(dict(text=t, x=float(a['x']), y=float(a['y']), size=float(a['font-size']),
                        bold=a.get('font-weight') == '700', italic=a.get('font-style') == 'italic',
                        transform=a.get('transform'), raw=m.group(0)))
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


def compose_case(tmp, name, runs, translations, artwork=None, control=False, reuse=None, pre=None):
    """prepare (or reuse a prepared dir) -> plant -> derive blocks -> compose.
    -> dict(out, blocks, entries, report, svg, stdout, rc)"""
    out = Path(tmp) / name
    if reuse is None:
        prep = run_prepare(out, 'CNX_Fixture_' + name)
        precondition(f'{name}: prepare exits 0', prep.returncode == 0,
                     f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
        if runs is not None:
            plant_runs(out, runs)
        if artwork is not None:
            r = plant_artwork(out, artwork)
            precondition(f'{name}: the planted artwork renders', r.returncode == 0
                         and (out / 'artwork.png').exists(), r.stderr[-300:])
    else:
        out = reuse
    blocks, entries = derive_blocks(out)
    tr = Path(tmp) / f'{name}-tr.json'
    tr.write_text(json.dumps({'blocks': translations}, ensure_ascii=False))
    for f in ('compose-report.json', 'translated.svg', 'control.svg'):
        (out / f).unlink(missing_ok=True)
    c = run_compose(out, tr, control=control, pre=pre)
    svg_name = 'control.svg' if control else 'translated.svg'
    rep = (json.loads((out / 'compose-report.json').read_text())
           if (out / 'compose-report.json').exists() else None)
    svg = (out / svg_name).read_text() if (out / svg_name).exists() else ''
    return dict(out=out, blocks=blocks, entries=entries, report=rep, svg=svg, stdout=c.stdout,
                stderr=c.stderr, rc=c.returncode)


def one(case, key):
    hits = [(b, e) for b, e in zip(case['blocks'], case['entries']) if e['key'] == key]
    return hits[0] if len(hits) == 1 else (None, None)


def index_of(case, key):
    return [e['key'] for e in case['entries']].index(key)


def src_centre(block):
    """Source frame centre in SVG coordinates (x, y-down), from the PDF advances."""
    a0, a1, n0, n1 = FC.source_frame(block)
    return (a0 + a1) / 2, PAGE_H - (n0 + n1) / 2


def is_kept_element(el, kept_runs):
    return any(el['x'] == float(f"{r['x']:.3f}") and el['y'] == float(f"{PAGE_H - r['y']:.3f}")
               for r in kept_runs)


def label_elements(case, labels, kept_runs):
    """Assign every translated-population <text> to the NEAREST source label centre.
    labels: {key: block}. -> {key: [elements]}"""
    centres = {k: src_centre(b) for k, b in labels.items()}
    out = {k: [] for k in labels}
    for el in elements(case['svg']):
        if is_kept_element(el, kept_runs):
            continue
        mx = el['x'] + text_adv(el['text'], el['size'], el['bold'], el['italic']) / 2
        k = min(centres, key=lambda k: math.hypot(centres[k][0] - mx, centres[k][1] - el['y']))
        out[k].append(el)
    return out


def group_lines(els):
    """Lines BY GEOMETRY: base-size elements clustered on the baseline (gap < 0.5 lead), every
    element assigned to the nearest cluster, each line ordered along x. Top line first."""
    if not els:
        return []
    base = max(e['size'] for e in els)
    lead = 1.222 * base
    ys = sorted(e['y'] for e in els if abs(e['size'] - base) < 1e-6)
    clusters = []
    for y in ys:
        if clusters and abs(y - clusters[-1][-1]) < 0.5 * lead:
            clusters[-1].append(y)
        else:
            clusters.append([y])
    cs = [c[0] for c in clusters]
    lines = [[] for _ in cs]
    for e in els:
        lines[min(range(len(cs)), key=lambda j: abs(cs[j] - e['y']))].append(e)
    return [sorted(l, key=lambda e: e['x']) for l in lines]


def sentinel(els, value):
    """The drawn pieces, per line in x-order, concatenated, reproduce the value's words exactly."""
    lines = group_lines(els)
    texts = [''.join(e['text'] for e in l) for l in lines]
    bad = [t for t in texts if t != ' '.join(t.split()) or not t]
    got, want = ' '.join(texts), ' '.join(value.split())
    return (not bad and got == want), f'lines={texts!r} want={want!r}'


def line_extent(line):
    x0 = min(e['x'] for e in line)
    x1 = max(e['x'] + text_adv(e['text'], e['size'], e['bold'], e['italic']) for e in line)
    return x0, x1


# ════════════════════════════════════════════════════════════════════════════════════════════
# FIGURE 1 - ② formulas, ⑨ the kept decimal, the goldens
# ════════════════════════════════════════════════════════════════════════════════════════════
K_NA, K_NAMISS, K_PLAIN, K_DEC, K_H2O = ('Moles of Na3PO4', 'Mass of Na3PO4',
                                         'Observation and curiosity', '26.98', 'H2O (g)')


def formula_runs(prefix, y):
    """'<prefix>Na'@12, '3'@8 at -3, 'PO'@12, '4'@8 at -3 - four runs, gaps 0."""
    a = adv(prefix + 'Na', 12)
    x3 = round(10.0 + a, 3)
    xpo = round(x3 + adv('3', 8), 3)
    x4 = round(xpo + adv('PO', 12), 3)
    return [run(prefix + 'Na', 10.0, y), run('3', x3, y - 3.0, size=8.0),
            run('PO', xpo, y), run('4', x4, y - 3.0, size=8.0)]


FIG1_RUNS = (formula_runs('Moles of ', 180.0) + formula_runs('Mass of ', 140.0)
             + [run(K_PLAIN, 10.0, 100.0), run(K_DEC, 10.0, 60.0), run(K_H2O, 10.0, 20.0)])
FIG1_KEPT = [r for r in FIG1_RUNS if r['text'] in (K_DEC, K_H2O)]
FIG1_TR = {K_NA: 'Mól af Na3PO4', K_NAMISS: 'Massi natríumfosfats', K_PLAIN: 'Athugun og forvitni'}


def blank_page(ctx):
    ctx.set_source_rgb(1, 1, 1)
    ctx.paint()


PLAIN_TR = {'Observation and curiosity': 'Athugun og forvitni', 'Form a hypothesis': 'Setja fram tilgatu',
            'Test the hypothesis': 'Profa tilgatuna'}

TMP = tempfile.TemporaryDirectory()
print(f'composer under test: {COMPOSE}')
f1 = compose_case(TMP.name, 'fig1', FIG1_RUNS, FIG1_TR, artwork=blank_page)
precondition('P0 the fixture page is 300 x 220 pt',
             json.loads((f1['out'] / 'meta.json').read_text())['page'] == [PAGE_W, PAGE_H])
b, e = one(f1, K_NA)
precondition('P1 the Na3PO4 plant is ONE send:true block of 4 runs on ONE line',
             e is not None and e['send'] is True and len(b) == 4 and len(FT.lines(b)) == 1
             and not any(k in {x['key'] for x in f1['entries']} for k in ('3', '4', 'PO', 'PO4')),
             repr([x['key'] for x in f1['entries']]))
b, e = one(f1, K_NAMISS)
precondition('P2 the named-miss plant is ONE send:true block of 4 runs', e is not None and e['send']
             and len(b) == 4, repr(e))
b, e = one(f1, K_PLAIN)
precondition('P3 the nothing-to-style plant is ONE send:true one-run block', e is not None and e['send']
             and len(b) == 1, repr(e))
for k in (K_DEC, K_H2O):
    b, e = one(f1, k)
    precondition(f'P4 {k!r} is its own send:false block', e is not None and e['send'] is False, repr(e))
precondition('P5 exactly 5 blocks', len(f1['entries']) == 5, repr([x['key'] for x in f1['entries']]))
precondition('P6 compose exits 0 and writes its report and SVG', f1['rc'] == 0 and f1['report'] is not None
             and f1['svg'] != '', f1['stderr'][-600:])
precondition('P7 compose kept exactly the send:false blocks (report `missing`)',
             collections.Counter(f1['report']['missing']) == collections.Counter([K_DEC, K_H2O]),
             repr(f1['report']['missing']))

fp = compose_case(TMP.name, 'plain', None, PLAIN_TR)
precondition('P8 the unplanted fixture composes', fp['rc'] == 0 and fp['svg'] != '', fp['stderr'][-400:])

els1 = elements(f1['svg'])
kept1 = [el['raw'] for el in els1 if is_kept_element(el, FIG1_KEPT)]
lab1 = label_elements(f1, {K_NA: one(f1, K_NA)[0], K_NAMISS: one(f1, K_NAMISS)[0],
                           K_PLAIN: one(f1, K_PLAIN)[0]}, FIG1_KEPT)
current = {'kept': kept1, 'plain_label': [el['raw'] for el in lab1[K_PLAIN]],
           'faces_plain': faces(fp['svg'])}
precondition('P9 NON-VACUITY the kept population is 2 elements and the plain label has one',
             len(kept1) == 2 and len(current['plain_label']) >= 1,
             f"kept={kept1!r} plain={current['plain_label']!r}")

if CAPTURE:
    check('CAPTURE refused unless the composer is UNCHANGED (its report has no `unformatted`)',
          'unformatted' not in f1['report'],
          'this composer already implements ② - a golden captured from it would describe the new output')
    if not fails:
        GOLDEN.write_text(json.dumps(current, indent=1, ensure_ascii=False) + '\n')
        print(f'  wrote {GOLDEN.name}')
    finish()

golden = json.loads(GOLDEN.read_text()) if GOLDEN.exists() else None
precondition('P10 the golden exists (captured from the unchanged composer)', golden is not None, str(GOLDEN))
rep1 = f1['report']
REFLOW = 'overflow' in rep1           # ③ (commit 4) adds `overflow` to the report contract

# ── controls ────────────────────────────────────────────────────────────────────────────────
dec_golden = [raw for raw in golden['kept'] if f'>{K_DEC}<' in raw]
# [USER] ruling (C) 2026-09-15 moves ONE attribute, and it must move EXACTLY there: the golden was captured
# under the naive (1-c)(1-k) text colour, which drew the planted FILL (K=1) #000000; poppler - and the
# artwork's own strokes - draw it #231f20 (test_figcolour.py 1a). The expected attribute is derived from
# figcolour.fill_rgb(FILL) with svgout.write_svg's own rounding, and it must DIFFER from the golden's naive
# one - so a composer, or a figcolour, that went back to the naive map fails here.
KEPT_FILL_NOW = 'fill="#%02x%02x%02x"' % tuple(round(v * 255) for v in figcolour.fill_rgb(FILL))
KEPT_FILL_GOLD = sorted({f for raw in golden['kept'] for f in re.findall(r'fill="#[0-9a-f]{6}"', raw)})


def kept_fill(raw):
    return raw.replace(KEPT_FILL_GOLD[0], KEPT_FILL_NOW) if raw.count(KEPT_FILL_GOLD[0]) == 1 else None


check('G1 CONTROL the kept population is byte-identical to the unchanged composer - except the '
      'planted decimal, which may differ ONLY by 26.98 -> 26,98, and ruling (C)\'s fill, which is exactly '
      'figcolour.fill_rgb of the planted fill',
      len(dec_golden) == 1 and len(kept1) == len(golden['kept']) and len(KEPT_FILL_GOLD) == 1
      and KEPT_FILL_NOW != KEPT_FILL_GOLD[0]
      and all(kept_fill(old) is not None
              and (now == kept_fill(old)
                   or (old == dec_golden[0] and now == kept_fill(old).replace('>26.98<', '>26,98<')))
              for now, old in zip(kept1, golden['kept'])),
      f'expected {KEPT_FILL_NOW} (golden {KEPT_FILL_GOLD}), now {kept1!r}')
if not REFLOW:
    check('G2 CONTROL (before ③) the translated label with nothing to style is byte-identical to the '
          'unchanged composer', current['plain_label'] == golden['plain_label'],
          f"now {current['plain_label']!r}")
else:
    g_text = ''.join(re.sub(r'<[^>]+>', '', raw) for raw in golden['plain_label'])
    n_text = ' '.join(''.join(e['text'] for e in l) for l in group_lines(lab1[K_PLAIN]))
    check('G2 CONTROL (③ present - step (4) is free to re-lay it) the label with nothing to style draws '
          'the same words it drew before, now laid out by ③',
          n_text == g_text and bool(re.search(re.escape(repr(K_PLAIN)) + r'\s+\[(box|cell|open) ',
                                              f1['stdout'])), f'{n_text!r} vs golden {g_text!r}')
check('G3 CONTROL the unplanted fixture\'s faces are the unchanged composer\'s (structure)',
      current['faces_plain'] == golden['faces_plain'], repr(current['faces_plain']))

# ── ⑥b ──────────────────────────────────────────────────────────────────────────────────────
# [USER] ruling (a) 2026-09-17: a TRANSLATED straight label - laid out by ③ from lin_advance - is drawn with
# font-kerning:none, so the browser draws the width the layout was decided with; a KEPT element is untouched
# (G1 pins its bytes). Checked on the elements the composer really wrote for figure 1. The control is that each
# population is what it claims to be: every label's pieces reproduce that label's TRANSLATED value (sentinel), and
# the kept elements draw exactly the kept English - so an element in the wrong population fails K0, and neither
# K1 nor K2 can pass over an empty or mis-assigned list. (label_elements assigns every non-kept element to a label,
# so a count identity between the two lists and els1 would hold by construction and is deliberately not the control.)
lab_els = [el for k in (K_NA, K_NAMISS, K_PLAIN) for el in lab1[k]]
kept_els = [el for el in els1 if is_kept_element(el, FIG1_KEPT)]
precondition('K0 CONTROL each translated label\'s pieces reproduce its translated value, and the kept elements draw '
             'exactly the kept English (26,98 after ⑨; H2O (g))',
             all(sentinel(lab1[k], FIG1_TR[k])[0] for k in (K_NA, K_NAMISS, K_PLAIN)) and len(lab_els) >= 3
             and sorted(el['text'] for el in kept_els) == sorted([K_DEC.replace('.', ','), K_H2O]),
             f"{[sentinel(lab1[k], FIG1_TR[k])[1] for k in (K_NA, K_NAMISS, K_PLAIN)]} kept={[el['text'] for el in kept_els]}")
check('K1 ⑥b every element of the translated labels (formula segments and scripts included) ends in '
      'style="font-kerning:none", and says it once',
      all(el['raw'].count('font-kerning') == 1 and el['raw'].split('>', 1)[0].endswith(' style="font-kerning:none"')
          for el in lab_els), repr([el['raw'] for el in lab_els]))
check('K2 ⑥b no kept element mentions font-kerning',
      not any('font-kerning' in el['raw'] for el in kept_els), repr([el['raw'] for el in kept_els]))

# ── ② ───────────────────────────────────────────────────────────────────────────────────────
na = lab1[K_NA]
base_el = [el for el in na if el['size'] == 12.0 and el['text'].endswith('Na')]
for digit in ('3', '4'):
    hit = [el for el in na if el['text'] == digit]
    check(f'S1 ② the {digit} of Na3PO4 is its own <text> at 8.000 pt, 3.000 below the label baseline',
          len(hit) == 1 and len(base_el) == 1 and f"{hit[0]['size']:.3f}" == '8.000'
          and round(hit[0]['y'] - base_el[0]['y'], 3) == 3.0,
          repr([(el['text'], el['size'], el['y']) for el in na]))
unf = rep1.get('unformatted')
check('S2 ② the report carries `unformatted`, and names nothing for the label whose formula was placed',
      unf is not None and not [u for u in unf if u.get('key') == K_NA], repr(unf))
named = [u for u in (unf or []) if u.get('key') == K_NAMISS]
check('S3 ② a formula replaced by a name: `unformatted` names BOTH stretches of Na3PO4',
      sorted((u.get('token'), u.get('stretch'), u.get('reason')) for u in named)
      == [('Na3PO4', '3', 'absent'), ('Na3PO4', '4', 'absent')]
      and all(set(u) == {'key', 'token', 'stretch', 'reason', 'candidates'} for u in named), repr(named))

# ── ⑨ ───────────────────────────────────────────────────────────────────────────────────────
g_dec = elements(dec_golden[0])[0] if dec_golden else None
now_dec = [el for el in els1 if el['text'] == '26,98']
check('D1 ⑨ the kept run 26.98 is drawn 26,98 at the same x and y as the unchanged composer drew it',
      g_dec is not None and len(now_dec) == 1 and now_dec[0]['x'] == g_dec['x']
      and now_dec[0]['y'] == g_dec['y'] and not [el for el in els1 if el['text'] == '26.98'],
      repr([(el['text'], el['x'], el['y']) for el in els1 if '26' in el['text']]))
check('D2 ⑨ the report names it in `localized` (and nothing else)', rep1.get('localized') == [K_DEC],
      repr(rep1.get('localized')))
f1c = compose_case(TMP.name, 'fig1c', None, FIG1_TR, control=True, reuse=f1['out'])
check('D3 CONTROL ⑨ --control is a faithful redraw: it draws 26.98, and localises nothing',
      f1c['rc'] == 0 and [el['text'] for el in elements(f1c['svg']) if '26' in el['text']] == ['26.98']
      and not (f1c['report'] or {}).get('localized'),
      repr([el['text'] for el in elements(f1c['svg'])]))

# ── ⑨ / R6 end to end: an IDENTITY reply carrying a number (final review, tests-3) ──────────────────────
# R6: every label drawn in English gets Icelandic separators, identity replies included, and an identity reply
# keeps its Nota card - so ACCEPTING `373,15 K` must not change how the label is drawn. D1/D2 reach ⑨ only
# through a send:false `missing` block, and this file's only identity plant (K_IDENT) has no digits: measured,
# `drawn = b if (CONTROL or key in identity) else localise_block(b)` left every test green. So ONE send:true
# one-run label with a decimal, composed twice on the same prepared page: reply = the exact English, and reply
# = the accepted Nota value. Both must be identity (and translated, and localized), both must draw the
# localised text run-exact at the source origin, and the two SVGs must be byte-identical to each other.
K_R6 = 'Temperature 373.15 K'
R6_RUNS = [run(K_R6, 10.0, 60.0)]
r6a = compose_case(TMP.name, 'r6exact', R6_RUNS, {K_R6: K_R6}, artwork=blank_page)
b, e = one(r6a, K_R6)
precondition('PR6 the R6 plant is ONE send:true one-run block (a decimal inside prose is bought)',
             e is not None and e['send'] is True and len(b) == 1 and len(r6a['entries']) == 1,
             repr(r6a['entries']))
r6b = compose_case(TMP.name, 'r6nota', None, {K_R6: 'Temperature 373,15 K'}, reuse=r6a['out'])
R6_XY = (float(f'{10.0:.3f}'), float(f'{PAGE_H - 60.0:.3f}'))
for tag, case in (('the exact English', r6a), ('the accepted Nota value 373,15 K', r6b)):
    rep = case['report'] or {}
    drawn = [(el['text'], el['x'], el['y']) for el in elements(case['svg'])]
    check(f'R6 an identity reply of {tag}: identity, translated and localized, drawn run-exact as '
          f'`Temperature 373,15 K` at the source origin',
          case['rc'] == 0 and rep.get('identity') == [K_R6] and rep.get('translated') == [K_R6]
          and rep.get('localized') == [K_R6] and rep.get('runExact') == [K_R6]
          and drawn == [('Temperature 373,15 K',) + R6_XY],
          f"rc {case['rc']}, identity {rep.get('identity')!r} localized {rep.get('localized')!r}, drawn {drawn!r}")
check('R6 accepting the Nota value does not change the drawing: the two SVGs are byte-identical',
      r6a['svg'] != '' and r6a['svg'] == r6b['svg'],
      f"{len(r6a['svg'])} vs {len(r6b['svg'])} chars")

# ════════════════════════════════════════════════════════════════════════════════════════════
# FIGURE 2 - ③ containers
# ════════════════════════════════════════════════════════════════════════════════════════════
K_BOX, K_CELL, K_ARROW, K_FLOOR, K_IDENT = ('Boiling|point of water', 'Molar mass', 'Molar|mass', 'Mass',
                                           'Form a hypothesis')
BOX = (10.0, 150.0, 100.0, 200.0)      # page x0 y0 x1 y1 - stroked rect, lw 1.0
IDBOX = (10.0, 20.0, 100.0, 80.0)      # stroked rect, lw 1.0
FLOORBOX = (200.0, 15.0, 260.0, 45.0)  # stroked rect, lw 1.0
GRID_X, GRID_Y = (110.0, 180.0, 290.0), (100.0, 150.0, 200.0)   # separate lines, lw 0.5
ARROW = (60.0, 240.0, 62.0)            # x0, x1, y - one stroked line, lw 1.5
CELL_END = 287.0                       # the right-flush source label's right edge


def fig2_art(ctx):
    blank_page(ctx)
    ctx.set_source_rgb(0, 0, 0)
    for (x0, y0, x1, y1) in (BOX, IDBOX, FLOORBOX):
        ctx.set_line_width(1.0)
        ctx.rectangle(x0, PAGE_H - y1, x1 - x0, y1 - y0)
        ctx.stroke()
    ctx.set_line_width(0.5)
    for gx in GRID_X:
        ctx.move_to(gx, PAGE_H - GRID_Y[-1])
        ctx.line_to(gx, PAGE_H - GRID_Y[0])
        ctx.stroke()
    for gy in GRID_Y:
        ctx.move_to(GRID_X[0], PAGE_H - gy)
        ctx.line_to(GRID_X[-1], PAGE_H - gy)
        ctx.stroke()
    ctx.set_line_width(1.5)
    ctx.move_to(ARROW[0], PAGE_H - ARROW[2])
    ctx.line_to(ARROW[1], PAGE_H - ARROW[2])
    ctx.stroke()


LEAD9 = round(9.0 * 1.222, 3)
FIG2_RUNS = [
    run('Boiling', 16.0, 180.0, 9.0), run('point of water', 16.0, 180.0 - LEAD9, 9.0),    # box, left-set
    run('Molar mass', round(CELL_END - adv('Molar mass', 9.0), 3), 170.0, 9.0),            # right-flush cell
    run('Molar', round(150.0 - adv('Molar', 9.0) / 2, 3), 50.0, 9.0),                      # under the arrow
    run('mass', round(150.0 - adv('mass', 9.0) / 2, 3), 50.0 - LEAD9, 9.0),
    run('Mass', 221.0, 27.0, 9.0),                                                         # floor box
    run('Form a hypothesis', 14.0, 46.0, 9.0),                                             # identity, boxed
]
# K_ARROW's value is chosen so the UNCHANGED composer COLLIDES with the arrow and ③ does not: its greedy
# wrap at 63 pt breaks 'Mólmassi efnisins í grömmum' (119 pt at 9 pt) into THREE lines about the source
# centre, which lifts the top line's glyphs to y 62.07 - into the stroke (61.25..62.75). ③ keeps the
# source's two lines at their own baselines (top glyphs 56.57). A shorter value ('Mólmassi efnis') made
# L4 pass on the unchanged composer by geometry: it drew one line, BELOW the arrow.
FIG2_TR = {K_BOX: 'Suðumark vatns við sjávarmál', K_CELL: 'Mólmassi', K_ARROW: 'Mólmassi efnisins í grömmum',
           K_FLOOR: 'Prósentusamsetningar', K_IDENT: 'Setja fram tilgátu'}

f2i = compose_case(TMP.name, 'fig2', FIG2_RUNS, dict(FIG2_TR, **{K_IDENT: K_IDENT}), artwork=fig2_art)
for k in (K_BOX, K_CELL, K_ARROW, K_FLOOR, K_IDENT):
    b, e = one(f2i, k)
    precondition(f'P11 {k!r} is ONE send:true block', e is not None and e['send'] is True,
                 repr([x['key'] for x in f2i['entries']]))
precondition('P12 exactly 5 blocks on figure 2', len(f2i['entries']) == 5,
             repr([x['key'] for x in f2i['entries']]))
pg = FC.load_page(f2i['out'] / 'artwork.pdf')
from PIL import Image                                          # noqa: E402
dark = Image.open(f2i['out'] / 'artwork.png').convert('L')
cls = {k: FC.container_for(index_of(f2i, k), f2i['blocks'], pg, dark, PAGE_H) for k in
       (K_BOX, K_CELL, K_ARROW, K_FLOOR, K_IDENT)}
precondition('P13 the planted page classifies as planted: box / cell (right) / open / box / box',
             [cls[k]['cls'] for k in (K_BOX, K_CELL, K_ARROW, K_FLOOR, K_IDENT)]
             == ['box', 'cell', 'open', 'box', 'box'] and cls[K_CELL]['align'] == 'right',
             repr({k: (v['cls'], v['why'], v['align']) for k, v in cls.items()}))
precondition('P14 the identity plant IS identity when its reply is its English (report `identity`)',
             f2i['rc'] == 0 and K_IDENT in (f2i['report'] or {}).get('identity', []),
             f"rc={f2i['rc']} {(f2i['report'] or {}).get('identity')!r} {f2i['stderr'][-300:]}")

f2 = compose_case(TMP.name, 'fig2e', None, FIG2_TR, reuse=f2i['out'])
rep2 = f2['report'] or {}
check('L0 PIN (regression, NOT red-first - the unchanged composer never crashed here; the r2 prototype did) an '
      'identity label edited into a translation composes (exit 0), with its report',
      f2['rc'] == 0 and f2['report'] is not None and K_IDENT not in rep2.get('identity', [K_IDENT]),
      f"rc={f2['rc']} {f2['stderr'][-400:]}")
lab2 = label_elements(f2, {k: one(f2, k)[0] for k in FIG2_TR}, [])

# ── the text sentinel, over every layout label of both figures ─────────────────────────────
values = [(K_NA, FIG1_TR[K_NA], lab1[K_NA]), (K_NAMISS, FIG1_TR[K_NAMISS], lab1[K_NAMISS]),
          (K_PLAIN, FIG1_TR[K_PLAIN], lab1[K_PLAIN])] + [(k, v, lab2[k]) for k, v in FIG2_TR.items()]
results = [(k,) + sentinel(els, v) for k, v, els in values]
check('T1 TEXT SENTINEL every layout label (8): its drawn pieces, per line in x-order, reproduce the '
      "value's words", all(ok for _, ok, _ in results),
      '; '.join(f'{k}: {d}' for k, ok, d in results if not ok) or f'{len(results)} labels')


def corrupt(kind):
    """A corrupted COPY of one label's elements; the sentinel must fail it."""
    if kind == 'drop-char':
        els = [dict(e) for e in lab2[K_BOX]]
        els[-1]['text'] = els[-1]['text'][:-1]
        return els, FIG2_TR[K_BOX]
    if kind == 'item-moved-a-line':
        els = [dict(e) for e in lab2[K_BOX]]
        lines = group_lines(els)
        victim = lines[0][-1]
        victim['y'] = lines[-1][0]['y']
        return els, FIG2_TR[K_BOX]
    if kind == 'pieces-misordered':
        # always applicable: split the label's first drawn piece in two and draw the halves in the
        # wrong order along the line (a segment advanced past its successor)
        els = sorted((dict(e) for e in lab1[K_NA]), key=lambda e: e['x'])
        e, t = els[0], els[0]['text']
        k = len(t) // 2
        tail = dict(e, text=t[k:])
        head = dict(e, text=t[:k], x=e['x'] + text_adv(t, e['size'], e['bold'], e['italic']) + 1.0)
        return [tail, head] + els[1:], FIG1_TR[K_NA]
    raise ValueError(kind)


ctl = {kind: sentinel(*corrupt(kind))[0] for kind in ('drop-char', 'item-moved-a-line', 'pieces-misordered')}
check('T2 CONTROL the sentinel FAILS each corrupted copy (a dropped char, an item moved to another line, '
      'pieces drawn out of order along a line)', ctl == {k: False for k in ctl}, repr(ctl))

# ── ③ ───────────────────────────────────────────────────────────────────────────────────────


def box_centred(key, box, lw=1.0):
    L, D, R, U = box[0] + lw / 2, box[1] + lw / 2, box[2] - lw / 2, box[3] - lw / 2
    lines = group_lines(lab2[key])
    ext = [line_extent(l) for l in lines]
    centre = (L + R) / 2
    inside = all(L <= x0 and x1 <= R for x0, x1 in ext) and all(
        D <= PAGE_H - e['y'] - DESC * e['size'] and PAGE_H - e['y'] + ASC * e['size'] <= U
        for e in lab2[key])
    centred = all(abs((x0 + x1) / 2 - centre) <= 0.5 for x0, x1 in ext)
    return inside and centred, f'centres={[round((a + b) / 2, 3) for a, b in ext]} box centre={centre} inside={inside}'


ok, d = box_centred(K_BOX, BOX)
check('L1 ③ a boxed translated label is drawn inside its box with EVERY line centred (±0.5 pt)', ok, d)
cl = group_lines(lab2[K_CELL])
x0, x1 = line_extent(cl[0]) if cl else (None, None)
check('L2 ③ a right-flush table-cell label stays right-flush against the source edge (±0.5 pt)',
      len(cl) == 1 and abs(x1 - CELL_END) <= 0.5, f'extent {x0}..{x1}, source right edge {CELL_END}')
al = group_lines(lab2[K_ARROW])
check('L3 ③ a two-line arrow label keeps its two lines', len(al) == 2, repr([[e['text'] for e in l] for l in al]))
arrow_bottom = ARROW[2] - 1.5 / 2
tops = [PAGE_H - e['y'] + ASC * e['size'] for e in lab2[K_ARROW]]
check('L4 ③ ... and clears the arrow above it (every glyph top below the stroke)',
      bool(tops) and max(tops) < arrow_bottom, f'max glyph top {max(tops) if tops else None} < {arrow_bottom}')
lifted = [PAGE_H - (e['y'] - 1.222 * e['size']) + ASC * e['size'] for e in lab2[K_ARROW]]
check('L4c CONTROL ... the clearance test FIRES on a copy of the label drawn one line higher',
      bool(lifted) and not (max(lifted) < arrow_bottom), f'max glyph top {max(lifted) if lifted else None}')
fl = lab2[K_FLOOR]
check('L5 ③ an unbreakable word that does not fit at the floor is drawn at 7.5 pt',
      len(fl) == 1 and f"{fl[0]['size']:.3f}" == '7.500', repr([(e['text'], e['size']) for e in fl]))
ov = [o for o in rep2.get('overflow', []) if o.get('key') == K_FLOOR]
check('L6 ③ ... and NAMED in `overflow` with its block, need > budget, at the floor, on the WIDTH axis, with the drawn '
      'line (linePt == needPt: one word on one line)',
      len(ov) == 1 and set(ov[0]) == {'key', 'block', 'word', 'needPt', 'budgetPt', 'sizePt', 'axis', 'linePt'}
      and ov[0]['block'] == index_of(f2, K_FLOOR) and ov[0]['word'] == FIG2_TR[K_FLOOR]
      and ov[0]['needPt'] > ov[0]['budgetPt'] and ov[0]['sizePt'] == 7.5
      and ov[0]['axis'] == 'width' and abs(ov[0]['linePt'] - ov[0]['needPt']) <= 1e-9, repr(rep2.get('overflow')))
ok, d = box_centred(K_IDENT, IDBOX)
line_ident = [l for l in f2['stdout'].splitlines() if l.startswith('  ') and repr(K_IDENT) in l]
check('L7 ③ the edited identity label is LAID OUT: centred in its box, its report line naming the box',
      ok and any(re.search(r'\[box \S+\]', l) for l in line_ident), f'{d} lines={line_ident!r}')
REPORT_LINE = re.compile(r'^  \S+\s+[\d.]+->[\d.]+pt  ')      # the per-block report line, not a NOTE
lines_named = {k: [l for l in f2['stdout'].splitlines() if REPORT_LINE.match(l) and repr(k) in l]
               for k in FIG2_TR}
check('L8 ③ the report line of every layout block names its class and step',
      all(len(v) == 1 and re.search(r'\[(box|cell|open) \S+\]', v[0]) for v in lines_named.values()),
      repr(lines_named))

# ════════════════════════════════════════════════════════════════════════════════════════════
# ③ A DETECTION ERROR IS NAMED - `containerErrors`
# ════════════════════════════════════════════════════════════════════════════════════════════
check('X1 ③ a figure whose detection never raised reports `containerErrors` EMPTY (present, not absent)',
      rep2.get('containerErrors') == [], repr(rep2.get('containerErrors')))
check('X5 ③ ... and so does a --control run, which lays nothing out (present, empty)',
      (f1c['report'] or {}).get('containerErrors') == [], repr((f1c['report'] or {}).get('containerErrors')))

DETECTOR_FAILURE = r'''
import os, runpy, sys
sys.dont_write_bytecode = True
path = sys.argv[1]
sys.argv = [path] + sys.argv[2:]
sys.path.insert(0, os.path.dirname(path))
try:
    import figcontainers
except ImportError:              # a composer from before ③ has no detection to break
    figcontainers = None
if figcontainers is not None:
    _classify = figcontainers.classify
    def classify(page, bbox):
        if all(abs(a - b) < 1e-6 for a, b in zip(bbox, TARGET)):
            raise RuntimeError('planted detector failure')
        return _classify(page, bbox)
    figcontainers.classify = classify
runpy.run_path(path, run_name='__main__')
'''
# The CELL label: 'Mólmassi' (35.5 pt) fits its own source width (46.5 pt) less 2 PAD, so an error
# container lays it out at full size with NO overflow - exactly the case where `containerErrors` is the
# only record that detection failed.
target = tuple(FC.page_bbox(one(f2i, K_CELL)[0]))
f2x = compose_case(TMP.name, 'fig2x', None, FIG2_TR, reuse=f2i['out'],
                   pre=DETECTOR_FAILURE.replace('TARGET', repr(target)))
rep2x = f2x['report'] or {}
precondition('P15 the detector-failure compose exits 0 and writes its report',
             f2x['rc'] == 0 and f2x['report'] is not None, f2x['stderr'][-600:])
cell_line = [l for l in f2x['stdout'].splitlines() if REPORT_LINE.match(l) and repr(K_CELL) in l]
check('X0 CONTROL the planted failure REACHED the composer: the cell label is laid out as open, not cell',
      len(cell_line) == 1 and '[open ' in cell_line[0] and any('[cell ' in l for l in lines_named[K_CELL]),
      f'{cell_line!r} (unplanted: {lines_named[K_CELL]!r})')
check('X2 ③ `containerErrors` names exactly that block - key, block index, why - and nothing else',
      rep2x.get('containerErrors') == [{'key': K_CELL, 'block': index_of(f2x, K_CELL),
                                        'why': 'error: RuntimeError'}], repr(rep2x.get('containerErrors')))
out_lines = f2x['stdout'].splitlines()
note_at = [i for i, l in enumerate(out_lines) if l.startswith('NOTE (not a failure)') and 'container detection' in l]
check('X3 ③ stdout names it in a NOTE section that begins after a BLANK line (test_blockkey_consumers parses `!!`)',
      len(note_at) == 1 and note_at[0] > 0 and out_lines[note_at[0] - 1] == ''
      and repr(K_CELL) in out_lines[note_at[0] + 1] and 'error: RuntimeError' in out_lines[note_at[0] + 1],
      repr(out_lines[note_at[0] - 1:note_at[0] + 2] if note_at else f2x['stdout'][-500:]))
check('X4 PIN the error container named NO overhang for it - `containerErrors` is the only trace',
      not [o for o in rep2x.get('overflow', []) if o.get('key') == K_CELL], repr(rep2x.get('overflow')))
lab2x = label_elements(f2x, {k: one(f2x, k)[0] for k in FIG2_TR}, [])

# ════════════════════════════════════════════════════════════════════════════════════════════
# ② A LEGACY LIST VALUE IS TRANSFERRED ONCE
# ════════════════════════════════════════════════════════════════════════════════════════════
LEGACY = ['Mól af', 'Na3PO4']
f1l = compose_case(TMP.name, 'fig1l', None, dict(FIG1_TR, **{K_NA: LEGACY}), reuse=f1['out'])
precondition('P16 the legacy list value composes (exit 0, report, SVG)',
             f1l['rc'] == 0 and f1l['report'] is not None and f1l['svg'] != '', f1l['stderr'][-600:])
unf_l = (f1l['report'] or {}).get('unformatted')
check('LG1 ② a legacy LIST value is transferred as ONE value: its placed formula names no false `absent` for the '
      'paragraph that lacks it', unf_l is not None and not [u for u in unf_l if u.get('key') == K_NA], repr(unf_l))
lab1l = label_elements(f1l, {K_NA: one(f1l, K_NA)[0], K_NAMISS: one(f1l, K_NAMISS)[0],
                             K_PLAIN: one(f1l, K_PLAIN)[0]}, FIG1_KEPT)
na_l = lab1l[K_NA]
base_l = [el for el in na_l if el['size'] == 12.0 and el['text'].endswith('Na')]
check("LG2 ② ... and its 3 and 4 are each their own <text> at 8.000 pt, 3.000 below the 'Na' baseline",
      len(base_l) == 1 and all(len(h) == 1 and f"{h[0]['size']:.3f}" == '8.000'
                                and round(h[0]['y'] - base_l[0]['y'], 3) == 3.0
                                for h in ([el for el in na_l if el['text'] == d] for d in '34')),
      repr([(el['text'], el['size'], el['y']) for el in na_l]))

# ════════════════════════════════════════════════════════════════════════════════════════════
# FIGURE 3 - ③ R9, [USER] ruling 2026-09-14: a 1-2 character SYMBOL binds to the next word; a lowercase
# alphabetic word ('af', 'og', 'á', 'í') may end a line.
# ════════════════════════════════════════════════════════════════════════════════════════════
K_R9A, K_R9B = 'Moles of|CO2', 'Mass of|A atoms'
R9BOX_A = (20.0, 110.0, 110.0, 180.0)   # page x0 y0 x1 y1 - stroked rects, lw 1.0
R9BOX_B = (170.0, 110.0, 260.0, 180.0)


def fig3_art(ctx):
    blank_page(ctx)
    ctx.set_source_rgb(0, 0, 0)
    ctx.set_line_width(1.0)
    for (x0, y0, x1, y1) in (R9BOX_A, R9BOX_B):
        ctx.rectangle(x0, PAGE_H - y1, x1 - x0, y1 - y0)
        ctx.stroke()


def centred(text, cx, y):
    return run(text, round(cx - adv(text, 9.0) / 2, 3), y, 9.0)


FIG3_RUNS = [centred('Moles of', 65.0, 150.0), centred('CO2', 65.0, 150.0 - LEAD9),
             centred('Mass of', 215.0, 150.0), centred('A atoms', 215.0, 150.0 - LEAD9)]
# Two lines are held (count before size, 2 lines fit an 85 pt budget at 9 pt). Min-max alone would pick
# 'Massi A | atóma' (32.0 / 25.0 pt) - R9 binds the symbol 'A': 'Massi | A atóma'. The literal R9 forbade
# the cut after 'af' and drew 'Mól | af CO2' (28.5 pt longest); the ruling allows it: 'Mól af | CO2' (24.5).
FIG3_TR = {K_R9A: 'Mól af CO2', K_R9B: 'Massi A atóma'}
f3 = compose_case(TMP.name, 'fig3', FIG3_RUNS, FIG3_TR, artwork=fig3_art)
for k in (K_R9A, K_R9B):
    b, e = one(f3, k)
    precondition(f'P17 {k!r} is ONE send:true block of two lines', e is not None and e['send'] is True
                 and len(FT.lines(b)) == 2, repr([(x['key'], x['send']) for x in f3['entries']]))
pg3 = FC.load_page(f3['out'] / 'artwork.pdf')
dark3 = Image.open(f3['out'] / 'artwork.png').convert('L')
precondition('P18 both figure-3 labels classify as box, and the compose exits 0',
             all(FC.container_for(index_of(f3, k), f3['blocks'], pg3, dark3, PAGE_H)['cls'] == 'box'
                 for k in (K_R9A, K_R9B)) and f3['rc'] == 0 and f3['report'] is not None, f3['stderr'][-400:])
lab3 = label_elements(f3, {k: one(f3, k)[0] for k in FIG3_TR}, [])


def drawn_lines(els):
    return [''.join(e['text'] for e in l) for l in group_lines(els)]


check("R9a ③ a lowercase alphabetic 2-letter word may END a line: 'Mól af CO2' draws ['Mól af', 'CO2']",
      drawn_lines(lab3[K_R9A]) == ['Mól af', 'CO2'], repr(drawn_lines(lab3[K_R9A])))
check("R9b ③ a 1-character SYMBOL binds to the next word: 'Massi A atóma' draws ['Massi', 'A atóma']",
      drawn_lines(lab3[K_R9B]) == ['Massi', 'A atóma'], repr(drawn_lines(lab3[K_R9B])))

more = ([(K_CELL + ' (detector failure)', FIG2_TR[K_CELL], lab2x[K_CELL]),
         (K_NA + ' (legacy list)', ' '.join(LEGACY), na_l)]
        + [(k, v, lab3[k]) for k, v in FIG3_TR.items()])
res3 = [(k,) + sentinel(els, v) for k, v, els in more]
check('T3 TEXT SENTINEL the labels of the X, LG and R9 arms (4) reproduce their values\' words',
      all(ok for _, ok, _ in res3), '; '.join(f'{k}: {d}' for k, ok, d in res3 if not ok) or f'{len(res3)} labels')

finish()
