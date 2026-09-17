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
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))
os.environ['SOURCE_DATE_EPOCH'] = '1700000000'  # BEFORE any child is spawned - see docstring

import figtext as FT                                          # noqa: E402
import figcolour                                              # noqa: E402
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


def run_compose(out_dir, tr_path, extra_env=None):
    """`extra_env` goes into the CHILD's environment only - this process's os.environ is never touched."""
    env = dict(os.environ)
    env['FIGTEXT_OUT'] = str(out_dir)
    if extra_env:
        env.update(extra_env)
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


def prepare_fixture(tmp, name, mutate, translations):
    """prepare -> mutate(out) -> derive blocks -> write the translations. -> (out, extra, blocks, entries, tr)"""
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
    return out, extra, blocks, entries, tr


def compose_fixture(tmp, name, mutate, translations, extra_env=None):
    """prepare -> mutate(out) -> derive blocks -> compose. -> (out, blocks, entries, report, svg)"""
    out, extra, blocks, entries, tr = prepare_fixture(tmp, name, mutate, translations)
    c = run_compose(out, tr, extra_env)
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
# §C140 ③ re-lays every translated STRAIGHT label (figcontainers + figlayout, linear metrics), so the
# plain labels' geometry is no longer E's to pin - test_compose_t23.py owns it. The ARC path is not
# touched by ③ and stays byte-identical; the plain labels must still draw exactly their words.
ARC_GLYPHS = ('B', 'O', 'G', 'I', 'X')
arc_now = [raw for text, _, raw in els if text in ARC_GLYPHS]
arc_gold = [raw for raw in (golden or {}).get('population', [])
            if re.search(r'>(?:B|O|G|I|X)</text>$', raw)]
# [USER] ruling (C) 2026-09-15 moves ONE attribute of these elements, and it must move EXACTLY there: the
# golden was captured under the naive (1-c)(1-k) text colour, which drew the planted FILL (0.75,0.5,0,0.2)
# #3366cc; poppler, and so the artwork under it, draws it #415e9f (test_figcolour.py 1e 'CMYK blue'
# measures that on pdftocairo). The expected attribute is derived from figcolour.fill_rgb(FILL) with
# svgout.write_svg's own rounding, and it must DIFFER from the golden's naive one - so a composer, or a
# figcolour, that went back to the naive map fails here instead of passing either way.
ARC_FILL_NOW = 'fill="#%02x%02x%02x"' % tuple(round(v * 255) for v in figcolour.fill_rgb(FILL))
ARC_FILL_GOLD = sorted({f for raw in arc_gold for f in re.findall(r'fill="#[0-9a-f]{6}"', raw)})
check('C1 CONTROL the translated ARC is byte-identical to the unchanged composer but for ruling (C)\'s '
      'fill, which is exactly figcolour.fill_rgb of the planted fill',
      golden is not None and len(arc_gold) == 5 and len(arc_now) == 5 and len(ARC_FILL_GOLD) == 1
      and ARC_FILL_NOW != ARC_FILL_GOLD[0]
      and all(old.count(ARC_FILL_GOLD[0]) == 1 and now == old.replace(ARC_FILL_GOLD[0], ARC_FILL_NOW)
              for now, old in zip(arc_now, arc_gold)),
      f"expected {ARC_FILL_NOW} (golden {ARC_FILL_GOLD}), now {arc_now!r}")
plain_now = [text for text, _, _ in els if text in ('Athugun og forvitni', 'Profa tilgatuna')]
plain_gold = [re.sub(r'<[^>]+>', '', raw) for raw in (golden or {}).get('population', [])
              if not re.search(r'>(?:B|O|G|I|X)</text>$', raw)]
check('C1b CONTROL the two plain translated labels still draw exactly their words (geometry: '
      'test_compose_t23.py)', golden is not None and plain_now == plain_gold,
      f"now {plain_now!r} golden {plain_gold!r}")
check('C2 CONTROL a figure with no italic run has the unchanged composer\'s faces (plain)',
      golden is not None and current['faces_plain'] == golden['faces_plain'],
      repr(current['faces_plain']))
check('C3 CONTROL ... and with a whole bold run (face order is visible here)',
      golden is not None and current['faces_bold'] == golden['faces_bold'],
      repr(current['faces_bold']))

# ── E's assertions are appended below this line by Tasks 4 and 5 ────────────────────

