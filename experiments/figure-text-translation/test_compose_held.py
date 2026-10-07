#!/usr/bin/env python3
"""§C140 ㊾ D5(a), end to end: compose.py draws [USER]'s held values for send:false labels from
`--held-values`, per VISUAL source line, all or nothing - and draws everything else exactly as today.

    FIGTEXT_PYLIBS=./pylibs python3 -B -u test_compose_held.py

Design: docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md (D-c, D-d, D-e,
D-i: CH1-CH11). The planner itself (every refusal, the real placements on the 13 value-sheet lines) is
tested alone in test_heldplan.py; this file tests what compose.py DOES with a plan: the flag, the draw,
the report, stdout, and that nothing else moves.

WHAT IS PLANTED, AND FROM WHERE
-------------------------------
The committed fixture (`fixtures/fixture_figure.pdf`, page 300 x 220) is prepared ONCE with
`--basename CNX_Fixture_held`, so meta.json's `source` stem - the basename a held-values file must name
- is `CNX_Fixture_held`. Each planted figure is a copy of that directory with runs.json REPLACED by REAL
runs copied from the committed evidence/2026-10-03-c140-held/held-geometry.json, at their REAL,
unshifted coordinates (all 13 value-sheet lines fit inside 300 x 220), and meta.json's `fonts` extended
with that figure's own font entries (the test_compose_runexact pattern). The FIXTURE artwork is kept, so
containers differ from the real figure's: every planted block is `open` here. A hard PRECONDITION
measures each block's container class and alignment with figcontainers itself, and each CH asserts only
container-independent or relative properties - absolute placements inside the REAL containers are
test_heldplan.py's HP16.
* MATT    MattType's three `No` (real b11, b13, b15) plus one planted kept label `QZK`, so `missing`
          is non-empty and CH9's stdout parse is not vacuous.
* OX      OxStNonmts b2 `4+|To|4–` (3 visual lines; its `+` and `–` are STIXGeneral-BoldItalic).
* AMIDE   amide1 b0 `C|H or R` (2 visual lines, multi-line alignment right).
* BUF     buffer b23 `[CH3CO2H] is 11% of [CH3CO2|–]` (2 FT.lines, ONE visual line).
* STIX    a planted one-line label `QZA → QZB +` whose arrow is a STIXGeneral-Regular run and whose `+`
          is a STIXGeneral-Bold run (CH12).
* LOC     a planted 2-line label `2.54 QZ|QZM` (CH13): its first line holds a decimal point that a kept
          line draws as `2,54` (numloc), and its second line is RED, unlike the block's first run.
* RM      (CH14) two planted blocks: a one-line label `QZ rot` drawn at rot 90, and a 2-line label
          `QZ ab|QZ cd` whose first line is regular and whose second is BOLD (MattType's own bold face
          entry), both lines centred on one x. The changed lines draw `QZtrill`, whose Liberation width
          differs by weight (24.0 regular, 26.5 bold at 9 pt), where every other sentinel here is the
          same width in both - which is why no other arm could see the measuring run.
Values are ASCII sentinels (QZX, QZQ, QZT, QZC/QZD), except BUF's, which is the value sheet's B3 quoted
verbatim as evidence (docs/handoffs/2026-10-03-step2-value-sheet.md), as test_heldplan.py does.
Every arm is composed WITH the flag and compared against the same figure composed with NO flag (today).

WHAT IS PINNED
--------------
* CH1  MattType's `No` x3 with `QZX`: three laid-out `QZX` (bold 9), each on its OWN source baseline
       and centred on its OWN source centre; no `No` left; `held` lists `No` three times; `No` is not in
       `missing`. Kills first-occurrence-only, a set where a multiset is needed, held keys in `missing`.
* CH2  OxStNonmts `4+\\nQZQ\\n4–`: lines 0 and 2 are the no-flag run's <text> elements, byte for byte
       and in order; one laid-out `QZQ` (bold 7) on `To`'s baseline, centred on `To`; no `To`; the STIX
       runs of the unchanged lines are counted as today; `localized` is the no-flag run's ([]). Kills the
       whole-block route, re-laying unchanged lines, and (CH2g) a laid-out line that does not advance the
       source offset, which compares line 2's drawn runs against `To` and names the block `localized`.
* CH3  amide1 `C\\nQZX R`: `C` is the no-flag element; the changed line ENDS at its own source end
       87.26 (right-aligned per line). Kills a block anchor (104.52).
* CH4  buffer B3: ONE laid-out line on 150.365; `3`/`2` at 9 x 0.7778 shifted 9 x -0.3333; the charge
       as U+2013 at 9 x 0.7778 shifted 9 x 0.4444, AFTER the last subscript; no U+2070-209F character
       anywhere in translated.svg. Kills FT.lines counting (refuses), literal glyphs, NFKC, constants.
* CH5  refusals end to end (`no-glyph:U+2603`, `line-count`): translated.svg byte-identical to the
       no-flag run, the key in BOTH `missing` and `heldErrors`, `held` empty.
* CH6  CONTROL: --control ignores a NONEXISTENT --held-values path - exit 0, control.png/.svg
       byte-identical to --control alone, heldValuesPath null.
* CH7  an empty `values` is byte-identical to no flag (svg, png) and the report differs only in
       heldValuesPath / heldConfigPath. Kills the always-passed flag perturbing every figure.
* CH8  a nonexistent --held-values path, and a file written for ANOTHER basename: exit != 0 and no
       compose-report.json, translated.png or translated.svg. Kills a missing file read as {} and a
       leftover file in a reused directory drawing another figure's values.
* CH9  test_blockkey_consumers.py's OWN parse rule (its source, exec'd) over the stdout of CH1 and
       CH5 yields exactly `missing`; the held NOTE section and the `!!` refusal header each open after a
       blank line, and the `!!` header does not contain `no translation`; the closing line gains
       `, 3 held` only when something was held.
* CH10 a key in both --translations and the values: the translation is drawn, `heldErrors` names
       `in-translations` per occurrence, `held` is empty.
* CH11 a configured key absent from the figure: `heldErrors` gets `no-block` with block null, and the
       keys that are present are still drawn.
* CH12 (added) the STIX runs of a CHANGED line are drawn as Liberation text in the laid-out line and
       named per run in stix.skipped: an eligible one `held`, one in another STIX face `other-face`; never
       FigSym. CONTROL: the same eligible run, kept (no flag), IS drawn in FigSym.
* CH13 (added) a held block's UNCHANGED line is drawn from its LOCALISED runs (`2,54`) and the block is
       named in `localized`, exactly as the no-flag run draws and names it; the value line `2,54 QZ` (the
       localised source form) counts as unchanged; the changed line is drawn in the fill of its OWN visual
       line's first run (red), never the block's first run's (black).
* CH14 (a skeptic's finding, 2026-10-03) the held route's ROTATION and MEASURING RUN, end to end: the
       rot-90 changed line is drawn rotated (`rotate(-90 ...)`), its pen at the source run's own x and
       centred on the run's own extent along the text; the bold changed line under a regular first line
       is drawn bold and centred on its own source line, measured in ITS weight. Kills draw_held drawing
       at rot 0 and its width measured with the block's first run (draw_held's lambdas, which HP18 cannot
       reach).
RED ON THE COMPOSER WITHOUT `--held-values` (it ignores the flag): CH1-CH5, CH7, CH8, CH9 (stdout),
CH10, CH11, CH12, CH13, CH14. CH6 is a CONTROL and passes on both sides.
"""
import ast
import collections
import json
import os
import re
import shutil
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

