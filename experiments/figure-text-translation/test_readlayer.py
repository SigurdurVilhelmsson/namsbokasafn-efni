#!/usr/bin/env python3
"""Tests for the pdfplumber read layer. Run:

    FIGTEXT_PYLIBS=./pylibs python3 test_readlayer.py

Plain asserts, like test_sources.py — no pytest in this tree.

🔴 THIS SUITE IS NOT ALL REFUSALS (§C137 D11). Cases 1, 3, 5, 5b, 6, 8, 9 and 14 FAIL if
the code does not actually work: each one is anchored on a figure where the program being
replaced demonstrably fails, and several plant the evidence of the defect first and then
assert the fix — a control, so that a harness which broke everything equally could not
read as a pass.

  CASE 14 covers strip-text.py rather than the reader. It carries THREE synthetic
  fixtures, which is a deviation worth naming: measured over 110 real figures, NO single
  /Form holds both text and visible artwork (Illustrator isolates text into its own
  form), and neither a form referenced twice nor a reference cycle occurs at all. So the
  shapes that the visited set, the recursion and the non-greedy regex exist to survive
  are not in the corpus. Precedent is ruling R-7, which kept the `(cid:` detector against
  a synthetic fixture once the real corpus stopped exercising it.

⚠️ TWO CASES DEVIATE FROM THE PLAN'S WORDING, BOTH BECAUSE THE CORPUS DOES NOT CONTAIN
THE FIXTURE THE PLAN NAMED. Both are recorded here rather than in a report only:

  CASE 3. The plan says to use one of the 7 measured form-text-only figures with a
  bare-resource-key conflict and assert "the Bold one lands in compose.py's BOLD set while
  the Regular one does not". Measured over all 532 PDF figures in the text buckets: 19
  figures have such a conflict, 9 of them involve a Bold face — and NONE of those 9 is in
  form-text-only. All 7 form-text conflicts are Regular vs ITALIC. So the sentence names a
  figure that does not exist, exactly as ruling R-7 found for the old case 5. The purpose
  is kept and split across two real figures: CNX_Chem_07_06_BeF2 for the BOLD half (bare
  'TT0' is Bold at PAGE scope and Regular inside three /Form XObjects, and both are drawn),
  CNX_Chem_07_05_CH4bond_img for the form-scope half (it is one of the 7, and the richest
  — 'TT0' and 'TT1' both conflict).

  CASE 5b is ADDED, not prescribed. `size = char['size']` turns out to be right only for
  UPRIGHT text; see `readlayer._visual_size`. The plan could not have known, because the
  R-5 measurement that produced the prescription compared hypot() against char['size'] and
  both are correct when the text is upright.
"""
import collections
import math
import os
import sys
import tempfile
from pathlib import Path

import _deps  # noqa: F401  — sys.path, never process.cwd()

import pdfplumber  # noqa: E402
import pikepdf  # noqa: E402
import read_layer_accept as H  # noqa: E402  — for read_baseline: the program being replaced
import readlayer as RL  # noqa: E402

HERE = Path(__file__).resolve().parent
COMPOSE = (HERE / 'compose.py').read_text()

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''))
    if not ok:
        fails.append(label)


resolve = H.resolver()


def read_figure(name):
    """Resolve, stage exactly as the harness does, and read. -> (runs, meta, outcome)."""
    path, _ = resolve(name)
    assert path, f'fixture {name} did not resolve — check sources.local.json'
    with H.staged(path) as (src, err):
        assert not err, f'staging {name} failed: {err}'
        return RL.read(src)


def chars_of(name):
    """The raw pdfplumber chars for a figure, staged the same way."""
    path, _ = resolve(name)
    with H.staged(path) as (src, err):
        assert not err, err
        target, temp = RL._stage(src)
        try:
            with pdfplumber.open(str(target)) as doc:
                return doc.pages[0].chars
        finally:
            if temp:
                os.unlink(temp)


# ── 1. A FORM-TEXT figure returns non-empty runs — where the old reader CRASHES ──────
# The positive control is in the same case: the baseline must actually raise here, or the
# fixture has stopped being evidence and case 1 passes for the wrong reason.
print('\n[1] a form-text figure reads, and the reader being replaced raises on it')
path, _ = resolve('CNX_Chem_02_00_Biomarkers')
with H.staged(path) as (src, _e):
    b_runs, b_meta, b_outcome = H.read_baseline(src)
    runs, meta, outcome = RL.read(src)
text = ''.join(r['text'] for r in runs)
check('1a CONTROL — the baseline still raises on this figure',
      b_outcome == 'raises' and 'AttributeError' in (b_meta.get('error') or ''),
      f"baseline outcome={b_outcome} error={b_meta.get('error')!r}")
check('1b the candidate reads it', outcome == 'reads' and len(text) == 19,
      f'{len(runs)} runs, {len(text)} chars: {text!r}')