A1 = adv('Form a ', 12)
check('E1 IDENTITY, POSITIONAL: each run of the two-run identity line is its own <text> at '
      'its own origin (a joined line would be one element at x=10)',
      len(find(els, 'Form a ', x='10.000', y=f'{PAGE_H - 120.0:.3f}')) == 1
      and len(find(els, 'hypothesis', x=f'{10.0 + A1:.3f}', y=f'{PAGE_H - 120.0:.3f}')) == 1,
      repr([(t, a.get('x'), a.get('y')) for t, a, _ in els if 'hyp' in t or 'Form' in t]))

check('E2 IDENTITY, REPORT: the identity key is in `identity` AND stays in `translated`',
      K_HYP in rep.get('identity', []) and K_HYP in rep['translated'],
      f"identity={rep.get('identity')!r} translated={rep['translated']!r}")

h = find(els, 'H', font_size='12.000')
two = find(els, '2', font_size='8.000')
check('E3 SUBSCRIPT: the 2 is its own <text> at 8 pt, 3.000 below the H baseline',
      len(h) == 1 and len(two) == 1
      and float(two[0][1]['y']) - float(h[0][1]['y']) == 3.0,
      repr([(t, a.get('font-size'), a.get('y')) for t, a, _ in els if t in ('H', '2', 'H2O (g)')]))

check('E4 ARROW GAP: the 10 typed spaces survive inside one <text>',
      len(find(els, K_GAP)) == 1, repr([t for t, _, _ in els if 'H2O(' in t]))

# The kept arc is centred at (230, 100): its glyphs sit at y 152-159. The subscript '2'
# (y 37) and the translated arc (y 72-79) share glyph texts or shapes and are excluded.
karc = [r for r in RUNS if r['text'] in list(K_KARC) and r['y'] > 150]


def arc_ok(r):
    x, y = f"{r['x']:.3f}", f"{PAGE_H - r['y']:.3f}"
    hit = find(els, r['text'], x=x, y=y)
    want = (f"rotate({-r['rot']:.4f} {x} {y})" if abs(r['rot']) > 1e-6 else None)
    return len(hit) == 1 and hit[0][1].get('transform') == want


check('E5 KEPT ARC: every glyph is a <text> at its run\'s (text, x, y) with its own rotation',
      len(karc) == 5 and all(arc_ok(r) for r in karc),
      repr([(t, a.get('x'), a.get('y'), a.get('transform')) for t, a, _ in els
            if t in list(K_KARC)]))

check('E6 EDGE SPACE: a kept line ending in a space is NOT named undecodable, and keeps it',
      K_EDGE not in rep.get('undecodable', []) and len(find(els, K_EDGE)) == 1,
      f"undecodable={rep.get('undecodable')!r}")

check('E7 runExact names exactly the kept blocks, identity included',
      collections.Counter(rep.get('runExact', []))
      == collections.Counter([K_HYP, K_VERBATIM, K_GAP, K_EDGE, K_KARC]),
      repr(rep.get('runExact')))

check('E8 ITALIC: an italic @font-face exists and the italic run uses it',
      ['400', 'italic', '()g'] in faces(svg)
      and len(find(els, '(g)', font_style='italic')) == 1,
      f"faces={[f[:2] for f in faces(svg)]!r} (g)={find(els, '(g)')!r}")

# ── §C140 ⑥a: a REAL bought figure — CNX_Chem_04_02_HClsoln has an identity KEPT STIX block ──
# (evidence/2026-09-17-c6a-build/reports/before/stix-recount.json: kept_blocks=1, chars ' ', '+').
# This is a compose-level end-to-end check, not a planted one: it resolves the figure's own
# source PDF the way a real run does (sources.py, this box's sources.local.json).
HCL_BASENAME = 'CNX_Chem_04_02_HClsoln'
try:
    import sources as SRC
    _cfg = SRC.load_config()
    _trees = SRC.load_trees('efnafraedi-2e', _cfg)
    _hcl_src, _ = SRC.resolve(HCL_BASENAME, _trees, _cfg['editionPrecedence'],
                              superseded=_cfg.get('supersededArtwork'))
except SystemExit as exc:
    _hcl_src = None
    check('R0 PRECONDITION CNX_Chem_04_02_HClsoln resolves on this box', False, str(exc))