import figtext as FT                                          # noqa: E402
import figcontainers as FC                                    # noqa: E402
import heldvalues as HV                                       # noqa: E402
from blockkey import block_key                                # noqa: E402
from fontTools.ttLib import TTFont                            # noqa: E402
from PIL import Image                                         # noqa: E402

PREPARE = HERE / 'figure-prepare.py'
COMPOSE = HERE / 'compose.py'
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'
CONSUMERS = HERE / 'test_blockkey_consumers.py'
GEOM = json.loads((HERE / 'evidence' / '2026-10-03-c140-held' / 'held-geometry.json').read_text(encoding='utf-8'))
BASENAME = 'CNX_Fixture_held'
PAGE_H = 220.0
BLACK = ['cmyk', 0.0, 0.0, 0.0, 1.0]
RED = ['cmyk', 0.0, 1.0, 1.0, 0.0]
# The value sheet's B3, quoted VERBATIM as evidence - the only value here that is not an ASCII sentinel.
B3 = '[CH₃CO₂H] er 11% af [CH₃CO₂⁻]'
B3_DRAWN = '[CH3CO2H] er 11% af [CH3CO2–]'      # its decoded characters (D-a), ⁻ -> U+2013
SCRIPT_RANGE = (0x2070, 0x209F)

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


def attempt(label, fn):
    """Run one arm; an exception is a FAIL of that arm, never a crash of the file."""
    try:
        fn()
    except Exception as e:                      # noqa: BLE001 - reported, not swallowed
        check(label + ' (raised)', False, f'{type(e).__name__}: {e}')


def fixture_adv(text, size):
    return round(sum(_W[ord(c) - _FIRST] for c in text) * size / 1000.0, 3)


def run(text, size, x, y, adv, font='PAGE/F1', fill=BLACK):
    return dict(text=text, font=font, size=size, rot=0.0, x=x, y=y, adv=adv,
                fill=fill, tm=[1.0, 0.0, 0.0, 1.0, x, y])


_FACES = {}


def text_adv(text, size, bold=False, italic=False):
    """The drawn width, from the face FILES with fontTools - independent of compose.py's cairo measure
    (test_compose_t23.py's instrument)."""
    from figis import face_path
    k = (bool(bold), bool(italic))
    if k not in _FACES:
        f = TTFont(str(face_path(k)))
        _FACES[k] = (f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm)
    cmap, hmtx, upm = _FACES[k]
    return sum(hmtx[cmap.get(ord(c), '.notdef')][0] for c in text) * size / upm


def elements(svg_text):
    """[{text, x, y (PDF, y up), size, bold, italic, family, layout, raw}] in document order. `layout` is
    True for a LAID-OUT segment (svgout draws those, and only those, with font-kerning:none - ⑥b)."""
    out = []
    for m in re.finditer(r'<text ([^>]*)>([^<]*)</text>', svg_text):
        a = dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1)))
        t = m.group(2).replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
        out.append(dict(text=t, x=float(a['x']), y=PAGE_H - float(a['y']), size=float(a['font-size']),
                        bold=a.get('font-weight') == '700', italic=a.get('font-style') == 'italic',
                        family=a.get('font-family'), layout='font-kerning:none' in a.get('style', ''),
                        raw=m.group(0)))
    return out


def geom_runs(basename, index):
    fig = GEOM['figures'][basename]
    return [dict(r) for r in next(b for b in fig['blocks'] if b['block'] == index)['runs']], fig['fonts']


TMP = tempfile.TemporaryDirectory(prefix='c49-held-')
TD = Path(TMP.name)
BASE = TD / 'fix'
env0 = dict(os.environ)
env0.pop('FIGTEXT_OUT', None)
prep = subprocess.run([sys.executable, str(PREPARE), str(FIXTURE), '--basename', BASENAME, '--out', str(BASE)],
                      capture_output=True, text=True, env=env0)
precondition('the fixture prepares', prep.returncode == 0, prep.stderr.strip()[-400:])
precondition("meta.json's source stem is the basename a held-values file must name",
             Path(json.loads((BASE / 'meta.json').read_text())['source']).stem == BASENAME)


def plant(name, runs, fonts):
    """A copy of the prepared fixture whose runs.json is `runs` and whose meta fonts gain `fonts`."""
    d = TD / name
    shutil.copytree(BASE, d)
    (d / 'runs.json').write_text(json.dumps(runs, ensure_ascii=False))
    meta = json.loads((d / 'meta.json').read_text())
    meta['fonts'].update(fonts)
    (d / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False))
    blocks = FT.merge_blocks(FT.group(runs))
    pg = FC.load_page(d / 'artwork.pdf')
    with Image.open(d / 'artwork.png') as im:
        dark = im.convert('L')
    cont = [FC.container_for(i, blocks, pg, dark, PAGE_H) for i in range(len(blocks))]
    return d, blocks, [block_key(b) for b in blocks], cont


