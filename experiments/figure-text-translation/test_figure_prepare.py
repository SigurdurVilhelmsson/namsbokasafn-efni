#!/usr/bin/env python3
"""`figure-prepare.py` turns ONE artwork file into one output directory, and reports
enough about it for the classifier to decide what to do with it.

    python3 test_figure_prepare.py

Plain asserts and a module-level `fails` list, like test_figtext_out.py / test_sources.py
- there is no pytest in this tree.

🔴 THIS SUITE IS NOT ALL REFUSALS, AND THE REASON IS RECORDED IN THE PLAN THIS TASK COMES
FROM: the previous version of this task had three cases, all refusals, and a 12-line stub
that refuses everything passed 5 of 5. Cases 1-3 run the real thing end to end against
committed / generated artwork and assert MEASURED values, so a refuse-everything
implementation fails them all.

🔴 AND EVERY NULL HERE IS PAIRED. `imageXObjects == 0` and `formTextXObjects == 0` are
CORRECT on the committed fixture (it has no XObject at all) and are also exactly what a
counter that always returns 0 reports. Case 1 therefore unit-tests the counter against a
generated PDF that DOES nest forms two deep and DOES carry an image, and case 1c is its
paired negative: the same builder minus the text must report 0 form-text XObjects while
still reporting the image and the fill.

⚠️ This file writes ONLY into temporary directories, and case 5 is what proves it: the
shared `out/` must come out of the run byte-for-byte and mtime-for-mtime unchanged,
because `test_blockkey_consumers.py` requires `out/artwork.png` to be
CNX_Chem_01_01_SciMethod's.
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))

import pikepdf                                  # noqa: E402  - after the pylibs bootstrap

PREPARE = HERE / 'figure-prepare.py'
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'
SHARED_OUT = HERE / 'out'

N = pikepdf.Name

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''),
          flush=True)
    if not ok:
        fails.append(label)


# ── generated artwork ────────────────────────────────────────────────────────────────
# Built here rather than committed: these exist to exercise the COUNTER, they are not
# read-layer fidelity fixtures, and a shape that only one test needs should not become a
# tracked artefact somebody has to keep true. `fixtures/fixture_figure.pdf` is committed
# because the read layer's numbers are the thing being pinned there.

FILL = b'0.2 0.4 0.8 rg 0 0 50 50 re f\n'       # ONE paint op
RULE = b'0 0 0 RG 1 w 10 20 m 90 20 l S\n'      # a second paint op
CLIP = b'q 0 0 100 100 re W n\n'                # `n` paints NOTHING - must not count


def _plain_font(pdf):
    """Base-14 Helvetica, NOT a subset: no /FirstChar, no ABCDEF+ prefix, so
    `extract.is_subset` is False and `warnings` must come back empty. That is the
    negative control for the fixture's `['subset font PAGE/F1']`."""
    descriptor = pdf.make_indirect(pikepdf.Dictionary(
        Type=N('/FontDescriptor'), FontName=N('/Helvetica'), Flags=32,
        FontBBox=pikepdf.Array([-166, -225, 1000, 931]),
        ItalicAngle=0, Ascent=718, Descent=-207, CapHeight=718, StemV=88))
    return pdf.make_indirect(pikepdf.Dictionary(
        Type=N('/Font'), Subtype=N('/Type1'), BaseFont=N('/Helvetica'),
        FontDescriptor=descriptor, Encoding=N('/WinAnsiEncoding')))