else:
    check('R0 PRECONDITION CNX_Chem_04_02_HClsoln resolves on this box', _hcl_src is not None,
          str(_hcl_src) if _hcl_src is not None else 'unresolved (no source tree holds it)')


def run_prepare_src(src, out_dir, basename):
    env = dict(os.environ)
    env.pop('FIGTEXT_OUT', None)
    return subprocess.run([sys.executable, str(PREPARE), str(src), '--basename', basename,
                           '--out', str(out_dir)], capture_output=True, text=True, env=env)


def run_compose_real(out_dir, extra_env=None):
    """--control --svg, no --translations: CONTROL never looks translations up."""
    env = dict(os.environ)
    env['FIGTEXT_OUT'] = str(out_dir)
    if extra_env:
        env.update(extra_env)
    return subprocess.run([sys.executable, str(COMPOSE), '--control', '--svg'],
                          capture_output=True, text=True, env=env, cwd=str(HERE))


if _hcl_src is not None:
    hcl_out = Path(TMP.name) / 'hclsoln'
    prep_hcl = run_prepare_src(_hcl_src, hcl_out, HCL_BASENAME)
    check('R1 PRECONDITION CNX_Chem_04_02_HClsoln prepares',
          prep_hcl.returncode == 0, f'exit {prep_hcl.returncode}: {prep_hcl.stderr.strip()[-400:]}')

    if prep_hcl.returncode == 0:
        comp_hcl = run_compose_real(hcl_out)
        hcl_report_path = hcl_out / 'compose-report.json'
        hcl_svg_path = hcl_out / 'control.svg'
        check('R2 PRECONDITION it composes (--control --svg) and writes a report and an SVG',
              comp_hcl.returncode == 0 and hcl_report_path.exists() and hcl_svg_path.exists(),
              f'exit {comp_hcl.returncode}: {comp_hcl.stderr.strip()[-600:]}')

        if comp_hcl.returncode == 0 and hcl_report_path.exists() and hcl_svg_path.exists():
            hcl_rep = json.loads(hcl_report_path.read_text())
            hcl_svg = hcl_svg_path.read_text()
            check("R3 compose-report.json's stix.drawn is non-empty",
                  bool(hcl_rep.get('stix', {}).get('drawn')), repr(hcl_rep.get('stix')))
            try:
                hcl_root = ET.fromstring(hcl_svg.encode('utf-8'))
                hcl_parse_err = None
            except ET.ParseError as e:
                hcl_root = None
                hcl_parse_err = str(e)
            check('R4 the SVG parses as XML', hcl_root is not None, hcl_parse_err or '')
            hcl_figsym_texts = ([e for e in hcl_root.iter()
                                 if e.tag.split('}', 1)[-1] == 'text'
                                 and e.get('font-family') == 'FigSym']
                                if hcl_root is not None else [])
            check('R5 at least one <text font-family="FigSym"> exists',
                  len(hcl_figsym_texts) > 0, repr(len(hcl_figsym_texts)))
            hcl_metadata = ([e for e in hcl_root.iter() if e.tag.split('}', 1)[-1] == 'metadata']
                            if hcl_root is not None else [])
            check('R6 its <metadata> exists', len(hcl_metadata) == 1, repr(len(hcl_metadata)))

    # Negative arm: FIGTEXT_STIX_FONT pointing at a missing file refuses this figure — exit
    # non-zero, no compose-report.json (T3 of the design: a missing/wrong font fails loudly).
    if prep_hcl.returncode == 0:
        hcl_bad_out = Path(TMP.name) / 'hclsoln-badfont'
        prep_hcl2 = run_prepare_src(_hcl_src, hcl_bad_out, HCL_BASENAME)
        if prep_hcl2.returncode == 0:
            missing_font = Path(TMP.name) / 'no-such-stix-font.otf'
            comp_bad = run_compose_real(hcl_bad_out, extra_env={'FIGTEXT_STIX_FONT': str(missing_font)})
            check('R7 NEGATIVE ARM: a missing FIGTEXT_STIX_FONT exits non-zero, writes no report, and the '
                  'cause is figsym.FontUnavailable (not some other non-zero exit)',
                  comp_bad.returncode != 0 and not (hcl_bad_out / 'compose-report.json').exists()
                  and 'FontUnavailable' in comp_bad.stderr,
                  f'exit {comp_bad.returncode}; stderr tail: {comp_bad.stderr.strip()[-300:]!r}')
        else:
            check('R7 NEGATIVE ARM: a missing FIGTEXT_STIX_FONT exits non-zero, writes no report, and the '
                  'cause is figsym.FontUnavailable (not some other non-zero exit)',
                  False, f'PRECONDITION prep failed: {prep_hcl2.stderr.strip()[-300:]}')