# ── 2. THE JOIN-KEY PROPERTY: every run['font'] is a key of meta['fonts'] ────────────
print('\n[2] every run font resolves in meta.fonts (the cross-reader join key)')
JOIN_FIGURES = ['CNX_Chem_02_00_Biomarkers', 'CNX_Chem_00_AA_PeriodicPU_img',
                'CNX_Chem_01_01_SciMethod', 'CNX_Chem_07_05_CH4bond_img',
                'CNX_Chem_01_02_decomp', 'CNX_Chem_00_EE_Density_img',
                'CNX_Chem_21_06_IonRadSpec', 'CNX_Chem_20_01_alkyls']
unresolved, total_runs = [], 0
for name in JOIN_FIGURES:
    runs, meta, _ = read_figure(name)
    total_runs += len(runs)
    for run in runs:
        if run['font'] not in meta['fonts']:
            unresolved.append((name, run['font']))
        if not (meta['fonts'][run['font']].get('base') if run['font'] in meta['fonts']
                else None):
            unresolved.append((name, f"{run['font']} has no base"))
check('2 every run font is a key of meta.fonts, and every entry carries `base`',
      not unresolved and total_runs > 0,
      f'{total_runs} runs over {len(JOIN_FIGURES)} figures '
      f'(non-vacuity: must be > 0); unresolved {unresolved[:3]}')

# ── 3. A SCOPE-QUALIFIED KEY SURVIVES A REAL CONFLICT ───────────────────────────────
print('\n[3] one bare resource key naming two BaseFonts resolves to two distinct keys')
# compose.py cannot be imported (module-level cairo surfaces and file reads), so its two
# load-bearing expressions are PINNED AS SOURCE here and then applied. A copy that is not
# checked against its original is how the two drift.
BOLD_EXPR = "BOLD = {k for k, v in meta['fonts'].items() if 'bold' in v['base'].lower()}"
check('3a PIN — compose.py still derives BOLD exactly as this test assumes',
      BOLD_EXPR in COMPOSE, 'else the copy below has drifted from compose.py')

runs, meta, _ = read_figure('CNX_Chem_07_06_BeF2')
used = {r['font'] for r in runs}
bold_set = {k for k, v in meta['fonts'].items() if 'bold' in v['base'].lower()}
bold_used = {k for k in used if k in bold_set}
plain_used = {k for k in used if k not in bold_set}
bare = collections.Counter(k.rsplit('/', 1)[-1] for k in used)
check('3b BeF2: the two faces behind bare key TT0 get DISTINCT scope-qualified keys',
      len(used) == 2 and bare['TT0'] == 2 and len(bold_used) == 1 and len(plain_used) == 1,
      f'used={sorted(used)} bold={sorted(bold_used)} regular={sorted(plain_used)}')
check('3c BeF2: the Bold face lands in compose.py BOLD and the Regular one does not',
      all('Bold' in meta['fonts'][k]['base'] for k in bold_used)
      and all('Bold' not in meta['fonts'][k]['base'] for k in plain_used)
      and bold_used and plain_used,
      f'{ {k: meta["fonts"][k]["base"] for k in sorted(used)} }')

runs, meta, _ = read_figure('CNX_Chem_07_05_CH4bond_img')
used = {r['font'] for r in runs}
italic = {k for k in used if 'Italic' in meta['fonts'][k]['base']}
regular = {k for k in used if k not in italic}
form_scoped = {k for k in used if k.startswith('PAGE/Fm')}
check('3d CH4bond (form-text): Regular and Italic behind one bare key stay separate, '
      'and the keys are FORM-scoped',
      len(italic) >= 1 and len(regular) >= 1 and form_scoped == used,
      f'used={sorted(used)}')

# ── 4. x/y ARE BASELINE ORIGINS, TO THE DIGIT ───────────────────────────────────────
print('\n[4] x/y come from the matrix, not from the bbox')
runs, meta, _ = read_figure('CNX_Chem_02_00_Biomarkers')
first = runs[0]
raw = chars_of('CNX_Chem_02_00_Biomarkers')[0]
check('4a CONTROL — y0 really is a different number here (the descender)',
      abs(float(raw['y0']) - 53.9312) < 1e-3 and abs(float(raw['matrix'][5]) - 56.6582) < 1e-3,
      f"y0={raw['y0']} matrix[5]={raw['matrix'][5]} — 2.727pt apart")
check('4b y is the baseline origin, to the digit',
      first['y'] == 56.6582 and first['x'] == 417.7153,
      f"x={first['x']} y={first['y']} (must be 417.7153 / 56.6582, NOT y0 53.9312)")

# ── 5. `size` IS CORRECT ON AN EPS FIGURE ───────────────────────────────────────────
print('\n[5] size on an EPS figure is the real size, not the unit matrix scale')
EPS_FIG = 'CNX_Chem_00_BB_Dependence_img'
runs, meta, _ = read_figure(EPS_FIG)
labelled = [r for r in runs if 'Dependence' in r['text']]
hypots = {round(math.hypot(r['tm'][0], r['tm'][1]), 6) for r in runs}
check('5a CONTROL — the hypot() trap is LIVE on this fixture (gs leaves it unit-scaled)',
      hypots == {1.0}, f'hypot(tm[0],tm[1]) over all runs = {sorted(hypots)} (must be 1.0)')
