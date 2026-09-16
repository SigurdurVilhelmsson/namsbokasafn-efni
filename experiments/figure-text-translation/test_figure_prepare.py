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
        _mod = None                               # module_from_spec binds BEFORE
        # exec_module, so without this the next check reports PASS on a module whose
        # import raised.
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

# ── 3h. THE GHOSTSCRIPT BRANCH — .eps input, which no other case reaches ─────────────
# `stage_artwork` has two paths and only the copy path was exercised above. The EPS path
# is not hypothetical: 294 chemistry figures and 7 of ch04's 29 are `.eps`, and it is
# also where `--basename` earns its keep, because a gs-staged temp file has a name that
# has nothing to do with the CNXML basename.
# The EPS is MADE HERE from the committed fixture rather than committed itself: a second
# binary artefact that has to be kept true is a liability, and `gs` is already a hard
# dependency of this chain (readlayer stages .eps with the same argv).
with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as foreign:
    eps = Path(td) / 'CNX_Fake_Vector_img.eps'
    made = subprocess.run(['gs', '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER',
                           '-sDEVICE=eps2write', f'-sOutputFile={eps}', str(FIXTURE)],
                          capture_output=True, text=True)
    check('3h PRECONDITION an .eps was produced from the fixture',
          made.returncode == 0 and eps.exists() and eps.stat().st_size > 0,
          f'gs exit {made.returncode}: {made.stderr.strip()[-200:]}')
    if eps.exists() and eps.stat().st_size > 0:
        out = Path(td) / 'out-eps'
        r = run_prepare(eps, '--basename', 'CNX_Chem_04_03_map2_img', '--out', out,
                        cwd=foreign)
        d = load_prepare_json(out) or {}
        check('3i an .eps is staged through ghostscript and prepares', r.returncode == 0,
              f'exit {r.returncode}: {r.stderr.strip()[-400:]}')
        # THE WHOLE POINT of --basename on this branch. Without the staging rename,
        # meta.source names a random ghostscript temp file, publish-figure-svg.js
        # refuses `basename-mismatch`, and it does so AFTER the figure is paid for.
        meta = json.loads((out / 'meta.json').read_text()) \
            if (out / 'meta.json').exists() else {}
        check('3j the gs-staged PDF carries the CNXML basename, not a temp name',
              Path(meta.get('source', '')).stem == 'CNX_Chem_04_03_map2_img'
              and (out / 'CNX_Chem_04_03_map2_img.pdf').exists(),
              f"{meta.get('source')!r}")
        check('3k the text survives the PDF -> EPS -> PDF round trip',
              d.get('blocks') == 4 and d.get('sendable') == 3,
              f"{d.get('blocks')!r}/{d.get('sendable')!r}")
        check('3l ... and prepare.json still reports the ORIGINAL .eps as its source',
              d.get('source') == str(eps), f"{d.get('source')!r}")

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

# ── 4h. THE CHARSET, CALIBRATED ON THE CORPUS RATHER THAN HAND-PICKED ────────────────
# 🔴 THE REGEX THAT WAS HERE REFUSED A REAL FIGURE, AND NOTHING IN THIS SUITE COULD SEE
# IT: case 4e probes `a/../b`, i.e. only the property the class exists to protect. The
# one basename in either kept book outside `[A-Za-z0-9._-]` is chemistry ch11's
# `CNX_Chem_11_02_Fe(NO3)3_img` (m68781) - it RESOLVES to real artwork, so the driver
# never filters it as `unresolved`, argparse then exits 2 before `main`, and the whole
# chapter can never reach `VERDICT ok`.
#
# MEASURED over `enumerateChapterImages` on both kept books, every chNN + appendices:
# 56 chapters, 3,311 figures, distinct characters `()-0-9A-Z_a-z` - i.e. exactly TWO
# characters outside the old class, both in that one basename, and 0 leading characters
# outside `[0AC O]`. The corpus-wide pin lives in
# tools/__tests__/figure-enumerate.test.js, where the enumerator already is.
CORPUS_PAREN_BASENAME = 'CNX_Chem_11_02_Fe(NO3)3_img'
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'paren'
    r = run_prepare(FIXTURE, '--basename', CORPUS_PAREN_BASENAME, '--out', out)
    d = load_prepare_json(out) or {}
    check('4h a REAL enumerated basename carrying parentheses is ACCEPTED',
          r.returncode == 0,
          f'exit {r.returncode}: {r.stderr.strip()[-300:]}')
    check('4h-b ... and prepare.json echoes it back unchanged - nothing was sanitised',
          d.get('basename') == CORPUS_PAREN_BASENAME, f"{d.get('basename')!r}")
    check('4h-c ... and the artwork was STAGED under that exact name',
          (out / f'{CORPUS_PAREN_BASENAME}.pdf').exists(),
          f'{sorted(p.name for p in out.iterdir()) if out.is_dir() else out!r}')
    _meta = json.loads((out / 'meta.json').read_text()) \
        if (out / 'meta.json').exists() else {}
    check("4h-d ... and meta.json's source stem is that basename, which is what "
          "basenameFromMeta cross-checks AFTER the figure has been paid for",
          Path(_meta.get('source', '')).stem == CORPUS_PAREN_BASENAME,
          f"{_meta.get('source')!r}")