def synth_nested(dst, with_text=True):
    """page -> Fm0 -> {Fm1, Im0}. Text (when asked for) in BOTH forms, so a counter that
    stops at depth 1 reports 1 where the answer is 2 - the 64-of-817 case
    strip-text.py:172-175 measured. Returns the path."""
    pdf = pikepdf.new()
    font = _plain_font(pdf)

    image = pdf.make_stream(b'\xff\x00\xff')
    image.Type, image.Subtype = N('/XObject'), N('/Image')
    image.Width, image.Height = 1, 1
    image.ColorSpace, image.BitsPerComponent = N('/DeviceRGB'), 8
    image = pdf.make_indirect(image)

    inner_text = b'BT /F1 12 Tf 6 6 Td (Inner label here) Tj ET\n' if with_text else b''
    inner = pdf.make_stream(inner_text + RULE)
    inner.Type, inner.Subtype = N('/XObject'), N('/Form')
    inner.BBox = pikepdf.Array([0, 0, 100, 100])
    inner.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font))
    inner = pdf.make_indirect(inner)

    outer_text = b'BT /F1 12 Tf 10 80 Td (Outer label here) Tj ET\n' if with_text else b''
    outer = pdf.make_stream(FILL + outer_text
                            + b'q /Fm1 Do Q\nq 10 0 0 10 0 0 cm /Im0 Do Q\n')
    outer.Type, outer.Subtype = N('/XObject'), N('/Form')
    outer.BBox = pikepdf.Array([0, 0, 100, 100])
    outer.Resources = pikepdf.Dictionary(
        Font=pikepdf.Dictionary(F1=font),
        XObject=pikepdf.Dictionary(Fm1=inner, Im0=image))
    outer = pdf.make_indirect(outer)

    page = pdf.add_blank_page(page_size=(100, 100))
    page.Contents = pdf.make_stream(CLIP + b'q /Fm0 Do Q\nQ\n')
    page.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Fm0=outer))
    pdf.save(str(dst), deterministic_id=True)
    return Path(dst)


def synth_plain_vector(dst):
    """A vector figure with NO text object anywhere: `copied-textless`. Two paint ops,
    no XObjects at all."""
    pdf = pikepdf.new()
    page = pdf.add_blank_page(page_size=(100, 100))
    page.Contents = pdf.make_stream(FILL + RULE)
    pdf.save(str(dst), deterministic_id=True)
    return Path(dst)


# ── running the thing ────────────────────────────────────────────────────────────────

def run_prepare(*args, cwd=None):
    """Spawn figure-prepare.py with a BARE env.

    `FIGTEXT_PYLIBS` and `FIGTEXT_OUT` are popped on purpose. pdfplumber and fontTools are
    not on this box's system path, so if the child inherited FIGTEXT_PYLIBS from however
    this test was launched, the tool's own bootstrap would never be exercised - and the
    driver that will call it in anger sets neither."""
    env = dict(os.environ)
    env.pop('FIGTEXT_PYLIBS', None)
    env.pop('FIGTEXT_OUT', None)
    return subprocess.run([sys.executable, str(PREPARE), *[str(a) for a in args]],
                          capture_output=True, text=True, env=env,
                          cwd=str(cwd) if cwd else None)


def refused(result, code):
    """Did the TOOL refuse with `code` - or did the interpreter refuse the tool?

    🔴 WITHOUT THIS, EVERY USAGE-ERROR CASE PASSES VACUOUSLY WHEN THE FILE IS ABSENT.
    Measured on the red run that preceded this implementation: `python3 <missing file>`
    prints "can't open file ... No such file or directory" and exits **2** - the same
    exit code argparse uses - so 4c/4d/4e/4f all reported PASS against nothing at all."""
    return result.returncode == code and "can't open file" not in result.stderr


def load_prepare_json(out_dir):
    path = Path(out_dir) / 'prepare.json'
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception as exc:                      # noqa: BLE001 - reported, not raised
        return {'_unparsable': f'{type(exc).__name__}: {exc}'}


def snapshot(directory):
    """{relative path: (size, mtime_ns)} for every file under `directory`, RECURSIVELY -
    or None if the directory does not exist.

    🔴 None, not {}. `test_figtext_out.py`'s version returns {} for an absent directory,
    which makes absent->absent and absent->created-then-deleted compare EQUAL. In CI this
    directory does not exist at all (it is gitignored), so {} would make the isolation
    assertion pass there for the wrong reason - exactly the vacuous shape this case
    replaced."""
    directory = Path(directory)
    if not directory.is_dir():
        return None
    return {str(p.relative_to(directory)): (p.stat().st_size, p.stat().st_mtime_ns)
            for p in sorted(directory.rglob('*')) if p.is_file()}


check('0 PRECONDITION figure-prepare.py exists', PREPARE.exists(), str(PREPARE))
check('0b PRECONDITION the committed fixture is present', FIXTURE.exists(), str(FIXTURE))