check('5b size is 9.0 and not 1.0',
      len(labelled) == 1 and labelled[0]['size'] == 9.0,
      f"{[(r['text'], r['size']) for r in labelled]}")

# ── 5c. `size` IS ROTATION-INVARIANT, AND STILL AGREES WITH char['size'] UPRIGHT ────
print('\n[5c] size survives rotation, and is unchanged on the upright text R-5 measured')
ROT_FIG = 'CNX_Chem_00_EE_Density_img'
raw = chars_of(ROT_FIG)
rotated = [c for c in raw if abs(math.degrees(math.atan2(c['matrix'][1], c['matrix'][0]))) > 1]
raw_sizes = {round(float(c['size']), 3) for c in rotated}
check('5c-i CONTROL — pdfplumber\'s own size really does vary per glyph when rotated',
      len(rotated) > 0 and len(raw_sizes) > 1,
      f'{len(rotated)} rotated chars, char["size"] takes {len(raw_sizes)} distinct '
      f'values: {sorted(raw_sizes)[:6]}')
# ⚠️ NOT "constant": this label is `Density (kg/m3)` and the 3 is a REAL 7pt superscript,
# so a constant-size assertion would be asserting a defect.
#
# 🔴 ASSERTED ON THE RUNS `read()` EMITS, NOT ON `_visual_size` DIRECTLY. An earlier version
# called the helper itself and was MISSED by the mutation that matters: reverting
# `_prepare` to `char['size']` — the plan's own prescription — left `_visual_size` correct
# and simply stopped calling it, so a helper-level assertion passed while the reader was
# broken. A gate never called is a gate that does not exist.
emitted = [(r['text'], r['size']) for r in read_figure(ROT_FIG)[0] if abs(r['rot']) > 1]
check('5c-ii the RUNS carry the true size — 9.0 for the label, 7.0 for the superscript, '
      'and the superscript is not flattened into it',
      emitted == [('Density (kg/m', 9.0), ('3', 7.0), (')', 9.0)],
      f'{emitted}')
# The compatibility half: R-5's population is UPRIGHT text, where char['size'] is right.
disagree = []
for name in ['CNX_Chem_02_00_Biomarkers', EPS_FIG, 'CNX_Chem_00_AA_PeriodicPU_img']:
    for c in chars_of(name):
        m = [float(v) for v in c['matrix']]
        if abs(math.degrees(math.atan2(m[1], m[0]))) > 1e-9:
            continue
        if abs(RL._visual_size(c, m) - float(c['size'])) > 1e-6:
            disagree.append((name, c['text'], c['size'], RL._visual_size(c, m)))
check('5c-iii on UPRIGHT chars it still equals char["size"] — R-5 is not undone',
      not disagree, f'{len(disagree)} disagreements: {disagree[:3]}')

# ── 6. `adv` IS USER-SPACE AND INCLUDES Tc/Tw/TJ KERNING ────────────────────────────
print('\n[6] adv is a user-space advance, not the unscaled glyph width')
runs, meta, _ = read_figure('CNX_Chem_02_00_Biomarkers')
raw = chars_of('CNX_Chem_02_00_Biomarkers')[0]
check('6a CONTROL — char["adv"] on this glyph really is the 0.722 text-space width',
      abs(float(raw['adv']) - 0.722) < 1e-3 and abs(float(raw['size']) - 9.0) < 1e-6,
      f"char adv={raw['adv']} size={raw['size']} — ratio is exactly the font size")
check('6b the run carries 6.498, not 0.722',
      abs(runs[0]['adv'] - 6.498) < 1e-3, f"adv={runs[0]['adv']}")

# Tc/Tw are exactly what a sum of glyph widths omits, so the assertion needs a figure that
# HAS them. Measured: 23 figures in the corpus carry a non-zero Tc or Tw; this one has 5
# of each. The alternative derivation is computed here independently and must DISAGREE.
#
# 🔴 AGAIN, ASSERTED ON THE EMITTED `run['adv']`. An earlier version re-derived BOTH sides
# inside the test and never looked at what `_to_runs` wrote, so replacing the run's advance
# with the forbidden `sum(char['adv'])` passed the whole suite — exit 0, nothing failed.
# Case 6b cannot cover it either: Biomarkers' runs are single characters, where the
# positional advance and the sum are equal by construction.
TCTW_FIG = 'CNX_Chem_01_05_SigDigits4_img'
prepared = RL._prepare(chars_of(TCTW_FIG), lambda f: str(f), collections.Counter())
groups, current = [], []
for char in prepared:
    if current and RL._continues(current[-1], char):
        current.append(char)
    else:
        if current:
            groups.append(current)
        current = [char]