# ── §C140 ⑥a: ELIGIBILITY, planted — every branch of the STIX decision, each by VALUE ────────
# HClsoln above reaches only the covered path, and so does every one of the 34 bought figures: the
# `cmap` fallback and the `other-face` / `translated` reasons have 0 corpus instances. So they are
# planted, one single-run block each, at x=170 (clear of the fixture's labels, which end by x=146)
# and 30 pt apart (well over the 1.222 x 12 pt leading `figtext.group` joins lines within). KEPT is
# decided by the translations file alone (compose.py: no value -> kept), so only 'Total' is given one.
K_S_DRAWN, K_S_CMAP, K_S_ITALIC, K_S_SIZEONE, K_S_MATHPI, K_S_TR = '+=', '+Ɓ', 'x', '[', '±', 'Total'
# U+0181 'Ɓ' is in Liberation Sans and NOT in the official STIX 1.1.0 cmap (measured with fontTools), so the
# FigIS fallback can really draw it; the '+' beside it is covered, so the run is refused on `all`, not `any`.
STIX_TR = {K_S_TR: 'Samtals'}
STIX_KEPT = (K_S_DRAWN, K_S_CMAP, K_S_ITALIC, K_S_SIZEONE, K_S_MATHPI)
STIX_ENV_BEFORE = os.environ.get('FIGTEXT_STIX_FONT')


def plant_stix(out_dir):
    runs = json.loads((out_dir / 'runs.json').read_text())
    meta = json.loads((out_dir / 'meta.json').read_text())
    for fk, base in (('PAGE/F4', '/ABCDEF+STIXGeneral-Regular'), ('PAGE/F5', '/ABCDEF+STIXGeneral-Italic'),
                     ('PAGE/F6', '/ABCDEF+STIXSizeOneSym-Regular'), ('PAGE/F7', '/XYZABC+MathematicalPi-One')):
        meta['fonts'][fk] = dict(meta['fonts']['PAGE/F1'], base=base)
    for text, y, fk in ((K_S_DRAWN, 200.0, 'PAGE/F4'), (K_S_CMAP, 170.0, 'PAGE/F4'), (K_S_ITALIC, 140.0, 'PAGE/F5'),
                        (K_S_SIZEONE, 110.0, 'PAGE/F6'), (K_S_MATHPI, 80.0, 'PAGE/F7'), (K_S_TR, 50.0, 'PAGE/F4')):
        runs.append(run(text, 170.0, y, font=fk, a=round(0.6 * 12.0 * len(text), 3)))
    (out_dir / 'runs.json').write_text(json.dumps(runs, ensure_ascii=False))
    (out_dir / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False))


def figsym_chars(svg_text):
    """The decoded character set of every FigSym @font-face (a list of strings, one per rule)."""
    return [''.join(sorted(chr(c) for c in TTFont(io.BytesIO(base64.b64decode(b64))).getBestCmap()))
            for b64 in re.findall(r"@font-face\{font-family:'FigSym';font-weight:400;font-style:normal;"
                                  r"src:url\(data:font/woff2;base64,([^)]+)\)", svg_text)]


_, _, s_blocks, s_entries, s_rep, s_svg = compose_fixture(TMP.name, 'stix', plant_stix, STIX_TR)
s_keys = collections.Counter(e['key'] for e in s_entries)
s_by_key = {e['key']: b for b, e in zip(s_blocks, s_entries)}
check('S0 PRECONDITION each STIX plant is its OWN one-run block, the five kept ones are kept (runExact) and '
      '`Total` is translated, not identity',
      all(s_keys[k] == 1 and len(s_by_key[k]) == 1 for k in STIX_KEPT + (K_S_TR,))
      and collections.Counter(s_rep.get('runExact', [])) >= collections.Counter(STIX_KEPT)
      and K_S_TR not in s_rep.get('runExact', []) and K_S_TR in s_rep['translated']
      and K_S_TR not in s_rep.get('identity', []),
      f"keys={sorted(s_keys)} runExact={s_rep.get('runExact')!r} translated={s_rep['translated']!r}")