_mod = None
if PREPARE.exists():
    try:
        _spec = importlib.util.spec_from_file_location('figure_prepare', PREPARE)
        _mod = importlib.util.module_from_spec(_spec)
        _spec.loader.exec_module(_mod)
    except Exception as exc:                      # noqa: BLE001
        check('0c figure-prepare.py imports without running', False,
              f'{type(exc).__name__}: {exc}')
check('0c figure-prepare.py imports without running', _mod is not None,
      'module not loaded' if _mod is None else '')

# ── 1. UNIT — the three counters, against artwork that HAS the features ───────────────
# The committed fixture reports imageXObjects 0 and formTextXObjects 0, both correct and
# both indistinguishable from `return 0`. This is the positive signal.
if _mod is not None and hasattr(_mod, 'count_page_features'):
    with tempfile.TemporaryDirectory() as td:
        nested = synth_nested(Path(td) / 'nested.pdf', with_text=True)
        flat = synth_nested(Path(td) / 'flat.pdf', with_text=False)
        try:
            got = _mod.count_page_features(nested)
        except Exception as exc:                  # noqa: BLE001
            got = {'_raised': f'{type(exc).__name__}: {exc}'}
        try:
            got_flat = _mod.count_page_features(flat)
        except Exception as exc:                  # noqa: BLE001
            got_flat = {'_raised': f'{type(exc).__name__}: {exc}'}

        check('1a counts form text TWO levels deep, not one',
              got.get('formTextXObjects') == 2, f'{got!r}')
        check('1b counts an image nested inside a form',
              got.get('imageXObjects') == 1, f'{got!r}')
        # FILL (in Fm0) + RULE (in Fm1) = 2. The page's `W n` clip must NOT be counted:
        # `n` ends a path without painting it, and counting it would give a photograph
        # wrapped in a clip path a non-zero paint count - which is the one thing paintOps
        # exists to distinguish.
        check('1c counts paint ops inside forms and EXCLUDES the `n` clip op',
              got.get('paintOps') == 2, f'{got!r}')
        check('1d CONTROL the same builder without text reports 0 form-text XObjects '
              'while still seeing the image and the fills',
              got_flat.get('formTextXObjects') == 0
              and got_flat.get('imageXObjects') == 1
              and got_flat.get('paintOps') == 2, f'{got_flat!r}')
else:
    check('1 UNIT count_page_features is importable', False,
          'figure-prepare.py exposes no count_page_features')