if current:
    groups.append(current)
emitted_runs = read_figure(TCTW_FIG)[0]
paired = len(groups) == len(emitted_runs)
differing, multi = [], 0
for g, run in zip(groups, emitted_runs):
    if len(g) < 2 or run['text'] != ''.join(c['text'] for c in g):
        continue
    multi += 1
    naive = sum(c['adv'] for c in g)          # the forbidden sum-of-widths derivation
    if abs(run['adv'] - naive) > 0.01:
        differing.append((run['text'], run['adv'], round(naive, 3)))
check('6c the EMITTED run adv differs from a sum of glyph widths on a Tc/Tw figure',
      paired and len(differing) > 0 and multi > 0,
      f'{len(differing)} of {multi} multi-char runs differ (must be > 0, or the run advance '
      f'is a width-sum and R-6 is violated): {differing[:3]}')

# ── 7. `fill` IS A 5-TUPLE compose.cmyk() CAN UNPACK ────────────────────────────────
print('\n[7] fill unpacks in compose.cmyk')
check('7a PIN — compose.cmyk still unpacks exactly five values',
      '_, c, m, y, k = f' in COMPOSE, 'else the arity asserted below is wrong')
bad, seen_fills = [], 0
for name in JOIN_FIGURES + [EPS_FIG]:
    runs, meta, _ = read_figure(name)
    for run in runs:
        f = run['fill']
        if f is None:
            continue
        seen_fills += 1
        try:
            _, c, m, y, k = f              # compose.cmyk's own unpack, verbatim
        except (ValueError, TypeError):
            bad.append((name, f))
            continue
        if f[0] != 'cmyk' or not all(isinstance(v, (int, float)) for v in (c, m, y, k)):
            bad.append((name, f))
check('7b every non-None fill is ("cmyk", c, m, y, k)',
      not bad and seen_fills > 0,
      f'{seen_fills} fills checked (non-vacuity: must be > 0); bad {bad[:3]}')

# 7c is the VALUE assertion 7b cannot make. 7b is a SHAPE test — arity and types — over a
# population (JOIN_FIGURES + EPS_FIG) that contains none of the three figures below, so a
# wrong value passed it by construction. `_fill` used to dispatch on the COMPONENT COUNT,
# which put a 1-component /Separation tint into the DeviceGray branch: tint 1.0 is FULL
# colorant, DeviceGray 1.0 is white, so 91 solid-black characters came back as
# ('cmyk',0,0,0,0) -> RGB (1,1,1) and svgout published fill="#ffffff" on them. Since
# strip-text.py removes the English underneath, a purchased Icelandic label would have been
# INVISIBLE, not mis-coloured. The three figures are the whole of the affected population:
# they are the only ones in the 817-figure corpus whose meta['unknown_colorspaces'] is
# non-empty.
print('\n[7c] an unrecognised colour space is refused (black), never read as DeviceGray')
SEPARATION_FIGURES = ['CNX_Chem_14_07_titration2', 'CNX_Chem_18_07_Nitrogen',
                      'CNX_Chem_21_06_Penetrate']


def _rgb(f):
    """compose.cmyk's body, verbatim — the consumer that decides what a reader SEES."""
    if not f:
        return (0, 0, 0)
    _, c, m, y, k = f
    return ((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))


white, unknown_seen, black_control = [], 0, 0
for name in SEPARATION_FIGURES:
    runs, meta, _ = read_figure(name)
    # NON-VACUITY, and it is the stimulus itself: unless this figure still presents an
    # unrecognised space, the assertion below is measuring nothing. Asserted, not printed.
    unknown_seen += sum(n for k, n in (meta.get('unknown_colorspaces') or {}).items()
                        if not k.startswith(('arity:', 'non-numeric:')))
    for run in runs:
        if _rgb(run['fill']) == (1.0, 1.0, 1.0):
            white.append((name, run['text'][:24], run['fill']))
        # POSITIVE CONTROL, on the SAME figures: a genuine DeviceCMYK k=1.0 run must
        # still read black. Without it, a change that refused EVERY colour would pass.
        if run['fill'] == ('cmyk', 0.0, 0.0, 0.0, 1.0):
            black_control += 1
check('7c no run on a /Separation figure renders WHITE, and real black still reads black',
      not white and unknown_seen > 0 and black_control > 0,
      f'{unknown_seen} chars in an unrecognised colour space across '
      f'{len(SEPARATION_FIGURES)} figures (non-vacuity: MUST be > 0, or the stimulus is '
      f'gone and a clean result means nothing); white runs {len(white)} (MUST be 0) '
      f'{white[:3]}; DeviceCMYK k=1.0 control runs {black_control} (MUST be > 0)')

# ── 8. THE TYPE0 FIGURES DECODE (ruling R-7) ────────────────────────────────────────
print('\n[8] the type0 figures decode, and the baseline garbage is gone')
import json  # noqa: E402
TYPE0 = [r['name'] for r in json.loads(H.CENSUS.read_text())
         if r['bucket'] == 'type0-unreadable']
