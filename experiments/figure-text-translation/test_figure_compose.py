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

🔴 SECTION 12 IS heldBlockValues (§C140 ㊾ D5(a), design
docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md, D-d/D-e/D-i F1-F11).
figure-compose.py is the ONE reader of the table: a pre-flight refuses a configured key that matches
no block, is send:true, or is also translated, BEFORE anything is spawned or written; it hands this
figure's values to compose.py in `<out>/held-values.json`; and `verify` checks the held labels compose
drew against blocks.json as a multiset before the money check subtracts them. F4 and F10 are the
CONTROLS that make the refusals mean anything: a configured value IS drawn, and the production route
(no --config) reads the committed config. Every value there is an ASCII sentinel (QZ...).
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

# The composer's NOTE lists that figure-compose.py copies into compose.json (§C140 ② ③ ⑨ ㊾).
# Spelled out here rather than read from the wrapper, so a list the wrapper stops copying fails
# this file instead of silently shrinking the set it is checked against. `held` (§C140 ㊾ D5(a)) is
# the labels drawn from heldBlockValues; `heldErrors` is NOT a note - verify refuses it (section 12).
COMPOSE_NOTES = ('unformatted', 'overflow', 'localized', 'containerErrors', 'held')

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
    # §C140: compose.json carries the composer's five NOTE lists beside outputPath, so the
    # driver can name them without a second file. Each must be the REPORT'S list, and a report
    # that has none (an older composer's) must read as [] - a note is never a refusal. Section 11
    # carries the non-empty arm, which this fixture cannot produce.
    check("2h compose.json carries the composer's five note lists, each the report's own "
          "(or [] where the report has none)",
          all(isinstance(d.get(k), list) and d.get(k) == rep.get(k, [])
              for k in COMPOSE_NOTES),
          f'compose.json keys {sorted(d)}; report lists '
          + repr({k: rep.get(k) for k in COMPOSE_NOTES}))


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


# ── 4f. a missing artwork.pdf is refused BEFORE compose.py runs ──────────────────────
# §C140 ③: compose.py reads the stripped artwork.pdf for CONTAINER DETECTION, lazily, on the
# first translated label it lays out - and that load sits outside the detector's never-raises
# boundary. Measured on the ③ composer (reviews.txt, 'artwork.pdf is a new required input'): a
# missing artwork.pdf exits 1 with FileNotFoundError and NO compose-report.json, but only on a
# figure that carries a translation - a figure with none composes fine. Case 4's pre-flight is the
# same remedy for the same shape, so it is asserted the same way, paired control included.
# 🔴 BUT 4c's SHAPE IS VACUOUS HERE, MEASURED. On the ③ composer the UNCHANGED wrapper already
# exits 1 with no PNG and no report - the child crashes before it writes either - and its
# "wrote no compose-report.json" message quotes the child's stderr, traceback and `artwork.pdf`
# included. So "refused" and "names artwork.pdf" pass without any pre-flight at all. What only a
# pre-flight produces is a refusal with NO traceback and in the pre-flight's own wording, and
# that is what 4h and 4i assert.
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fig-nopdf'
    prep = run_prepare(FIXTURE, out, 'CNX_Fixture_NoPdf')
    check('4f PRECONDITION prepare produced the fixture directory, artwork.pdf included',
          prep.returncode == 0 and (out / 'artwork.pdf').is_file(),
          f"exit {prep.returncode}, artwork.pdf={(out / 'artwork.pdf').is_file()}: "
          f"{prep.stderr.strip()[-400:]}")
    tr = write_tr(Path(td) / 'full.json',
                  {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu',
                   K_TEST: 'Profa tilgatuna'})
    keep = Path(td) / 'artwork.pdf.keep'
    shutil.move(str(out / 'artwork.pdf'), str(keep))

    r = run_wrapper('--out', out, '--translations', tr)
    d = load_json(out / 'compose.json') or {}
    check('4g a missing artwork.pdf is refused (exit 1)', refused(r, 1),
          f'exit {r.returncode}: {r.stderr.strip()[-300:]}')
    check('4h ... BEFORE compose.py ran — no translated.png, no compose-report.json, and no '
          'composer traceback',
          not (out / 'translated.png').exists()
          and not (out / 'compose-report.json').exists()
          and 'Traceback' not in r.stderr,
          f"png={(out / 'translated.png').exists()} "
          f"report={(out / 'compose-report.json').exists()} "
          f"traceback={'Traceback' in r.stderr}")
    err = d.get('error', '') if isinstance(d.get('error'), str) else ''
    check('4i ... and compose.json names artwork.pdf AS A MISSING INPUT, not as a crash',
          'artwork.pdf is missing' in err and 'wrote no compose-report.json' not in err,
          f'{d!r}')

    # PAIRED CONTROL, as 4d: "no translated.png" is also what a wrapper that silently does
    # nothing produces. Restore the file and require both artefacts to appear.
    shutil.move(str(keep), str(out / 'artwork.pdf'))
    r2 = run_wrapper('--out', out, '--translations', tr)
    check('4j CONTROL with artwork.pdf restored the SAME probe produces both files',
          r2.returncode == 0 and (out / 'translated.png').exists()
          and (out / 'compose-report.json').exists(),
          f"exit {r2.returncode}, png={(out / 'translated.png').exists()}, "
          f"report={(out / 'compose-report.json').exists()}")


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
# the money assertion would compare [] against the send:false blocks and refuse a correct figure.
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
    from blockkey import block_key, block_lines, block_english
    out_dir = Path(out_dir)
    runs = json.loads((out_dir / 'runs.json').read_text())
    fonts = json.loads((out_dir / 'meta.json').read_text())['fonts']
    entries = []
    for b in FT.merge_blocks(FT.group(runs)):
        arc = FT.is_arc(b)
        lines = block_lines(b)
        key = block_key(b)
        joined = block_english(b)
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
    got = _FT.run_draw_text({'text': probe})
    check("9i the remover that DRAWS matches everything readlayer's DETECTOR finds",
          _RL.CID in probe and got == (' x', True), f'{probe!r} -> {got!r}')
    plain = _FT.run_draw_text({'text': 'Nutrition Facts '})
    check('9j ... and it leaves ordinary text alone, edge space included',
          plain == ('Nutrition Facts ', False), repr(plain))