if fails:
    finish()
s_stix = s_rep.get('stix', {})
s_els = elements(s_svg)
check("S1 stix.drawn is EXACTLY the covered STIXGeneral-Regular kept run's key",
      s_stix.get('drawn') == [K_S_DRAWN], repr(s_stix))
check('S2 stix.skipped is EXACTLY: cmap (Regular, a character outside the cmap), other-face (STIXGeneral-Italic '
      'AND STIXSizeOneSym-Regular), translated (a Regular run in a translated block) - and NOTHING for the '
      'MathematicalPi run or the fixture\'s own Helvetica labels',
      collections.Counter((s['key'], s['reason']) for s in s_stix.get('skipped', []))
      == collections.Counter([(K_S_CMAP, 'cmap'), (K_S_ITALIC, 'other-face'), (K_S_SIZEONE, 'other-face'),
                              (K_S_TR, 'translated')]), repr(s_stix.get('skipped')))
check('S3 the ONLY <text> drawn in FigSym is the covered run',
      [t for t, a, _ in s_els if a.get('font-family') == 'FigSym'] == [K_S_DRAWN],
      repr([(t, a.get('font-family')) for t, a, _ in s_els]))
check('S4 each other kept plant is ONE <text> drawn in FigIS (the italic one italic)',
      all(len(find(s_els, k, font_family='FigIS')) == 1 for k in (K_S_CMAP, K_S_SIZEONE, K_S_MATHPI))
      and len(find(s_els, K_S_ITALIC, font_family='FigIS', font_style='italic')) == 1,
      repr([(t, a.get('font-family'), a.get('font-style')) for t, a, _ in s_els if t in STIX_KEPT]))
s_tr_els = [(t, a) for t, a, _ in s_els if 'Samtals' in t]
check('S5 the translated STIX block draws its VALUE in FigIS, and its English is gone',
      len(s_tr_els) >= 1 and all(a.get('font-family') == 'FigIS' for _, a in s_tr_els)
      and not any(K_S_TR in t for t, _, _ in s_els), repr(s_tr_els))
s_sym = figsym_chars(s_svg)
s_is_chars = ''.join(f[2] for f in faces(s_svg))
check('S6 the SVG embeds ONE FigSym face holding the drawn run\'s characters and not the fallback\'s; the '
      'FigIS faces hold the fallback character and not the FigSym-only one',
      len(s_sym) == 1 and set(K_S_DRAWN) <= set(s_sym[0]) and 'Ɓ' not in s_sym[0]
      and 'Ɓ' in s_is_chars and '=' not in s_is_chars, f'figsym={s_sym!r} figis={s_is_chars!r}')

# REFUSAL, both sides, on planted inputs (spec § 3): the same missing font path refuses the STIX figure
# and composes the no-STIX one. Each side is the other's control - a success on `plain` means nothing
# unless the same variable, the same path, really does refuse a figure that needs the font.
S_MISSING = {'FIGTEXT_STIX_FONT': str(Path(TMP.name) / 'no-such-stix-font.otf')}
s_bad_out, _, _, _, s_bad_tr = prepare_fixture(TMP.name, 'stix-nofont', plant_stix, STIX_TR)
s_bad = run_compose(s_bad_out, s_bad_tr, S_MISSING)
check('S7 CONTROL the planted STIX figure with FIGTEXT_STIX_FONT missing REFUSES: exit non-zero, no report, '
      'figsym.FontUnavailable',
      s_bad.returncode != 0 and not (s_bad_out / 'compose-report.json').exists()
      and 'FontUnavailable' in s_bad.stderr,
      f'exit {s_bad.returncode}; stderr tail: {s_bad.stderr.strip()[-300:]!r}')
_, _, _, _, n_rep, n_svg = compose_fixture(TMP.name, 'plain-nofont', None, PLAIN_TR, extra_env=S_MISSING)
check('S8 a figure with NO STIX run composes with the same missing font: report written, stix empty, no FigSym',
      n_rep.get('stix') == {'drawn': [], 'skipped': []} and 'FigSym' not in n_svg, repr(n_rep.get('stix')))
check('S9 this process\'s own FIGTEXT_STIX_FONT is unchanged (the variable went to children only)',
      os.environ.get('FIGTEXT_STIX_FONT') == STIX_ENV_BEFORE, repr(os.environ.get('FIGTEXT_STIX_FONT')))

finish()