verdicts, wrongly_flagged, base_raises = [], [], 0
for name in TYPE0:
    path, _ = resolve(name)
    with H.staged(path) as (src, _e):
        b_runs, b_meta, b_outcome = H.read_baseline(src)
        runs, meta, _ = RL.read(src)
        oracle = H.read_oracle(src)
    if b_outcome == 'raises':
        base_raises += 1
    verdicts.append(H.classify_type0(runs, meta, H.charcount(oracle)))
    if any(not v.get('decodable', True) for v in meta['fonts'].values()):
        wrongly_flagged.append(name)
    if H.looks_undecoded(''.join(r['text'] for r in runs)):
        wrongly_flagged.append(f'{name}:control-bytes')
counts = collections.Counter(verdicts)
check('8a CONTROL — the baseline raises on all of them (this is the defect being fixed)',
      base_raises == len(TYPE0) and len(TYPE0) > 0,
      f'{base_raises}/{len(TYPE0)} raise (AttributeError: /FirstChar)')
check('8b every type0 figure is classified `decoded`, none `decodable: false`',
      counts.get('decoded', 0) == len(TYPE0) and not wrongly_flagged,
      f'{dict(counts)}; wrongly flagged {wrongly_flagged}')

# ── 9. A SYNTHETIC UNDECODABLE FONT IS MARKED decodable: False ──────────────────────
# The real corpus contains NO '(cid:' (ruling R-7), so without a fixture this detector is
# never exercised and its silence means nothing.
print('\n[9] a font whose bytes cannot be decoded is DECLARED, not silently reduced')
path, _ = resolve('CNX_Chem_01_02_decomp')
with H.staged(path) as (src, _e):
    handle = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
    handle.close()
    removed = 0
    with pikepdf.open(str(src)) as pdf:
        def strip(res, seen):
            global removed
            fonts = res.get('/Font')
            if fonts is not None:
                for _n, fobj in fonts.items():
                    if '/ToUnicode' in fobj:
                        del fobj['/ToUnicode']
                        removed += 1
            xobjects = res.get('/XObject')
            if xobjects is None:
                return
            for _n, xobj in xobjects.items():
                if str(xobj.get('/Subtype', '')) != '/Form' or xobj.objgen in seen:
                    continue
                seen.add(xobj.objgen)
                sub = xobj.get('/Resources')
                if sub is not None:
                    strip(sub, seen)
        for page in pdf.pages:
            res = pikepdf.Page(page).obj.get('/Resources')
            if res is not None:
                strip(res, set())
        pdf.save(handle.name)
    oracle_chars = H.charcount(H.read_oracle(src))
try:
    runs, meta, _ = RL.read(handle.name)
    text = ''.join(r['text'] for r in runs)
    used = {r['font'] for r in runs}
    check('9a PLANT — the fixture really does produce undecodable glyphs',
          removed > 0 and '(cid:' in text,
          f'{removed} /ToUnicode removed; text {text[:40]!r}')
    check('9b every font it uses is marked decodable: False',
          used and all(meta['fonts'][k].get('decodable') is False for k in used),
          f'{ {k: meta["fonts"][k].get("decodable") for k in sorted(used)} }')
    check('9c the harness classifies it `declared-undecodable`, NOT `FAIL-silent`',
          H.classify_type0(runs, meta, oracle_chars) == 'declared-undecodable',
          H.classify_type0(runs, meta, oracle_chars))
finally:
    os.unlink(handle.name)

# ── 10. A TEXTLESS FIGURE RETURNS [], AND DOES NOT RAISE (H8) ───────────────────────
print('\n[10] a textless figure returns [] rather than raising')
empties = []
for name in ['CNX_Chem_08_01_pi', 'CNX_Chem_08_02_H2Ovb', 'CNX_Chem_10_06_SimpleCub1']:
    try:
        runs, meta, outcome = read_figure(name)
        empties.append((name, len(runs), outcome))
    except Exception as exc:                       # noqa: BLE001 — the thing under test
        empties.append((name, f'RAISED {type(exc).__name__}: {exc}', None))
check('10 textless figures return [] and outcome "empty"',
      all(r == 0 and o == 'empty' for _n, r, o in empties),
      f'{empties}')

# ── 11. meta['source'] IS THE ORIGINAL ARTWORK, NOT THE STAGED TEMP ────────────────
print('\n[11] meta.source names the original artwork for an .eps input')
eps_path, _ = resolve(EPS_FIG)
check('11a CONTROL — the fixture really is an .eps (so staging happens at all)',
      eps_path.suffix.lower() == '.eps', str(eps_path))
runs, meta, outcome = RL.read(eps_path)       # given the .eps DIRECTLY, not a staged pdf
check('11b meta.source basename is the original, and the figure still read',
      Path(meta['source']).name == f'{EPS_FIG}.eps' and meta['staged'] and outcome == 'reads',
      f"source={meta['source']!r} staged={meta['staged']} outcome={outcome}")

