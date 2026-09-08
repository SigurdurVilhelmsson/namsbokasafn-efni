#!/usr/bin/env python3
"""`compose.py` reports its own key set, and `figure-compose.py` REFUSES on a mismatch.

    python3 test_figure_compose.py

Plain asserts and a module-level `fails` list, like test_figure_prepare.py /
test_figtext_out.py - there is no pytest in this tree.

WHAT IS BEING CLOSED
--------------------
`compose.py` KEEPS THE ENGLISH for any block key it cannot match, says so ONLY on stdout,
and exits **0**. A wrapper reading `returncode` sees success. Composed with the missing
per-figure isolation that `FIGTEXT_OUT` closed, that meant a whole chapter tallying
`translated` with English still in every image.

🔴 AND THE OBVIOUS FIX IS DEFEATED: A CORRECT RUN PRINTS THE SAME
`!! N block(s) with no translation - ENGLISH KEPT` WARNING, for the `send:false` verbatim
blocks that were deliberately never bought. Case 2 is that decoy, and it is what makes
case 1 mean anything: a check keyed on the warning's presence, or on its COUNT, refuses a
perfectly good figure. The check has to compare KEY SETS.

🔴 AND THEY MUST BE MULTISETS, NOT SETS (ruling R-13, READ-LAYER-ACCEPTANCE.md:229). A
figure may legitimately carry one key twice and `compose.py` DRAWS BOTH, so a lost twin
leaves a label undrawn with the key SET identical. Duplicate keys are not exotic - the
acceptance table records 5,375 corpus-wide. Case 3 is a lost twin, and case 3c proves it
by showing the SET comparison of the same two sides is EQUAL.

🔴 THIS SUITE IS NOT ALL REFUSALS. Case 2 composes the committed fixture end to end and
asserts the Icelandic reached `translated.svg` and the English left it; case 5b asserts the
same substitution for a single block. A wrapper that refuses everything fails both, and so
does a `compose.py` that stopped drawing translations.

🔴 EVERY NULL IS PAIRED. "compose.py never ran" (case 4b) is asserted as the absence of
`translated.png` and `compose-report.json` - which is also what a wrapper that silently
does nothing produces - so case 4c runs the SAME probe on the SAME artwork with
`artwork.svg` restored and requires both files to appear.

⚠️ This file writes ONLY into temporary directories. Case 7 is what proves it: the shared
`out/` must come out byte-for-byte and mtime-for-mtime unchanged, because
`test_blockkey_consumers.py` requires `out/artwork.png` to be CNX_Chem_01_01_SciMethod's.
"""
import collections
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))

import pikepdf                                  # noqa: E402  - after the pylibs bootstrap

WRAPPER = HERE / 'figure-compose.py'
PREPARE = HERE / 'figure-prepare.py'
COMPOSE = HERE / 'compose.py'
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'
SHARED_OUT = HERE / 'out'

N = pikepdf.Name

# The committed fixture's four block keys, measured by the chain itself (Task 2a) and
# pinned by test_figure_prepare.py:2c-2e. Three are sendable; 'H2O (g)' is held verbatim
# and is therefore the decoy that makes case 2 a real control.
K_OBS = 'Observation and curiosity'
K_HYP = 'Form a hypothesis'
K_TEST = 'Test the hypothesis'
K_VERBATIM = 'H2O (g)'

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''),
          flush=True)
    if not ok:
        fails.append(label)


def refused(result, code):
    """Did the TOOL refuse with `code` - or did the interpreter refuse the tool?

    🔴 WITHOUT THIS, EVERY USAGE-ERROR CASE PASSES VACUOUSLY WHEN THE FILE IS ABSENT:
    `python3 <missing file>` prints "can't open file ..." and exits **2**, the same code
    argparse uses. Copied from test_figure_prepare.py, where it was measured."""
    return result.returncode == code and "can't open file" not in result.stderr


def bare_env():
    """The environment the driver will actually hand these tools.

    `FIGTEXT_PYLIBS` and `FIGTEXT_OUT` are popped on purpose: pdfplumber, pycairo and
    fontTools are not on this box's system path, so a child that inherited them from
    however this test was launched would never exercise the tool's own bootstrap."""
    env = dict(os.environ)
    env.pop('FIGTEXT_PYLIBS', None)
    env.pop('FIGTEXT_OUT', None)
    return env


def run_prepare(artwork, out_dir, basename):
    return subprocess.run(
        [sys.executable, str(PREPARE), str(artwork), '--basename', basename,
         '--out', str(out_dir)],
        capture_output=True, text=True, env=bare_env())


def run_wrapper(*args, cwd=None):
    return subprocess.run([sys.executable, str(WRAPPER), *[str(a) for a in args]],
                          capture_output=True, text=True, env=bare_env(),
                          cwd=str(cwd) if cwd else None)


def run_compose_direct(out_dir, tr_path, svg=True):
    """Spawn the BARE composer, the way a human does. Used to measure what it does on
    its own - the exit code, the warning, and what lands in the SVG - so the wrapper's
    refusals are anchored on a measurement rather than on this file's prose."""
    env = dict(os.environ)
    env['FIGTEXT_OUT'] = str(out_dir)
    env.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))
    argv = [sys.executable, str(COMPOSE), '--translations', str(tr_path)]
    if svg:
        argv.append('--svg')
    return subprocess.run(argv, capture_output=True, text=True, env=env, cwd=str(HERE))


def write_tr(path, mapping):
    Path(path).write_text(json.dumps({'blocks': mapping}, ensure_ascii=False))
    return Path(path)


def load_json(path):
    path = Path(path)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception as exc:                      # noqa: BLE001 - reported, not raised
        return {'_unparsable': f'{type(exc).__name__}: {exc}'}


def keys_of(out_dir):
    blocks = load_json(Path(out_dir) / 'blocks.json') or []
    return [b['key'] for b in blocks]


def snapshot(directory):
    """{relative path: (size, mtime_ns)} for every file under `directory`, or None if it
    does not exist. None, not {} - see test_figure_prepare.py:snapshot for why."""
    directory = Path(directory)
    if not directory.is_dir():
        return None
    return {str(p.relative_to(directory)): (p.stat().st_size, p.stat().st_mtime_ns)
            for p in sorted(directory.rglob('*')) if p.is_file()}