# ── 9k. THE PUREST CASE: a block whose ENTIRE text is the placeholder ─────────────────
# 🔴 THE ONE WAY THE SCRUB COULD BE WORSE THAN THE DEFECT. Every case above has English
# AFTER the token, so something is left to draw. A lone unmerged bullet glyph is a block
# whose only run strips to '' — the block is KEPT (see compose.py) and drawn via
# `draw_run_exact`, which removes the placeholder token and SKIPS the now-empty run rather
# than drawing it: 9p pins zero empty <text> elements and 9q proves the block was still
# processed (undecodable + runExact) rather than silently dropped. If the scrub instead
# produced a malformed SVG or a fatal compose, this fix would have converted reader-visible
# garbage into something strictly worse. Measured, not assumed.
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
    # RE-PINNED by E (§C140 ①), a DECISION: a run that is nothing but a placeholder strips to
    # '' and draw_run_exact SKIPS it, so no empty <text> element is written any more (the old
    # composer wrote exactly one). An absence proves nothing on its own - 9q pairs it.
    check('9p ... drawing NO empty <text> element: a run that strips to nothing is skipped',
          sum(1 for t in texts if t.strip() == '') == 0, f'{texts!r}')
    rep = load_json(out / 'compose-report.json') or {}
    check('9q ... PAIRED: the placeholder block WAS processed - named undecodable, drawn '
          'run-exact', '(cid:127)' in rep.get('undecodable', [])
          and '(cid:127)' in rep.get('runExact', []),
          f"undecodable={rep.get('undecodable')!r} runExact={rep.get('runExact')!r}")

# ── 10. THE DRIVER'S OWN SIDECAR AS `--translations` — the seam nothing crossed ───────
# 🔴 EVERY COMPOSE IN THE DRIVER'S PAID SUITE GOES THROUGH A FAKE `spawn` THAT
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


# ── 11. THE COMPOSER'S NOTES REACH compose.json — THROUGH main(), NOT A HELPER ────────
# §C140 ② ③ ⑨ ㊾. compose-report.json carries five note lists beside its key sets - `unformatted`,
# `overflow`, `localized`, `containerErrors`, `held` - and the driver reads compose.json, never the
# report, so a list the wrapper does not copy is a list nobody sees. Case 2h can only show []
# (the committed fixture has nothing to style, nothing to overhang, no decimal and a detectable
# page), so this plants the CHILD: `run_compose` is replaced in-process by one that writes a
# report the real `verify` accepts, and `main()` is driven for real - validate, read_report,
# verify and the compose.json write all run.
# ⚠️ THROUGH main() ON PURPOSE. A unit test of a payload helper stays green against a main() that
# writes five hand-built [] lists, and case 2h cannot tell that apart either.
NOTES_PLANTED = {
    'unformatted': [
        {'key': K_OBS, 'token': 'Na3PO4', 'stretch': '3', 'reason': 'absent', 'candidates': 0},
        {'key': K_OBS, 'token': 'Na3PO4', 'stretch': '4', 'reason': 'absent', 'candidates': 0},
    ],
    'overflow': [
        {'key': K_TEST, 'block': 2, 'word': 'Prósentusamsetningar', 'needPt': 75.04028320312501,
         'budgetPt': 33.999999999999986, 'sizePt': 7.5, 'axis': 'width'},
    ],
    # multiplicity is data: a figure that draws one localised key twice names it twice
    'localized': [K_HYP, K_HYP],
    'containerErrors': [{'key': K_TEST, 'block': 2, 'why': 'error: KeyError'}],
    # §C140 ㊾ D5(a): a label drawn from heldBlockValues. `verify` checks this list before it is copied
    # (the held contract), so the planted figure really CONFIGURES that key - main_with_planted_report
    # writes the --config - and the planted `missing` leaves it out. 11a is then the copy of a held list
    # verify accepted, never one it would refuse.
    'held': [{'key': K_VERBATIM, 'block': 3, 'changed': [0]}],
}
HELD_PLANTED = {K_VERBATIM: 'QZX'}
# Report fields that are NOT notes, planted so 11b can show they stay out of compose.json: `heldErrors` is
# fatal at verify (never a note), and the two paths are the composer's own bookkeeping.
REPORT_ONLY = {'heldErrors': [], 'heldValuesPath': '/planted/held-values.json',
               'heldConfigPath': '/planted/figure-text.config.json'}