# ── 12. RUN SEGMENTATION: A KERN PAIR MUST NOT BREAK A LABEL ───────────────────────
# Added after the fact, and the reason is worth keeping: the two hardest-won findings in
# this task — the relative gap window and exact rotation matching — were caught only by
# the harness's C4b, and NOTHING in cases 1-11 fails if either regresses. A defect that
# only an out-of-tree instrument can see is one nobody runs.
print('\n[12] a kern pair does not split a label into two runs')
KERN_FIG = 'CNX_Chem_00_AA_PeriodicPU_img'
prepared = RL._prepare(chars_of(KERN_FIG), lambda f: str(f), collections.Counter())
text = ''.join(c['text'] for c in prepared)
start = text.find('Periodic Table')
negative = []
for a, b in zip(prepared[start:start + 29], prepared[start + 1:start + 30]):
    rot = a['rot']
    gap = (RL._along(b['x'], b['y'], rot) - RL._along(a['x'], a['y'], rot) - a['adv'])
    if gap < 0:
        negative.append((a['text'], b['text'], round(gap, 4)))
check('12a CONTROL — this label really does contain a NEGATIVE (kerned) gap',
      len(negative) > 0,
      f'{negative} (if empty, the fixture cannot exercise the window at all)')
runs, meta, _ = read_figure(KERN_FIG)
whole = [r for r in runs if r['text'] == 'Periodic Table of the Elements']
check('12b the kerned label is ONE run, not split at the kern',
      len(whole) == 1,
      f"runs containing 'Periodic': "
      f"{[r['text'] for r in runs if 'Periodic' in r['text']]}")

# ── 13. RUN SEGMENTATION: ARC TEXT STAYS ONE RUN PER GLYPH ─────────────────────────
print('\n[13] arc text keeps one run per glyph, so figtext still sees an arc')
import figtext as FT  # noqa: E402
ARC_FIG = 'CNX_Chem_01_01_SciMethod'
prepared = RL._prepare(chars_of(ARC_FIG), lambda f: str(f), collections.Counter())
text = ''.join(c['text'] for c in prepared)
start = text.find('not consistent with')
steps = [round(RL._angle_delta(a['rot'], b['rot']), 3)
         for a, b in zip(prepared[start:start + 18], prepared[start + 1:start + 19])]
check('13a CONTROL — the per-glyph rotation steps STRADDLE figtext\'s 3 degrees',
      steps and min(steps) < 3.0 < max(steps),
      f'steps {min(steps)}..{max(steps)} — a 3-degree tolerance would merge some and '
      f'split the rest, which is worse than either')
runs, meta, _ = read_figure(ARC_FIG)
arcs = [b for b in H.blocks_of(runs) if H.block_key(b) == 'not consistent with']
check('13b the arc label is ONE block, is_arc, and every run is a single glyph',
      len(arcs) == 1 and FT.is_arc(arcs[0])
      and all(len(r['text']) <= 1 for r in arcs[0]),
      f"{len(arcs)} matching block(s)" + (
          f", is_arc={FT.is_arc(arcs[0])}, "
          f"multi-char runs={[r['text'] for r in arcs[0] if len(r['text']) > 1]}"
          if arcs else '; keys present: '
          f'{[H.block_key(b) for b in H.blocks_of(runs)][-8:]}'))

# ── 14. strip-text.py DESCENDS INTO /Form XObjects — WITHOUT DESTROYING THEM ────────
# Two properties, and each needs the other's control to mean anything (ruling R-9):
# the text must be GONE, and the artwork must still be THERE. A form rewritten with
# pdf.make_stream() contains no text either — it contains nothing at all — so the
# first assertion passes on a figure the change erased. Only a pixel count sees that.
print('\n[14] strip-text descends into /Form XObjects without destroying them')
import re  # noqa: E402
import shutil  # noqa: E402
import subprocess  # noqa: E402
import importlib.util  # noqa: E402
from PIL import Image  # noqa: E402

_spec = importlib.util.spec_from_file_location('strip_text_tool', HERE / 'strip-text.py')
ST = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ST)          # hyphenated filename: no plain `import` exists

S14 = Path(tempfile.mkdtemp(prefix='r3-strip-'))   # never a /tmp literal: tmpfs fills up


def bt_blocks(pdf_path):
    """(page blocks, total blocks) over the page stream and every reachable /Form.

    Deliberately NOT strip-text.py's own walk. A check that reuses the code it is
    checking cannot see a walk that descends into the wrong set of objects."""
    pdf = pikepdf.open(pdf_path)
    page = pdf.pages[0]
    page_n = len(re.findall(rb'BT.*?ET', _deps.read_content(page).encode('latin-1'), re.S))
    total, seen = page_n, set()
    stack, res = [], pikepdf.Page(page).obj.get('/Resources')
    if res is not None:
        stack.append(res)
    while stack:
        xo = stack.pop().get('/XObject')
        if xo is None:
            continue
        for _k, x in xo.items():
            if str(x.get('/Subtype', '')) != '/Form' or x.objgen in seen:
                continue
            seen.add(x.objgen)
            total += len(re.findall(rb'BT.*?ET', x.read_bytes(), re.S))
            sub = x.get('/Resources')
            if sub is not None:
                stack.append(sub)
    return page_n, total