# ── 4i. THE CONTROL: the widening admits exactly `(` and `)` and nothing else ────────
# 🔴 WITHOUT THIS, 4h IS SATISFIED BY DELETING THE CHECK. The unit of the question is a
# CHARACTER CLASS, so every case below differs from an accepted basename by one
# character or by one leading character - not by being obviously absurd.
REFUSALS = [
    ('a/../b', 'traversal through a separator'),
    ('..', 'the parent directory itself'),
    ('.', 'the current directory itself'),
    ('../CNX_Chem_11_02_Fe(NO3)3_img', 'traversal in front of a legal name'),
    ('/etc/passwd', 'an absolute path'),
    ('CNX_Chem/11', 'a bare separator'),
    ('-out', 'a leading dash, which the next tool would read as a flag'),
    ('.hidden', 'a leading dot'),
    ('(NO3)3', 'a LEADING paren - the corpus leads with 0/A/C/O only'),
    ('CNX $(id)', 'a space and a shell metacharacter'),
    ('CNX;rm', 'a semicolon'),
    ('CNX*', 'a glob star'),
    ('CNX\\11', 'a backslash'),
]
with tempfile.TemporaryDirectory() as td:
    for i, (bad, why) in enumerate(REFUSALS):
        r = run_prepare(FIXTURE, '--basename', bad, '--out', Path(td) / f'ref{i}')
        check(f'4i-{i} REFUSED ({why}): {bad!r}', refused(r, 2),
              f'exit {r.returncode}: {r.stderr.strip()[-160:]}')


# ── 4g. a STALE artwork.svg cannot satisfy the success check ────────────────────────
# `artwork.svg` has a fixed name. A driver reusing a directory, or a retry after a failed
# run, would otherwise let prepare report success against the PREVIOUS figure's artwork -
# and composition would render the wrong picture under this figure's translations, with
# every downstream check green because the file exists, is non-empty and is valid SVG.
with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'reused'
    out.mkdir()
    (out / 'artwork.svg').write_text('<svg><!-- A PREVIOUS FIGURE --></svg>')
    r = run_prepare(Path(td) / 'no-such-figure.pdf', '--basename', 'CNX_Fake_Retry',
                    '--out', out)
    check('4g a run that fails removes the previous figure\'s artwork.svg rather than '
          'leaving it to be mistaken for its own',
          refused(r, 1) and not (out / 'artwork.svg').exists(),
          f"exit {r.returncode}, artwork.svg present={(out / 'artwork.svg').exists()}")

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