DERIVED = ('compose-report.json', 'translated.png', 'translated.svg', 'control.png', 'control.svg')
_N = collections.Counter()


def compose(d, tr=None, held=None, control=False, basename=BASENAME, config='test-config.json'):
    """Compose planted figure `d`. `held` None = no flag, a dict = write a held-values file for
    `basename` and pass it, a str = pass that path verbatim. -> a dict of everything a check reads."""
    for n in DERIVED:
        (d / n).unlink(missing_ok=True)
    _N[d.name] += 1
    stem = f'{d.name}-{_N[d.name]}'
    trp = TD / f'{stem}-tr.json'
    trp.write_text(json.dumps({'blocks': tr or {}}, ensure_ascii=False))
    argv = [sys.executable, str(COMPOSE), '--translations', str(trp), '--svg']
    hp = None
    if isinstance(held, dict):
        hp = TD / f'{stem}-held.json'
        HV.write_file(hp, basename, config, held)
        argv += ['--held-values', str(hp)]
    elif isinstance(held, str):
        argv += ['--held-values', held]
    if control:
        argv.append('--control')
    c = subprocess.run(argv, capture_output=True, text=True, env=dict(os.environ, FIGTEXT_OUT=str(d)), cwd=str(HERE))
    name = 'control' if control else 'translated'
    rp, svg, png = d / 'compose-report.json', d / f'{name}.svg', d / f'{name}.png'
    return dict(rc=c.returncode, stdout=c.stdout, stderr=c.stderr, held_path=hp,
                report=json.loads(rp.read_text()) if rp.exists() else None,
                svg=svg.read_text(encoding='utf-8') if svg.exists() else None,
                png=png.read_bytes() if png.exists() else None,
                exists={n: (d / n).exists() for n in DERIVED})


def ok_compose(label, res):
    ok = res['rc'] == 0 and res['report'] is not None and res['svg'] is not None
    precondition(f'{label}: compose exits 0 and writes its report and SVG', ok, '' if ok else res['stderr'][-500:])


def held_lines(res):
    """The `HELD` report lines: {key: [(block, changed, [(cls, step, align, size)])]}."""
    out = collections.defaultdict(list)
    for line in res['stdout'].splitlines():
        m = re.match(r"^  HELD   (.+) block (\d+): lines \[([\d, ]*)\]  (.*)$", line)
        if m:
            segs = re.findall(r"\[(\w+) ([\w-]+)\] (\w+) ([\d.]+)pt", m.group(4))
            out[ast.literal_eval(m.group(1))].append(
                (int(m.group(2)), [int(x) for x in m.group(3).split(',') if x.strip()], segs))
    return out


def rget(res, field, default=None):
    return (res['report'] or {}).get(field, default)


def held_keys(res):
    return [h.get('key') for h in rget(res, 'held') or []]


def err_view(res):
    return [(e.get('key'), e.get('block'), e.get('reason')) for e in rget(res, 'heldErrors') or []]


# ── the plants ─────────────────────────────────────────────────────────────────────────────
MT, OX, AM, BF = ('CNX_Chem_01_02_MattType', 'CNX_Chem_18_04_OxStNonmts', 'CNX_Chem_20_04_amide1_img',
                  'CNX_Chem_14_06_buffer')
mruns, mfonts = [], {}
for i in (11, 13, 15):
    r_, f_ = geom_runs(MT, i)
    mruns += r_
    mfonts.update(f_)
QZK = run('QZK', 9.0, 20.0, 190.0, fixture_adv('QZK', 9.0))
MATT, m_blocks, m_keys, m_cont = plant('matt', mruns + [QZK], mfonts)
precondition('MATT groups into the three real `No` blocks plus the planted `QZK`',
             m_keys == ['No', 'No', 'No', 'QZK'], repr(m_keys))
precondition('MATT: every `No` is open, centre-aligned, here (figcontainers)',
             [(c['cls'], c['align']) for c in m_cont[:3]] == [('open', 'center')] * 3,
             repr([(c['cls'], c['why'], c['align']) for c in m_cont[:3]]))
SRC_CENTRES = [round(b[0]['x'] + b[0]['adv'] / 2, 4) for b in m_blocks[:3]]
SRC_BASES = [b[0]['y'] for b in m_blocks[:3]]
precondition("MATT: the source centres are the design's 151.70 / 52.78 / 288.94 (0.01)",
             all(abs(a - e) <= 0.01 for a, e in zip(SRC_CENTRES, (151.70, 52.78, 288.94))), repr(SRC_CENTRES))

oruns, ofonts = geom_runs(OX, 2)
OXD, o_blocks, o_keys, o_cont = plant('ox', oruns, ofonts)
K_OX = '4+|To|4–'
precondition('OX groups into the one real block, 3 visual lines', o_keys == [K_OX]
             and len(FT.visual_lines(o_blocks[0])) == 3, repr(o_keys))
precondition('OX is open or cell and centre-aligned here (figcontainers)',
             o_cont[0]['cls'] in ('open', 'cell') and o_cont[0]['align'] == 'center',
             f"{o_cont[0]['cls']} {o_cont[0]['why']} {o_cont[0]['align']}")
TO = next(r for r in oruns if r['text'] == 'To')
TO_CENTRE, TO_BASE = TO['x'] + TO['adv'] / 2, TO['y']

aruns, afonts = geom_runs(AM, 0)
AMD, a_blocks, a_keys, a_cont = plant('amide', aruns, afonts)
K_AM = 'C|H or R'
precondition('AMIDE groups into the one real block, 2 visual lines', a_keys == [K_AM]
             and len(FT.visual_lines(a_blocks[0])) == 2, repr(a_keys))