def words(pdf_path):
    """The INDEPENDENT oracle — a different program from the one under test."""
    return subprocess.run(['pdftotext', str(pdf_path), '-'],
                          capture_output=True).stdout.split()


def nonwhite(pdf_path, tag):
    """Non-white pixels at 200 dpi — the only instrument that can see R-9."""
    base = str(S14 / tag)
    subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(pdf_path), base],
                   check=True, capture_output=True)
    with Image.open(base + '.png') as im:
        return sum(1 for v in im.convert('L').get_flattened_data() if v < 250)


def pageonly_strip(src, dst):
    """THE BEHAVIOUR BEING REPLACED, frozen: the page stream only, no form walk.

    This is what 'before' means for the artwork comparison — the artwork as the old
    tool left it, with its page text legitimately removed. Copied rather than imported
    because the original is being changed by this very task; it never changes again."""
    pdf = pikepdf.open(src)
    page = pdf.pages[0]
    stripped = re.sub(r'BT.*?ET', '', _deps.read_content(page), flags=re.S)
    page.Contents = pdf.make_stream(stripped.encode('latin-1'))
    pdf.save(dst)


def new_strip(src, dst):
    pdf = pikepdf.open(src)
    stats = ST.strip_text(pdf)
    pdf.save(dst)
    return stats


# ── the text half: a figure that hides ALL of its text inside forms ──────────────
FORM_FIG = 'CNX_Chem_02_00_Biomarkers'
form_src, _ = resolve(FORM_FIG)
f_page_bt, f_total_bt = bt_blocks(form_src)
check('14a CONTROL — this figure keeps ALL its text inside /Form XObjects',
      f_page_bt == 0 and f_total_bt > 0 and len(words(form_src)) == 19,
      f'page BT={f_page_bt}, reachable BT={f_total_bt}, pdftotext words='
      f'{len(words(form_src))} (if page BT > 0 the fixture cannot show the defect)')

old_out = S14 / 'biomarkers-pageonly.pdf'
pageonly_strip(form_src, old_out)
check('14b CONTROL — the behaviour being REPLACED leaves that text in place',
      len(words(old_out)) == 19,
      f'{len(words(old_out))} words survive a page-only strip — this is the defect, '
      f'planted before the fix is asserted')

new_out = S14 / 'biomarkers-new.pdf'
f_stats = new_strip(form_src, new_out)
n_page_bt, n_total_bt = bt_blocks(new_out)
check('14c the text is gone — no reachable BT block, and the oracle reads nothing',
      n_total_bt == 0 and words(new_out) == [],
      f'reachable BT={n_total_bt}, pdftotext={words(new_out)[:6]}; '
      f'walk visited {f_stats["forms_visited"]} forms, rewrote {f_stats["forms_rewritten"]}')

# ── the artwork half: a figure whose FORMS carry the drawing ─────────────────────
# Measured across 110 figures: no single /Form holds both text and visible artwork —
# Illustrator isolates text into its own form. So the two halves cannot be one real
# fixture, and the artwork detector must be a figure whose forms are pure artwork.
ART_FIG = 'CNX_Chem_02_01_Dalton10_img'
art_src, _ = resolve(ART_FIG)
art_old = S14 / 'dalton-pageonly.pdf'
pageonly_strip(art_src, art_old)
old_px = nonwhite(art_old, 'dalton-old')
art_new = S14 / 'dalton-new.pdf'
a_stats = new_strip(art_src, art_new)
new_px = nonwhite(art_new, 'dalton-new')
check('14d CONTROL — there IS artwork to lose, and the walk really enters its forms',
      old_px > 1000 and a_stats['forms_visited'] > 0,
      f'{old_px} non-white px after the old strip, {a_stats["forms_visited"]} forms '
      f'visited (0 forms would make 14e true of a walk that did nothing)')
check('14e THE ARTWORK SURVIVES — same pixels as the old strip, to the pixel',
      new_px == old_px,
      f'old {old_px} -> new {new_px}. pdf.make_stream() gives 435 here: erased, and '
      f'still free of BT, which is why 14c alone cannot see it')

# ── synthetic fixtures: the shapes the corpus does not contain ───────────────────
# Precedented by ruling R-7, which kept the `(cid:` detector against a synthetic
# fixture once the real corpus stopped exercising it.
N = pikepdf.Name
RECT = b'0 0 0 rg 10 10 80 40 re f\n'
TEXT1 = b'BT /F1 12 Tf 10 80 Td (HELLO) Tj ET\n'
TEXT2 = b'BT /F1 12 Tf 10 60 Td (WORLD) Tj ET\n'