# ── 2. THE POSITIVE CONTROL — the committed fixture, end to end, foreign cwd ──────────
# Every number below was measured by the chain itself (Task 2a) and by
# test_make_fixture.py in-process. `--basename` is deliberately NOT the file's stem: a
# basename equal to the stem passes with no staging at all, so it could not detect the
# `basename-mismatch` defect this flag exists to prevent.
STAGED_NAME = 'CNX_Chem_99_99_Renamed'
with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as foreign:
    out = Path(td) / 'deep' / 'fig-001'          # TWO levels: prepare must mkdir parents
    r = run_prepare(FIXTURE, '--basename', STAGED_NAME, '--out', out, cwd=foreign)
    d = load_prepare_json(out) or {}

    check('2a the committed fixture exits 0', r.returncode == 0,
          f'exit {r.returncode}: {r.stderr.strip()[-500:]}')
    check('2b prepare.json is written', bool(d) and '_unparsable' not in d, f'{d!r}')
    check('2c finds 4 blocks', d.get('blocks') == 4, f"got {d.get('blocks')!r}")
    check('2d 3 are sendable', d.get('sendable') == 3, f"got {d.get('sendable')!r}")
    check('2e 1 block held as verbatim (H2O (g)), 0 for any other reason',
          (d.get('verbatimBlocks'), d.get('undecodedBlocks'), d.get('missingFontBlocks'))
          == (1, 0, 0),
          f"{d.get('verbatimBlocks')!r}/{d.get('undecodedBlocks')!r}/"
          f"{d.get('missingFontBlocks')!r}")
    check('2f the five block counts are mutually consistent',
          isinstance(d.get('blocks'), int)
          and d.get('sendable', 0) + d.get('verbatimBlocks', 0)
          + d.get('undecodedBlocks', 0) + d.get('missingFontBlocks', 0) == d.get('blocks'),
          f'{d!r}')
    check('2g reports meta chars', d.get('chars') == 68, f"got {d.get('chars')!r}")
    check('2h reports 2 paint ops (one fill, one stroke)', d.get('paintOps') == 2,
          f"got {d.get('paintOps')!r}")
    check('2i reports no images and no form-text XObjects on this fixture',
          (d.get('imageXObjects'), d.get('formTextXObjects')) == (0, 0),
          f"{d.get('imageXObjects')!r}/{d.get('formTextXObjects')!r}")
    check('2j the subset-font warning surfaces as a STRING containing "subset"',
          isinstance(d.get('warnings'), list)
          and any('subset' in w.lower() for w in d['warnings'])
          and d['warnings'] == ['subset font PAGE/F1'], f"{d.get('warnings')!r}")
    svg = d.get('artworkSvgPath')
    check('2k artworkSvgPath is non-null, exists and is non-empty',
          bool(svg) and Path(svg).exists() and Path(svg).stat().st_size > 0, f'{svg!r}')
    check('2l the artwork was STAGED UNDER THE GIVEN BASENAME',
          (out / f'{STAGED_NAME}.pdf').exists()
          and not (out / 'artwork-src.pdf').exists(),
          f'{sorted(p.name for p in out.iterdir()) if out.is_dir() else out!r}')
    meta = json.loads((out / 'meta.json').read_text()) if (out / 'meta.json').exists() \
        else {}
    check("2m meta.json's source basename is the CNXML basename, not the file's stem",
          Path(meta.get('source', '')).stem == STAGED_NAME, f"{meta.get('source')!r}")
    check('2n prepare.json records the ORIGINAL artwork as `source`',
          d.get('source') == str(FIXTURE), f"{d.get('source')!r}")
    check('2o basename is echoed back', d.get('basename') == STAGED_NAME,
          f"{d.get('basename')!r}")

# ── 3. a genuinely text-less vector exits 0 with blocks == 0 ─────────────────────────
# `copied-textless`. The old chain took an IndexError on this shape.
with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as foreign:
    art = synth_plain_vector(Path(td) / 'CNX_Fake_Textless.pdf')
    out = Path(td) / 'out-textless'
    r = run_prepare(art, '--basename', 'CNX_Fake_Textless', '--out', out, cwd=foreign)
    d = load_prepare_json(out) or {}
    check('3a a text-less vector exits 0', r.returncode == 0,
          f'exit {r.returncode}: {r.stderr.strip()[-500:]}')
    check('3b ... with blocks == 0 and sendable == 0',
          (d.get('blocks'), d.get('sendable')) == (0, 0),
          f"{d.get('blocks')!r}/{d.get('sendable')!r}")
    check('3c ... and chars == 0, which is what tells the classifier the reader saw '
          'no text at all', d.get('chars') == 0, f"got {d.get('chars')!r}")
    check('3d ... and it still produced an SVG to copy',
          bool(d.get('artworkSvgPath')) and Path(d['artworkSvgPath']).exists()
          and Path(d['artworkSvgPath']).stat().st_size > 0,
          f"{d.get('artworkSvgPath')!r}")
    check('3e CONTROL warnings is EMPTY here — so 2j measured something',
          d.get('warnings') == [], f"{d.get('warnings')!r}")

# ── 3f. form-borne text survives the whole chain, not just the counter ───────────────
with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as foreign:
    art = synth_nested(Path(td) / 'CNX_Fake_Forms.pdf', with_text=True)
    out = Path(td) / 'out-forms'
    r = run_prepare(art, '--basename', 'CNX_Fake_Forms', '--out', out, cwd=foreign)
    d = load_prepare_json(out) or {}
    check('3f text drawn inside nested /Form XObjects is READ, not reported as textless',
          r.returncode == 0 and d.get('blocks', 0) >= 1 and d.get('sendable', 0) >= 1,
          f"exit {r.returncode}, {d.get('blocks')!r} blocks / "
          f"{d.get('sendable')!r} sendable: {r.stderr.strip()[-300:]}")
    check('3g ... and prepare.json carries the form-text count from the same run',
          d.get('formTextXObjects') == 2, f"{d.get('formTextXObjects')!r}")