def main_with_planted_report(extra_report, held_values=None):
    """Prepare the fixture, plant a verify-clean report carrying `extra_report`, drive main().
    `held_values` None = no --config (the production route, the committed config); a dict = a --config
    whose heldBlockValues configures exactly that for this figure.
    -> (main's return code, the compose.json it wrote, the prepare result, `handed`): `handed` records
    what main() gave the child - the held-values path and that file's content AT SPAWN TIME - plus
    `out` and `config`."""
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / 'fig-notes'
        prep = run_prepare(FIXTURE, out, 'CNX_Fixture_Notes')
        tr = write_tr(Path(td) / 'full.json',
                      {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu',
                       K_TEST: 'Profa tilgatuna'})
        blocks = load_json(out / 'blocks.json') or []
        drawn_held = {h['key'] for h in extra_report.get('held', [])}
        report = {'blocks': [b['key'] for b in blocks],
                  'missing': [b['key'] for b in blocks
                              if not b.get('send') and b['key'] not in drawn_held],
                  'translated': [b['key'] for b in blocks if b.get('send')],
                  'translationsPath': str(tr), 'control': False, **extra_report}
        argv = ['--out', str(out), '--translations', str(tr)]
        handed = {'out': out.resolve(), 'config': None, 'path': None, 'doc': None}
        if held_values is not None:
            cfg = Path(td) / 'config.json'
            cfg.write_text(json.dumps({'heldBlockValues': {'CNX_Fixture_Notes': held_values}},
                                      ensure_ascii=False), encoding='utf-8')
            handed['config'] = cfg.resolve()
            argv += ['--config', str(cfg)]

        class _Child:
            returncode, stdout, stderr = 0, '', ''

        # The third parameter is DEFAULTED so the same child serves a wrapper that does not pass one.
        def planted_child(out_dir, _translations, held_path=None):
            handed['path'] = held_path
            handed['doc'] = load_json(held_path) if held_path else None
            (out_dir / 'compose-report.json').write_text(
                json.dumps(report, ensure_ascii=False), encoding='utf-8')
            (out_dir / 'translated.svg').write_text('<svg/>', encoding='utf-8')
            return _Child

        real = _mod.run_compose
        _mod.run_compose = planted_child
        try:
            rc = _mod.main(argv)
        except SystemExit as exc:                 # argparse refusing a flag: report its code, run on
            rc = exc.code
        finally:
            _mod.run_compose = real
        return rc, load_json(out / 'compose.json') or {}, prep, handed


if _mod is not None:
    rc, d, prep, handed = main_with_planted_report({**NOTES_PLANTED, **REPORT_ONLY}, HELD_PLANTED)
    check('11 PRECONDITION the planted report is one verify ACCEPTS - main() exits 0 with an '
          'outputPath, so 11a is about the copy and not a refusal',
          prep.returncode == 0 and rc == 0 and d.get('outputPath') and 'error' not in d,
          f'prepare exit {prep.returncode}, main {rc}: {d!r}')
    check('11a compose.json carries all five note lists VERBATIM - draw order, multiplicity '
          'and every field of every entry',
          all(d.get(k) == NOTES_PLANTED[k] for k in COMPOSE_NOTES),
          repr({k: d.get(k) for k in COMPOSE_NOTES}))
    check('11b ... and nothing else from the report leaks into compose.json - not heldErrors, '
          'not the two held paths',
          set(d) == {'outputPath', *COMPOSE_NOTES}, f'{sorted(d)}')
    check("11e main() hands the child <out>/held-values.json, already written at spawn time with "
          "this figure's basename, the --config path and its configured values",
          handed['path'] is not None
          and Path(handed['path']).resolve() == handed['out'] / 'held-values.json'
          and handed['doc'] == {'basename': 'CNX_Fixture_Notes', 'configPath': str(handed['config']),
                                'values': HELD_PLANTED},
          f"path={handed['path']!r} doc={handed['doc']!r}")

    # THE OLDER COMPOSER. Its report has none of the lists, and that must read as EMPTY lists -
    # never a refusal, because none of them is a verdict - when nothing is configured for the figure.
    rc, d, prep, handed = main_with_planted_report({})
    check("11c a report WITHOUT the lists (an older composer's) still composes, exit 0",
          prep.returncode == 0 and rc == 0 and d.get('outputPath') and 'error' not in d,
          f'prepare exit {prep.returncode}, main {rc}: {d!r}')
    check('11d ... and its compose.json carries each list as []',
          all(d.get(k) == [] for k in COMPOSE_NOTES),
          repr({k: d.get(k) for k in COMPOSE_NOTES}))


# ── 12. heldBlockValues — the pre-flight, the hand-off, and verify's held contract ────────────
# §C140 ㊾ D5(a); design D-d, D-e, D-f, D-i (F1-F11). figure-compose.py is the ONE reader of
# figure-text.config.json's `heldBlockValues`. It takes THIS figure's entry by exact basename (meta.json's
# `source` stem), refuses before anything is spawned or written a key that matches no block, is
# send:true, or is also in --translations, and hands the values to compose.py in <out>/held-values.json
# (always - `{}` included). `verify` then checks the held labels compose DREW against blocks.json as a
# multiset and only then subtracts them from the send:false keys the money check expects in `missing`.
# 🔴 EVERY ARM RUNS THROUGH `attempt`, so a wrapper that lacks this (no --config, a 3-argument
# run_compose, no `held=`) prints FAIL lines rather than killing the file.
# ⚠️ SOURCE_DATE_EPOCH: fontTools stamps a font subset's head.modified from it, and translated.svg
# embeds the FigIS subset - F5's byte identity across two runs needs it in the spawn environment.
os.environ.setdefault('SOURCE_DATE_EPOCH', '1700000000')
import heldvalues as HV                         # noqa: E402 - stdlib only (test_heldvalues HV7)
from fontTools.ttLib import TTFont              # noqa: E402 - after the pylibs bootstrap