precondition("AMIDE is open or cell and right-aligned from its own frames here (figcontainers)",
             a_cont[0]['cls'] in ('open', 'cell') and a_cont[0]['align'] == 'right',
             f"{a_cont[0]['cls']} {a_cont[0]['why']} {a_cont[0]['align']} {a_cont[0].get('align_why')}")
HOR = next(r for r in aruns if r['text'] == 'H or R')
AM_END = HOR['x'] + HOR['adv']
C_END = max(r['x'] + r['adv'] for r in aruns)

bruns, bfonts = geom_runs(BF, 23)
BFD, b_blocks, b_keys, b_cont = plant('buffer', bruns, bfonts)
K_BF = '[CH3CO2H] is 11% of [CH3CO2|–]'
precondition('BUF groups into the one real block: 2 FT.lines, ONE visual line', b_keys == [K_BF]
             and len(FT.lines(b_blocks[0])) == 2 and len(FT.visual_lines(b_blocks[0])) == 1, repr(b_keys))
BUF_BASE = next(r for r in bruns if r['text'] == '[CH')['y']
precondition('the snowman U+2603 is in none of the four pinned Liberation faces (CH5 needs a missing glyph)',
             all(0x2603 not in TTFont(str(__import__('figis').face_path(k))).getBestCmap()
                 for k in ((False, False), (True, False), (False, True), (True, True))))

_STIXF = dict(first=32, last=255, subtype='/Type1', encoding='/WinAnsiEncoding', decodable=True, tounicode=True,
              unmapped_glyphs=[])
SX = {'PAGE/SX': dict(_STIXF, base='/ABCDEF+STIXGeneral-Regular'),
      'PAGE/SB': dict(_STIXF, base='/ABCDEF+STIXGeneral-Bold')}
a1, a3 = fixture_adv('QZA ', 9.0), fixture_adv(' QZB ', 9.0)
sruns = [run('QZA ', 9.0, 40.0, 30.0, a1), run('→', 9.0, 40.0 + a1, 30.0, 8.334, font='PAGE/SX'),
         run(' QZB ', 9.0, 40.0 + a1 + 8.334, 30.0, a3),
         run('+', 9.0, 40.0 + a1 + 8.334 + a3, 30.0, 5.13, font='PAGE/SB')]
STX, s_blocks, s_keys, s_cont = plant('stix', sruns, SX)
K_SX = 'QZA → QZB +'
precondition('STIX groups into one one-line block', s_keys == [K_SX] and len(FT.visual_lines(s_blocks[0])) == 1,
             repr(s_keys))
lruns = [run('2.54 QZ', 9.0, 40.0, 60.0, fixture_adv('2.54 QZ', 9.0)),
         run('QZM', 9.0, 40.0, 49.0, fixture_adv('QZM', 9.0), fill=RED)]
LOC, l_blocks, l_keys, l_cont = plant('loc', lruns, {})
K_LOC = '2.54 QZ|QZM'
precondition('LOC groups into one block of 2 visual lines', l_keys == [K_LOC] and len(FT.visual_lines(l_blocks[0])) == 2,
             repr(l_keys))
# RM (CH14): a rot-90 one-line label, then a 2-line label whose second line is bold, both lines centred on
# x 150. Every value-sheet line is rot 0 and shares its weight with its block's first run.
RM_SENT = 'QZtrill'
precondition('RM: the changed-line sentinel is wider in bold than in regular, by far more than the 0.01 tolerance',
             text_adv(RM_SENT, 9.0, True) - text_adv(RM_SENT, 9.0) > 2.0,
             f'{text_adv(RM_SENT, 9.0):.3f} regular / {text_adv(RM_SENT, 9.0, True):.3f} bold')
RX, RY, RADV = 250.0, 60.0, fixture_adv('QZ rot', 9.0)
rot_run = dict(run('QZ rot', 9.0, RX, RY, RADV), rot=90.0, tm=[0.0, 1.0, -1.0, 0.0, RX, RY])
MC, M0ADV, M1ADV = 150.0, fixture_adv('QZ ab', 9.0), text_adv('QZ cd', 9.0, True)
mix0 = run('QZ ab', 9.0, MC - M0ADV / 2, 150.0, M0ADV)
mix1 = run('QZ cd', 9.0, MC - M1ADV / 2, 139.0, M1ADV, font='PAGE/TT0')
RMD, rm_blocks, rm_keys, rm_cont = plant('rotmix', [rot_run, mix0, mix1], mfonts)
K_ROT, K_MIX = 'QZ rot', 'QZ ab|QZ cd'
precondition('RM groups into the rot-90 one-line block, then ONE block of 2 visual lines',
             rm_keys == [K_ROT, K_MIX] and len(FT.visual_lines(rm_blocks[1])) == 2, repr(rm_keys))
precondition("RM: mix's second line is in MattType's bold face, its first is not",
             'bold' in mfonts['PAGE/TT0']['base'].lower() and mix0['font'] not in mfonts, repr(mfonts['PAGE/TT0']['base']))
precondition('RM: both blocks are open and centre-aligned here (figcontainers)',
             [(c['cls'], c['align']) for c in rm_cont] == [('open', 'center')] * 2,
             repr([(c['cls'], c['why'], c['align'], c.get('align_why')) for c in rm_cont]))

# ── today: every plant composed with NO flag ──────────────────────────────────────────────
NOFLAG = {}
for nm, d in (('matt', MATT), ('ox', OXD), ('amide', AMD), ('buffer', BFD), ('stix', STX), ('loc', LOC),
               ('rotmix', RMD)):
    NOFLAG[nm] = compose(d)
    ok_compose(f'{nm} with no flag', NOFLAG[nm])
precondition("no flag: MATT keeps every block in English, as today",
             NOFLAG['matt']['report']['missing'] == ['No', 'No', 'No', 'QZK'], repr(NOFLAG['matt']['report']['missing']))
H1 = {}