# ── 6. THE BLEND-CHAIN SENTINEL — a warning that no bought figure trips once collapsed ─────
# 3e asserts warnings == [] on the fixture, which is also what a sentinel that never fires
# reports. So the helper is driven directly with a doubling reference chain of exactly 2^k
# paint invocations: k = 24 must warn with the exact string, k = 10 must not. The chain is
# deliberately NOT cairo's shape - the sentinel's whole job is to fire when the collapse in
# strip-text.py no longer recognises what cairo writes.
def _doubling_chain(k):
    groups = [b'<g id="g0"><rect width="1" height="1"/></g>'] + [
        b'<g id="g%d"><use xlink:href="#g%d"/><use xlink:href="#g%d"/></g>' % (i, i - 1, i - 1)
        for i in range(1, k + 1)]
    return (b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
            b'<defs>' + b''.join(groups) + b'</defs><use xlink:href="#g%d"/></svg>' % k)


_sentinel = getattr(_mod, 'reference_cost_warnings', None) if _mod is not None else None
check('6 PRECONDITION figure-prepare.py exposes reference_cost_warnings', callable(_sentinel))
with tempfile.TemporaryDirectory() as td:
    got = {}
    for k in (24, 10):
        path = Path(td) / f'chain{k}.svg'
        path.write_bytes(_doubling_chain(k))
        try:
            got[k] = _sentinel(path) if callable(_sentinel) else None
        except Exception as exc:                  # noqa: BLE001
            got[k] = f'{type(exc).__name__}: {exc}'
    check('6a a 2^24 reference chain is WARNED, with the exact string',
          got[24] == ['artwork.svg reference cost 2^24.0 exceeds 2^20 — a browser may never '
                      'finish loading it (see svgfix.py)'], f'{got[24]!r}')
    check('6b CONTROL a 2^10 chain is not', got[10] == [], f'{got[10]!r}')

    # End to end: strip-text.py reports the pass on EVERY --svg run, so "ran, nothing to
    # collapse" (the fixture has no blend paint) is distinguishable from "did not run".
    out = Path(td) / 'svgfix'
    r = run_prepare(FIXTURE, '--basename', 'CNX_Svgfix_Probe', '--out', out)
    report = json.loads((out / 'svgfix.json').read_text()) \
        if (out / 'svgfix.json').exists() else None
    check('6c the fixture run writes svgfix.json: six keys, addOps 0, nothing rewritten',
          r.returncode == 0 and isinstance(report, dict)
          and set(report) == {'addOps', 'collapsed', 'useSitesRewritten', 'clipped',
                              'unmatched', 'modes'}
          and report['addOps'] == 0 and report['useSitesRewritten'] == 0,
          f'exit {r.returncode}, {report!r}')

# ── 6d. THE COLLAPSE IS WRITTEN — end to end, on a page that HAS a blend paint (final review) ─
# 6c's fixture has no blend paint and test_svgfix.py drives collapse_blend_lerp on bytes in
# memory, so a strip-text.py that COMPUTED the collapse and never saved it (measured: its
# `if fixed is not data and fixed != data:` turned into `if False:`) passed every test while a
# recompose would put exocytosis's uncollapsed 2^116 chain back. So: one text-less page with ONE
# `/BM /Multiply` fill over another fill - cairo writes that as the add/blend lerp - through
# prepare, and artwork.svg must be exactly the collapse of a bare `pdftocairo -svg` of the
# artwork.pdf prepare wrote (same argv, `svgfix.pdftocairo_svg_argv`), and must differ from it.
# CONTROL: the same page with `/BM /Normal` has nothing to collapse, and artwork.svg must equal
# the bare conversion byte for byte - otherwise "differs" could come from anything else in the
# chain.
def synth_blend(dst, blend):
    """A text-less 100 x 100 pt page: an opaque fill, then a second fill under an ExtGState whose
    /BM is /Multiply (blend) or /Normal (control)."""
    pdf = pikepdf.new()
    page = pdf.add_blank_page(page_size=(100, 100))
    state = pikepdf.Dictionary(Type=N('/ExtGState'), BM=N('/Multiply') if blend else N('/Normal'))
    page.Resources = pikepdf.Dictionary(ExtGState=pikepdf.Dictionary(GS0=state))
    page.Contents = pdf.make_stream(b'0.2 0.4 0.8 rg 0 0 60 60 re f\n'
                                    b'q /GS0 gs 0.9 0.5 0.1 rg 30 30 60 60 re f Q\n')
    pdf.save(str(dst), deterministic_id=True)
    return Path(dst)