def _plain_font(pdf):
    """Base-14 Helvetica, not a subset. Copied from test_figure_prepare.py."""
    descriptor = pdf.make_indirect(pikepdf.Dictionary(
        Type=N('/FontDescriptor'), FontName=N('/Helvetica'), Flags=32,
        FontBBox=pikepdf.Array([-166, -225, 1000, 931]),
        ItalicAngle=0, Ascent=718, Descent=-207, CapHeight=718, StemV=88))
    return pdf.make_indirect(pikepdf.Dictionary(
        Type=N('/Font'), Subtype=N('/Type1'), BaseFont=N('/Helvetica'),
        FontDescriptor=descriptor, Encoding=N('/WinAnsiEncoding')))


DUP_LABEL = 'Reaction rate'
SOLO_LABEL = 'Only once here'


def synth_duplicate(dst):
    """Artwork carrying ONE label TWICE, far enough apart to stay two blocks.

    Generated rather than committed: it exists to exercise the multiset comparison, and a
    second binary artefact somebody has to keep true is a liability. The two copies are
    190pt apart - `figtext.group`'s newline rule needs the baselines within
    `size*1.222 +/- 2.0`, so nothing merges them."""
    pdf = pikepdf.new()
    font = _plain_font(pdf)
    page = pdf.add_blank_page(page_size=(300, 300))
    page.Contents = pdf.make_stream(
        b'0 0 0 rg 0 0 20 20 re f\n'
        + f'BT /F1 12 Tf 20 250 Td ({DUP_LABEL}) Tj ET\n'.encode('latin-1')
        + f'BT /F1 12 Tf 20 155 Td ({SOLO_LABEL}) Tj ET\n'.encode('latin-1')
        + f'BT /F1 12 Tf 20 60 Td ({DUP_LABEL}) Tj ET\n'.encode('latin-1'))
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font))
    pdf.save(str(dst), deterministic_id=True)
    return Path(dst)


# ── 0. preconditions ─────────────────────────────────────────────────────────────────
check('0 PRECONDITION figure-compose.py exists', WRAPPER.exists(), str(WRAPPER))
check('0b PRECONDITION figure-prepare.py exists', PREPARE.exists(), str(PREPARE))
check('0c PRECONDITION the committed fixture is present', FIXTURE.exists(), str(FIXTURE))