def ch1():
    res = H1['res'] = compose(MATT, held={'No': 'QZX'})
    ok_compose('CH1', res)
    hl = held_lines(res).get('No', [])
    check('CH1 pre: the three `No` report a HELD line, each [open ...]',
          len(hl) == 3 and all(s and s[0][0] == 'open' for _, _, s in hl), repr(hl))
    els = elements(res['svg'])
    q = sorted([e for e in els if e['text'] == 'QZX'], key=lambda e: (-e['y'], e['x']))
    check('CH1a exactly three laid-out QZX, bold 9', len(q) == 3 and all(e['layout'] and e['bold']
          and abs(e['size'] - 9.0) < 1e-6 for e in q), repr([(e['x'], e['y'], e['size']) for e in q]))
    if len(q) == 3:
        got = [(round(e['y'], 3), round(e['x'] + text_adv('QZX', 9.0, True) / 2, 3)) for e in q]
        want = [(round(y, 3), c) for y, c in zip(SRC_BASES, SRC_CENTRES)]
        check('CH1b each QZX on its OWN source baseline and centred on its OWN source centre (0.01)',
              all(abs(g[0] - w[0]) <= 0.01 and abs(g[1] - w[1]) <= 0.01 for g, w in zip(got, want)),
              f'got {got} want {want}')
    else:
        check('CH1b each QZX on its OWN source baseline and centred on its OWN source centre (0.01)', False,
              f'{len(q)} QZX drawn')
    check('CH1c no `No` is drawn', not [e for e in els if e['text'] == 'No'],
          repr([e['raw'] for e in els if e['text'] == 'No']))
    check('CH1d `held` lists No three times, blocks 0 1 2, changed [0]',
          [(h.get('key'), h.get('block'), h.get('changed')) for h in rget(res, 'held') or []]
          == [('No', 0, [0]), ('No', 1, [0]), ('No', 2, [0])], repr(rget(res, 'held')))
    check('CH1e `No` is not in missing (only QZK is) and in no other list', rget(res, 'missing') == ['QZK']
          and 'No' not in (rget(res, 'translated', []) + rget(res, 'identity', []) + rget(res, 'runExact', [])),
          f"missing={rget(res, 'missing')} runExact={rget(res, 'runExact')}")
    check('CH1f heldErrors is empty and heldValuesPath names the file',
          rget(res, 'heldErrors') == [] and rget(res, 'heldValuesPath') == str(res['held_path']),
          f"heldErrors={rget(res, 'heldErrors')} heldValuesPath={rget(res, 'heldValuesPath')}")


def ch2():
    res = compose(OXD, held={K_OX: '4+\nQZQ\n4–'})
    ok_compose('CH2', res)
    hl = held_lines(res).get(K_OX, [])
    check('CH2 pre: HELD line changed [1], [open|cell ...] center', len(hl) == 1 and hl[0][1] == [1]
          and hl[0][2] and hl[0][2][0][0] in ('open', 'cell') and hl[0][2][0][2] == 'center', repr(hl))
    els, base = elements(res['svg']), elements(NOFLAG['ox']['svg'])
    precondition('CH2: today draws the five runs run-exact, `To` third', [e['text'] for e in base]
                 == ['4', '+', 'To', '4', '–'] and not any(e['layout'] for e in base), repr([e['text'] for e in base]))
    kept = [e['raw'] for e in els if not e['layout']]
    check('CH2a lines 0 and 2 are the no-flag <text> elements, byte for byte and in order',
          kept == [base[i]['raw'] for i in (0, 1, 3, 4)], f'{len(kept)} kept elements')
    lay = [e for e in els if e['layout']]
    ok = len(lay) == 1 and lay[0]['text'] == 'QZQ' and lay[0]['bold'] and abs(lay[0]['size'] - 7.0) < 1e-6
    check('CH2b one laid-out QZQ, bold 7', ok, repr([(e['text'], e['size'], e['bold']) for e in lay]))
    if ok:
        cx = lay[0]['x'] + text_adv('QZQ', 7.0, True) / 2
        check("CH2c ... on To's baseline 59.51 and centred on To's centre 166.94 (0.01)",
              abs(lay[0]['y'] - TO_BASE) <= 0.01 and abs(cx - TO_CENTRE) <= 0.01,
              f"y={lay[0]['y']:.3f} centre={cx:.3f} (To {TO_BASE:.3f} / {TO_CENTRE:.3f})")
    else:
        check("CH2c ... on To's baseline 59.51 and centred on To's centre 166.94 (0.01)", False, 'no QZQ')
    check('CH2d no `To` is drawn', 'To' not in [e['text'] for e in els])
    check("CH2e the unchanged lines' STIX runs are counted as today (stix identical)",
          rget(res, 'stix') == NOFLAG['ox']['report']['stix'] and rget(res, 'stix')['skipped'] == [],   # M6: the BoldItalic +/– are now drawn, not skipped
          f"{rget(res, 'stix')} vs {NOFLAG['ox']['report']['stix']}")
    check('CH2f held = [{key, block 0, changed [1]}]', [(h.get('key'), h.get('block'), h.get('changed'))
          for h in rget(res, 'held') or []] == [(K_OX, 0, [1])], repr(rget(res, 'held')))
    precondition("CH2: today's run names nothing in localized (no run of OX changes under numloc)",
                 NOFLAG['ox']['report']['localized'] == [], repr(NOFLAG['ox']['report']['localized']))
    check("CH2g localized is today's - line 2's drawn runs are compared with line 2's OWN source runs, not "
          "with `To` (a laid-out line advances the offset)", rget(res, 'localized') == NOFLAG['ox']['report']['localized'],
          f"localized={rget(res, 'localized')} today={NOFLAG['ox']['report']['localized']}")