import svgfix as _svgfix                        # noqa: E402 - the argv owner, stdlib only (HERE is on sys.path)
with tempfile.TemporaryDirectory() as td:
    seen = {}
    for tag, blend in (('blend', True), ('normal', False)):
        art = synth_blend(Path(td) / f'CNX_Fake_Blend_{tag}.pdf', blend)
        out = Path(td) / f'out-{tag}'
        r = run_prepare(art, '--basename', f'CNX_Fake_Blend_{tag}', '--out', out)
        report = json.loads((out / 'svgfix.json').read_text()) \
            if (out / 'svgfix.json').exists() else None
        bare = Path(td) / f'bare-{tag}.svg'
        if (out / 'artwork.pdf').exists():
            subprocess.run(_svgfix.pdftocairo_svg_argv(out / 'artwork.pdf', bare), check=True,
                           timeout=120)
        written = (out / 'artwork.svg').read_bytes() if (out / 'artwork.svg').exists() else None
        bare_bytes = bare.read_bytes() if bare.exists() else None
        seen[tag] = (r, report, written, bare_bytes)
    r, report, written, bare_bytes = seen['blend']
    expected = _svgfix.collapse_blend_lerp(bare_bytes)[0] if bare_bytes is not None else None
    check('6d a /BM /Multiply page: prepare exits 0 and svgfix.json reports collapsed >= 1',
          r.returncode == 0 and isinstance(report, dict) and report.get('collapsed', 0) >= 1,
          f'exit {r.returncode}, {report!r}: {r.stderr.strip()[-300:]}')
    check('6e ... and artwork.svg IS the collapse: it differs from a bare `pdftocairo -svg` of '
          'artwork.pdf and equals collapse_blend_lerp of those bytes',
          written is not None and bare_bytes is not None and written != bare_bytes
          and written == expected,
          f'written {None if written is None else len(written)} bytes, bare '
          f'{None if bare_bytes is None else len(bare_bytes)}, '
          f'equal-to-bare {written == bare_bytes}, equal-to-collapse {written == expected}')
    r, report, written, bare_bytes = seen['normal']
    check('6f CONTROL the same page with /BM /Normal: addOps 0, and artwork.svg equals the bare '
          'conversion byte for byte',
          r.returncode == 0 and isinstance(report, dict) and report.get('addOps') == 0
          and written is not None and written == bare_bytes,
          f'exit {r.returncode}, {report!r}, equal-to-bare {written == bare_bytes}')

# ── 7. THE ARTWORK SHARES THE TEXT'S COORDINATES — ruling (W), 2026-09-15 ──────────────────
# `pdftocairo -svg` without `-noshrink -nocenter` fits the page onto a "paper" of the page size
# rounded UP to whole points: on a page with a fractional dimension every artwork element is
# scaled by min(w/ceil w, h/ceil h) and centred, while svgout.write_svg places the <text> at
# the TRUE coordinates, (x, page_h - y). Measured on the 34 bought figures: 24 shifted, up to
# 2.66 pt. Every PNG-based check is blind to it - `-png` does not shrink.
#
# 🔴 THERE IS NO PAGE-LEVEL ELEMENT TO READ. cairo bakes the page transform into EVERY element's
# own `transform` (etheneBr: `matrix(0.992857, 0, 0, -0.992857, 196.13, 25.91)` on each path),
# composed with the PDF's own `cm`s, so "the page transform" is only observable through a path
# whose PDF coordinates are KNOWN. These cases plant one - three points spanning the page - and
# map cairo's `d` through cairo's `transform` with this file's OWN parser, deliberately not the
# guard's: a check that shares its instrument with the thing it checks cannot see its anchor.
FRACTIONAL_PAGE = (468, 69.5)                   # CNX_Chem_04_03_etheneBr_img's page
INTEGRAL_PAGE = (468, 70)
TOL_PT = 0.01