# ── 1. THE DEFECT — a bought key with no translation, and the wrapper refuses ─────────
# `Test the hypothesis` is send:true: on a real run it was PAID for. It is left out of
# the translations file here, which is exactly what a partial MT response looks like.
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fig-missing'
    prep = run_prepare(FIXTURE, out, 'CNX_Fixture_Missing')
    check('1 PRECONDITION prepare produced the fixture directory', prep.returncode == 0,
          f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
    tr = write_tr(Path(td) / 'partial.json',
                  {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu'})

    # 1a-1c: what the BARE composer does. Measured here, not quoted from the plan.
    bare = run_compose_direct(out, tr)
    check('1a the bare composer EXITS 0 with a bought key it could not match',
          bare.returncode == 0, f'exit {bare.returncode}: {bare.stderr.strip()[-300:]}')
    check('1b ... and reports it ONLY on stdout',
          'ENGLISH KEPT' in bare.stdout and 'ENGLISH KEPT' not in bare.stderr,
          f'stdout has it={"ENGLISH KEPT" in bare.stdout}, '
          f'stderr has it={"ENGLISH KEPT" in bare.stderr}')
    svg_text = (out / 'translated.svg').read_text(encoding='utf-8') \
        if (out / 'translated.svg').exists() else ''
    check('1c ... and the ENGLISH is in the SVG a reader would be served',
          K_TEST in svg_text, f'{len(svg_text)} bytes of svg')

    # 1d-1e: the wrapper must refuse anyway, and NAME the key.
    r = run_wrapper('--out', out, '--translations', tr)
    d = load_json(out / 'compose.json') or {}
    check('1d THE WRAPPER REFUSES (exit 1) even though compose.py exited 0',
          refused(r, 1), f'exit {r.returncode}: {r.stderr.strip()[-300:]}')
    check('1e ... and compose.json NAMES the offending BLOCK KEY',
          isinstance(d.get('keys'), list) and K_TEST in d.get('keys', [])
          and isinstance(d.get('error'), str) and d.get('error'),
          f'{d!r}')
    check('1f ... and no translated.svg is left behind claiming success',
          not (out / 'translated.svg').exists(),
          f"translated.svg present={(out / 'translated.svg').exists()}")

    # 1g-1i: THE MESSAGE MUST NAME THE CONDITION IT ACTUALLY MEASURED.
    # 🔴 K_TEST is not in the translations file AT ALL, and the wrapper cannot know that
    # anything was ever bought for it. On the DRIVER this shape never reaches compose on
    # the buy path - `normaliseTranslations` drops empty values and step 8 refuses the
    # figure before step 9 - so at compose time it means the file predates this figure's
    # current block keys (they are content-addressed: a re-extraction or a read-layer
    # change MOVES them). Saying "BOUGHT" here accuses the paid MT of losing a
    # translation it was never sold, and sends the operator hunting for a refund.
    err = d.get('error', '')
    check('1g the refusal says the key has NO ENTRY in the translations file',
          'NO ENTRY' in err and str(tr) in err, f'{err!r}')
    check('1h ... and does NOT claim it was BOUGHT - nothing here shows a purchase',
          'BOUGHT' not in err, f'{err!r}')
    check('1i ... and, this file carrying no `state`, says deleting it discards no '
          'editorial decision',
          'no `state`' in err and 'discards no' in err, f'{err!r}')


# ── 1j. THE SAME DRIFT AGAINST AN APPROVED SIDECAR — the remedy must NOT be "delete it" ─
# 🔴 A SIDECAR'S `state` IS A HEAD EDITOR'S RULING. Deleting the file is what makes a
# figure eligible to be bought again (R8), so it is the obvious remedy to print here - and
# on an approved sidecar it silently destroys the approval. The wording is therefore
# conditional on what the file actually carries, and 1i above is this case's control: the
# same defect, the same tool, opposite advice.
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fig-approved'
    prep = run_prepare(FIXTURE, out, 'CNX_Fixture_Approved')
    check('1j PRECONDITION prepare produced the fixture directory', prep.returncode == 0,
          f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
    sidecar = Path(td) / 'approved.is.json'
    sidecar.write_text(json.dumps({
        'version': 1, 'basename': 'CNX_Fixture_Approved', 'renderHash': 'deadbeef',
        'composerVersion': 1, 'state': 'approved',
        'blocks': {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu'},
    }, ensure_ascii=False))
    r = run_wrapper('--out', out, '--translations', sidecar)
    d = load_json(out / 'compose.json') or {}
    err = d.get('error', '')
    check('1k the wrapper refuses a sidecar that predates this figure\'s keys',
          refused(r, 1) and K_TEST in d.get('keys', []), f'exit {r.returncode}: {d!r}')
    check('1l ... and WARNS that deleting this one discards an editor\'s decision',
          'discards' in err and 'no `state`' not in err
          and ('approved' in err or 'editor' in err), f'{err!r}')
    check('1m ... and still does not claim the block was BOUGHT', 'BOUGHT' not in err,
          f'{err!r}')


# ── 2. THE CONTROL THAT MAKES CASE 1 MEAN ANYTHING ───────────────────────────────────
# A CORRECT run. All three sendable keys are translated; `H2O (g)` is send:false and was
# never bought, so compose.py prints the very same ENGLISH KEPT warning. A check keyed on
# the warning - or on its count - refuses this figure. This one must pass.
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fig-correct'
    prep = run_prepare(FIXTURE, out, 'CNX_Fixture_Correct')
    check('2 PRECONDITION prepare produced the fixture directory', prep.returncode == 0,
          f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
    tr = write_tr(Path(td) / 'full.json',
                  {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu',
                   K_TEST: 'Profa tilgatuna'})
    r = run_wrapper('--out', out, '--translations', tr)
    d = load_json(out / 'compose.json') or {}

    check('2a a CORRECT run carrying send:false verbatim blocks exits 0',
          r.returncode == 0, f'exit {r.returncode}: {r.stderr.strip()[-400:]}')
    check('2b ... and the same ENGLISH KEPT warning was printed on this PASSING run, so '
          'a warning-keyed check would have refused a good figure',
          'ENGLISH KEPT' in r.stdout, f'stdout: {r.stdout.strip()[-300:]!r}')
    out_path = d.get('outputPath')
    check('2c ... compose.json carries outputPath, and it exists and is non-empty',
          bool(out_path) and Path(out_path).exists()
          and Path(out_path).stat().st_size > 0 and 'error' not in d,
          f'{d!r}')
    svg_text = Path(out_path).read_text(encoding='utf-8') if out_path \
        and Path(out_path).exists() else ''
    check('2d NON-VACUITY the Icelandic REACHED the svg and the English left it',
          'Athugun' in svg_text and 'forvitni' in svg_text
          and K_OBS not in svg_text and K_HYP not in svg_text,
          f'Athugun={"Athugun" in svg_text} obs-english={K_OBS in svg_text}')
    check('2e ... while the send:false formula is still there in English, untranslated',
          K_VERBATIM in svg_text, f'{K_VERBATIM!r} in svg={K_VERBATIM in svg_text}')
    rep = load_json(out / 'compose-report.json') or {}
    check('2f compose-report.json partitions the four keys: 3 translated, 1 missing',
          sorted(rep.get('translated', [])) == sorted([K_OBS, K_HYP, K_TEST])
          and rep.get('missing') == [K_VERBATIM]
          and sorted(rep.get('blocks', [])) == sorted([K_OBS, K_HYP, K_TEST, K_VERBATIM]),
          f'{rep!r}')
    check('2g ... and records which translations file it read, and that it is not a '
          '--control run', rep.get('translationsPath') == str(tr)
          and rep.get('control') is False,
          f"{rep.get('translationsPath')!r} control={rep.get('control')!r}")


# ── 3. THE MULTISET CASE — a duplicate key lost ONCE ─────────────────────────────────
# A SET comparison passes here. Ruling R-13 and test_blockkey_consumers.py:116-121 both
# record why that is not good enough: compose DRAWS both twins, so a lost one leaves a
# label undrawn with the key set identical.
with tempfile.TemporaryDirectory() as td:
    art = synth_duplicate(Path(td) / 'CNX_Fake_Dup.pdf')
    out = Path(td) / 'fig-dup'
    prep = run_prepare(art, out, 'CNX_Fake_Dup')
    check('3 PRECONDITION prepare produced the duplicate-key figure',
          prep.returncode == 0, f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
    counts = collections.Counter(keys_of(out))
    check('3a PRECONDITION the figure really carries one key TWICE',
          counts.get(DUP_LABEL) == 2 and counts.get(SOLO_LABEL) == 1,
          f'{dict(counts)!r}')

    tr = write_tr(Path(td) / 'dup.json',
                  {DUP_LABEL: 'Hradi efnahvarfs', SOLO_LABEL: 'Adeins einu sinni'})

    # CONTROL first: the unmodified figure composes cleanly, so case 3b's refusal is
    # caused by the dropped twin and not by anything about this synthetic artwork.
    ok = run_wrapper('--out', out, '--translations', tr)
    check('3b CONTROL the unmodified duplicate-key figure composes and exits 0',
          ok.returncode == 0, f'exit {ok.returncode}: {ok.stderr.strip()[-400:]}')

    # Now drop ONE of the two twins from blocks.json - a stale blocks.json, or a
    # re-extraction that merged them. compose.py still draws both.
    blocks = json.loads((out / 'blocks.json').read_text())
    dropped, kept = False, []
    for b in blocks:
        if b['key'] == DUP_LABEL and not dropped:
            dropped = True
            continue
        kept.append(b)
    (out / 'blocks.json').write_text(json.dumps(kept, indent=1, ensure_ascii=False))

    r = run_wrapper('--out', out, '--translations', tr)
    d = load_json(out / 'compose.json') or {}
    check('3c a duplicate key lost ONCE is REFUSED', refused(r, 1),
          f'exit {r.returncode}: {r.stderr.strip()[-300:]}')
    check('3d ... and the offending key is named', DUP_LABEL in d.get('keys', []),
          f'{d!r}')

    rep = load_json(out / 'compose-report.json') or {}
    left = collections.Counter(rep.get('blocks', []))
    right = collections.Counter(b['key'] for b in kept)
    check('3e CONTROL — this case is INVISIBLE to a set comparison, which is the whole '
          'reason the assertion is a multiset',
          set(rep.get('blocks', [])) == {b['key'] for b in kept} and left != right,
          f'sets equal={set(rep.get("blocks", [])) == {b["key"] for b in kept}}, '
          f'multisets equal={left == right}, delta={sorted(((left - right) + (right - left)).items())}')


# ── 4. a missing artwork.svg is refused BEFORE compose.py runs ───────────────────────
# compose.py writes translated.png BEFORE it reads artwork.svg, and svgout.py:49 is a
# bare `assert` on that file's last tag - so an unvalidated run crashes after a partial
# write, leaving a PNG that describes a compose nothing verified.
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fig-nosvg'
    prep = run_prepare(FIXTURE, out, 'CNX_Fixture_NoSvg')
    check('4 PRECONDITION prepare produced the fixture directory', prep.returncode == 0,
          f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
    tr = write_tr(Path(td) / 'full.json',
                  {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu',
                   K_TEST: 'Profa tilgatuna'})
    keep = Path(td) / 'artwork.svg.keep'
    shutil.move(str(out / 'artwork.svg'), str(keep))

    r = run_wrapper('--out', out, '--translations', tr)
    d = load_json(out / 'compose.json') or {}
    check('4a a missing artwork.svg is refused (exit 1)', refused(r, 1),
          f'exit {r.returncode}: {r.stderr.strip()[-300:]}')
    check('4b ... BEFORE compose.py ran — no translated.png, no compose-report.json',
          not (out / 'translated.png').exists()
          and not (out / 'compose-report.json').exists(),
          f"png={(out / 'translated.png').exists()} "
          f"report={(out / 'compose-report.json').exists()}")
    check('4c ... and compose.json says so', isinstance(d.get('error'), str)
          and 'artwork.svg' in d.get('error', ''), f'{d!r}')

    # PAIRED CONTROL. "no translated.png" is also what a wrapper that silently does
    # nothing produces. Restore the file and require both artefacts to appear.
    shutil.move(str(keep), str(out / 'artwork.svg'))
    r2 = run_wrapper('--out', out, '--translations', tr)
    check('4d CONTROL with artwork.svg restored the SAME probe produces both files',
          r2.returncode == 0 and (out / 'translated.png').exists()
          and (out / 'compose-report.json').exists(),
          f"exit {r2.returncode}, png={(out / 'translated.png').exists()}, "
          f"report={(out / 'compose-report.json').exists()}")

    # A truncated artwork.svg is svgout.py:49's second post-write crash mode, and it is
    # caught by the same pre-flight rather than by a traceback.
    (out / 'translated.png').unlink(missing_ok=True)
    (out / 'compose-report.json').unlink(missing_ok=True)
    (out / 'artwork.svg').write_text('<svg><!-- truncated, no closing tag')
    r3 = run_wrapper('--out', out, '--translations', tr)
    check('4e a TRUNCATED artwork.svg is refused by the same pre-flight',
          refused(r3, 1) and not (out / 'translated.png').exists(),
          f"exit {r3.returncode}, png={(out / 'translated.png').exists()}")


# ── 5. an empty / whitespace translation value ERASES a label — treat it as missing ──
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fig-blank'
    prep = run_prepare(FIXTURE, out, 'CNX_Fixture_Blank')
    check('5 PRECONDITION prepare produced the fixture directory', prep.returncode == 0,
          f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
    blank_tr = write_tr(Path(td) / 'blank.json',
                        {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu',
                         K_TEST: '   '})
    bare = run_compose_direct(out, blank_tr)
    svg_text = (out / 'translated.svg').read_text(encoding='utf-8') \
        if (out / 'translated.svg').exists() else ''
    check('5a a whitespace-only value must KEEP THE ENGLISH, not silently delete the '
          'label', K_TEST in svg_text,
          f'exit {bare.returncode}, {len(svg_text)} bytes of svg, '
          f'{K_TEST!r} present={K_TEST in svg_text}')
    check('5b CONTROL a REAL value on the same key replaces it — so 5a is not just '
          '"the composer ignores translations"',
          'Athugun' in svg_text and K_OBS not in svg_text,
          f'Athugun={"Athugun" in svg_text} obs-english={K_OBS in svg_text}')
    rep = load_json(out / 'compose-report.json') or {}
    check('5c ... and the report files it under `missing`, never `translated`',
          K_TEST in rep.get('missing', []) and K_TEST not in rep.get('translated', []),
          f"missing={rep.get('missing')!r} translated={rep.get('translated')!r}")

    r = run_wrapper('--out', out, '--translations', blank_tr)
    d = load_json(out / 'compose.json') or {}
    check('5d the wrapper refuses a blank translation and names the key',
          refused(r, 1) and K_TEST in d.get('keys', []),
          f'exit {r.returncode}: {d!r}')

    # 5e-5f: THE TWIN OF 1g/1h, AND THE PAIR IS THE POINT. Case 1's key is ABSENT from
    # the file; this key is PRESENT with an unusable value. Both ship English, both must
    # be refused, and the two sentences must not be interchangeable - an operator reading
    # "no entry" goes looking at extraction vintages, one reading "empty entry" goes
    # looking at what wrote the value. Before this pair existed both printed the SAME
    # sentence, and it was the wrong one on the case that actually happens.
    err = d.get('error', '')
    check('5e the refusal says the entry EXISTS and is empty or whitespace-only',
          'empty or whitespace-only' in err, f'{err!r}')
    check('5f ... and does NOT reuse case 1\'s "no entry" wording',
          'NO ENTRY' not in err, f'{err!r}')


# ── 6. usage and per-figure refusals ─────────────────────────────────────────────────
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fig-usage'
    prep = run_prepare(FIXTURE, out, 'CNX_Fixture_Usage')
    check('6 PRECONDITION prepare produced the fixture directory', prep.returncode == 0,
          f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
    tr = write_tr(Path(td) / 'full.json',
                  {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu',
                   K_TEST: 'Profa tilgatuna'})

    r = run_wrapper('--out', out, '--translations', tr, '--bogus', '1')
    check('6a an unknown flag is REJECTED, not dropped (exit 2)', refused(r, 2),
          f'exit {r.returncode}: {r.stderr.strip()[-200:]}')

    r = run_wrapper('--out', out)
    check('6b a missing --translations is a USAGE error (exit 2)', refused(r, 2),
          f'exit {r.returncode}: {r.stderr.strip()[-200:]}')

    r = run_wrapper('--translations', tr)
    check('6c a missing --out is a USAGE error (exit 2)', refused(r, 2),
          f'exit {r.returncode}: {r.stderr.strip()[-200:]}')

    # compose.py reads a nonexistent --translations path as an EMPTY translation set and
    # exits 0 with every label in English. It must never get that far.
    r = run_wrapper('--out', out, '--translations', Path(td) / 'no-such-file.json')
    d = load_json(out / 'compose.json') or {}
    check('6d a NONEXISTENT --translations path is refused (exit 1), not read as {}',
          refused(r, 1) and isinstance(d.get('error'), str)
          and not (out / 'compose-report.json').exists(), f'exit {r.returncode}: {d!r}')

    empty = Path(td) / 'unprepared'
    empty.mkdir()
    r = run_wrapper('--out', empty, '--translations', tr)
    d = load_json(empty / 'compose.json') or {}
    check('6e an --out that prepare never wrote is refused (exit 1) with a named input',
          refused(r, 1) and isinstance(d.get('error'), str)
          and any(n in d.get('error', '')
                  for n in ('runs.json', 'meta.json', 'blocks.json', 'artwork.png')),
          f'exit {r.returncode}: {d!r}')


# ── 7. ISOLATION — the shared out/ is not touched ───────────────────────────────────
before_shared = snapshot(SHARED_OUT)
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fig-iso'
    prep = run_prepare(FIXTURE, out, 'CNX_Fixture_Iso')
    tr = write_tr(Path(td) / 'full.json',
                  {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu',
                   K_TEST: 'Profa tilgatuna'})
    r = run_wrapper('--out', out, '--translations', tr)
    check('7 PRECONDITION the isolation run itself succeeded',
          prep.returncode == 0 and r.returncode == 0,
          f'prepare {prep.returncode}, compose {r.returncode}: {r.stderr.strip()[-300:]}')
after_shared = snapshot(SHARED_OUT)

if before_shared is None:
    check('7a the shared out/ was absent and STAYED absent', after_shared is None,
          f'{len(after_shared or {})} files appeared at {SHARED_OUT}')
else:
    changed = sorted(set(before_shared.items()) ^ set((after_shared or {}).items()))
    check('7a the shared out/ is unchanged — same files, sizes and mtimes',
          after_shared == before_shared,
          f'{len(before_shared)} files before, {len(after_shared or {})} after; '
          f'first differences: {changed[:4]}')
    check('7b NON-VACUITY the shared out/ actually had files to protect',
          len(before_shared) > 0, f'{len(before_shared)} files')

# CONTROL — the same comparator over a directory that IS written to. Without it,
# "nothing changed" and "my comparator is blind" are the same output.
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fig-probe'
    run_prepare(FIXTURE, out, 'CNX_Fixture_Probe')
    tr = write_tr(Path(td) / 'full.json',
                  {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu',
                   K_TEST: 'Profa tilgatuna'})
    before_probe = snapshot(out)
    r = run_wrapper('--out', out, '--translations', tr)
    after_probe = snapshot(out)
    check('7c CONTROL the same comparator FIRES on a directory that WAS written to',
          r.returncode == 0 and before_probe is not None and after_probe is not None
          and after_probe != before_probe,
          f'exit {r.returncode}, {len(before_probe or {})} files -> '
          f'{len(after_probe or {})}')

# ── 8. UNIT — the guards a whole-run case cannot reach ──────────────────────────────
# `figure-compose.py` deletes any stale compose-report.json before it spawns the child, so
# its "this report is from a --control run" guard is unreachable through the CLI. That
# makes it exactly the kind of defensive branch that rots unnoticed - and it guards a real
# trap, measured: a `--control` run re-injects the ENGLISH and leaves `missing` EMPTY, so
# assertion 2 would compare [] against the send:false blocks and refuse a correct figure.
# So it is exercised here as a unit instead.
_mod = None
if WRAPPER.exists():
    import importlib.util
    try:
        _spec = importlib.util.spec_from_file_location('figure_compose', WRAPPER)
        _mod = importlib.util.module_from_spec(_spec)
        _spec.loader.exec_module(_mod)
    except Exception as exc:                      # noqa: BLE001
        _mod = None                               # module_from_spec binds BEFORE
        # exec_module, so without this the next check reports PASS on a module whose
        # import raised.
        check('8 figure-compose.py imports without running', False,
              f'{type(exc).__name__}: {exc}')
check('8 figure-compose.py imports without running', _mod is not None,
      'module not loaded' if _mod is None else '')


def _raises(fn):
    """-> (did it raise ComposeError, the keys it named, the message)."""
    try:
        fn()
    except _mod.ComposeError as exc:
        return True, exc.keys, str(exc)
    except Exception as exc:                      # noqa: BLE001
        return False, [], f'{type(exc).__name__}: {exc}'
    return False, [], ''


if _mod is not None:
    GOOD = {'blocks': ['a', 'b'], 'missing': ['b'], 'translated': ['a'],
            'degenerate': [], 'translationsPath': '/x.json', 'control': False}
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)

        class _Child:
            returncode, stderr = 0, ''

        (d / 'compose-report.json').write_text(json.dumps(GOOD))
        ok, _keys, msg = _raises(lambda: _mod.read_report(d, _Child))
        check('8a CONTROL read_report ACCEPTS a well-formed report', not ok, msg)

        (d / 'compose-report.json').write_text(json.dumps({**GOOD, 'control': True}))
        ok, _keys, msg = _raises(lambda: _mod.read_report(d, _Child))
        check('8b a report from a --control run is refused as stale',
              ok and 'control' in msg, msg)

        (d / 'compose-report.json').write_text(json.dumps(
            {k: v for k, v in GOOD.items() if k != 'missing'}))
        ok, _keys, msg = _raises(lambda: _mod.read_report(d, _Child))
        check('8c a report with no `missing` list is refused, not read as empty',
              ok and 'missing' in msg, msg)

        (d / 'compose-report.json').unlink()
        ok, _keys, msg = _raises(lambda: _mod.read_report(d, _Child))
        check('8d an absent report is refused', ok and 'compose-report.json' in msg, msg)

    # `verify`'s two directions produce DIFFERENT messages on purpose: a driver log full
    # of "key mismatch" cannot tell "we paid and shipped English" from "wrong directory".
    blocks = [{'key': 'a', 'send': True}, {'key': 'b', 'send': False}]
    ok, _k, msg = _raises(lambda: _mod.verify(
        GOOD, blocks, _mod.Translations(path='/x.json', keys=frozenset({'a'}),
                                        has_state=False)))
    # ⚠️ `msg == ''` IS LOAD-BEARING, and `not ok` alone was vacuous: `_raises` returns
    # ok=False for ANY non-ComposeError too, so a TypeError from a wrong call signature
    # read as "verify accepted this report". Measured on the red run for this very
    # change - an AttributeError printed PASS here.
    check('8e CONTROL verify PASSES on an agreeing report - nothing raised at all',
          not ok and msg == '', f'{msg!r}')

    # 🔴 `verify`'s THIRD argument is REQUIRED, not defaulted. The two directions below
    # differ ONLY in what the translations file was found to contain, so a default would
    # silently pick one of them - and picking wrong is exactly the defect being closed.
    present = _mod.Translations(path='/x.json', keys=frozenset({'a'}), has_state=False)
    absent = _mod.Translations(path='/x.json', keys=frozenset(), has_state=False)
    approved = _mod.Translations(path='/x.json', keys=frozenset(), has_state=True)

    ok, keys, msg = _raises(lambda: _mod.verify(
        {**GOOD, 'missing': ['a', 'b'], 'translated': []}, blocks, present))
    check('8f a key with an UNUSABLE entry is named, and the message says the entry '
          'exists', ok and keys == ['a'] and 'empty or whitespace-only' in msg
          and 'NO ENTRY' not in msg, f'{keys!r}: {msg}')

    ok, keys, msg = _raises(lambda: _mod.verify(
        {**GOOD, 'missing': ['a', 'b'], 'translated': []}, blocks, absent))
    check('8f-2 a key ABSENT from the file gets the OTHER message, and no purchase is '
          'claimed', ok and keys == ['a'] and 'NO ENTRY' in msg
          and 'BOUGHT' not in msg and 'empty or whitespace-only' not in msg,
          f'{keys!r}: {msg}')

    ok, keys, msg = _raises(lambda: _mod.verify(
        {**GOOD, 'missing': ['a', 'b'], 'translated': []}, blocks, approved))
    check('8f-3 ... and the deletion remedy flips when the file carries a `state`',
          ok and 'discards' in msg and 'no `state`' not in msg, f'{keys!r}: {msg}')

    # BOTH directions at once: a send:false key drawn as translated AND a send:true key
    # with no entry. The old code reported only the first branch it found, so a real
    # finding was hidden whenever the two coincided.
    ok, keys, msg = _raises(lambda: _mod.verify(
        {**GOOD, 'missing': ['a'], 'translated': ['b']}, blocks, absent))
    check('8f-4 a two-direction mismatch reports BOTH, not just the first',
          ok and sorted(keys) == ['a', 'b'] and 'NO ENTRY' in msg
          and 'send:false' in msg, f'{keys!r}: {msg}')

    ok, keys, msg = _raises(lambda: _mod.verify({**GOOD, 'blocks': ['a', 'b', 'b']},
                                                blocks, present))
    check('8g a block-set disagreement is a DIFFERENT message — stale directory, not '
          'lost money', ok and keys == ['b'] and 'stale' in msg, f'{keys!r}: {msg}')


# ── 9. A pdfminer PLACEHOLDER MUST NEVER BE DRAWN ON A PUBLISHED FIGURE ───────────────
# 🔴 THE DEFECT, MEASURED ON REAL ARTWORK (dataflow/F3, 2026-09-07). A block whose own text
# did not decode is held back from the MT by `figtext.sendable`, so it takes compose.py's
# ENGLISH-KEPT branch - and `strip-text.py` has already removed EVERY glyph from the
# artwork (`grep -ac '<text' artwork.svg` -> 0), so that label is REDRAWN from the read
# layer's text or not at all. On CNX_Chem_05_02_FoodLabel (47 blocks, 28 sendable, 2
# undecoded) figure-compose.py exited 0 and translated.svg carried two live elements:
#     <text ... >(cid:127) 5% or less</text>   <text ... >(cid:127) 20% or</text>
#
# 🔴 THE TOKEN IS NOT REMOVED UPSTREAM, DELIBERATELY: it is the POSITIVE EVIDENCE the hold
# is keyed on (`readlayer._looks_undecoded`). Stripping it at extraction would make the
# block read as clean prose and send it to the paid MT. The draw site is the only place.
#
# The fixture is SYNTHESISED rather than committed: one run of the committed figure gets a
# leading `(cid:127) `, and blocks.json is re-derived with the REAL rules (the same loop
# emit-blocks.py runs), because block keys are content-addressed and a hand-written
# blocks.json would be a second implementation of the rule the wrapper checks against.
K_CID = '(cid:127) Observation and curiosity'


def regenerate_blocks(out_dir):
    """Re-derive blocks.json from runs.json exactly as emit-blocks.py does. -> the entries."""
    import figtext as FT
    from blockkey import block_key, block_lines
    out_dir = Path(out_dir)
    runs = json.loads((out_dir / 'runs.json').read_text())
    fonts = json.loads((out_dir / 'meta.json').read_text())['fonts']
    entries = []
    for b in FT.merge_blocks(FT.group(runs)):
        arc = FT.is_arc(b)
        lines = block_lines(b)
        key = block_key(b)
        joined = key if arc else ' '.join(lines)
        entries.append(dict(key=key, english=joined, lines=lines, arc=arc,
                            send=FT.sendable(b, joined, fonts)))
    (out_dir / 'blocks.json').write_text(json.dumps(entries, indent=1, ensure_ascii=False))
    return entries


def drawn_text(svg_path):
    """Every string the composer DREW, read out of the SVG a reader would be served."""
    import re
    return re.findall(r'<text[^>]*>([^<]*)</text>',
                      Path(svg_path).read_text(encoding='utf-8'))


with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fig-cid'
    prep = run_prepare(FIXTURE, out, 'CNX_Fixture_Cid')
    check('9 PRECONDITION prepare produced the fixture directory', prep.returncode == 0,
          f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')

    # THE DECISIVE CONTROL, re-measured here rather than quoted: strip-text removed every
    # glyph, so a label that is not redrawn is ERASED - the original English cannot survive.
    art = (out / 'artwork.svg').read_text(encoding='utf-8')
    check('9a strip-text left NO text in the artwork, so every label is redrawn',
          '<text' not in art, f'{art.count("<text")} <text elements')

    runs = json.loads((out / 'runs.json').read_text())
    runs[0]['text'] = '(cid:127) ' + runs[0]['text']
    (out / 'runs.json').write_text(json.dumps(runs, ensure_ascii=False))
    entries = regenerate_blocks(out)
    by_key = {e['key']: e for e in entries}
    check('9b the read layer HOLDS the undecodable block back from the MT',
          K_CID in by_key and by_key[K_CID]['send'] is False, f'{sorted(by_key)}')
    check('9c ... and the other prose blocks are still sendable (the hold is not blanket)',
          by_key.get(K_HYP, {}).get('send') is True
          and by_key.get(K_TEST, {}).get('send') is True, f'{by_key.keys()}')

    tr = write_tr(Path(td) / 'cid.json',
                  {K_HYP: 'Setja fram tilgatu', K_TEST: 'Profa tilgatuna'})
    r = run_wrapper('--out', out, '--translations', tr)
    d = load_json(out / 'compose.json') or {}
    check('9d the wrapper composes it (a held block is not a failure)',
          r.returncode == 0 and d.get('outputPath'),
          f'exit {r.returncode}: {d!r}')

    texts = drawn_text(out / 'translated.svg') if (out / 'translated.svg').exists() else []
    check('9e NO pdfminer placeholder is drawn on the published figure',
          not any('(cid:' in t for t in texts), f'{texts!r}')
    # POSITIVE CONTROLS in the SAME output. Without them 9e passes against a composer that
    # drew nothing at all, or that erased the whole label rather than the token.
    check('9f ... and the label KEEPS the English that DID decode - it is not erased',
          any('Observation and curiosity' in t for t in texts), f'{texts!r}')
    check('9g ... and the translated siblings are still drawn',
          any('Setja fram tilgatu' in t for t in texts)
          and any('Profa tilgatuna' in t for t in texts), f'{texts!r}')
    check('9h ... and the send:false English block is untouched',
          any('H2O (g)' in t for t in texts), f'{texts!r}')

    # The remover and the DETECTOR are two representations of one token, in two modules.
    # Asserted against each other rather than described, because a drift here is silent:
    # the block is still held back, and the placeholder is drawn anyway.
    import figtext as _FT
    import readlayer as _RL
    probe = f'{_RL.CID}127) x'
    check('9i the remover matches everything readlayer\'s DETECTOR finds',
          _RL.CID in probe and _FT.strip_undecodable(probe) == 'x',
          f'{probe!r} -> {_FT.strip_undecodable(probe)!r}')
    check('9j ... and it leaves ordinary text alone',
          _FT.strip_undecodable(['Nutrition Facts', 'Calories 250'])
          == ['Nutrition Facts', 'Calories 250'],
          repr(_FT.strip_undecodable(['Nutrition Facts', 'Calories 250'])))


# ── 9k. THE PUREST CASE: a block whose ENTIRE text is the placeholder ─────────────────
# 🔴 THE ONE WAY THE SCRUB COULD BE WORSE THAN THE DEFECT. Every case above has English
# AFTER the token, so something is left to draw. A lone unmerged bullet glyph strips to '',
# and `wrap([''])` -> [''] -> `measure('')` -> `show_text('')` -> svgout. If that path
# refused or produced a malformed SVG, this fix would convert reader-visible garbage into a
# FATAL failed-compose for the figure, which is strictly worse. Measured, not assumed.
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fig-pure-cid'
    prep = run_prepare(FIXTURE, out, 'CNX_Fixture_PureCid')
    check('9k PRECONDITION prepare produced the fixture directory', prep.returncode == 0,
          f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
    runs = json.loads((out / 'runs.json').read_text())
    runs[0]['text'] = '(cid:127)'
    (out / 'runs.json').write_text(json.dumps(runs, ensure_ascii=False))
    entries = regenerate_blocks(out)
    check('9l the whole-placeholder block is held back', 
          {e['key']: e['send'] for e in entries}.get('(cid:127)') is False,
          f"{[(e['key'], e['send']) for e in entries]}")

    tr = write_tr(Path(td) / 'pure.json',
                  {K_HYP: 'Setja fram tilgatu', K_TEST: 'Profa tilgatuna'})
    r = run_wrapper('--out', out, '--translations', tr)
    d = load_json(out / 'compose.json') or {}
    check('9m composing a figure whose label is NOTHING BUT a placeholder still succeeds',
          r.returncode == 0 and d.get('outputPath'), f'exit {r.returncode}: {d!r}')

    svg = (out / 'translated.svg').read_text(encoding='utf-8') \
        if (out / 'translated.svg').exists() else ''
    texts = drawn_text(out / 'translated.svg') if (out / 'translated.svg').exists() else []
    check('9n ... the SVG is well formed and carries no placeholder',
          svg.rstrip().endswith('</svg>') and '(cid:' not in svg, f'{len(svg)} bytes')
    # POSITIVE CONTROL: the figure's other three labels are untouched, so 9n cannot pass
    # against a composer that drew nothing at all.
    check('9o ... and every OTHER label is still drawn',
          all(any(w in t for t in texts)
              for w in ('Setja fram tilgatu', 'Profa tilgatuna', 'H2O (g)')), f'{texts!r}')
    # RECORDED, not merely tolerated: the stripped label leaves ONE empty <text> element.
    # It renders nothing and is well formed. `wrap()` already emits '' for a blank paragraph,
    # so this shape predates the scrub - it is pinned here so a future change to it is a
    # decision rather than a surprise.
    check('9p ... leaving exactly one empty, inert <text> element',
          sum(1 for t in texts if t.strip() == '') == 1, f'{texts!r}')

# ── 10. THE DRIVER'S OWN SIDECAR AS `--translations` — the seam nothing crossed ───────
# 🔴 EVERY COMPOSE IN THE DRIVER'S 74-TEST PAID SUITE GOES THROUGH A FAKE `spawn` THAT
# WRITES A SUCCESS compose.json, so `verify()` had never run against a driver-minted
# sidecar anywhere in the tree. The driver hands the SIDECAR FILE ITSELF to
# `--translations` (figure-run.js step 9) and relies on two things it never checks:
# `compose.py` reading `TR = _tr.get('blocks', _tr)`, which steps past the envelope, and
# `normalise_block_value` accepting the sidecar's FLAT STRINGS. A change to either — or
# to the sidecar's shape — makes every figure in every chapter fail at compose, and no
# test in either language could see it.
#
# 🔴 THE SIDECAR IS MINTED BY THE DRIVER'S OWN JS MODULE, NOT HAND-WRITTEN. `node` writes
# it through `tools/lib/figure-text-sidecar.cjs` — the same `writeSidecar`,
# `computeRenderHash`, `sidecarPath`, `SIDECAR_VERSION` and `COMPOSER_VERSION` the driver
# uses — so this really is the file the driver produces, serialization and path included.
# ⚠️ RESIDUAL LIMIT, stated rather than glossed: the OBJECT LITERAL is transcribed from
# figure-run.js step 7, which does not export it. A change to the sidecar MODULE is
# caught here; a change to that literal is not.
REPO_ROOT = HERE.parents[1]
SIDECAR_JS = REPO_ROOT / 'tools' / 'lib' / 'figure-text-sidecar.cjs'

# ⚠️ `node -e` PUTS NO SCRIPT PATH IN argv: it is [execPath, ...args], so the first user
# argument is argv[1], not argv[2]. Measured — the argv[2] form reads `undefined` and dies
# in `require`, which arrives here as "--translations file does not exist: .../None".
MINT = """
const m = require(process.argv[1]);
const [bookDir, basename, blocksJson] = process.argv.slice(2);
const blocks = JSON.parse(blocksJson);
// figure-run.js step 7, verbatim: renderHash and NO `state`.
m.writeSidecar(bookDir, basename, {
  version: m.SIDECAR_VERSION,
  basename,
  renderHash: m.computeRenderHash(blocks, m.COMPOSER_VERSION),
  composerVersion: m.COMPOSER_VERSION,
  blocks,
});
process.stdout.write(m.sidecarPath(bookDir, basename));
"""


def mint_sidecar(book_dir, basename, blocks):
    """Write the sidecar the DRIVER would write, using the driver's own module."""
    r = subprocess.run(['node', '-e', MINT, str(SIDECAR_JS), str(book_dir), basename,
                        json.dumps(blocks, ensure_ascii=False)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None, r
    return Path(r.stdout.strip()), r


# THE INSTRUMENT'S OWN CONTROL, FIRST: if `node` is missing every case below would report
# a plausible-looking refusal for the wrong reason. Prove the minter works before using it.
with tempfile.TemporaryDirectory() as td:
    probe_path, probe = mint_sidecar(Path(td) / 'books' / 'probe', 'PROBE', {'a': 'b'})
    minted = json.loads(probe_path.read_text(encoding='utf-8')) if probe_path else {}
    check('10 PRECONDITION the driver\'s own module mints a sidecar here',
          probe_path is not None and probe_path.exists()
          and minted.get('basename') == 'PROBE' and minted.get('blocks') == {'a': 'b'}
          and isinstance(minted.get('renderHash'), str) and minted['renderHash']
          and 'state' not in minted,
          f'exit {probe.returncode}: {probe.stderr.strip()[-300:]} :: {minted!r}')

# 10a-10f: THE AGREEING CASE. The sidecar carries exactly the three send:true keys, which
# is what every driver-minted sidecar holds by construction (step 8 refuses any other key
# set before the figure is ever composed).
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fig-sidecar-ok'
    prep = run_prepare(FIXTURE, out, 'CNX_Fixture_Sidecar')
    check('10a PRECONDITION prepare produced the fixture directory', prep.returncode == 0,
          f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
    sidecar, _ = mint_sidecar(Path(td) / 'books' / 'figrun-testbook', 'CNX_Fixture_Sidecar',
                              {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu',
                               K_TEST: 'Profa tilgatuna'})
    r = run_wrapper('--out', out, '--translations', sidecar)
    d = load_json(out / 'compose.json') or {}
    check('10b A DRIVER-MINTED SIDECAR IS A VALID --translations PAYLOAD: exit 0',
          r.returncode == 0 and not d.get('error') and d.get('outputPath'),
          f'exit {r.returncode}: {d!r} :: {r.stderr.strip()[-300:]}')
    svg_text = Path(d['outputPath']).read_text(encoding='utf-8') if d.get('outputPath') \
        and Path(d['outputPath']).exists() else ''
    # NON-VACUITY: the envelope did not merely fail to crash it — the Icelandic INSIDE
    # `blocks` reached the SVG and the English left it. `compose.py` steps past the
    # envelope with `TR = _tr.get('blocks', _tr)`; without that this exits 0 having drawn
    # every label in English.
    check('10c ... and the Icelandic in `blocks` REACHED the svg, the English leaving it',
          'Athugun' in svg_text and 'Profa tilgatuna' in svg_text
          and K_OBS not in svg_text and K_TEST not in svg_text,
          f'{len(svg_text)} bytes: Athugun={"Athugun" in svg_text} '
          f'obs-english={K_OBS in svg_text}')
    # The same decoy that makes case 2 a control: a send:false block prints the ENGLISH
    # KEPT warning on a PASSING run, so nothing here may be keyed on that warning.
    check('10d ... while the send:false formula stays in English, as it must',
          K_VERBATIM in svg_text, f'{K_VERBATIM!r} in svg={K_VERBATIM in svg_text}')
    rep = load_json(out / 'compose-report.json') or {}
    check('10e ... and the composer read OUR file, not one left in the directory',
          rep.get('translationsPath') == str(sidecar), f"{rep.get('translationsPath')!r}")
    check('10f ... partitioning the four keys 3 translated / 1 missing, as case 2 does',
          sorted(rep.get('translated', [])) == sorted([K_OBS, K_HYP, K_TEST])
          and rep.get('missing') == [K_VERBATIM], f'{rep!r}')

# 10g-10j: THE DRIFT ARM, and the reason this section exists at all. This file's own
# docstring defers it in writing: "A sidecar that had acquired a translation for a
# `send:false` block ... would leave that key out of `missing` and refuse a CORRECT
# recompose. That direction is reported with its own wording; making it non-fatal is a
# behaviour change and is not this wrapper's to take." The DRIVER now refuses this shape
# before it ever spawns a composer (`applyPartialDriftGuard`, pinned in
# tools/__tests__/figure-run-paid.test.js) — so what is measured here is the backstop
# underneath that guard: if the driver's check is ever removed or narrowed, THIS is what
# the operator meets, and it must name the key rather than fail obscurely.
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fig-sidecar-drift'
    prep = run_prepare(FIXTURE, out, 'CNX_Fixture_Drift')
    check('10g PRECONDITION prepare produced the fixture directory', prep.returncode == 0,
          f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
    # The figure was bought when this key was send:true; the read layer now holds it back.
    sidecar, _ = mint_sidecar(Path(td) / 'books' / 'figrun-testbook', 'CNX_Fixture_Drift',
                              {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu',
                               K_TEST: 'Profa tilgatuna', K_VERBATIM: K_VERBATIM})
    r = run_wrapper('--out', out, '--translations', sidecar)
    d = load_json(out / 'compose.json') or {}
    err = d.get('error', '')
    check('10h a sidecar carrying a key blocks.json now holds back is REFUSED (exit 1)',
          refused(r, 1) and d.get('keys') == [K_VERBATIM],
          f'exit {r.returncode}: {d!r}')
    check('10i ... and the refusal NAMES send:false rather than blaming the MT',
          'send:false' in err and 'BOUGHT' not in err, f'{err!r}')
    check('10j ... and no translated.svg is left behind claiming success',
          not (out / 'translated.svg').exists(),
          f"translated.svg present={(out / 'translated.svg').exists()}")


print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