def ch3():
    res = compose(AMD, held={K_AM: 'C\nQZX R'})
    ok_compose('CH3', res)
    hl = held_lines(res).get(K_AM, [])
    check('CH3 pre: HELD line changed [1], [open|cell ...] right', len(hl) == 1 and hl[0][1] == [1]
          and hl[0][2] and hl[0][2][0][0] in ('open', 'cell') and hl[0][2][0][2] == 'right', repr(hl))
    els, base = elements(res['svg']), elements(NOFLAG['amide']['svg'])
    check('CH3a `C` is the no-flag element, byte for byte',
          [e['raw'] for e in els if e['text'] == 'C'] == [e['raw'] for e in base if e['text'] == 'C'] != [])
    lay = [e for e in els if e['layout']]
    if len(lay) == 1 and lay[0]['text'] == 'QZX R':
        end = lay[0]['x'] + text_adv('QZX R', 9.0)
        check('CH3b the changed line ENDS at its own source end 87.26 (0.01), not the block end 104.52',
              abs(end - AM_END) <= 0.01, f'end={end:.3f} own={AM_END:.3f} block={C_END:.3f}')
    else:
        check('CH3b the changed line ENDS at its own source end 87.26 (0.01), not the block end 104.52', False,
              repr([e['text'] for e in lay]))
    check('CH3c no `H or R` is drawn', 'H or R' not in [e['text'] for e in els])


def ch4():
    res = compose(BFD, held={K_BF: B3})
    ok_compose('CH4', res)
    hl = held_lines(res).get(K_BF, [])
    check('CH4 pre: HELD line changed [0], one [cls step]', len(hl) == 1 and hl[0][1] == [0] and len(hl[0][2]) == 1,
          repr(hl))
    lay = [e for e in elements(res['svg']) if e['layout']]
    body = [e for e in lay if abs(e['size'] - 9.0) < 1e-6]
    check('CH4a ONE laid-out line: every 9 pt segment on the source baseline 150.365 (0.01)',
          bool(body) and all(abs(e['y'] - BUF_BASE) <= 0.01 for e in body),
          f"baselines={sorted({round(e['y'], 3) for e in body})}")
    check('CH4b the segments, in order, are the decoded value', ''.join(e['text'] for e in lay) == B3_DRAWN,
          repr([e['text'] for e in lay]))
    subs = [e for e in lay if e['text'] in ('3', '2')]
    check('CH4c the subscripts 3 2 3 2 at 7.0002 pt, shifted -2.9997 pt (0.002)',
          [e['text'] for e in subs] == ['3', '2', '3', '2']
          and all(abs(e['size'] - 9 * 0.7778) < 0.001 and abs((e['y'] - BUF_BASE) - 9 * -0.3333) < 0.002 for e in subs),
          repr([(e['text'], e['size'], round(e['y'] - BUF_BASE, 4)) for e in subs]))
    ch = [e for e in lay if e['text'] == '–']
    ok = len(ch) == 1 and abs(ch[0]['size'] - 9 * 0.7778) < 0.001 and abs((ch[0]['y'] - BUF_BASE) - 9 * 0.4444) < 0.002
    check('CH4d the charge is U+2013 at 7.0002 pt, shifted +3.9996 pt (0.002)', ok,
          repr([(e['text'], e['size'], round(e['y'] - BUF_BASE, 4)) for e in ch]))
    if ok and subs:
        last = subs[-1]
        check('CH4e ... drawn AFTER the last subscript, not kerned back over it',
              ch[0]['x'] >= last['x'] + text_adv('2', 9 * 0.7778) - 0.01, f"charge x={ch[0]['x']} last 2 x={last['x']}")
    else:
        check('CH4e ... drawn AFTER the last subscript, not kerned back over it', False, 'no charge')
    precondition('CH4: the value itself holds script characters (the census below is not vacuous)',
                 sum(SCRIPT_RANGE[0] <= ord(c) <= SCRIPT_RANGE[1] for c in B3) == 5)
    n = sum(SCRIPT_RANGE[0] <= ord(c) <= SCRIPT_RANGE[1] for c in res['svg'])
    check('CH4f 0 characters in U+2070-209F anywhere in translated.svg', n == 0, f'{n} found')
    check('CH4g held lists the key once; missing is empty', held_keys(res) == [K_BF] and rget(res, 'missing') == [],
          f"held={held_keys(res)} missing={rget(res, 'missing')}")


H5 = {}


def ch5():
    for arm, value, reason in (('a', 'QZ☃', 'no-glyph:U+2603'), ('b', 'QZX\nQZQ', 'line-count')):
        res = H5[arm] = compose(BFD, held={K_BF: value})
        ok_compose(f'CH5{arm}', res)
        check(f'CH5{arm} translated.svg is byte-identical to the no-flag run (the block drawn run-exact, as today)',
              res['svg'] == NOFLAG['buffer']['svg'])
        check(f'CH5{arm} translated.png is byte-identical to the no-flag run', res['png'] == NOFLAG['buffer']['png'])
        check(f'CH5{arm} the key is in missing AND in heldErrors ({reason}), held is []',
              rget(res, 'missing') == [K_BF] and err_view(res) == [(K_BF, 0, reason)] and rget(res, 'held') == [],
              f"missing={rget(res, 'missing')} heldErrors={rget(res, 'heldErrors')} held={rget(res, 'held')}")
    e = (rget(H5['b'], 'heldErrors') or [{}])[0]
    check('CH5c line-count carries {value 2, visual 1}', (e.get('value'), e.get('visual')) == (2, 1), repr(e))


def ch6():
    a = compose(MATT, control=True)
    b = compose(MATT, control=True, held=str(TD / 'no-such-held-values.json'))
    ok = b['rc'] == 0 and b['svg'] is not None and b['png'] is not None
    check('CH6a --control with a NONEXISTENT --held-values exits 0 and writes control.png/.svg', ok,
          '' if ok else b['stderr'][-300:])
    check('CH6b control.svg and control.png are byte-identical to --control alone',
          a['svg'] is not None and a['svg'] == b['svg'] and a['png'] == b['png'])
    check('CH6c heldValuesPath is null and both held lists are empty',
          rget(b, 'heldValuesPath') is None and rget(b, 'held', []) == [] and rget(b, 'heldErrors', []) == [],
          f"heldValuesPath={rget(b, 'heldValuesPath')}")