def synth_known_path(dst, size):
    """A text-less page carrying ONE stroked path through three known points. -> (path, pts)"""
    w, h = size
    pts = [(0.1 * w, 0.2 * h), (0.9 * w, 0.2 * h), (0.1 * w, 0.8 * h)]
    ops = '0 0 0 RG 1 w {:.4f} {:.4f} m {:.4f} {:.4f} l {:.4f} {:.4f} l S\n'.format(
        *[v for p in pts for v in p])
    pdf = pikepdf.new()
    page = pdf.add_blank_page(page_size=size)
    page.Contents = pdf.make_stream(ops.encode('ascii'))
    pdf.save(str(dst), deterministic_id=True)
    return Path(dst), pts


def mapped_known_points(svg_path):
    """-> the three planted points as the SVG draws them, or a string naming why not.

    Only the shape cairo writes for ONE plain stroke is accepted: a single STROKED <path> whose
    `d` is `M x y L x y L x y` and whose `transform` is absent or a `matrix(...)`, under no
    transformed ancestor. Anything else is reported, never guessed at.
    ⚠️ "a single <path>" is NOT "a single stroked <path>": measured, cairo wraps this very page in
    a `<clipPath>` whose own <path> is the clip rectangle - on the unflagged call only for some
    geometries - so counting every <path> reads "2, expected 1" and measures nothing."""
    import re
    import xml.etree.ElementTree as ET
    root = ET.parse(str(svg_path)).getroot()
    parent = {child: node for node in root.iter() for child in node}
    paths = [e for e in root.iter()
             if e.tag.endswith('}path') and e.get('stroke') not in (None, 'none')]
    if len(paths) != 1:
        return f'{len(paths)} stroked <path> elements, expected 1'
    node = parent.get(paths[0])
    while node is not None:
        if node.get('transform'):
            return 'a transformed ancestor'
        node = parent.get(node)
    nums = [float(v) for v in re.findall(r'[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?', paths[0].get('d', ''))]
    if len(nums) != 6:
        return f"d={paths[0].get('d')!r}"
    t = paths[0].get('transform')
    m = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    if t:
        mm = re.fullmatch(r'\s*matrix\(([^)]*)\)\s*', t)
        if not mm:
            return f'transform={t!r}'
        m = tuple(float(v) for v in re.split(r'[\s,]+', mm.group(1).strip()))
    a, b, c, d, e, f = m
    return [(a * x + c * y + e, b * x + d * y + f) for x, y in zip(nums[0::2], nums[1::2])]


def displacement(svg_path, pts, page_h):
    """Largest distance, in pt, between where the SVG draws each planted point and where the
    composer's <text> convention (x, page_h - y) puts it. None if the shape was not readable."""
    import math
    got = mapped_known_points(svg_path)
    if isinstance(got, str):
        return None
    return max(math.hypot(gx - x, gy - (page_h - y)) for (gx, gy), (x, y) in zip(got, pts))