def synth(kind, dst):
    """A tiny PDF exercising one shape. -> saved path."""
    pdf = pikepdf.new()
    font = pdf.make_indirect(pikepdf.Dictionary(
        Type=N('/Font'), Subtype=N('/Type1'), BaseFont=N('/Helvetica')))

    def form(content, res=None):
        s = pdf.make_stream(content)
        s.Type, s.Subtype = N('/XObject'), N('/Form')
        s.BBox = pikepdf.Array([0, 0, 100, 100])
        s.Resources = res if res is not None else pikepdf.Dictionary(
            Font=pikepdf.Dictionary(F1=font))
        return pdf.make_indirect(s)

    page = pdf.add_blank_page(page_size=(100, 100))
    if kind == 'textrect':      # artwork drawn BETWEEN two text blocks
        xobj = pikepdf.Dictionary(Fm0=form(TEXT1 + RECT + TEXT2))
    elif kind == 'rectonly':    # the reference render for textrect
        xobj = pikepdf.Dictionary(Fm0=form(RECT))
    elif kind == 'nested':
        child = form(TEXT2)
        parent = form(TEXT1 + b'q /Fm1 Do Q\n', pikepdf.Dictionary(
            Font=pikepdf.Dictionary(F1=font), XObject=pikepdf.Dictionary(Fm1=child)))
        xobj = pikepdf.Dictionary(Fm0=parent)
    elif kind == 'dup':         # ONE object, referenced under two names
        shared = form(TEXT1 + RECT)
        xobj = pikepdf.Dictionary(Fm0=shared, FmAgain=shared)
    elif kind == 'cycle':       # A -> B -> A
        a = form(TEXT1)
        b = form(TEXT2, pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font),
                                           XObject=pikepdf.Dictionary(FmA=a)))
        a.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font),
                                         XObject=pikepdf.Dictionary(FmB=b))
        xobj = pikepdf.Dictionary(Fm0=a)
    page.Contents = pdf.make_stream(b'q /Fm0 Do Q\n')
    page.Resources = pikepdf.Dictionary(XObject=xobj)
    pdf.save(dst)
    return dst


tr_src = synth('textrect', S14 / 'textrect.pdf')
ro_src = synth('rectonly', S14 / 'rectonly.pdf')
tr_before, ro_px = nonwhite(tr_src, 'tr-before'), nonwhite(ro_src, 'ro')
tr_out = S14 / 'textrect-stripped.pdf'
tr_stats = new_strip(tr_src, tr_out)
tr_after = nonwhite(tr_out, 'tr-after')
check('14f CONTROL — the synthetic form really draws text AND artwork',
      tr_before > ro_px > 0 and len(words(tr_src)) == 2 and tr_stats['forms_rewritten'] == 1,
      f'with text {tr_before} px, artwork alone {ro_px} px, words {words(tr_src)}, '
      f'{tr_stats["forms_rewritten"]} form rewritten')
check("14f a rewritten form keeps the artwork drawn BETWEEN its two text blocks",
      tr_after == ro_px and words(tr_out) == [],
      f'{tr_after} px vs the {ro_px} px reference, words {words(tr_out)}. A greedy '
      f'BT.*ET eats the rectangle between the blocks and lands near 0')

ne_out = S14 / 'nested-stripped.pdf'
ne_stats = new_strip(synth('nested', S14 / 'nested.pdf'), ne_out)
check('14g the walk RECURSES — a form inside a form is stripped too',
      ne_stats['forms_visited'] == 2 and bt_blocks(ne_out)[1] == 0,
      f'{ne_stats["forms_visited"]} forms visited (want 2), '
      f'{bt_blocks(ne_out)[1]} BT blocks left')

dup_src = synth('dup', S14 / 'dup.pdf')
with pikepdf.open(dup_src) as _dup:   # hold the Pdf: a temporary is destroyed mid-expression
    dup_refs = len(_dup.pages[0].Resources.XObject.keys())
dup_stats = new_strip(dup_src, S14 / 'dup-stripped.pdf')
check('14h CONTROL — the page really does reference one form under two names',
      dup_refs == 2, f'{dup_refs} /XObject entries')
check('14h a form reachable twice is visited ONCE (the objgen visited set)',
      dup_stats['forms_visited'] == 1,
      f'{dup_stats["forms_visited"]} visits for 2 references')

cy_out = S14 / 'cycle-stripped.pdf'
cy_stats = new_strip(synth('cycle', S14 / 'cycle.pdf'), cy_out)
check('14i a REFERENCE CYCLE terminates, and both forms are stripped',
      cy_stats['forms_visited'] == 2 and bt_blocks(cy_out)[1] == 0,
      f'{cy_stats["forms_visited"]} forms visited, {bt_blocks(cy_out)[1]} BT left '
      f'(an unguarded walk never returns from A -> B -> A)')

shutil.rmtree(S14, ignore_errors=True)

print(f"\n  {'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(0 if not fails else 1)