def ch7():
    res = compose(MATT, held={}, config='/where/the/config/is.json')
    ok_compose('CH7', res)
    base = NOFLAG['matt']
    check('CH7a translated.svg and translated.png are byte-identical to no flag',
          res['svg'] == base['svg'] and res['png'] == base['png'])
    strip = ('heldValuesPath', 'heldConfigPath', 'translationsPath')
    r1 = {k: v for k, v in res['report'].items() if k not in strip}
    r0 = {k: v for k, v in base['report'].items() if k not in strip}
    check('CH7b the report is identical but for heldValuesPath / heldConfigPath (and the tr file name)', r1 == r0,
          repr(sorted(set(r1.items()) ^ set(r0.items()), key=str)[:4]) if r1 != r0 else '')
    check('CH7c ... which name the file and its configPath; no flag reports both null',
          rget(res, 'heldValuesPath') == str(res['held_path']) and rget(res, 'heldConfigPath') == '/where/the/config/is.json'
          and 'heldValuesPath' in base['report'] and base['report']['heldValuesPath'] is None
          and base['report'].get('heldConfigPath', 'absent') is None,
          f"flag {rget(res, 'heldValuesPath')!r} {rget(res, 'heldConfigPath')!r}; no flag "
          f"{base['report'].get('heldValuesPath', 'absent')!r} {base['report'].get('heldConfigPath', 'absent')!r}")


def ch8():
    a = compose(MATT, held=str(TD / 'no-such-held-values.json'))
    check('CH8a a nonexistent --held-values path: exit != 0 and nothing written',
          a['rc'] != 0 and not any(a['exists'][n] for n in ('compose-report.json', 'translated.png', 'translated.svg')),
          f"exit {a['rc']} wrote {[n for n, v in a['exists'].items() if v]}")
    check('CH8b ... and stderr names the unreadable file', 'unreadable' in a['stderr'] and 'no-such-held-values' in a['stderr'],
          a['stderr'].strip().splitlines()[-1][:200] if a['stderr'].strip() else '(empty stderr)')
    b = compose(MATT, held={'No': 'QZX'}, basename='CNX_Fixture_other')
    check('CH8c a file written for ANOTHER basename: exit != 0 and nothing written',
          b['rc'] != 0 and not any(b['exists'][n] for n in ('compose-report.json', 'translated.png', 'translated.svg')),
          f"exit {b['rc']} wrote {[n for n, v in b['exists'].items() if v]}")
    check('CH8d ... and stderr names both basenames', 'CNX_Fixture_other' in b['stderr'] and BASENAME in b['stderr'],
          b['stderr'].strip().splitlines()[-1][:200] if b['stderr'].strip() else '(empty stderr)')


def consumers_parse(stdout):
    """test_blockkey_consumers.py's OWN parse rule - its source, cut from that file and exec'd, so this
    follows the rule if the rule changes."""
    src = CONSUMERS.read_text(encoding='utf-8')
    a = src.index('compose_keys, grabbing = [], False')
    code = src[a:src.index('\n\n', a)]
    ns = {'stdout': stdout, 'ast': ast}
    exec(code, ns)                              # noqa: S102 - a committed file of this tree
    return ns['compose_keys']


def ch9():
    src = CONSUMERS.read_text(encoding='utf-8')
    precondition("CH9: test_blockkey_consumers' parse rule is where this test cuts it, and keys on 'no translation'",
                 "'no translation' in line" in src[src.index('compose_keys, grabbing = [], False'):])
    r1 = H1.get('res')
    precondition('CH9: CH1 ran', r1 is not None and r1['report'] is not None)
    check("CH9a the consumers' parse of CH1's stdout yields exactly report.missing (non-empty)",
          consumers_parse(r1['stdout']) == r1['report']['missing'] == ['QZK'],
          f"parsed {consumers_parse(r1['stdout'])} missing {r1['report']['missing']}")
    lines = r1['stdout'].splitlines()
    i = next((k for k, s in enumerate(lines) if 'drawn from heldBlockValues' in s), None)
    check('CH9b the held NOTE section opens after a blank line', i is not None and i > 0 and lines[i - 1] == '',
          repr(lines[i - 1:i + 2]) if i else 'no NOTE section')
    r5 = H5.get('a')
    precondition('CH9: CH5 ran', r5 is not None and r5['report'] is not None)
    check("CH9c the consumers' parse of CH5's stdout yields exactly report.missing",
          consumers_parse(r5['stdout']) == r5['report']['missing'] == [K_BF], repr(consumers_parse(r5['stdout'])))
    l5 = r5['stdout'].splitlines()
    j = next((k for k, s in enumerate(l5) if s.startswith('!!') and 'heldBlockValues' in s), None)
    check("CH9d the `!!` refusal header opens after a blank line and does not contain 'no translation'",
          j is not None and l5[j - 1] == '' and 'no translation' not in l5[j], repr(l5[j - 1:j + 2]) if j else 'no header')
    close1, close0 = lines[-1], NOFLAG['matt']['stdout'].splitlines()[-1]
    check("CH9e the closing line gains ', 3 held' only when something was held",
          close1.endswith('(0 translated, 1 english-kept, 3 held)') and close0.endswith('(0 translated, 4 english-kept)'),
          f'{close1!r} / {close0!r}')


def ch10():
    res = compose(MATT, tr={'No': 'QZT'}, held={'No': 'QZX'})
    ok_compose('CH10', res)
    els = elements(res['svg'])
    check('CH10a the translation is drawn (3 laid-out QZT), the held value is not (0 QZX)',
          len([e for e in els if e['text'] == 'QZT' and e['layout']]) == 3 and not [e for e in els if e['text'] == 'QZX'],
          repr([e['text'] for e in els]))
    check('CH10b heldErrors names in-translations for each occurrence; held is []; No x3 is translated',
          err_view(res) == [('No', 0, 'in-translations'), ('No', 1, 'in-translations'), ('No', 2, 'in-translations')]
          and rget(res, 'held') == [] and rget(res, 'translated') == ['No', 'No', 'No'],
          f"heldErrors={err_view(res)} held={rget(res, 'held')} translated={rget(res, 'translated')}")


def ch11():
    res = compose(MATT, held={'No': 'QZX', 'QZNOPE': 'QZX'})
    ok_compose('CH11', res)
    check('CH11a a configured key absent from the figure: heldErrors no-block, block null',
          err_view(res) == [('QZNOPE', None, 'no-block')], repr(rget(res, 'heldErrors')))
    check('CH11b the keys that are present are still drawn', held_keys(res) == ['No', 'No', 'No'], repr(held_keys(res)))