with tempfile.TemporaryDirectory() as td:
    frac, frac_pts = synth_known_path(Path(td) / 'CNX_Fake_Fractional.pdf', FRACTIONAL_PAGE)
    whole, whole_pts = synth_known_path(Path(td) / 'CNX_Fake_Integral.pdf', INTEGRAL_PAGE)

    # 7a/7b THE INSTRUMENT, BOTH WAYS. The defect must reproduce on THIS poppler through the
    # bare call, or 7c could pass because poppler changed rather than because the call did; and
    # the same bare call on an integral page must read clean, or the parser just always fires.
    disp = {}
    for tag, pdf, pts, h in (('frac', frac, frac_pts, FRACTIONAL_PAGE[1]),
                             ('whole', whole, whole_pts, INTEGRAL_PAGE[1])):
        svg = Path(td) / f'bare-{tag}.svg'
        subprocess.run(['pdftocairo', '-svg', str(pdf), str(svg)], check=True, timeout=120)
        disp[tag] = displacement(svg, pts, h)
    check('7a CONTROL the UNFLAGGED `pdftocairo -svg` scales a 468 x 69.5 pt page '
          '(the defect reproduces here)',
          disp['frac'] is not None and disp['frac'] > 0.5, f"max displacement {disp['frac']!r} pt")
    check('7b CONTROL ... and leaves a 468 x 70 pt page alone (the instrument discriminates)',
          disp['whole'] is not None and disp['whole'] < TOL_PT,
          f"max displacement {disp['whole']!r} pt")

    # 7c END TO END: what prepare actually wrote. RED before the flags, GREEN after.
    out = Path(td) / 'out-fractional'
    r = run_prepare(frac, '--basename', 'CNX_Fake_Fractional', '--out', out)
    got = displacement(out / 'artwork.svg', frac_pts, FRACTIONAL_PAGE[1]) \
        if (out / 'artwork.svg').exists() else None
    check('7c prepare\'s artwork.svg of a FRACTIONAL page draws every point exactly where the '
          '<text> convention (x, page_h - y) puts it',
          r.returncode == 0 and got is not None and got < TOL_PT,
          f'exit {r.returncode}, max displacement {got!r} pt, '
          f'mapped {mapped_known_points(out / "artwork.svg") if (out / "artwork.svg").exists() else None!r}: '
          f'{r.stderr.strip()[-300:]}')

    # 7d-7f THE GUARD, as a decision: it must FIRE on the unflagged argv for a fractional page,
    # stay quiet on the same argv for an integral page (it keys on the transform, not on the
    # argv's spelling), and stay quiet on the shipped argv.
    guard = getattr(_mod, 'artwork_transform_refusal', None) if _mod is not None else None
    check('7 PRECONDITION figure-prepare.py exposes artwork_transform_refusal', callable(guard))
    if callable(guard):
        def _call(pdf, **kw):
            try:
                return guard(pdf, **kw)
            except Exception as exc:              # noqa: BLE001 - reported, not raised
                return f'RAISED {type(exc).__name__}: {exc}'
        fired = _call(frac, flags=())
        check('7d the guard REFUSES the unflagged argv on a fractional page, naming the transform',
              isinstance(fired, str) and 'transform' in fired and not fired.startswith('RAISED'),
              f'{fired!r}')
        quiet = _call(whole, flags=())
        check('7e CONTROL ... and does NOT refuse the same argv on an integral page', quiet is None,
              f'{quiet!r}')
        shipped = _call(frac)
        check('7f ... and does NOT refuse the shipped argv on the fractional page', shipped is None,
              f'{shipped!r}')

        # 7h/7i FAIL CLOSED (final review). The block comment above the guard promises that a probe
        # which cannot be READ refuses too, because nothing else can see an artwork displacement -
        # and 7d-7f only ever feed probes that parse, while 7d's `'transform' in fired` is also
        # satisfied by the could-not-verify text. Measured: turning either branch into a pass left
        # this file ALL PASS. 7f above is the control: the shipped argv on a readable probe is None.
        # 7h: an argv pdftocairo rejects (it exits 99 on an unknown flag and writes no probe.svg).
        broken = _call(frac, flags=('-bogus-flag',))
        check('7h the guard REFUSES when the probe conversion exits non-zero, saying the transform '
              'could not be verified', isinstance(broken, str) and not broken.startswith('RAISED')
              and 'could not be verified' in broken, f'{broken!r}')
        # 7i: a probe SVG the reader cannot interpret - `_probe_points` raising ValueError, which is
        # what it does on any shape it does not recognise. Restored in `finally`.
        saved_probe = getattr(_mod, '_probe_points', None)

        def _unreadable(_svg_bytes):
            raise ValueError('planted: probe shape not recognised')
        try:
            _mod._probe_points = _unreadable
            unread = _call(frac)
        finally:
            _mod._probe_points = saved_probe
        check('7i the guard REFUSES when the probe cannot be read, saying the transform could not be '
              'verified', isinstance(unread, str) and not unread.startswith('RAISED')
              and 'could not be verified' in unread, f'{unread!r}')

    # 7g WIRING: prepare() consults the guard and refuses. The guard reads svgfix's flags AT
    # CALL TIME, so dropping them in THIS process makes the guard's probe scale while the
    # strip-text.py child still writes a correct artwork.svg - the refusal can only come from
    # the guard. Restored in `finally`, whatever happens.
    sf = getattr(_mod, 'svgfix', None) if _mod is not None else None
    if callable(guard) and sf is not None and hasattr(sf, 'PDFTOCAIRO_SVG_FLAGS'):
        saved = sf.PDFTOCAIRO_SVG_FLAGS
        wired_out = Path(td) / 'out-wired'
        import contextlib
        import io
        try:
            sf.PDFTOCAIRO_SVG_FLAGS = ()
            # main() prints `FAILED <basename>: ...` to stderr; captured so this suite's own
            # log carries no FAILED line for a refusal it EXPECTS.
            with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                rc = _mod.main([str(frac), '--basename', 'CNX_Fake_Wired', '--out', str(wired_out)])
        except BaseException as exc:              # noqa: BLE001
            rc = f'RAISED {type(exc).__name__}: {exc}'
        finally:
            sf.PDFTOCAIRO_SVG_FLAGS = saved
        wd = load_prepare_json(wired_out) or {}
        check('7g prepare EXITS 1 when the guard refuses, with the refusal in prepare.json',
              rc == 1 and 'transform' in str(wd.get('error', '')), f'rc {rc!r}, {wd!r}')
    else:
        check('7g PRECONDITION svgfix exposes PDFTOCAIRO_SVG_FLAGS for the guard to read', False)