TR12 = {K_OBS: 'QZO', K_HYP: 'QZH', K_TEST: 'QZT'}     # ASCII sentinels for the three send:true keys
GEOM = json.loads((HERE / 'evidence' / '2026-10-03-c140-held' / 'held-geometry.json')
                  .read_text(encoding='utf-8'))
MATT = GEOM['figures']['CNX_Chem_01_02_MattType']
MATT_RUNS = [dict(r) for b in MATT['blocks'] for r in b['runs']]      # the three real `No`


def attempt(label, fn):
    """Run one arm; an exception is a FAIL of that arm, never a crash of the file."""
    try:
        fn()
    except Exception as exc:                      # noqa: BLE001 - reported, not swallowed
        check(label + ' (raised)', False, f'{type(exc).__name__}: {exc}')


def write_config(path, table):
    """A --config file whose `heldBlockValues` is `table`, written VERBATIM (any JSON value)."""
    Path(path).write_text(json.dumps({'heldBlockValues': table}, ensure_ascii=False),
                          encoding='utf-8')
    return Path(path)


def err_of(d):
    return d.get('error') if isinstance(d.get('error'), str) else ''


def held_of(d):
    """compose.json / compose-report.json `held` as (key, block, changed) tuples, or the raw value."""
    h = d.get('held')
    return [(e.get('key'), e.get('block'), e.get('changed')) for e in h] if isinstance(h, list) else h


SPAWN_TRACES = ('compose-report.json', 'translated.png', 'held-values.json')


def clean(out):
    """Remove what a spawned run leaves, so the next arm's `not_spawned` reads only its OWN run."""
    for n in SPAWN_TRACES:
        (out / n).unlink(missing_ok=True)


def not_spawned(out):
    """-> (True when nothing past the pre-flight happened, a detail string)."""
    seen = {n: (out / n).exists() for n in SPAWN_TRACES}
    return not any(seen.values()), repr(seen)


_FACES = {}


def text_adv(text, size, bold=False, italic=False):
    """The drawn width from the face FILES with fontTools - one instrument for both sides of F4's
    comparison (test_compose_t23.py's)."""
    from figis import face_path
    k = (bool(bold), bool(italic))
    if k not in _FACES:
        f = TTFont(str(face_path(k)))
        _FACES[k] = (f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm)
    cmap, hmtx, upm = _FACES[k]
    return sum(hmtx[cmap.get(ord(c), '.notdef')][0] for c in text) * size / upm


def svg_items(svg_path):
    """[(text, x, y-in-SVG, laid-out?)] for every <text> element, in document order."""
    import re
    out = []
    for m in re.finditer(r'<text ([^>]*)>([^<]*)</text>', Path(svg_path).read_text(encoding='utf-8')):
        a = dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1)))
        out.append((m.group(2), float(a['x']), float(a['y']), 'font-kerning:none' in a.get('style', '')))
    return out


def plant_matt(td, basename):
    """The fixture prepared under `basename`, its runs.json REPLACED by MattType's three real `No`
    (evidence/2026-10-03-c140-held/held-geometry.json, unshifted - they fit the 300 x 220 page), its
    meta fonts extended with MattType's, and blocks.json re-derived by the REAL rules. -> (out, prepare
    result, blocks.json entries)."""
    out = Path(td) / basename
    prep = run_prepare(FIXTURE, out, basename)
    if prep.returncode != 0:
        return out, prep, []
    (out / 'runs.json').write_text(json.dumps(MATT_RUNS, ensure_ascii=False))
    meta = json.loads((out / 'meta.json').read_text())
    meta['fonts'].update(MATT['fonts'])
    (out / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False))
    return out, prep, regenerate_blocks(out)