# ── 4. refusals ──────────────────────────────────────────────────────────────────────
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'out-missing'
    r = run_prepare(Path(td) / 'no-such-figure.pdf', '--basename', 'nope', '--out', out)
    d = load_prepare_json(out) or {}
    check('4a a missing artwork file exits 1', refused(r, 1), f'exit {r.returncode}')
    check('4b ... and says so in prepare.json',
          isinstance(d.get('error'), str) and d.get('error')
          and d.get('warnings') == [], f'{d!r}')

    r = run_prepare(FIXTURE, '--basename', 'x')
    check('4c a missing --out is a USAGE error (exit 2)', refused(r, 2),
          f'exit {r.returncode}: {r.stderr.strip()[-200:]}')

    r = run_prepare(FIXTURE, '--basename', 'x', '--out', Path(td) / 'o', '--bogus', '1')
    check('4d an unknown flag is REJECTED, not dropped (exit 2)', refused(r, 2),
          f'exit {r.returncode}: {r.stderr.strip()[-200:]}')

    r = run_prepare(FIXTURE, '--basename', 'a/../b', '--out', Path(td) / 'o2')
    check('4e a basename that is not a bare filename is refused (exit 2)',
          refused(r, 2), f'exit {r.returncode}: {r.stderr.strip()[-200:]}')

    r = run_prepare(FIXTURE, '--basename', 'artwork', '--out', Path(td) / 'o3')
    check('4f --basename artwork is refused: it would collide with strip-text.py\'s own '
          'artwork.pdf', refused(r, 2),
          f'exit {r.returncode}: {r.stderr.strip()[-200:]}')

# ── 5. ISOLATION — the shared out/ is not touched ───────────────────────────────────
before_shared = snapshot(SHARED_OUT)
with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as foreign:
    out = Path(td) / 'iso'
    r = run_prepare(FIXTURE, '--basename', 'CNX_Iso_Probe', '--out', out, cwd=foreign)
    check('5 PRECONDITION the isolation run itself succeeded', r.returncode == 0,
          f'exit {r.returncode}: {r.stderr.strip()[-300:]}')
after_shared = snapshot(SHARED_OUT)

# TWO branches, and both assert. A shared out/ that is absent (CI, and any clean clone -
# it is gitignored) must STILL be absent afterwards; one that exists must be unchanged
# file for file, size for size, mtime for mtime.
if before_shared is None:
    check('5a the shared out/ was absent and STAYED absent',
          after_shared is None,
          f'{len(after_shared or {})} files appeared at {SHARED_OUT}')
else:
    changed = sorted(set(before_shared.items()) ^ set((after_shared or {}).items()))
    check('5a the shared out/ is unchanged — same files, sizes and mtimes',
          after_shared == before_shared,
          f'{len(before_shared)} files before, {len(after_shared or {})} after; '
          f'first differences: {changed[:4]}')
    check('5b NON-VACUITY the shared out/ actually had files to protect',
          len(before_shared) > 0, f'{len(before_shared)} files')

# CONTROL — the same comparator, over a directory that IS written to. Without this,
# "nothing changed" and "my comparator is blind" are the same output. Run over a
# throwaway directory so proving the detector works costs nothing.
with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as foreign:
    probe = Path(td) / 'probe'
    probe.mkdir()
    empty = snapshot(probe)
    r = run_prepare(FIXTURE, '--basename', 'CNX_Iso_Control', '--out', probe, cwd=foreign)
    written = snapshot(probe)
    check('5c CONTROL the same comparator FIRES on a directory that was written to',
          r.returncode == 0 and written is not None and empty is not None
          and written != empty and len(written) > 0,
          f'exit {r.returncode}, {len(empty or {})} files -> {len(written or {})}')
    check('5d CONTROL the absent branch is distinguishable from the empty one',
          snapshot(Path(td) / 'never-created') is None and empty == {},
          f'{snapshot(Path(td) / "never-created")!r} vs {empty!r}')

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