# ── 12. §C140 ⑦ — glyph repairs reach prepare.json, summed over fonts ─────────────────
print('\n[12] glyph repairs are reported in prepare.json')
if _mod is not None:
    summary = _mod.glyph_summary({
        'glyph_repairs': {'PAGE/R16': {'H11034': 2}, 'PAGE/F1/R2': {'H11034': 1, 'H9261': 4}},
        'glyph_unrepaired': {'PAGE/R9': {'H99999': 3}},
        'glyph_ambiguous': {},
    })
    check('12a repairs are summed over fonts and carry the replacement',
          summary[0] == [{'glyph': 'H11034', 'to': '°', 'count': 3},
                         {'glyph': 'H9261', 'to': 'λ', 'count': 4}], f'{summary[0]!r}')
    check('12b unrepaired and ambiguous are reported by name',
          summary[1] == [{'glyph': 'H99999', 'count': 3}] and summary[2] == [], f'{summary[1:]!r}')
    check('12c CONTROL — a meta with no glyph fields reports three empty lists',
          _mod.glyph_summary({}) == ([], [], []), f'{_mod.glyph_summary({})!r}')

with tempfile.TemporaryDirectory() as td:
    out = Path(td) / 'fixture-out'
    r = run_prepare(FIXTURE, '--basename', 'CNX_Fixture_Glyphs', '--out', out)
    d = load_prepare_json(out) or {}
    check('12d CONTROL — the committed fixture prepares with empty glyph lists',
          r.returncode == 0 and d.get('glyphRepairs') == [] and d.get('glyphUnrepaired') == []
          and d.get('glyphAmbiguous') == [], f"{d.get('glyphRepairs')!r}")

try:
    import sources as _S
    _cfg = _S.load_config()
    _pent, _k = _S.resolve('CNX_Chem_10_01_PentIso', _S.load_trees('efnafraedi-2e', _cfg),
                           _cfg['editionPrecedence'], superseded=_cfg.get('supersededArtwork'))
except SystemExit as exc:
    _pent = None
    check('12e PRECONDITION the PentIso artwork resolves on this box', False, str(exc))
if _pent:
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / 'pent-out'
        r = run_prepare(_pent, '--basename', 'CNX_Chem_10_01_PentIso', '--out', out)
        d = load_prepare_json(out) or {}
        keys = [b['key'] for b in json.loads((out / 'blocks.json').read_text())] \
            if (out / 'blocks.json').exists() else []
        check('12e PentIso end to end: 3 repairs reported and the keys read °C',
              r.returncode == 0
              and d.get('glyphRepairs') == [{'glyph': 'H11034', 'to': '°', 'count': 3}]
              and sum(' °C' in k for k in keys) == 3 and not any('8C' in k for k in keys),
              f"exit {r.returncode}; {d.get('glyphRepairs')!r}; keys {keys[:4]!r}")

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