# F1-F3: the three pre-flight refusals of a key. Each is asserted BEFORE the spawn - no report, no png,
# no held-values.json - on a freshly prepared directory, so "never written" cannot be a leftover.
def f1_f3():
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / 'fig-f1'
        prep = run_prepare(FIXTURE, out, 'CNX_Fixture_F1')
        check('12 PRECONDITION prepare produced the fixture directory', prep.returncode == 0,
              f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')

        stale = 'QZ no such label'
        r = run_wrapper('--out', out, '--translations', write_tr(Path(td) / 'tr1.json', TR12),
                        '--config', write_config(Path(td) / 'c1.json',
                                                 {'CNX_Fixture_F1': {stale: 'QZX'}}))
        d = load_json(out / 'compose.json') or {}
        quiet, seen = not_spawned(out)
        check('F1 a configured key that matches no block is REFUSED (exit 1) and named',
              refused(r, 1) and d.get('keys') == [stale], f'exit {r.returncode}: {d!r}')
        check('F1b ... compose.json says it `matches no block`', 'matches no block' in err_of(d)
              and stale in err_of(d), repr(err_of(d)))
        check('F1c ... BEFORE the spawn: no compose-report.json, translated.png or held-values.json',
              quiet, seen)

        # F2's translations file OMITS the send:true key, so only one reason can fire.
        clean(out)
        r = run_wrapper('--out', out, '--translations',
                        write_tr(Path(td) / 'tr2.json', {K_HYP: 'QZH', K_TEST: 'QZT'}),
                        '--config', write_config(Path(td) / 'c2.json',
                                                 {'CNX_Fixture_F1': {K_OBS: 'QZX'}}))
        d = load_json(out / 'compose.json') or {}
        quiet, seen = not_spawned(out)
        check('F2 a configured key that blocks.json marks send:true is refused before the spawn',
              refused(r, 1) and d.get('keys') == [K_OBS] and 'send:true' in err_of(d)
              and '--translations' not in err_of(d) and quiet, f'exit {r.returncode}: {d!r} {seen}')

        clean(out)
        r = run_wrapper('--out', out, '--translations',
                        write_tr(Path(td) / 'tr3.json', {**TR12, K_VERBATIM: 'QZW'}),
                        '--config', write_config(Path(td) / 'c3.json',
                                                 {'CNX_Fixture_F1': {K_VERBATIM: 'QZX'}}))
        d = load_json(out / 'compose.json') or {}
        quiet, seen = not_spawned(out)
        check('F3 a configured key that the --translations file ALSO translates is refused - two '
              'authors for one label', refused(r, 1) and d.get('keys') == [K_VERBATIM]
              and '--translations' in err_of(d) and 'send:true' not in err_of(d) and quiet,
              f'exit {r.returncode}: {d!r} {seen}')


# F4 + F10: the CONTROLS. A configured value IS drawn, where the block was; and with no --config the
# production route reads the committed config, writing held-values.json even when it holds nothing.
def f4_f10():
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / 'fig-f4'
        prep = run_prepare(FIXTURE, out, 'CNX_Fixture_F4')
        blocks = load_json(out / 'blocks.json') or []
        cands = [b for b in blocks if not b['send'] and not b['arc'] and len(b['lines']) == 1]
        check('F4 PRECONDITION the fixture has a single-line send:false non-arc block, and it is the '
              'formula', prep.returncode == 0 and cands and cands[0]['key'] == K_VERBATIM,
              repr([(b['key'], b['send']) for b in blocks]))
        key, sent = K_VERBATIM, 'QZ'
        bi = [b['key'] for b in blocks].index(key)
        src = next(r for r in json.loads((out / 'runs.json').read_text()) if r['text'] == key)
        page_h = json.loads((out / 'meta.json').read_text())['page'][1]
        check('F4 PRECONDITION the sentinel is narrower than the key, by ONE linear measure',
              text_adv(sent, src['size']) < text_adv(key, src['size']),
              f"{text_adv(sent, src['size']):.3f} < {text_adv(key, src['size']):.3f}")
        cfg = write_config(Path(td) / 'c4.json', {'CNX_Fixture_F4': {key: sent}})
        r = run_wrapper('--out', out, '--translations', write_tr(Path(td) / 'tr4.json', TR12),
                        '--config', cfg)
        d = load_json(out / 'compose.json') or {}
        rep = load_json(out / 'compose-report.json') or {}
        check('F4 CONTROL a configured send:false key composes, exit 0, and compose.json `held` lists '
              'it ONCE', r.returncode == 0 and 'error' not in d and held_of(d) == [(key, bi, [0])],
              f'exit {r.returncode}: {d!r} :: {r.stderr.strip()[-300:]}')
        items = svg_items(out / 'translated.svg') if (out / 'translated.svg').exists() else []
        mine = [i for i in items if i[0] == sent]
        check("F4b ... translated.svg draws the sentinel, laid out, on the block's baseline and inside "
              "its source extent - and not the key",
              len(mine) == 1 and mine[0][3] and abs(mine[0][2] - (page_h - src['y'])) <= 0.01
              and src['x'] - 0.01 <= mine[0][1] <= src['x'] + src['adv']
              and not [i for i in items if i[0] == key], f'{mine!r} of {items!r}')
        check('F4c ... the report keeps it out of `missing`, with no heldErrors, and names the file',
              rep.get('missing') == [] and rep.get('heldErrors') == []
              and rep.get('heldValuesPath') == str((out / 'held-values.json').resolve()),
              f"missing={rep.get('missing')!r} heldErrors={rep.get('heldErrors')!r} "
              f"heldValuesPath={rep.get('heldValuesPath')!r}")
        check('F4d ... and held-values.json carries the basename, the --config path and the values',
              load_json(out / 'held-values.json') == {'basename': 'CNX_Fixture_F4',
                                                      'configPath': str(cfg.resolve()),
                                                      'values': {key: sent}},
              repr(load_json(out / 'held-values.json')))

        # F10: the SAME directory through the production route - no --config.
        r = run_wrapper('--out', out, '--translations', write_tr(Path(td) / 'tr10.json', TR12))
        d = load_json(out / 'compose.json') or {}
        rep = load_json(out / 'compose-report.json') or {}
        hv = load_json(out / 'held-values.json')
        committed = str(HERE / 'figure-text.config.json')
        check('F10 CONTROL with no --config the wrapper reads the COMMITTED config and still writes '
              'held-values.json: values {} for this basename', r.returncode == 0
              and hv == {'basename': 'CNX_Fixture_F4', 'configPath': committed, 'values': {}},
              f'exit {r.returncode}: {hv!r}')
        check('F10b ... and passes --held-values anyway: the report names that file, the committed '
              'config, and draws nothing held',
              rep.get('heldValuesPath') == str((out / 'held-values.json').resolve())
              and rep.get('heldConfigPath') == committed and rep.get('held') == []
              and rep.get('heldErrors') == [] and held_of(d) == [] and rep.get('missing') == [key],
              f"{ {k: rep.get(k) for k in ('heldValuesPath', 'heldConfigPath', 'held', 'missing')} }")


# F5 + F11: the NOBELIUM control, and verify on compose's REAL report. MattType's three real `No`
# (send:false by the real rules) are planted under three basenames; the config names ONE. A prefix twin
# and a fold twin must draw exactly what they draw with an empty table.
def f5_f11():
    a_, prefix, fold = 'CNX_Fixture_Nobel', 'CNX_Fixture_Nobelium', 'cnx_fixture_nobel'
    with tempfile.TemporaryDirectory() as td:
        dirs = {}
        for b in (a_, prefix, fold):
            out, prep, entries = plant_matt(td, b)
            dirs[b] = out
            check(f'F5 PRECONDITION {b}: the planted figure is three send:false `No` blocks',
                  prep.returncode == 0 and [(e['key'], e['send']) for e in entries]
                  == [('No', False)] * 3, f'exit {prep.returncode}: {entries!r}')
        tr = write_tr(Path(td) / 'empty-tr.json', {})
        cfg = write_config(Path(td) / 'c5.json', {a_: {'No': 'QZX'}})
        empty = write_config(Path(td) / 'c5-empty.json', {})

        r = run_wrapper('--out', dirs[a_], '--translations', tr, '--config', cfg)
        d = load_json(dirs[a_] / 'compose.json') or {}
        items = svg_items(dirs[a_] / 'translated.svg') if (dirs[a_] / 'translated.svg').exists() else []
        check('F5 POSITIVE CONTROL the configured basename draws QZX three times and No not at all',
              r.returncode == 0 and held_of(d) == [('No', 0, [0]), ('No', 1, [0]), ('No', 2, [0])]
              and sum(1 for i in items if i[0] == 'QZX') == 3 and not [i for i in items if i[0] == 'No'],
              f'exit {r.returncode}: {d!r} :: {r.stderr.strip()[-300:]}')
        for b, what in ((prefix, 'a PREFIX twin'), (fold, 'a FOLD twin')):
            r1 = run_wrapper('--out', dirs[b], '--translations', tr, '--config', cfg)
            d1 = load_json(dirs[b] / 'compose.json') or {}
            svg1 = (dirs[b] / 'translated.svg').read_bytes() \
                if (dirs[b] / 'translated.svg').exists() else None
            r2 = run_wrapper('--out', dirs[b], '--translations', tr, '--config', empty)
            svg2 = (dirs[b] / 'translated.svg').read_bytes() \
                if (dirs[b] / 'translated.svg').exists() else None
            check(f'F5 {b} ({what} of the configured basename): held [] and translated.svg '
                  f'BYTE-identical to an empty table', r1.returncode == 0 and r2.returncode == 0
                  and held_of(d1) == [] and svg1 is not None and svg1 == svg2
                  and b'>No</text>' in svg1,
                  f'exit {r1.returncode}/{r2.returncode} held={held_of(d1)!r} '
                  f'identical={svg1 == svg2 if svg1 else None}')

        # F11: verify, IN PROCESS, on compose.py's REAL report (the production spawn, run_compose),
        # against blocks.json as block_key derived it. A drawn value passes; a refused one (the snowman
        # is in none of the four faces - test_compose_held CH5) raises, naming its reason.
        import contextlib
        import io
        out = dirs[a_]
        blocks = json.loads((out / 'blocks.json').read_text())
        rec = _mod.Translations(path=tr, keys=frozenset(), has_state=False)
        for value, want_raise in (('QZX', False), ('Q☃', True)):
            hp = Path(td) / 'f11-held.json'
            HV.write_file(hp, a_, 'f11', {'No': value})
            (out / 'compose-report.json').unlink(missing_ok=True)
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                child = _mod.run_compose(out, tr, hp)
            report = _mod.read_report(out, child)
            ok, keys, msg = _raises(lambda: _mod.verify(report, blocks, rec, held={'No': value}))
            if want_raise:
                check("F11b verify REFUSES compose's real report of a refused value, naming its reason",
                      ok and keys == ['No'] and 'no-glyph:U+2603' in msg,
                      f"{keys!r}: {msg} :: heldErrors={report.get('heldErrors')!r}")
            else:
                check("F11 verify ACCEPTS compose's real report of three drawn held labels - nothing "
                      "raised at all", not ok and msg == '' and len(report.get('held') or []) == 3,
                      f"{msg!r} held={report.get('held')!r}")


# F6: a configured TWIN. synth_duplicate draws prose, which the read layer buys (case 3 translates
# both keys), so the planted blocks.json marks both twins send:false - the one input the wrapper reads
# for that decision; the keys stay as block_key derived them.
def f6():
    with tempfile.TemporaryDirectory() as td:
        art = synth_duplicate(Path(td) / 'CNX_Fake_Dup.pdf')
        out = Path(td) / 'fig-dup'
        prep = run_prepare(art, out, 'CNX_Fake_Dup')
        blocks = load_json(out / 'blocks.json') or []
        check('F6 PRECONDITION the twin is send:true as prepared - flipping it is what makes it held',
              prep.returncode == 0 and [b['send'] for b in blocks if b['key'] == DUP_LABEL] == [True, True],
              repr([(b['key'], b['send']) for b in blocks]))
        for b in blocks:
            if b['key'] == DUP_LABEL:
                b['send'] = False
        (out / 'blocks.json').write_text(json.dumps(blocks, indent=1, ensure_ascii=False))
        tr = write_tr(Path(td) / 'tr6.json', {SOLO_LABEL: 'QZS'})
        r = run_wrapper('--out', out, '--translations', tr,
                        '--config', write_config(Path(td) / 'c6.json',
                                                 {'CNX_Fake_Dup': {DUP_LABEL: 'QZX'}}))
        d = load_json(out / 'compose.json') or {}
        check('F6 a configured twin key is drawn TWICE - compose.json `held` names it twice',
              r.returncode == 0 and [h[0] for h in held_of(d) or []] == [DUP_LABEL, DUP_LABEL],
              f'exit {r.returncode}: {d!r} :: {r.stderr.strip()[-300:]}')
        rep = load_json(out / 'compose-report.json') or {}
        rec = _mod.Translations(path=tr, keys=frozenset({SOLO_LABEL}), has_state=False)
        planted = {**rep, 'held': (rep.get('held') or [])[:1]}
        ok, keys, msg = _raises(lambda: _mod.verify(planted, blocks, rec, held={DUP_LABEL: 'QZX'}))
        check('F6b a report that drew the twin ONCE is refused, naming the key', ok
              and keys == [DUP_LABEL] and 'heldBlockValues' in msg, f'{keys!r}: {msg}')


# F7: verify's held contract as units (V1-V6 of the design, V5 in four arms, V6 in two).
def f7():
    blocks = [{'key': 'a', 'send': True}, {'key': 'b', 'send': False}]
    present = _mod.Translations(path='/x.json', keys=frozenset({'a'}), has_state=False)
    hb = [{'key': 'b', 'block': 1, 'changed': [0]}]

    ok, _k, msg = _raises(lambda: _mod.verify({**GOOD, 'missing': [], 'held': hb, 'heldErrors': []},
                                              blocks, present, held={'b': 'QZX'}))
    check('F7 V1 a held send:false key is SUBTRACTED from the expected English and passes',
          not ok and msg == '', repr(msg))

    ok, keys, msg = _raises(lambda: _mod.verify(
        {**GOOD, 'translated': [], 'held': [{'key': 'a', 'block': 0, 'changed': [0]}],
         'heldErrors': []}, blocks, present, held={'a': 'QZX'}))
    check('F7 V2 a value drawn over a send:true block gets its OWN wording, never held_but_drawn\'s',
          ok and keys == ['a'] and 'drawn from heldBlockValues for block(s) blocks.json marks '
          'send:true' in msg and 'translated anyway' not in msg, f'{keys!r}: {msg}')

    # CONTROL: three positional arguments, exactly as before this change - the OLD wording survives.
    ok, keys, msg = _raises(lambda: _mod.verify(
        {**GOOD, 'missing': [], 'translated': ['a', 'b'], 'held': [], 'heldErrors': []},
        blocks, present))
    check('F7 V3 CONTROL a send:false key in neither list keeps the OLD held_but_drawn wording',
          ok and keys == ['b'] and 'translated anyway' in msg and 'heldBlockValues' not in msg,
          f'{keys!r}: {msg}')

    no3 = [{'key': 'No', 'send': False}] * 3
    rep3 = {'blocks': ['No'] * 3, 'missing': [], 'translated': [], 'heldErrors': [],
            'held': [{'key': 'No', 'block': i, 'changed': [0]} for i in range(3)]}
    rec0 = _mod.Translations(path='/x.json', keys=frozenset(), has_state=False)
    ok, _k, msg = _raises(lambda: _mod.verify(rep3, no3, rec0, held={'No': 'QZX'}))
    check('F7 V4-ctl MattType `No` x3 drawn x3 passes', not ok and msg == '', repr(msg))
    ok, keys, msg = _raises(lambda: _mod.verify({**rep3, 'missing': ['No'], 'held': rep3['held'][:2]},
                                                no3, rec0, held={'No': 'QZX'}))
    check('F7 V4 MattType `No` x3 with only TWO drawn is refused', ok and keys == ['No']
          and 'heldBlockValues' in msg, f'{keys!r}: {msg}')

    ok, _k, msg = _raises(lambda: _mod.verify({**GOOD, 'missing': []}, blocks, present,
                                              held={'b': 'QZX'}))
    check('F7 V5a values configured and the report has no `held` list: refused as drift',
          ok and 'drifted' in msg, repr(msg))
    ok, keys, msg = _raises(lambda: _mod.verify({**GOOD, 'missing': [], 'held': hb, 'heldErrors': []},
                                                blocks, present))
    # The old money check refuses this too (as held_but_drawn), so the WORDING is what is pinned: the
    # held contract must refuse it, whatever the money check would say.
    check('F7 V5b NOTHING configured and the report names a held label: refused by the held contract',
          ok and keys == ['b'] and 'heldBlockValues' in msg and 'translated anyway' not in msg,
          f'{keys!r}: {msg}')
    ok, _k, msg = _raises(lambda: _mod.verify(
        {**GOOD, 'heldErrors': [{'key': 'b', 'block': 1, 'reason': 'line-count'}]}, blocks, present))
    check('F7 V5c nothing configured, `heldErrors` but no `held` list: refused as drift',
          ok and 'drifted' in msg, repr(msg))
    ok, _k, msg = _raises(lambda: _mod.verify(
        {**GOOD, 'missing': [], 'held': [{'block': 1, 'changed': [0]}], 'heldErrors': []},
        blocks, present, held={'b': 'QZX'}))
    check('F7 V5d a `held` entry with no string key: refused as drift', ok and 'drifted' in msg,
          repr(msg))

    blocks3 = blocks + [{'key': 'c', 'send': False}]
    errs = [{'key': 'b', 'block': 1, 'reason': 'no-glyph:U+2603'},
            {'key': 'c', 'block': 2, 'reason': 'line-count', 'value': 2, 'visual': 1}]
    ok, keys, msg = _raises(lambda: _mod.verify(
        {'blocks': ['a', 'b', 'c'], 'missing': ['b', 'c'], 'translated': ['a'], 'held': [],
         'heldErrors': errs}, blocks3, present, held={'b': 'QZX', 'c': 'QZQ\nQZR'}))
    check('F7 V6 heldErrors refuses and names EVERY key and reason', ok and keys == ['b', 'c']
          and all(s in msg for s in ("'b'", "'c'", 'no-glyph:U+2603', 'line-count')),
          f'{keys!r}: {msg}')
    ok, keys, msg = _raises(lambda: _mod.verify(
        {**GOOD, 'held': [], 'heldErrors': [{'key': 'zz', 'block': None, 'reason': 'no-block'}]},
        blocks, present, held={'zz': 'QZX'}))
    check('F7 V6b a compose-side no-block has ONE verdict: the heldErrors refusal, before any '
          'multiplicity check', ok and keys == ['zz'] and 'no-block' in msg and 'NOT drawn' in msg,
          f'{keys!r}: {msg}')


# F8: meta.json without a usable `source` - it names the figure's basename, which picks its entry.
def f8():
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / 'fig-f8'
        prep = run_prepare(FIXTURE, out, 'CNX_Fixture_F8')
        meta = json.loads((out / 'meta.json').read_text())
        check('F8 PRECONDITION prepare wrote a string `source`', prep.returncode == 0
              and isinstance(meta.get('source'), str), repr(meta.get('source')))
        tr = write_tr(Path(td) / 'tr8.json', TR12)
        for label, bad in (('absent', None), ('empty', '')):
            m = {k: v for k, v in meta.items() if k != 'source'}
            if bad is not None:
                m['source'] = bad
            (out / 'meta.json').write_text(json.dumps(m, ensure_ascii=False))
            clean(out)
            r = run_wrapper('--out', out, '--translations', tr)
            d = load_json(out / 'compose.json') or {}
            quiet, seen = not_spawned(out)
            check(f'F8 meta.json `source` {label}: refused by the pre-flight in its own words - no '
                  f'traceback, nothing spawned', refused(r, 1) and '`source`' in err_of(d)
                  and 'wrote no compose-report.json' not in err_of(d) and 'Traceback' not in r.stderr
                  and quiet, f'exit {r.returncode}: {d!r} {seen}')


# F9: a malformed --config. Each refusal names what it read; a malformed entry for ANOTHER figure is
# never read (the CONTROL, last).
def f9():
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / 'fig-f9'
        prep = run_prepare(FIXTURE, out, 'CNX_Fixture_F9')
        check('F9 PRECONDITION prepare produced the fixture directory', prep.returncode == 0,
              f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
        tr = write_tr(Path(td) / 'tr9.json', TR12)
        bad_json = Path(td) / 'c9-bad.json'
        bad_json.write_text('{"heldBlockValues": {', encoding='utf-8')
        arms = (
            ('a list table', write_config(Path(td) / 'c9a.json', []),
             'heldBlockValues must be an object'),
            ('a string entry', write_config(Path(td) / 'c9b.json', {'CNX_Fixture_F9': 'QZX'}),
             'heldBlockValues.CNX_Fixture_F9'),
            ("a value holding '|'", write_config(Path(td) / 'c9c.json',
                                                 {'CNX_Fixture_F9': {K_VERBATIM: 'QZ|X'}}),
             f"heldBlockValues.CNX_Fixture_F9[{K_VERBATIM!r}]"),
            ('a nonexistent --config', Path(td) / 'no-such-config.json', 'no-such-config.json'),
            ('an unparsable --config', bad_json, 'c9-bad.json'),
        )
        for label, cfg, needle in arms:
            clean(out)
            r = run_wrapper('--out', out, '--translations', tr, '--config', cfg)
            d = load_json(out / 'compose.json') or {}
            quiet, seen = not_spawned(out)
            check(f'F9 {label} is refused before the spawn, naming {needle!r}',
                  refused(r, 1) and needle in err_of(d) and quiet, f'exit {r.returncode}: {d!r} {seen}')
        r = run_wrapper('--out', out, '--translations', tr, '--config',
                        write_config(Path(td) / 'c9-other.json',
                                     {'CNX_Other_Figure': 'not an object',
                                      'CNX_Fixture_F9': {K_VERBATIM: 'QZ'}}))
        d = load_json(out / 'compose.json') or {}
        check("F9 CONTROL a malformed entry for ANOTHER basename is never read - this figure composes "
              "and draws its own value", r.returncode == 0 and held_of(d) == [(K_VERBATIM, 3, [0])],
              f'exit {r.returncode}: {d!r} :: {r.stderr.strip()[-300:]}')


if _mod is not None:
    for _label, _fn in (('F1-F3', f1_f3), ('F4/F10', f4_f10), ('F5/F11', f5_f11), ('F6', f6),
                        ('F7', f7), ('F8', f8), ('F9', f9)):
        attempt(_label, _fn)


print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