def ch12():
    res = compose(STX, held={K_SX: 'QZC → QZD +'})
    ok_compose('CH12', res)
    sk = [s for s in (rget(res, 'stix') or {}).get('skipped', []) if s.get('key') == K_SX]
    check("CH12a the changed line's STIX runs are named per run: the eligible one `held`, the other face `other-face`",
          sk == [{'key': K_SX, 'reason': 'held'}, {'key': K_SX, 'reason': 'other-face'}]
          and K_SX not in (rget(res, 'stix') or {}).get('drawn', []), repr(rget(res, 'stix')))
    els = elements(res['svg'])
    check('CH12b ... and drawn in FigIS as part of the laid-out line, never in FigSym',
          [(e['text'], e['family']) for e in els if e['layout']] == [('QZC → QZD +', 'FigIS')]
          and not [e for e in els if e['family'] == 'FigSym'], repr([(e['text'], e['family']) for e in els]))
    base = NOFLAG['stix']['report']['stix']
    check('CH12c CONTROL: kept (no flag), the same run IS drawn in FigSym', K_SX in base['drawn'], repr(base))
    check('CH12d held lists the key once', held_keys(res) == [K_SX], repr(held_keys(res)))


def ch13():
    res = compose(LOC, held={K_LOC: '2,54 QZ\nQZX'})
    ok_compose('CH13', res)
    base = NOFLAG['loc']
    precondition('CH13: today draws line 0 localised, `2,54 QZ`, and names the block in localized',
                 [e['text'] for e in elements(base['svg'])] == ['2,54 QZ', 'QZM'] and base['report']['localized'] == [K_LOC],
                 repr([e['text'] for e in elements(base['svg'])]))
    els = elements(res['svg'])
    check("CH13a the unchanged line is the no-flag `2,54 QZ` element, byte for byte",
          [e['raw'] for e in els if not e['layout']] == [elements(base['svg'])[0]['raw']],
          repr([e['text'] for e in els if not e['layout']]))
    check('CH13b the block is named in localized, as today, and held lists it with changed [1]',
          rget(res, 'localized') == [K_LOC] and [(h.get('key'), h.get('changed')) for h in rget(res, 'held') or []]
          == [(K_LOC, [1])], f"localized={rget(res, 'localized')} held={rget(res, 'held')}")
    lay, b0 = [e for e in els if e['layout']], elements(base['svg'])
    fills = (re.search(r'fill="([^"]*)"', b0[0]['raw']).group(1), re.search(r'fill="([^"]*)"', b0[1]['raw']).group(1))
    precondition("CH13: today's two lines are drawn in two different fills", fills[0] != fills[1], repr(fills))
    check("CH13c the changed line is one laid-out QZX, in its OWN line's fill (the no-flag QZM's), not the block's first run's",
          [e['text'] for e in lay] == ['QZX'] and re.search(r'fill="([^"]*)"', lay[0]['raw']).group(1) == fills[1],
          repr([e['raw'] for e in lay]))


def ch14():
    res = compose(RMD, held={K_ROT: RM_SENT, K_MIX: 'QZ ab\n' + RM_SENT})
    ok_compose('CH14', res)
    check('CH14 pre: held names the rot-90 block (changed [0]) and the mixed block (changed [1])',
          [(h.get('key'), h.get('block'), h.get('changed')) for h in rget(res, 'held') or []]
          == [(K_ROT, 0, [0]), (K_MIX, 1, [1])] and rget(res, 'heldErrors') == [],
          f"held={rget(res, 'held')} heldErrors={rget(res, 'heldErrors')}")
    lay = [e for e in elements(res['svg']) if e['layout'] and e['text'] == RM_SENT]
    precondition('CH14: two laid-out lines draw the sentinel', len(lay) == 2, repr([(e['text'], e['raw']) for e in lay]))
    rot, mix = lay
    # rot 90: along = y and proj = -x, so the pen sits at x = the run's own x, and along the text (up the
    # page, y) the line is centred on the run's own extent RY..RY+RADV.
    centre = rot['y'] + text_adv(RM_SENT, 9.0) / 2
    check('CH14a the rot-90 line is drawn ROTATED, its pen at the run\'s own x and centred on its own extent '
          'along the text (0.01)', 'transform="rotate(-90.0000 ' in rot['raw'] and abs(rot['x'] - RX) <= 0.01
          and abs(centre - (RY + RADV / 2)) <= 0.01,
          f"x={rot['x']:.3f} (run {RX}) centre={centre:.3f} (run {RY + RADV / 2:.3f}) {rot['raw'][:160]}")
    centre = mix['x'] + text_adv(RM_SENT, 9.0, True) / 2
    check("CH14b the bold changed line is drawn bold, on its own baseline 139, and centred on its own source "
          "line - measured in ITS weight, not its block's first run's (0.01)",
          mix['bold'] and abs(mix['y'] - 139.0) <= 0.01 and abs(centre - MC) <= 0.01,
          f"bold={mix['bold']} y={mix['y']:.3f} centre={centre:.3f} (source {MC}; a regular measure would put it "
          f"at {MC + (text_adv(RM_SENT, 9.0, True) - text_adv(RM_SENT, 9.0)) / 2:.3f})")
    check("CH14c the mixed block's unchanged line is the no-flag element, byte for byte",
          [e['raw'] for e in elements(res['svg']) if e['text'] == 'QZ ab']
          == [e['raw'] for e in elements(NOFLAG['rotmix']['svg']) if e['text'] == 'QZ ab'] != [])


for label, fn in (('CH1', ch1), ('CH2', ch2), ('CH3', ch3), ('CH4', ch4), ('CH5', ch5), ('CH6', ch6),
                  ('CH7', ch7), ('CH8', ch8), ('CH9', ch9), ('CH10', ch10), ('CH11', ch11), ('CH12', ch12),
                  ('CH13', ch13), ('CH14', ch14)):
    attempt(label, fn)
finish()
